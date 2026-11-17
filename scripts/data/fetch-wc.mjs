// ESA WorldCover 2021 v200 (CC BY 4.0) -> coarse land-cover rasters, read from the public Cloud-Optimised GeoTIFFs by HTTP range.
// Uses overview level 3 (4500 px per 3 degrees, about 74 m). Output: cache/wc/<tile>.raw (4500*4500 bytes, class codes, 0 = nodata).
// Usage: node scripts/data/fetch-wc.mjs <region>
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { REGIONS } from './regions.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const R = REGIONS[process.argv[2] ?? 'northafrica'];
const dir = path.join(here, 'cache', 'wc');
fs.mkdirSync(dir, { recursive: true });
const LEVEL = R.wcLevel ?? 3, N = 36000 >> LEVEL; // level 3: 4500 px per 3 deg (about 74 m); level 5: 1125 px (about 296 m, for continental-scale regions)
const SUF = LEVEL === 3 ? '' : `_L${LEVEL}`;
const base = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/';
const name = (lat, lon) => `N${String(lat).padStart(2, '0')}E${String(lon).padStart(3, '0')}`;
const rng = async (url, a, b) => { for (let t = 0; t < 4; t++) { try { const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}`, 'User-Agent': 'mapdata-script/1.0' } }); if (r.status === 404) return null; if (r.ok || r.status === 206) return Buffer.from(await r.arrayBuffer()); } catch { /* retry */ } await new Promise((s) => setTimeout(s, 1500 * (t + 1))); } throw new Error('fetch failed ' + url); };
const B = R.bbox;
for (let lat = Math.floor(B.south / 3) * 3; lat < B.north; lat += 3) {
  for (let lon = Math.floor(B.west / 3) * 3; lon < B.east; lon += 3) {
    const id = name(lat, lon), out = path.join(dir, id + SUF + '.raw');
    if (fs.existsSync(out)) continue;
    const url = `${base}ESA_WorldCover_10m_2021_v200_${id}_Map.tif`;
    const head = await rng(url, 0, 262143);
    if (!head) { console.log(id, 'no tile (sea)'); fs.writeFileSync(out, Buffer.alloc(0)); continue; }
    const le = head[0] === 0x49;
    const u16 = (o) => (le ? head.readUInt16LE(o) : head.readUInt16BE(o));
    const u32 = (o) => (le ? head.readUInt32LE(o) : head.readUInt32BE(o));
    let off = u32(4), ifd = null;
    for (let i = 0; i <= LEVEL; i++) { const c = u16(off); const t = {}; for (let k = 0; k < c; k++) { const e = off + 2 + k * 12; t[u16(e)] = [u16(e + 2), u32(e + 4), u32(e + 8)]; } if (i === LEVEL) ifd = t; off = u32(off + 2 + c * 12); }
    const readArr = (tag) => { const [, cnt, v] = ifd[tag]; const a = []; for (let i = 0; i < cnt; i++) a.push(u32(v + i * 4)); return a; };
    const offs = readArr(324), cnts = readArr(325);
    const T = ifd[322][2], per = Math.ceil(N / T);
    const raster = Buffer.alloc(N * N);
    for (let ty = 0; ty < per; ty++) for (let tx = 0; tx < per; tx++) {
      const i = ty * per + tx; if (!cnts[i]) continue;
      const raw = zlib.inflateSync(await rng(url, offs[i], offs[i] + cnts[i] - 1));
      for (let y = 0; y < T && ty * T + y < N; y++) { const w = Math.min(T, N - tx * T); raw.copy(raster, (ty * T + y) * N + tx * T, y * T, y * T + w); }
    }
    fs.writeFileSync(out, raster);
    console.log(id, 'ok');
  }
}
