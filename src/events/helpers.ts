/** Shared helpers for event templates (pure state manipulation; deterministic). */
import { haversineKm, moveToward } from '../core/geo';
import { nextFloat } from '../core/rng';
import type {
  GameState, Location, LocationKind, LogEntry, LonLat, NationId, ReinforcementArrival, SideId, Unit, UnitType,
} from '../core/types';
import type { EventContext, EventEnv } from './types';

export const clamp = (v: number, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);
export const opposite = (s: SideId): SideId => (s === 'allies' ? 'axis' : s === 'axis' ? 'allies' : 'neutral');
export const isAlive = (u: Unit) => !u.destroyed && !u.surrendered;

export function pushLog(state: GameState, e: Omit<LogEntry, 't'>): void {
  state.log.push({ t: state.clock.minutes, ...e });
}

export function nationsOfSide(state: GameState, side: SideId): NationId[] {
  return Object.values(state.nations).filter((n) => n.side === side).map((n) => n.id).sort();
}

/** Principal nation for a side: the player's nation, else the nation with most live units. */
export function principalNation(state: GameState, side: SideId): NationId {
  if (state.playerSide === side && state.nations[state.playerNation]) return state.playerNation;
  const ns = nationsOfSide(state, side);
  let best: NationId = ns[0] ?? 'NEUTRAL', bc = -1;
  for (const n of ns) {
    let c = 0;
    for (const id in state.units) { const u = state.units[id]; if (u.nation === n && isAlive(u)) c++; }
    if (c > bc) { bc = c; best = n; }
  }
  return best;
}

export function makeEnv(state: GameState, side: SideId, ctx?: EventContext): EventEnv {
  const rand = ctx ? () => ctx.rand() : () => nextFloat(state.rng);
  const gauss = ctx?.gauss ? () => ctx.gauss!() : () => (rand() + rand() + rand() + rand() - 2) * 1.7320508;
  return {
    state, side, enemySide: opposite(side), nation: principalNation(state, side), nations: nationsOfSide(state, side),
    isPlayer: side === state.playerSide, now: state.clock.minutes, rand, gauss, scenario: ctx?.scenario,
    log(text, severity = 'info', pos) {
      const e = { category: 'event' as const, text, severity, pos };
      if (ctx?.log) ctx.log(e); else pushLog(state, e);
    },
  };
}

export function sideUnits(state: GameState, side: SideId, f?: (u: Unit) => boolean): Unit[] {
  const out: Unit[] = [];
  for (const id in state.units) {
    const u = state.units[id];
    if (u.side === side && isAlive(u) && u.domain === 'land' && (!f || f(u))) out.push(u);
  }
  return out;
}

export const MOBILE: UnitType[] = ['armoured', 'mechanised', 'motorised', 'recon'];
export const isMobile = (u: Unit) => MOBILE.includes(u.type);
export const isCombat = (u: Unit) => u.type !== 'hq' && u.type !== 'logistics';

export function pick<T>(env: EventEnv, items: T[]): T | undefined {
  return items.length ? items[Math.min(items.length - 1, Math.floor(env.rand() * items.length))] : undefined;
}

export function nearest<T extends { pos: LonLat }>(from: LonLat, items: T[], n = 1): T[] {
  return [...items].map((i) => ({ i, d: haversineKm(from, i.pos) })).sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.i);
}

export type Stat = 'morale' | 'organisation' | 'fuel' | 'ammo' | 'supply' | 'fatigue' | 'entrenchment' | 'experience' | 'readiness';
export function adj(u: Unit, stat: Stat, delta: number): void { u[stat] = clamp(u[stat] + delta); }
export function adjManpower(u: Unit, frac: number): void { u.manpower = Math.max(0, Math.round(u.manpower * (1 + frac))); }

export type Resource = 'manpower' | 'fuel' | 'ammo' | 'equipment' | 'supplyPoints';
export function adjRes(state: GameState, nation: NationId, key: Resource, delta: number): number {
  const n = state.nations[nation];
  if (!n) return 0;
  const before = n.resources[key];
  n.resources[key] = Math.max(0, before + delta);
  return n.resources[key] - before;
}
export function hasRes(state: GameState, nation: NationId, key: Resource, amount: number): boolean {
  return (state.nations[nation]?.resources[key] ?? 0) >= amount;
}
/** Spend up to `amount` of a resource (all nations on the side are tried, principal first). Returns amount spent. */
export function spend(env: EventEnv, key: Resource, amount: number): number {
  const order = [env.nation, ...env.nations.filter((n) => n !== env.nation)];
  let left = amount;
  for (const n of order) {
    const have = env.state.nations[n]?.resources[key] ?? 0;
    const take = Math.min(have, left);
    if (take > 0) { env.state.nations[n].resources[key] -= take; left -= take; }
    if (left <= 0) break;
  }
  return amount - left;
}
export function sideRes(env: EventEnv, key: Resource): number {
  return env.nations.reduce((s, n) => s + (env.state.nations[n]?.resources[key] ?? 0), 0);
}

