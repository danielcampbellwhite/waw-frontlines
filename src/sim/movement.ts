import type { GameState, LonLat, Order, Unit } from '../core/types';
import { TICK_MINUTES, Terrain } from '../core/types';
import { haversineKm, moveToward, cellOf } from '../core/geo';
import type { SimContext } from './context';
import { CONTACT_KM, STACK_LIMIT, STOP_KM } from './constants';
import { fastKm, getGridInfo, roadAt, terrainAt, type GridInfo } from './gridutil';
import { etaMinutesAlong, findRoute, moveClassOf, passableIce, SUBSTEP_KM, unitSpeedKmh } from './pathfinding';
import { iceOf } from './ice';
import { getSimMeta } from './meta';
import { SpatialHash } from './spatial';

const MOVE_KINDS = new Set(['move', 'attack', 'withdraw', 'recon', 'capture', 'reinforce', 'support', 'follow', 'defensive_line', 'defend']);
const COMPLETE_ON_ARRIVAL = new Set(['move', 'withdraw', 'recon', 'capture', 'reinforce', 'defend', 'defensive_line']);
const ARRIVE_KM = 0.6;
const FOLLOW_KM = 3;
const ROUTES_PER_TICK = 60;

const isAlive = (u: Unit) => !u.destroyed && !u.surrendered;

function orderTarget(state: GameState, u: Unit, o: Order): LonLat | null {
  if (o.kind === 'support' || o.kind === 'follow') {
    const t = o.targetUnit ? state.units[o.targetUnit] : undefined;
    return t && isAlive(t) ? t.pos : null;
  }
  if (o.kind === 'capture' && o.targetLocation) {
    const l = state.locations[o.targetLocation];
    if (l) return l.pos;
  }
  if (o.kind === 'defensive_line' && o.line && o.line.length) return o.line[Math.floor(o.line.length / 2)];
  if (o.target) return o.target;
  if (o.targetUnit) {
    const t = state.units[o.targetUnit];
    if (t && isAlive(t)) return t.pos;
  }
  void u;
  return null;
}

interface MoveEnv {
  state: GameState;
  ctx: SimContext;
  info: GridInfo;
  enemies: SpatialHash<Unit>;
  stack: Map<number, number>;
  /** route computations still allowed this tick (keeps order bursts from spiking one frame) */
  routeBudget: number;
  /** set by advanceAlong when the unit could not move because its tank is empty */
  fuelHalt: boolean;
  /** serviceable airfields this tick (owner side resolved) */
  ice: number;
  airfields: { loc: GameState['locations'][string]; side: string }[];
}

const sideIdx = (s: string) => (s === 'allies' ? 0 : s === 'axis' ? 1 : 2);
function stackKey(info: GridInfo, p: LonLat, side: string): number {
  const c = cellOf(info.spec, p);
  return c ? (c[1] * info.cols + c[0]) * 3 + sideIdx(side) : -1;
}
const countsForStack = (u: Unit) => u.domain === 'land';

/** Combat troops exert a zone of control (units stop and fight at ZOC_KM, inside battle contact range); support troops only block at STOP_KM. */
const ZOC_KM = 4.5;
const isCombatTroop = (u: Unit) => u.type !== 'recon' && u.type !== 'hq' && u.type !== 'logistics';
function enemyTooClose(env: MoveEnv, u: Unit, p: LonLat): boolean {
  let hit = false;
  // true positions are used regardless of fog: you bump into enemies you have not seen yet
  env.enemies.query(p, ZOC_KM, (e) => {
    if (hit || e.side === u.side || e.side === 'neutral' || !isAlive(e)) return;
    const r = isCombatTroop(e) ? ZOC_KM : STOP_KM;
    const dx = (p[0] - e.pos[0]) * 111.32 * Math.cos((p[1] * Math.PI) / 180), dy = (p[1] - e.pos[1]) * 110.57;
    if (dx * dx + dy * dy < r * r) hit = true;
  });
  return hit;
}

