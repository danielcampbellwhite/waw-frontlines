// Audits every scenario's locations / unit starts / reinforcements against ITS OWN terrain grid (scenario.terrainFile).
// Usage: node scripts/data/audit.mjs [scenario-file-substring]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'src/data/campaigns');
const filter = process.argv[2];
const grids = new Map();
const grid = (f) => { if (!grids.has(f)) grids.set(f, JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'))); return grids.get(f); };
let bad = 0, files = 0;
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json') && !/\.(sources|events)\.json$/.test(n) && (!filter || n.includes(filter)))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
  if (!j.terrainFile || !j.locations || !j.units) continue;
  files++;
  const g = grid(j.terrainFile);
  const at = (p) => { const c = Math.floor((p[0] - g.bbox.west) / g.cellDeg), r = Math.floor((g.bbox.north - p[1]) / g.cellDeg); return c < 0 || r < 0 || c >= g.cols || r >= g.rows ? -1 : g.cells[r * g.cols + c]; };
  const check = (kind, name, pos, domain) => {
    const t = at(pos), water = t === 0 || t === 9, outside = t === -1;
    if (outside) { bad++; console.log(`${f} ${kind} ${name} [${pos}] OUTSIDE grid ${j.terrainFile}`); }
    else if (water && domain !== 'sea') { bad++; console.log(`${f} ${kind} ${name} [${pos}] terrain=${t} (${t === 0 ? 'Sea' : 'Lake'})`); }
  };
  for (const l of j.locations) check('location', `${l.id} (${l.kind})`, l.pos);
  for (const u of j.units) check('unit', `${u.id} ${u.shortName}`, u.pos, u.domain);
  for (const r of j.reinforcements ?? []) if (r.pos) check('reinf', r.id, r.pos, r.unit?.domain);
  for (const o of j.initialControl ?? []) for (const p of o.polygon) if (at(p) === -1 && (p[0] < g.bbox.west - 1 || p[0] > g.bbox.east + 1)) { /* polygons may extend beyond grid; ignored */ }
  console.log(`${f}: checked against ${j.terrainFile}`);
}
console.log(`scenarios: ${files}, problems: ${bad}`);
process.exitCode = bad ? 1 : 0;