export function sideLocations(state: GameState, side: SideId, kinds?: LocationKind[]): Location[] {
  return Object.values(state.locations).filter((l) => state.nations[l.owner]?.side === side && (!kinds || kinds.includes(l.kind)));
}

/** Nearest enemy unit to a point (alive land). */
export function nearestEnemy(state: GameState, side: SideId, from: LonLat): { unit: Unit; km: number } | null {
  let best: Unit | null = null, bd = Infinity;
  for (const id in state.units) {
    const u = state.units[id];
    if (!isAlive(u) || u.domain !== 'land' || u.side === side || u.side === 'neutral') continue;
    const d = haversineKm(from, u.pos);
    if (d < bd) { bd = d; best = u; }
  }
  return best ? { unit: best, km: bd } : null;
}

/** Move a unit `km` straight away from a point. */
export function pushAwayFrom(u: Unit, from: LonLat, km: number): void {
  const away: LonLat = [u.pos[0] + (u.pos[0] - from[0]), u.pos[1] + (u.pos[1] - from[1])];
  u.pos = moveToward(u.pos, away, km);
}

/**
 * Schedule a reinforcement by cloning an existing unit of the nation (we cannot call military's
 * createUnitFromTemplate from here without coupling; cloning keeps the nation's real equipment keys).
 * Returns the arrival or null when no suitable donor/location exists.
 */
export function scheduleReinforcement(
  env: EventEnv, nation: NationId, opts: { types?: UnitType[]; delayMinutes?: number; strength?: number; label?: string; locationId?: string },
): ReinforcementArrival | null {
  const { state } = env;
  const donors = Object.values(state.units).filter((u) => u.nation === nation && u.domain === 'land' && u.type !== 'hq' && u.type !== 'logistics'
    && (!opts.types || opts.types.includes(u.type)));
  const donor = donors.sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  if (!donor) return null;
  const side = state.nations[nation]?.side;
  const locs = sideLocations(state, side ?? donor.side, ['depot', 'city', 'town', 'port']).filter((l) => l.owner === nation);
  let loc: Location | undefined = opts.locationId ? state.locations[opts.locationId] : undefined;
  if (!loc && locs.length) {
    // rear-most: furthest from the nearest enemy
    loc = [...locs].sort((a, b) => {
      const da = nearestEnemy(state, donor.side, a.pos)?.km ?? 0, db = nearestEnemy(state, donor.side, b.pos)?.km ?? 0;
      return db - da || (a.id < b.id ? -1 : 1);
    })[0];
  }
  const id = `rf_${state.idCounter++}`;
  const frac = opts.strength ?? 0.7;
  const unit: Unit = JSON.parse(JSON.stringify(donor)) as Unit;
  unit.id = `u_${id}`;
  unit.name = `${opts.label ?? 'Reinforcement'} (${donor.shortName})`;
  unit.shortName = `Rfn ${donor.shortName}`;
  unit.manpower = Math.round(donor.manpowerMax * frac);
  unit.organisation = 70; unit.morale = 75; unit.fatigue = 5; unit.fuel = 90; unit.ammo = 90; unit.supply = 85; unit.entrenchment = 0;
  unit.kills = 0; unit.orders = []; unit.route = undefined; unit.inBattle = undefined; unit.encircled = false;
  unit.moveStatus = 'stationary'; unit.combatStatus = 'idle'; unit.posture = 'hold'; unit.parentId = undefined; unit.visibleTo = undefined; unit.lastSeenBy = undefined;
  for (const k in unit.equipment.held) unit.equipment.held[k] = Math.round((unit.equipment.authorised[k] ?? unit.equipment.held[k]) * frac);
  if (loc) { unit.pos = [loc.pos[0], loc.pos[1]]; unit.homeLocation = loc.id; }
  const arr: ReinforcementArrival = { id, atMinutes: env.now + (opts.delayMinutes ?? 360), locationId: loc?.id, pos: loc ? undefined : unit.pos, unit };
  state.nations[nation].reinforcements.push(arr);
  return arr;
}
