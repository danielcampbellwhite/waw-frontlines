// Builds public/data/*.json per region from cached Natural Earth + AWS terrain tiles + CORINE land cover.
// Usage: node scripts/data/build.mjs [region ...]   (default: all)   - run fetch.mjs first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, regionIds } from './regions.mjs';
import { clipRing, clipLine, bboxOfRing, boxesOverlap, simplify, round, rasterise, decodePng } from './lib.mjs';
import { classify, FOREST, URBAN, MARSH, BOCAGE } from './clc.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, 'cache');
const out = path.resolve(here, '../../public/data');
const campDir = path.resolve(here, '../../src/data/campaigns');
fs.mkdirSync(out, { recursive: true });
const neCache = new Map();
const ne = (n) => { if (!neCache.has(n)) neCache.set(n, JSON.parse(fs.readFileSync(path.join(cache, `ne_10m_${n}.geojson`), 'utf8'))); return neCache.get(n); };
const T = { Sea: 0, Plains: 1, Forest: 2, Hills: 3, Mountains: 4, Marsh: 5, Urban: 6, Desert: 7, Lake: 9, Bocage: 10 };
const write = (f, o) => { const s = JSON.stringify(o); fs.writeFileSync(path.join(out, f), s); console.log('  ', f, (s.length / 1024).toFixed(0) + ' KB'); };
const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const lines = (g) => (g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const NATION = { FRA: 'FRA', DEU: 'GER', GBR: 'GBR', BEL: 'BEL', NLD: 'NED', ITA: 'ITA' };

/** Scenario files that declare this region's terrain file: their locations / land unit starts must sit on land. */
function scenarioAnchors(R) {
  const anchors = [];
  if (!fs.existsSync(campDir)) return anchors;
  for (const f of fs.readdirSync(campDir).filter((n) => /\.(short|standard|[a-z_]+)\.json$/.test(n) && !/\.(sources|events)\.json$/.test(n))) {
    let sc; try { sc = JSON.parse(fs.readFileSync(path.join(campDir, f), 'utf8')); } catch { continue; }
    if (sc.terrainFile !== R.files.terrain) continue;
    for (const l of sc.locations ?? []) anchors.push({ pos: l.pos, kind: l.kind, what: `${f}:${l.id}` });
    for (const u of sc.units ?? []) if (u.domain === 'land') anchors.push({ pos: u.pos, kind: 'unit', what: `${f}:${u.id}` });
  }
  return anchors;
}

function buildRegion(R) {
  console.log(`== ${R.id}`);
  const BBOX = R.bbox, CELL_DEG = R.cellDeg, RES = R.rasterRes, TOL = R.simplify;
  const MARGIN = 1;
  const WB = { west: BBOX.west - MARGIN, east: BBOX.east + MARGIN, south: BBOX.south - MARGIN, north: BBOX.north + MARGIN };
  const clipPolys = (g, tol) => {
    const res = [];
    for (const poly of polys(g)) {
      if (!boxesOverlap(bboxOfRing(poly[0]), WB)) continue;
      const rings = poly.map((r) => clipRing(r.slice(0, -1), WB)).map((r) => simplify(r, tol)).filter((r) => r.length >= 3);
      if (rings.length && clipRing(poly[0].slice(0, -1), WB).length < 3) continue;
      if (rings.length) res.push(rings.map((r) => { const q = r.map((p) => round(p)); q.push(q[0]); return q; }));
    }
    return res;
  };

  // ── land / lakes masks ──
  const landF = ne('land'), lakeF = ne('lakes');
  const landRings = [], lakeRings = [];
  for (const f of landF.features) for (const poly of polys(f.geometry)) for (const r of poly) landRings.push(clipRing(r.slice(0, -1), WB));
  for (const f of lakeF.features) for (const poly of polys(f.geometry)) for (const r of poly) lakeRings.push(clipRing(r.slice(0, -1), WB));
  const land = rasterise(landRings.filter((r) => r.length >= 3), BBOX, RES);
  const lake = rasterise(lakeRings.filter((r) => r.length >= 3), BBOX, RES);

  const cols = Math.ceil((BBOX.east - BBOX.west) / CELL_DEG - 1e-9), rows = Math.ceil((BBOX.north - BBOX.south) / CELL_DEG - 1e-9);
  const N = cols * rows, per = Math.round(CELL_DEG / RES);
  const landFrac = new Float32Array(N), lakeFrac = new Float32Array(N);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let l = 0, k = 0, t = 0;
    for (let y = 0; y < per; y++) for (let x = 0; x < per; x++) { const i = (r * per + y) * land.cols + c * per + x; l += land.mask[i]; k += lake.mask[i]; t++; }
    landFrac[r * cols + c] = l / t; lakeFrac[r * cols + c] = k / t;
  }

  // ── DEM mosaic ──
  const Z = R.demZoom, S = 256 * 2 ** Z;
  const tiles = new Map();
  for (const f of fs.readdirSync(path.join(cache, 'dem'))) {
    const [z, x, y] = f.replace('.png', '').split('_').map(Number);
    if (z !== Z) continue;
    const png = decodePng(fs.readFileSync(path.join(cache, 'dem', f)));
    const e = new Float32Array(256 * 256);
    for (let i = 0; i < 65536; i++) e[i] = png.data[i * png.bpp] * 256 + png.data[i * png.bpp + 1] + png.data[i * png.bpp + 2] / 256 - 32768;
    tiles.set(`${x}_${y}`, e);
  }
  const elevAt = (lon, lat) => {
    const px = ((lon + 180) / 360) * S, s = Math.sin((lat * Math.PI) / 180);
    const py = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * S;
    const t = tiles.get(`${Math.floor(px / 256)}_${Math.floor(py / 256)}`);
    return t ? t[(Math.floor(py) % 256) * 256 + (Math.floor(px) % 256)] : NaN;
  };
  const mean = new Float32Array(N), relief = new Float32Array(N);
  const SS = 7;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let sum = 0, n = 0, mn = 1e9, mx = -1e9;
    for (let y = 0; y < SS; y++) for (let x = 0; x < SS; x++) {
      const v = elevAt(BBOX.west + (c + (x + 0.5) / SS) * CELL_DEG, BBOX.north - (r + (y + 0.5) / SS) * CELL_DEG);
      if (Number.isNaN(v)) continue;
      sum += v; n++; if (v < mn) mn = v; if (v > mx) mx = v;
    }
    mean[r * cols + c] = n ? sum / n : 0; relief[r * cols + c] = n ? mx - mn : 0;
  }

  // ── CORINE land cover fractions per cell (forest / urban fabric / marsh) ──
  const cnt = { valid: new Uint32Array(N), forest: new Uint32Array(N), urban: new Uint32Array(N), marsh: new Uint32Array(N), bare: new Uint32Array(N), bocage: new Uint32Array(N) };
  const bocageSet = new Set(R.bocageCodes ?? [...BOCAGE]);
  let clcFiles = 0;
  if (R.landcover === 'worldcover') {
    // ESA WorldCover 2021 (74 m overview rasters from fetch-wc.mjs): 10 tree, 20 shrub, 30 grass, 40 crop, 50 built, 60 bare, 80 water, 90 wetland
    const WN = 4500, WD = 3 / WN;
    for (const f of fs.readdirSync(path.join(cache, 'wc'))) {
      const m = /^N(\d+)E(\d+)\.raw$/.exec(f); if (!m) continue;
      const s0 = +m[1], w0 = +m[2], buf = fs.readFileSync(path.join(cache, 'wc', f)); if (buf.length < WN * WN) continue;
      if (w0 + 3 <= BBOX.west || w0 >= BBOX.east || s0 + 3 <= BBOX.south || s0 >= BBOX.north) continue;
      clcFiles++;
      for (let y = 0; y < WN; y++) {
        const lat = s0 + 3 - (y + 0.5) * WD, r = Math.floor((BBOX.north - lat) / CELL_DEG);
        if (r < 0 || r >= rows) continue;
        for (let x = 0; x < WN; x++) {
          const v = buf[y * WN + x]; if (!v || v === 80) continue;
          const c = Math.floor((w0 + (x + 0.5) * WD - BBOX.west) / CELL_DEG); if (c < 0 || c >= cols) continue;
          const i = r * cols + c; cnt.valid[i]++;
          if (v === 10) cnt.forest[i]++; else if (v === 50) cnt.urban[i]++; else if (v === 90) cnt.marsh[i]++; else if (v === 60) cnt.bare[i]++;
        }
      }
    }
  }
  if (R.landcover !== 'worldcover') for (const f of fs.readdirSync(path.join(cache, 'clc'))) {
    const m = /^(-?[\d.]+)_(-?[\d.]+)_(-?[\d.]+)_(-?[\d.]+)_(\d+)x(\d+)\.png$/.exec(f); if (!m) continue;
    const [w, s, e, n] = m.slice(1, 5).map(Number);
    if (e <= BBOX.west || w >= BBOX.east || n <= BBOX.south || s >= BBOX.north) continue;
    clcFiles++;
    const png = decodePng(fs.readFileSync(path.join(cache, 'clc', f)));
    const dx = (e - w) / png.w, dy = (n - s) / png.h;
    for (let y = 0; y < png.h; y++) {
      const lat = n - (y + 0.5) * dy, r = Math.floor((BBOX.north - lat) / CELL_DEG);
      if (r < 0 || r >= rows) continue;
      for (let x = 0; x < png.w; x++) {
        const c = Math.floor((w + (x + 0.5) * dx - BBOX.west) / CELL_DEG);
        if (c < 0 || c >= cols) continue;
        const o = (y * png.w + x) * png.bpp, code = classify(png.data[o], png.data[o + 1], png.data[o + 2]);
        if (!code) continue;
        const i = r * cols + c;
        cnt.valid[i]++;
        if (FOREST.has(code)) cnt.forest[i]++; else if (URBAN.has(code)) cnt.urban[i]++; else if (MARSH.has(code)) cnt.marsh[i]++; else if (bocageSet.has(code)) cnt.bocage[i]++;
      }
    }
  }
  console.log(R.landcover === 'worldcover' ? '  WorldCover tiles used:' : '  CORINE chunks used:', clcFiles);
  const frac = (a, i) => (cnt.valid[i] > 20 ? a[i] / cnt.valid[i] : -1);

  // ── populated places -> urban cells ──
  const places = ne('populated_places_simple').features.filter((f) => { const [x, y] = f.geometry.coordinates; return x >= BBOX.west && x <= BBOX.east && y >= BBOX.south && y <= BBOX.north; });
  const urban = new Uint8Array(N);
  const cellAt = (lon, lat) => [Math.floor((lon - BBOX.west) / CELL_DEG), Math.floor((BBOX.north - lat) / CELL_DEG)];
  for (const f of places) {
    const pop = f.properties.pop_max; if (pop < R.urbanPlacePop) continue;
    const [c, r] = cellAt(...f.geometry.coordinates), rad = pop >= 500000 && CELL_DEG >= 0.05 ? 1 : pop >= 500000 ? 2 : 0;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const cc = c + dx, rr = r + dy; if (cc >= 0 && rr >= 0 && cc < cols && rr < rows) urban[rr * cols + cc] = 1; }
  }

  // ── sand-sea mask (Natural Earth named region polygons; WorldCover has no sand/rock distinction) ──
  const sandF = R.sandRegions ? ne('geography_regions_polys').features.filter((f) => R.sandRegions.some((n) => (f.properties.NAME ?? '').includes(n))) : [];
  const sandRings = []; for (const f of sandF) for (const poly of polys(f.geometry)) sandRings.push(clipRing(poly[0].slice(0, -1), WB));
  const sandMask = sandRings.length ? rasterise(sandRings.filter((r) => r.length >= 3), BBOX, RES) : null;
  const sandFrac = new Float32Array(N);
  if (sandMask) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { let k = 0; for (let y = 0; y < per; y++) for (let x = 0; x < per; x++) k += sandMask.mask[(r * per + y) * sandMask.cols + c * per + x]; sandFrac[r * cols + c] = k / (per * per); }

  // ── country mask for the bocage proxy ──
  const ctryFrac = new Float32Array(N).fill(1);
  if (R.bocageCountries) {
    const rings = []; for (const f of ne('admin_0_countries').features) if (R.bocageCountries.includes(f.properties.ADM0_A3)) for (const poly of polys(f.geometry)) rings.push(clipRing(poly[0].slice(0, -1), WB));
    const cm = rasterise(rings.filter((x) => x.length >= 3), BBOX, RES);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { let k = 0; for (let y = 0; y < per; y++) for (let x = 0; x < per; x++) k += cm.mask[(r * per + y) * cm.cols + c * per + x]; ctryFrac[r * cols + c] = k / (per * per); }
  }

  // ── classify ──
  const cells = new Array(N), elev = new Array(N), flags = new Array(N).fill(0);
  const cellKm = CELL_DEG * 111.2 * (1 + Math.cos(((BBOX.north + BBOX.south) / 2 * Math.PI) / 180)) / 2;
  const hillRelief = R.hillReliefPerKm * cellKm;
  for (let i = 0; i < N; i++) {
    const m = mean[i], rl = relief[i];
    elev[i] = Math.round(landFrac[i] >= 0.5 || lakeFrac[i] >= 0.5 ? m : Math.min(m, 0));
    const ff = frac(cnt.forest, i), uf = frac(cnt.urban, i), mf = frac(cnt.marsh, i);
    if (lakeFrac[i] >= 0.5) cells[i] = T.Lake;
    else if (landFrac[i] < 0.5) cells[i] = T.Sea;
    else if (urban[i] || uf >= 0.35) cells[i] = T.Urban;
    else if (m >= 900 || (m >= 500 && rl >= 500)) cells[i] = T.Mountains;
    else if (ff >= (R.forestFrac ?? 0.4) && m >= 0) cells[i] = T.Forest;
    else if (m >= R.hillMean || rl >= hillRelief) cells[i] = T.Hills;
    else if (R.landcover === 'worldcover' && sandFrac[i] >= 0.5 && cnt.bare[i] / Math.max(1, cnt.valid[i]) >= 0.5) cells[i] = T.Desert;
    else if (mf >= 0.4 || (m <= (R.sabkhaElev ?? 2) && rl <= (R.sabkhaRelief ?? 6))) cells[i] = T.Marsh;
    else if (R.bocageCodes && ctryFrac[i] >= 0.5 && frac(cnt.bocage, i) >= (R.bocageFrac ?? 0.4)) cells[i] = T.Bocage;
    else cells[i] = T.Plains;
  }
  const isWater = (i) => cells[i] === T.Sea;
  const coastFlags = () => {
    for (let i = 0; i < N; i++) flags[i] &= ~2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c; if (isWater(i) || cells[i] === T.Lake) continue;
      coast: for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const cc = c + dx, rr = r + dy; if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue; if (isWater(rr * cols + cc)) { flags[i] |= 2; break coast; } }
    }
  };
  coastFlags();
  // optional landing/bocage hints (flag bits 4 and 8; additional to river=1, coast=2)
  const hintFlags = () => {
    for (let i = 0; i < N; i++) {
      flags[i] &= ~8;
      const land = cells[i] !== T.Sea && cells[i] !== T.Lake;
      if (R.beachFlag && land && (flags[i] & 2) && cells[i] !== T.Urban && elev[i] <= R.beachFlag.maxElevM && relief[i] <= R.beachFlag.maxReliefM) flags[i] |= 8;
    }
  };
  hintFlags();
  // coastal flats are not bocage (open dunes / polder / beach hinterland): coast cells below 25 m revert to Plains
  if (R.bocageCodes) for (let i = 0; i < N; i++) if (cells[i] === T.Bocage && (flags[i] & 2) && elev[i] <= 25) cells[i] = T.Plains;

  // ── rivers (Natural Earth, plus optional OSM waterway=river from cache/osm_<id>_rivers.json) ──
  const infra = [];
  let riverId = 0, riverCells = 0;
  const markRiver = (piece) => {
    for (let k = 1; k < piece.length; k++) {
      const a = piece[k - 1], b = piece[k], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL_DEG / 5)));
      for (let s = 0; s <= steps; s++) {
        const [c, r] = cellAt(a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps);
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const i = r * cols + c; if (cells[i] !== T.Sea && !(flags[i] & 1)) { flags[i] |= 1; riverCells++; }
      }
    }
  };
  for (const f of ne('rivers_lake_centerlines').features) {
    if (f.properties.featurecla !== 'River' && !(R.lakeCenterlines && f.properties.featurecla === 'Lake Centerline')) continue;
    const sr = f.properties.scalerank, name = f.properties.name_en || f.properties.name || undefined;
    for (const ln of lines(f.geometry)) for (const piece of clipLine(ln, BBOX)) {
      const pts = simplify(piece, TOL).map((p) => round(p, 5));
      if (pts.length < 2) continue;
      infra.push({ id: `river_${riverId++}`, kind: 'river', historical: true, coords: pts, ...(name ? { name } : {}) });
      if (sr <= 8) markRiver(piece);
    }
  }
  const osmFile = path.join(cache, `osm_${R.id}_rivers.json`);
  if (fs.existsSync(osmFile)) {
    const osm = JSON.parse(fs.readFileSync(osmFile, 'utf8'));
    let n = 0;
    for (const el of osm.elements ?? []) {
      if (el.type !== 'way' || !el.geometry) continue;
      const ln = el.geometry.map((g) => [g.lon, g.lat]);
      for (const piece of clipLine(ln, BBOX)) {
        const pts = simplify(piece, TOL).map((p) => round(p, 5)); if (pts.length < 2) continue;
        const name = el.tags?.name;
        infra.push({ id: `river_${riverId++}`, kind: 'river', historical: true, coords: pts, ...(name ? { name } : {}) });
        markRiver(piece); n++;
      }
    }
    console.log('  OSM river ways:', n);
  }

  // ── wet river flats (e.g. Carentan / Douve / Taute marshes): low, flat, non-coastal cells on or next to a river become Marsh ──
  if (R.marshNearRiver) {
    const { maxElevM, maxReliefM } = R.marshNearRiver; let nm = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if ((cells[i] !== T.Bocage && cells[i] !== T.Plains) || (flags[i] & 2) || elev[i] > maxElevM || relief[i] > maxReliefM) continue;
      let wet = false;
      for (let dy = -1; dy <= 1 && !wet; dy++) for (let dx = -1; dx <= 1; dx++) { const cc = c + dx, rr = r + dy; if (cc >= 0 && rr >= 0 && cc < cols && rr < rows && (flags[rr * cols + cc] & 1)) { wet = true; break; } }
      if (wet) { cells[i] = T.Marsh; nm++; }
    }
    console.log('  river-flat marsh cells added:', nm);
  }

  // ── anchor scenario locations / land-unit starts to land ──
  const forced = new Map();
  for (const an of [...scenarioAnchors(R), ...(R.anchors ?? []).map(([name, lon, lat, kind]) => ({ pos: [lon, lat], kind, what: `region:${name}` }))]) {
    const [c, r] = cellAt(an.pos[0], an.pos[1]);
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    const i = r * cols + c;
    if (cells[i] !== T.Sea && cells[i] !== T.Lake) { if (an.what.startsWith('region:')) cells[i] = T.Urban; continue; } // region anchors (named ports/cities) are always Urban cells
    cells[i] = ['city', 'port', 'town'].includes(an.kind) ? T.Urban : T.Plains;
    if (elev[i] < 0) elev[i] = 0;
    forced.set(i, an.what);
  }
  if (forced.size) { console.log('  forced to land:', [...forced.values()].join(', ')); coastFlags(); hintFlags(); }
  if (R.beachFlag) { let nbeach = 0; for (const f of flags) if (f & 8) nbeach++; console.log('  beach-candidate cells (flag 8):', nbeach); }
  const hist = {}; for (const c of cells) hist[c] = (hist[c] || 0) + 1;
  console.log('  terrain counts (0 sea,1 plains,2 forest,3 hills,4 mtn,5 marsh,6 urban,9 lake):', JSON.stringify(hist), 'river cells', riverCells);
  write(R.files.terrain, { bbox: BBOX, cellDeg: CELL_DEG, cols, rows, cells, elevationM: elev, flags });

  // ── roads & railways (modern; historical=false). OSM extracts (ODbL) replace Natural Earth when cached ──
  let rid = 0;
  const osmInfra = (kind) => { const f = path.join(cache, `osm_${R.id}_${kind}.json`); return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')).elements ?? []).filter((e) => e.type === 'way' && e.geometry) : null; };
  const osmRoads = R.useOsmRoads === false ? null : osmInfra('roads'), osmRail = R.useOsmRail === false ? null : osmInfra('rail'), osmTracks = osmInfra('tracks');
  // OSM lists every parallel track / carriageway as its own way: drop ways whose points already lie on a kept way (quantised to ~300 m) and non-main rail
  const addOsm = (els, kind, cap) => {
    let n = 0; const covered = new Set(), Q = R.railQuantDeg ?? 0.003, qk = (p) => Math.round(p[0] / Q) + ',' + Math.round(p[1] / Q);
    const usable = els.filter((el) => kind !== 'rail' || (R.railUsage ?? ['main', 'branch', undefined]).includes(el.tags?.usage));
    usable.sort((x, y) => y.geometry.length - x.geometry.length);
    for (const el of usable) {
      const ln = el.geometry.map((g) => [g.lon, g.lat]);
      for (const piece of clipLine(ln, BBOX)) {
        const pts = simplify(piece, TOL).map((q) => round(q, 5)); if (pts.length < 2) continue;
        const keys = pts.map(qk), seen = keys.filter((k) => covered.has(k)).length;
        if (seen / keys.length > 0.6) continue;
        for (const k of keys) covered.add(k);
        const name = el.tags?.['name:en'] ?? el.tags?.name;
        infra.push({ id: `${kind}_${rid++}`, kind, historical: false, coords: pts, ...(name ? { name } : {}), capacity: cap(el) }); n++;
      }
    }
    return n;
  };
  if (osmRoads) console.log('  OSM road ways:', addOsm(osmRoads, 'road', (el) => (el.tags?.highway === 'trunk' ? 4 : 2)));
  if (!osmRoads && R.schematicVia) {
    const byName = new Map(places.map((f) => [f.properties.name, f.geometry.coordinates]));
    const pts = R.schematicVia.towns.map((n) => byName.get(n)).filter(Boolean).map((p) => round(p, 5));
    if (pts.length >= 2) { infra.push({ id: 'road_via_balbia', kind: 'road', historical: true, approximate: true, coords: pts, name: R.schematicVia.name, capacity: 4, note: 'Coast road (built 1937) is historical; geometry is SCHEMATIC straight segments between Natural Earth gazetteer towns, not the surveyed alignment.' }); console.log('  schematic Via Balbia points:', pts.length); }
  }
  if (osmTracks) console.log('  OSM named track ways:', addOsm(osmTracks, 'road', () => 1));
  for (const f of osmRoads ? [] : ne('roads').features) {
    const p = f.properties; if (!R.roadTypes.includes(p.type)) continue;
    for (const ln of lines(f.geometry)) for (const piece of clipLine(ln, BBOX)) {
      const pts = simplify(piece, TOL).map((q) => round(q, 5)); if (pts.length < 2) continue;
      infra.push({ id: `road_${rid++}`, kind: 'road', historical: false, coords: pts, ...(p.name ? { name: p.name } : {}), capacity: p.type === 'Major Highway' ? 4 : 2 });
    }
  }
  rid = 0;
  if (osmRail) console.log('  OSM rail ways:', addOsm(osmRail, 'rail', () => 8));
  for (const f of osmRail ? [] : ne('railroads').features) for (const ln of lines(f.geometry)) for (const piece of clipLine(ln, BBOX)) {
    const pts = simplify(piece, TOL).map((q) => round(q, 5)); if (pts.length < 2) continue;
    infra.push({ id: `rail_${rid++}`, kind: 'rail', historical: false, coords: pts, capacity: 8 });
  }
  console.log('  infra', JSON.stringify(infra.reduce((a, l) => ((a[l.kind] = (a[l.kind] || 0) + 1), a), {})));
  write(R.files.infra, infra);

  // ── boundaries (modern NE borders) ──
  const countries = [];
  for (const f of ne('admin_0_countries').features) {
    const mp = clipPolys(f.geometry, TOL); if (!mp.length) continue;
    const a3 = f.properties.ADM0_A3;
    countries.push({ type: 'Feature', properties: { name: f.properties.NAME_EN || f.properties.NAME, iso3: a3, nation: NATION[a3] ?? null, modernBorders: true }, geometry: { type: 'MultiPolygon', coordinates: mp } });
  }
  write(R.files.boundaries, { type: 'FeatureCollection', note: 'Natural Earth MODERN (2020s) borders; NOT 1940 borders. See docs/HISTORICAL_SOURCES.md (Map data).', features: countries });

  // ── land / lakes for the offline basemap ──
  const landFeat = []; for (const f of landF.features) { const mp = clipPolys(f.geometry, TOL * 0.75); if (mp.length) landFeat.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: mp } }); }
  const lakeFeat = []; for (const f of lakeF.features) { const mp = clipPolys(f.geometry, TOL * 0.75); if (mp.length) lakeFeat.push({ type: 'Feature', properties: { name: f.properties.name }, geometry: { type: 'MultiPolygon', coordinates: mp } }); }
  write(R.files.land, { type: 'FeatureCollection', features: landFeat });
  write(R.files.lakes, { type: 'FeatureCollection', features: lakeFeat });

  // ── cities ──
  const cities = places.filter((f) => f.properties.pop_max >= R.cityMinPop || f.properties.adm0cap).map((f) => {
    const p = f.properties;
    return { name: p.name, lon: +f.geometry.coordinates[0].toFixed(4), lat: +f.geometry.coordinates[1].toFixed(4), pop: p.pop_max, country: p.iso_a2, capital: !!p.adm0cap, rank: p.scalerank, minZoom: p.min_zoom };
  }).sort((a, b) => b.pop - a.pop);
  write(R.files.cities, cities);
  console.log('  cities', cities.length);
}

const want = process.argv.slice(2).length ? process.argv.slice(2) : regionIds;
for (const id of want) buildRegion(REGIONS[id]);

// manifest the map engine uses to find per-scenario data (matched by terrain bbox)
const manifest = regionIds.map((id) => ({ id, title: REGIONS[id].title, bbox: REGIONS[id].bbox, cellDeg: REGIONS[id].cellDeg, files: REGIONS[id].files }));
fs.writeFileSync(path.join(out, 'regions.json'), JSON.stringify(manifest, null, 1));
console.log('regions.json written');
