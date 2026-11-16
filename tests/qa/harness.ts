import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameSettings, GameState, InfraLine, NationId, ScenarioDefinition, TerrainGrid, Unit } from '../../src/core/types';
import { getHistoricalEvents, getScenarioDefinition, getScenarioSidecar } from '../../src/data';
import { clearHistoricalTemplates, registerHistoricalEventsFromData } from '../../src/events';
import { createEngine, restoreEngine } from '../../src/sim';
import type { EngineOptions } from '../../src/sim';

const ROOT = resolve(__dirname, '../..');
const cache = new Map<string, unknown>();
export const FALLBACKS: string[] = [];
/** Data files not delivered yet fall back to the Western Europe raster/infra (covers the Ardennes bbox); recorded in FALLBACKS. */
export function loadDataFile<T>(file: string): T {
  if (!cache.has(file)) {
    let path = resolve(ROOT, 'public/data', file);
    if (!existsSync(path)) { const fb = file.startsWith('terrain_') ? 'terrain_westeurope.json' : 'infra_westeurope.json'; FALLBACKS.push(`${file} -> ${fb}`); path = resolve(ROOT, 'public/data', fb); }
    cache.set(file, JSON.parse(readFileSync(path, 'utf8')));
  }
  return cache.get(file) as T;
}
export interface World { def: ScenarioDefinition; terrain: TerrainGrid; infra: InfraLine[] }
export function loadWorld(id = 'fall_of_france.standard'): World {
  const def = getScenarioDefinition(id);
  if (!def) throw new Error('no scenario ' + id);
  const terrain = loadDataFile<TerrainGrid>(def.terrainFile);
  const raw = loadDataFile<InfraLine[] | { lines: InfraLine[] }>(def.infraFile);
  const infra = Array.isArray(raw) ? raw : raw.lines;
  return { def, terrain, infra };
}
export const SETTINGS: GameSettings = {
  difficulty: 'normal', aiAggression: 0.5, fogOfWar: true, historicalDeployment: true, randomEvents: true,
  logisticsDifficulty: 1, reinforcementAvailability: 1, historicalEventFrequency: 1,
};
/** Registers the campaign's historical events exactly as src/app/App.tsx does (they are global module state). */
export function registerEvents(campaignId: string) {
  clearHistoricalTemplates();
  try { registerHistoricalEventsFromData(getHistoricalEvents(campaignId)); } catch { /* campaign without events */ }
}
export function mkEngine(w: World, nation: NationId, seed: number, extra: Partial<EngineOptions> = {}, settings: Partial<GameSettings> = {}) {
  registerEvents(w.def.campaignId);
  return createEngine(structuredClone(w.def), w.terrain, w.infra, { playerNation: nation, settings: { ...SETTINGS, ...settings }, seed, ...extra });
}
export function restore(w: World, s: GameState) { return restoreEngine(s, structuredClone(w.def), w.terrain, w.infra); }
export const J = (x: unknown) => JSON.stringify(x);
export { getScenarioSidecar };

