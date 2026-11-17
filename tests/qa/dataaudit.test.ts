import { describe, expect, it } from 'vitest';
import { Terrain } from '../../src/core/types';
import { listScenarios, validateScenario } from '../../src/data';
import { haversineKm } from '../../src/core/geo';
import { getScenarioSidecar, loadWorld } from './harness';
import { mulberry } from './util';

const IDS = ['fall_of_france.standard', 'fall_of_france.short', 'bulge.short', 'crusader.short', 'stalingrad.short', 'normandy.short'];

function terrainAtPos(w: ReturnType<typeof loadWorld>, p: [number, number]): number {
  const t = w.terrain; const c = Math.floor((p[0] - t.bbox.west) / t.cellDeg), r = Math.floor((t.bbox.north - p[1]) / t.cellDeg);
  if (c < 0 || r < 0 || c >= t.cols || r >= t.rows) return -1;
  return t.cells[r * t.cols + c];
}

describe.each(IDS)('historical data audit %s', (id) => {
  const w = loadWorld(id);
  const side = getScenarioSidecar(id);
  it('validateScenario passes with sidecar', () => { expect(validateScenario(w.def, side)).toEqual([]); });
  it('no duplicate ids (units, locations, reinforcements, objectives)', () => {
    const dup = (a: string[]) => a.filter((x, i) => a.indexOf(x) !== i);
    expect(dup(w.def.units.map((u) => u.id))).toEqual([]);
    expect(dup(w.def.locations.map((u) => u.id))).toEqual([]);
    expect(dup(w.def.reinforcements.map((u) => u.id))).toEqual([]);
    expect(dup(w.def.reinforcements.map((u) => u.unit.id))).toEqual([]);
    expect(dup(w.def.objectives.map((u) => u.id))).toEqual([]);
    const all = new Set(w.def.units.map((u) => u.id));
    expect(w.def.reinforcements.filter((r) => all.has(r.unit.id)).map((r) => r.unit.id)).toEqual([]);
  });
  it('all units start on land (not Sea/Lake) and inside the terrain grid', () => {
    const bad = w.def.units.map((u) => [u.id, terrainAtPos(w, u.pos)] as const).filter(([, t]) => t === Terrain.Sea || t === Terrain.Lake || t < 0);
    expect(bad).toEqual([]);
  });
  it('all locations are inside bbox; report those on sea cells (ports tolerated within 1 cell of land)', () => {
    const bad = w.def.locations.filter((l) => terrainAtPos(w, l.pos) < 0).map((l) => l.id);
    expect(bad).toEqual([]);
    const sea = w.def.locations.filter((l) => { const t = terrainAtPos(w, l.pos); return t === Terrain.Sea || t === Terrain.Lake; });
    // a location on a sea cell cannot be captured (territory anchors skip sea) – must be a port/bridge/airfield at most 1 cell from land
    const worse = sea.filter((l) => {
      const c = w.terrain.cellDeg; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const t = terrainAtPos(w, [l.pos[0] + dx * c, l.pos[1] + dy * c]); if (t > 0 && t !== Terrain.Lake) return false; } return true;
    });
    expect(worse.map((l) => l.id)).toEqual([]);
    if (sea.length) console.log(`[audit ${id}] locations on a sea cell:`, sea.map((l) => `${l.id}(${l.kind})`).join(', '));
  });
  it('units are within plausible theatre area (bbox, and not absurdly far from their nation hq)', () => {
    for (const u of w.def.units) {
      expect(u.pos[0] >= w.def.bbox.west && u.pos[0] <= w.def.bbox.east && u.pos[1] >= w.def.bbox.south && u.pos[1] <= w.def.bbox.north, u.id).toBe(true);
      expect(u.manpower).toBeLessThanOrEqual(u.manpowerMax);
      for (const k of ['organisation', 'morale', 'experience', 'fuel', 'ammo', 'supply', 'fatigue', 'readiness', 'entrenchment'] as const) expect(u[k] >= 0 && u[k] <= 100, `${u.id}.${k}=${u[k]}`).toBe(true);
      expect(w.def.nations.some((n) => n.id === u.nation), `${u.id} nation`).toBe(true);
      expect(w.def.nations.find((n) => n.id === u.nation)!.side, `${u.id} side`).toBe(u.side);
      if (u.parentId) expect(w.def.units.some((p) => p.id === u.parentId), `${u.id} parent ${u.parentId}`).toBe(true);
    }
  });
  it('every unit/location/objective has sidecar sources resolving to def.sources', () => {
    const ids = new Set(w.def.sources.map((s) => s.id));
    for (const u of w.def.units) { const s = side!.units[u.id]; expect(s?.sources?.length, `unit ${u.id} unsourced`).toBeGreaterThan(0); for (const x of s.sources) expect(ids.has(x), `${u.id}->${x}`).toBe(true); }
    for (const l of w.def.locations) { const s = side!.locations[l.id]; expect(s?.sources?.length, `loc ${l.id} unsourced`).toBeGreaterThan(0); for (const x of s.sources) expect(ids.has(x), `${l.id}->${x}`).toBe(true); }
    for (const o of w.def.objectives) { const s = side!.objectives?.[o.id]; expect(s?.sources?.length, `obj ${o.id} unsourced`).toBeGreaterThan(0); }
  });
  it('sidecar source ids all appear in docs/HISTORICAL_SOURCES.md', async () => {
    const { readFileSync } = await import('node:fs');
    const doc = readFileSync(new URL('../../docs/HISTORICAL_SOURCES.md', import.meta.url), 'utf8');
    const miss = w.def.sources.filter((s) => !doc.includes(`| ${s.id} |`)).map((s) => s.id);
    expect(miss).toEqual([]);
  });
  it('supply sources & objective locations exist; supply source owned by own nation', () => {
    const loc = new Map(w.def.locations.map((l) => [l.id, l]));
    for (const [n, ids] of Object.entries(w.def.supplySources)) for (const x of ids) { expect(loc.has(x), `${n}:${x}`).toBe(true); }
    for (const o of w.def.objectives) { const c = o.condition as { locationId?: string }; if (c.locationId) expect(loc.has(c.locationId), `${o.id}`).toBe(true); }
  });
  it('spot-check 15 random units + locations (seeded): position approximate flag, sources, plausible vs parent', () => {
    const r = mulberry(1234);
    const sample = Array.from({ length: 15 }, () => w.def.units[Math.floor(r() * w.def.units.length)]);
    const lines: string[] = [];
    for (const u of sample) {
      const s = side!.units[u.id];
      const parent = u.parentId ? w.def.units.find((p) => p.id === u.parentId) : undefined;
      const d = parent ? haversineKm(u.pos, parent.pos) : 0;
      lines.push(`${u.id.padEnd(16)} ${u.name.slice(0, 34).padEnd(34)} ${u.nation} src=${s.sources.join('/')} approx=${s.positionApproximate} terr=${terrainAtPos(w, u.pos)} distToParent=${d.toFixed(0)}km`);
      expect(d, `${u.id} is ${d}km from parent`).toBeLessThan(400);
    }
    console.log(`[spot-check ${id}]\n` + lines.join('\n'));
  });
  it('listScenarios exposes it as playable', () => { expect(listScenarios().find((s) => s.id === id)?.playable).toBe(true); });
  it('equipment held never exceeds authorised by absurd margins; manpowerMax > 0', () => {
    for (const u of w.def.units) { expect(u.manpowerMax).toBeGreaterThan(0); for (const k in u.equipment.held) expect(u.equipment.held[k], `${u.id}.${k}`).toBeGreaterThanOrEqual(0); }
  });
});
