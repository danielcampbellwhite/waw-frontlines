import type { GameState, LonLat, SideId, Unit, UnitType, WeatherKind } from '../core/types';
import type { SimContext } from './context';
import { fastKm, getGridInfo, terrainAt } from './gridutil';
import { SpatialHash } from './spatial';
import { hourAt } from './weather';
import { getSimMeta } from './meta';

/** A sighting spell ends after this many minutes without contact; the next sighting then counts as a first sighting. */
export const SIGHTING_RESET_MIN = 6 * 60;

/** Detection radius (km) by unit type: recon and air see far, logistics barely at all. */
export const DETECTION_KM: Record<UnitType, number> = {
  infantry: 10, paratroop: 10, engineer: 8, artillery: 8, antitank: 9, armoured: 14, mechanised: 13, motorised: 12,
  recon: 35, hq: 15, logistics: 5, naval: 30, carrier: 40, air_fighter: 50, air_bomber: 40,
};
// Terrain concealment of the TARGET cell: Sea, Plains, Forest, Hills, Mountains, Marsh, Urban, Desert, Jungle, Lake, Bocage
const CONCEAL = [1.1, 1, 0.6, 0.85, 0.8, 0.8, 0.55, 1.1, 0.45, 1, 0.5];
const WEATHER_VIS: Record<WeatherKind, number> = { clear: 1, cloud: 0.95, rain: 0.75, storm: 0.5, snow: 0.6, fog: 0.35, mud: 0.9, sandstorm: 0.4 };
const SIDES: SideId[] = ['allies', 'axis'];
const alive = (u: Unit) => !u.destroyed && !u.surrendered;

/** Units currently visible to `side` (own + detected enemies + neutrals). Uses the cache written by updateFog. */
export function visibleTo(state: Readonly<GameState>, side: SideId): Unit[] {
  const out: Unit[] = [];
  const fog = state.settings.fogOfWar;
  for (const id in state.units) {
    const u = state.units[id];
    if (!alive(u)) continue;
    if (!fog || u.side === side || u.side === 'neutral' || (u.visibleTo && u.visibleTo.includes(side))) out.push(u);
  }
  return out;
}

export function updateFog(state: GameState, ctx: SimContext): void {
  const units: Unit[] = [];
  for (const id in state.units) if (alive(state.units[id])) units.push(state.units[id]);
  if (!state.settings.fogOfWar) {
    for (const id in state.units) delete state.units[id].visibleTo;
    return;
  }
  const info = getGridInfo(ctx.terrain, ctx.infra);
  const midLat = (ctx.terrain.bbox.north + ctx.terrain.bbox.south) / 2;
  const hash = new SpatialHash<number>(25, midLat);
  for (let i = 0; i < units.length; i++) hash.insert(i, units[i].pos);
  const seen = new Uint8Array(units.length); // bit0 allies, bit1 axis
  const hour = hourAt(ctx.scenario, state.clock.minutes);
  const night = hour < 5 || hour >= 21;
  const wv = WEATHER_VIS[state.weather.kind] ?? 1;
  for (let oi = 0; oi < units.length; oi++) {
    const o = units[oi];
    if (o.side === 'neutral') continue;
    const bit = o.side === 'allies' ? 1 : 2;
    const air = o.domain === 'air';
    const base = DETECTION_KM[o.type] * wv * (night ? (air ? 0.5 : 0.7) : 1);
    if (base < 1) continue;
    const maxR = base * 1.25; // desert/sea/moving bonus ceiling
    hash.query(o.pos, maxR, (ti) => {
      if (seen[ti] & bit) return;
      const t = units[ti];
      if (t.side === o.side || t.side === 'neutral') return;
      const d = fastKm(o.pos, t.pos);
      if (d > maxR) return;
      const tt = terrainAt(info, t.pos);
      let r = base * CONCEAL[tt];
      if (t.moveStatus === 'moving') r *= 1.2;
      if (t.domain === 'air') r *= 1.0;
      if (d <= r) seen[ti] |= bit;
    });
  }
  const t = state.clock.minutes;
  const fs = getSimMeta(state).firstSeen;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const vis: SideId[] = [];
    for (const s of SIDES) {
      const bit = s === 'allies' ? 1 : 2;
      if (u.side === s || (seen[i] & bit) !== 0) {
        vis.push(s);
        if (u.side !== s) {
          const rec = (fs[u.id] ??= {});
          const e = rec[s];
          if (!e || t - e[1] > SIGHTING_RESET_MIN) rec[s] = [t, t]; else e[1] = t;
          const p: LonLat = [u.pos[0], u.pos[1]];
          if (!u.lastSeenBy) u.lastSeenBy = {};
          u.lastSeenBy[s] = { pos: p, minutes: t };
        }
      }
    }
    u.visibleTo = vis;
  }
  if (Math.floor(t / 60) % 24 === 0) {
    for (const id of Object.keys(fs)) {
      const u = state.units[id];
      if (!u || !alive(u)) { delete fs[id]; continue; }
      for (const s of Object.keys(fs[id])) if (t - fs[id][s][1] > SIGHTING_RESET_MIN) delete fs[id][s];
      if (Object.keys(fs[id]).length === 0) delete fs[id];
    }
  }
}