/** Move along `route` (mutated) for up to `hours`. Returns km travelled. */
function advanceAlong(env: MoveEnv, u: Unit, route: LonLat[], hours: number, forced: boolean): number {
  const { info, state } = env;
  const weather = state.weather.kind;
  const land = u.domain === 'land';
  let budget = hours, travelled = 0;
  env.fuelHalt = false;
  while (budget > 1e-9 && route.length) {
    const wp = route[0];
    const d = haversineKm(u.pos, wp);
    if (d < 1e-6) { route.shift(); continue; }
    const stepKm = Math.min(d, SUBSTEP_KM);
    const dest = stepKm >= d ? wp : moveToward(u.pos, wp, stepKm);
    const mid: LonLat = [(u.pos[0] + dest[0]) / 2, (u.pos[1] + dest[1]) / 2];
    let v = unitSpeedKmh(u, terrainAt(info, mid), weather, roadAt(info, mid) > 0, env.ice);
    if (forced) v *= 1.25;
    if (v <= 0) { env.fuelHalt = true; break; }
    const need = stepKm / v;
    let np = dest, used = need;
    if (need > budget) { np = moveToward(u.pos, dest, v * budget); used = budget; }
    if (land && !passableIce(moveClassOf(u.type), terrainAt(info, np, Terrain.Plains), env.ice)) { route.length = 0; break; } // never enter sea/lake
    if (land && !forced) {
      if (enemyTooClose(env, u, np)) {
        // advance to the edge of the zone of control (bisection), so the halted unit ends inside battle contact range
        let ok: LonLat | null = null;
        const at = (f: number): LonLat => [u.pos[0] + (np[0] - u.pos[0]) * f, u.pos[1] + (np[1] - u.pos[1]) * f];
        if (!enemyTooClose(env, u, at(0.05))) {
          let lo = 0.05, hi = 1;
          for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (enemyTooClose(env, u, at(m))) hi = m; else lo = m; }
          ok = at(lo);
        }
        if (!ok) break;
        np = ok; // partial step, then stop
        travelled += haversineKm(u.pos, np); u.pos = np;
        break;
      }
      const k0 = stackKey(info, u.pos, u.side), k1 = stackKey(info, np, u.side);
      if (k1 !== k0 && k1 >= 0 && (env.stack.get(k1) ?? 0) >= STACK_LIMIT && countsForStack(u)) break; // cell full: hold
    }
    travelled += haversineKm(u.pos, np);
    u.pos = np;
    budget -= used;
    if (np === wp) route.shift();
  }
  return travelled;
}

function updateStack(env: MoveEnv, u: Unit, from: LonLat) {
  if (!countsForStack(u)) return;
  const a = stackKey(env.info, from, u.side), b = stackKey(env.info, u.pos, u.side);
  if (a === b) return;
  if (a >= 0) env.stack.set(a, Math.max(0, (env.stack.get(a) ?? 1) - 1));
  if (b >= 0) env.stack.set(b, (env.stack.get(b) ?? 0) + 1);
}

function setRoute(env: MoveEnv, u: Unit, tgt: LonLat): boolean {
  const r = findRoute(env.ctx.terrain, env.ctx.infra, u, tgt, env.state);
  if (!r) return false;
  const path = r.path.slice();
  if (path.length && haversineKm(path[0], u.pos) < 0.05) path.shift();
  u.route = path;
  u.routeEtaMinutes = Math.round(r.etaMinutes);
  return true;
}