/** Whole-state invariant checker. Returns list of violations. */
export function checkInvariants(s: GameState): string[] {
  const bad: string[] = [];
  const rng01 = (v: unknown, where: string) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < -1e-9 || v > 100 + 1e-9) bad.push(`${where}=${String(v)} outside 0..100`); };
  const fin = (v: unknown, where: string) => { if (typeof v !== 'number' || !Number.isFinite(v)) bad.push(`${where}=${String(v)} not finite`); };
  const nonneg = (v: unknown, where: string) => { fin(v, where); if (typeof v === 'number' && v < 0) bad.push(`${where}=${v} negative`); };
  const walk = (v: unknown, path: string, depth: number) => {
    if (depth > 12) return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(`${path}=${v} non-finite`); return; }
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) { if (v.length > 5000 && !path.startsWith('control')) return; v.forEach((x, i) => { if (i < 400 || path.startsWith('control') === false) walk(x, `${path}[${i}]`, depth + 1); }); }
      else for (const k in v as object) walk((v as Record<string, unknown>)[k], `${path}.${k}`, depth + 1);
    }
  };
  for (const id in s.units) {
    const u = s.units[id]; const p = `unit ${id}`;
    if (u.id !== id) bad.push(`${p} id mismatch`);
    for (const k of ['organisation', 'morale', 'experience', 'fuel', 'ammo', 'supply', 'fatigue', 'readiness', 'entrenchment'] as const) rng01(u[k], `${p}.${k}`);
    nonneg(u.manpower, `${p}.manpower`);
    if (u.manpower > u.manpowerMax + 1e-6) bad.push(`${p} manpower ${u.manpower} > max ${u.manpowerMax}`);
    nonneg(u.kills, `${p}.kills`);
    for (const k in u.equipment.held) nonneg(u.equipment.held[k], `${p}.equip.${k}`);
    if (!Array.isArray(u.pos) || !Number.isFinite(u.pos[0]) || !Number.isFinite(u.pos[1])) bad.push(`${p} bad pos`);
    else if (u.pos[0] < s.control.bbox.west - 1 || u.pos[0] > s.control.bbox.east + 1 || u.pos[1] < s.control.bbox.south - 1 || u.pos[1] > s.control.bbox.north + 1) bad.push(`${p} far outside bbox ${u.pos}`);
    if (u.destroyed && u.moveStatus === 'moving') bad.push(`${p} destroyed but moving`);
    if (u.orders.length > 60) bad.push(`${p} order queue ${u.orders.length}`);
  }
  for (const id in s.locations) { const l = s.locations[id]; if (l.damaged !== undefined) rng01(l.damaged, `loc ${id}.damaged`); if (!s.nations[l.owner] && l.owner !== 'NEUTRAL') bad.push(`loc ${id} owner ${l.owner} unknown`); }
  for (const id in s.nations) { const r = s.nations[id].resources; for (const k in r) nonneg((r as Record<string, number>)[k], `nation ${id}.res.${k}`); }
  for (const c of s.control.owner) if (!Number.isInteger(c) || c < 0 || c >= s.control.nations.length) { bad.push(`control owner index ${c} invalid`); break; }
  for (const c of s.control.contested) if (!(c >= 0 && c <= 100)) { bad.push(`control.contested ${c}`); break; }
  fin(s.clock.minutes, 'clock.minutes');
  for (const bid in s.battles) {
    const b = s.battles[bid];
    for (const uid of [...b.attackers, ...b.defenders]) if (!s.units[uid]) bad.push(`battle ${bid} refs missing unit ${uid}`);
  }
  for (const r of s.reports) {
    for (const c of r.casualties) {
      nonneg(c.killed, `report ${r.id} killed`); nonneg(c.wounded, `report ${r.id} wounded`); nonneg(c.captured, `report ${r.id} captured`);
    }
    for (const o of r.orgChanges) { rng01(o.before, `report ${r.id} org before`); rng01(o.after, `report ${r.id} org after`); }
    if (!r.reasons.length) bad.push(`report ${r.id} has no reasons`);
  }
  for (const k in s.weather) if (typeof (s.weather as never)[k] === 'number') fin((s.weather as never)[k], `weather.${k}`);
  walk({ ...s, control: undefined, units: undefined } as unknown, 'state', 0);
  return bad;
}
export const aliveUnits = (s: GameState, side?: string): Unit[] => Object.values(s.units).filter((u) => !u.destroyed && !u.surrendered && (!side || u.side === side));

/** Same world with the campaign pushed far into the future and no objectives, so long runs are not cut short by victory. */
export function longWorld(id = 'fall_of_france.standard'): World {
  const w = loadWorld(id);
  const def = structuredClone(w.def);
  def.endDate = '1942-01-01T00:00:00Z';
  def.objectives = [];
  for (const p of def.playableNations) p.objectiveIds = [];
  return { ...w, def };
}

/** First N differing paths between two JSON-able values. */
export function diffPaths(a: unknown, b: unknown, max = 15, path = '$', out: string[] = []): string[] {
  if (out.length >= max) return out;
  if (typeof a !== typeof b || (a === null) !== (b === null)) { out.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} vs ${JSON.stringify(b)?.slice(0, 60)}`); return out; }
  if (a && typeof a === 'object') {
    const ka = Object.keys(a as object), kb = Object.keys(b as object);
    for (const k of new Set([...ka, ...kb])) { if (out.length >= max) break; diffPaths((a as never)[k], (b as never)[k], max, `${path}.${k}`, out); }
  } else if (a !== b) out.push(`${path}: ${String(a).slice(0, 60)} vs ${String(b).slice(0, 60)}`);
  return out;
}

/** Canonical JSON (sorted keys) for semantic equality independent of property insertion order. */
export function CJ(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
}
