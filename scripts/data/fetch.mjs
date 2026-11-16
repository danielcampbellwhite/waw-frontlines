// Downloads raw source data into scripts/data/cache (git-ignored, not shipped).
// Usage: node scripts/data/fetch.mjs [region ...]   (default: all regions)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, regionIds } from './regions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, 'cache');
const want = process.argv.slice(2).length ? process.argv.slice(2) : regionIds;
await fs.mkdir(path.join(cache, 'dem'), { recursive: true });
await fs.mkdir(path.join(cache, 'clc'), { recursive: true });

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const layers = ['admin_0_countries', 'rivers_lake_centerlines', 'lakes', 'populated_places_simple', 'land', 'roads', 'railroads', 'geography_regions_polys'];
async function get(url, file) {
  try { await fs.access(file); return; } catch { /* download */ }
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) { await fs.writeFile(file, Buffer.from(await r.arrayBuffer())); return; }
      if (i === 3) throw new Error(`${url} -> ${r.status}`);
    } catch (e) { if (i === 3) throw e; }
    await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
  }
}
for (const l of layers) { await get(`${NE}/ne_10m_${l}.geojson`, path.join(cache, `ne_10m_${l}.geojson`)); console.log('ok', l); }

const pool = async (jobs, n, fn) => { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) await fn(jobs[i++]); })); };

for (const id of want) {
  const R = REGIONS[id], B = R.bbox;
  // AWS Terrain Tiles (terrarium) covering the bbox
  const Z = R.demZoom;
  const tx = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
  const ty = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z); };
  const jobs = [];
  for (let y = ty(B.north); y <= ty(B.south); y++) for (let x = tx(B.west); x <= tx(B.east); x++) jobs.push([x, y]);
  await pool(jobs, 8, ([x, y]) => get(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`, path.join(cache, 'dem', `${Z}_${x}_${y}.png`)));
  console.log(`${id}: dem tiles z${Z}: ${jobs.length}`);

  if (R.landcover) continue; // not Europe: CORINE does not apply (see fetch-wc.mjs)
  // CORINE Land Cover 2018 as rendered by the EEA map service, 4x2 degree chunks at 0.001 deg/pixel.
  const chunks = [];
  for (let w = B.west; w < B.east - 1e-9; w += 4) for (let s = B.south; s < B.north - 1e-9; s += 2) chunks.push([w, s, Math.min(w + 4, B.east), Math.min(s + 2, B.north)]);
  await pool(chunks, 2, async ([w, s, e, n]) => {
    const W = Math.round((e - w) / 0.001), H = Math.round((n - s) / 0.001);
    const url = `https://image.discomap.eea.europa.eu/arcgis/rest/services/Corine/CLC2018_WM/MapServer/export?bbox=${w},${s},${e},${n}&bboxSR=4326&imageSR=4326&size=${W},${H}&format=png32&transparent=false&f=image`;
    await get(url, path.join(cache, 'clc', `${w}_${s}_${e}_${n}_${W}x${H}.png`));
  });
  console.log(`${id}: clc chunks: ${chunks.length}`);
}