/** The nearest friendly, serviceable airfield if the aircraft is more than 10 km from one; otherwise undefined (already based). */
function airBaseOf(env: MoveEnv, u: Unit): MoveEnv['airfields'][number] | undefined {
  let best: MoveEnv['airfields'][number] | undefined, bd = Infinity;
  for (const f of env.airfields) {
    if (f.side !== u.side) continue;
    const d = fastKm(u.pos, f.loc.pos);
    if (d <= 10) return undefined;
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function entrenchGain(u: Unit, o: Order | undefined): number {
  const eng = u.type === 'engineer' ? 1.5 : 1;
  if (o && o.status === 'active' && o.kind === 'entrench') return 2 * eng;
  if (u.posture === 'entrench') return 1.6 * eng;
  if (u.posture === 'defend') return 0.7 * eng;
  if (u.posture === 'hold') return 0.35 * eng;
  return 0;
}
function entrenchCap(u: Unit, o: Order | undefined): number {
  if ((o && o.status === 'active' && o.kind === 'entrench') || u.posture === 'entrench') return 100;
  if (u.posture === 'defend') return 65;
  if (u.posture === 'hold') return 40;
  return 0;
}

export function updateMovement(state: GameState, ctx: SimContext): void {
  const info = getGridInfo(ctx.terrain, ctx.infra);
  const midLat = (ctx.terrain.bbox.north + ctx.terrain.bbox.south) / 2;
  const enemies = new SpatialHash<Unit>(Math.max(STOP_KM, CONTACT_KM), midLat);
  const stack = new Map<number, number>();
  for (const id in state.units) {
    const u = state.units[id];
    if (!isAlive(u) || u.domain !== 'land') continue;
    enemies.insert(u, u.pos);
    const k = stackKey(info, u.pos, u.side);
    if (k >= 0) stack.set(k, (stack.get(k) ?? 0) + 1);
  }
  const env: MoveEnv = { state, ctx, info, enemies, stack, routeBudget: ROUTES_PER_TICK, fuelHalt: false, ice: iceOf(state), airfields: [] };
  for (const lid in state.locations) {
    const l = state.locations[lid];
    if (l.kind === 'airfield' && (l.damaged ?? 0) < 95) env.airfields.push({ loc: l, side: state.nations[l.owner]?.side ?? 'neutral' });
  }
  const hours = TICK_MINUTES / 60;
  const retreating = getSimMeta(state).retreating;
  const tickNo = Math.floor(state.clock.minutes / TICK_MINUTES);

  for (const id in state.units) {
    const u = state.units[id];
    if (!isAlive(u)) continue;
    const from: LonLat = u.pos;
    const o = u.orders.length ? u.orders[0] : undefined;
    let moved = 0;
    const airBase = u.domain === 'air' && !u.inBattle && u.moveStatus !== 'retreating' && !(o && MOVE_KINDS.has(o.kind) && o.status === 'active') ? airBaseOf(env, u) : undefined;

    if (retreating[id]) {
      if (u.route && u.route.length && u.moveStatus !== 'retreating') u.moveStatus = 'retreating'; // a retreat in progress is not cancelled by other modules
      else if (u.moveStatus !== 'retreating') delete retreating[id];
    }
    if (u.moveStatus === 'retreating') {
      const route = u.route ?? [];
      if (route.length) {
        moved = advanceAlong(env, u, route, hours, true);
        u.route = route;
      }
      if (!u.route || u.route.length === 0) {
        u.route = undefined; u.routeEtaMinutes = undefined;
        u.moveStatus = 'stationary';
        delete retreating[id];
        if (u.combatStatus === 'routed' && u.organisation > 35 && u.morale > 20) u.combatStatus = 'idle';
        if (!u.inBattle && u.combatStatus !== 'routed' && u.combatStatus !== 'encircled') u.combatStatus = 'idle';
      } else u.routeEtaMinutes = Math.round(etaMinutesAlong(info, u, [u.pos, ...u.route], state.weather.kind, env.ice));
    } else if (u.inBattle) {
      u.moveStatus = 'stationary'; // locked in combat
    } else if (o && o.status === 'active' && MOVE_KINDS.has(o.kind)) {
      const tgt = orderTarget(state, u, o);
      if (!tgt) {
        if (o.kind === 'support' || o.kind === 'follow') { o.status = 'failed'; o.note = 'target lost'; }
        u.moveStatus = 'stationary'; u.route = undefined;
      } else {
        const dist = haversineKm(u.pos, tgt);
        const follow = o.kind === 'support' || o.kind === 'follow';
        const arrived = dist <= (follow ? FOLLOW_KM : ARRIVE_KM);
        if (arrived) {
          u.route = undefined; u.routeEtaMinutes = undefined; u.moveStatus = 'stationary';
          if (COMPLETE_ON_ARRIVAL.has(o.kind)) o.status = 'complete';
          else if (o.kind === 'attack') {
            let enemyNear = false;
            enemies.query(u.pos, CONTACT_KM + 4, (e) => { if (e.side !== u.side && e.side !== 'neutral') enemyNear = true; });
            if (!enemyNear) o.status = 'complete';
          }
        } else {
          const stale = !u.route || u.route.length === 0 ||
            haversineKm(u.route[u.route.length - 1], tgt) > 2 || (follow && tickNo % 6 === 0);
          if (stale && env.routeBudget <= 0) { /* planning queue full: start marching next tick */ }
          else if (stale && (env.routeBudget--, !setRoute(env, u, tgt))) {
            o.status = 'failed'; o.note = 'no route to target'; u.route = undefined; u.moveStatus = 'stationary';
          }
          if (o.status === 'active' && u.route && u.route.length) {
            u.moveStatus = 'moving';
            moved = advanceAlong(env, u, u.route, hours, false);
            if (env.fuelHalt) u.moveStatus = 'stationary'; // out of fuel: stand still so supply can refuel it; the order stays active
            else if (moved < 0.05 && u.route.length > 0) u.moveStatus = 'stationary'; // held by contact-stop / full cell: no marching fuel burn while not advancing
            if (u.route.length === 0) {
              u.route = undefined; u.routeEtaMinutes = undefined;
              if (haversineKm(u.pos, tgt) <= ARRIVE_KM + 0.5 && COMPLETE_ON_ARRIVAL.has(o.kind)) { o.status = 'complete'; u.moveStatus = 'stationary'; }
            } else u.routeEtaMinutes = Math.round(etaMinutesAlong(info, u, [u.pos, ...u.route], state.weather.kind, env.ice));
          }
        }
      }
    } else if (airBase) {
      // idle aircraft return to the nearest friendly serviceable airfield (they are based, not parked in the sky)
      const base = airBase.loc;
      if (!u.route || u.route.length === 0 || haversineKm(u.route[u.route.length - 1], base.pos) > 2) {
        if (env.routeBudget > 0) { env.routeBudget--; if (!setRoute(env, u, base.pos)) u.route = undefined; }
      }
      if (u.route && u.route.length) {
        u.moveStatus = 'moving';
        moved = advanceAlong(env, u, u.route, hours, false);
        if (env.fuelHalt || (moved < 0.05 && u.route.length > 0)) u.moveStatus = 'stationary';
        if (u.route.length === 0) { u.route = undefined; u.routeEtaMinutes = undefined; u.moveStatus = 'stationary'; }
        else u.routeEtaMinutes = Math.round(etaMinutesAlong(info, u, [u.pos, ...u.route], state.weather.kind, env.ice));
      } else u.moveStatus = 'stationary';
    } else {
      if (u.route) { u.route = undefined; u.routeEtaMinutes = undefined; }
      u.moveStatus = 'stationary';
    }

    if (u.pos !== from) updateStack(env, u, from);
    // entrenchment: dig in when still, lose it when moving
    if (u.domain === 'land' && u.moveStatus !== 'moving' && u.moveStatus !== 'retreating' && moved === 0) {
      const cap = entrenchCap(u, o), gain = entrenchGain(u, o);
      if (gain > 0 && u.entrenchment < cap) u.entrenchment = Math.min(cap, u.entrenchment + gain);
      else if (cap < u.entrenchment && !u.inBattle) u.entrenchment = Math.max(cap, u.entrenchment - 0.5);
    } else if (moved > 0.5) u.entrenchment = Math.max(0, u.entrenchment - (u.moveStatus === 'retreating' ? 10 : 6));
    // movement through impassable terrain is a data error for land units; never let a land unit sit in open sea
    if (u.domain === 'land' && terrainAt(info, u.pos) === Terrain.Sea) u.route = undefined;
  }
}
