import type { Battle, BattleReport, GameState, Location, LonLat, SideId, Unit, UnitType } from '../core/types';
import { Terrain, TICK_MINUTES } from '../core/types';
import { bearingDeg, destination, haversineKm } from '../core/geo';
import type { SimContext } from './context';
import { AIR_SUPPORT_KM, ARTILLERY_SUPPORT_KM, CONTACT_KM, MAX_BATTLE_ROUNDS, MAX_REPORTS } from './constants';
import { cellIdxOf, fastKm, getGridInfo, type GridInfo } from './gridutil';
import { getSimMeta, type BattleMeta } from './meta';
import { findRoute, moveClassOf, passableIce } from './pathfinding';
import { iceOf } from './ice';
import { SpatialHash } from './spatial';
import { ownerSideAt } from './territory';

const alive = (u: Unit) => !u.destroyed && !u.surrendered;

// ───────────────────────── tables ─────────────────────────
/** [attack, defence] points per 1000 men (scaled by equipment). */
const RATING: Record<UnitType, [number, number]> = {
  infantry: [7, 9], paratroop: [8, 9], engineer: [5, 6], artillery: [6, 5], antitank: [4, 9], motorised: [7, 7],
  mechanised: [10, 9], armoured: [14, 10], recon: [2, 2], hq: [0.5, 0.7], logistics: [0.3, 0.4],
  air_fighter: [0, 0], air_bomber: [0, 0], naval: [0, 0], carrier: [0, 0],
};
const EQ_WEIGHT: Record<UnitType, number> = {
  armoured: 0.8, mechanised: 0.7, artillery: 0.8, antitank: 0.8, motorised: 0.5, recon: 0.5,
  infantry: 0.4, paratroop: 0.4, engineer: 0.4, hq: 0.2, logistics: 0.3, air_fighter: 1, air_bomber: 1, naval: 1, carrier: 1,
};
const CASUALTY_EXPOSURE: Partial<Record<UnitType, number>> = { artillery: 0.5, hq: 0.4, logistics: 0.8, armoured: 0.7, mechanised: 0.8, antitank: 0.9 };
const EQUIP_EXPOSURE: Partial<Record<UnitType, number>> = { armoured: 1.5, mechanised: 1.3, artillery: 1.0, antitank: 1.1, infantry: 0.9 };
const TERRAIN_NAME = ['sea', 'open plains', 'forest', 'hills', 'mountains', 'marsh', 'urban terrain', 'desert', 'jungle', 'lake'];
// Sea, Plains, Forest, Hills, Mountains, Marsh, Urban, Desert, Jungle, Lake
const DEF_TERRAIN = [1, 1, 1.25, 1.35, 1.7, 1.2, 1.5, 0.95, 1.4, 1];
const ATT_TERRAIN = [1, 1, 0.92, 0.9, 0.7, 0.85, 0.85, 0.95, 0.8, 1];
const MOBILE_ATT_TERRAIN = [1, 1, 0.8, 0.85, 0.55, 0.65, 0.7, 1.0, 0.6, 1];
const MOBILE = new Set<UnitType>(['armoured', 'mechanised', 'motorised', 'recon']);
const ATT_WEATHER: Record<string, number> = { clear: 1, cloud: 1, rain: 0.95, storm: 0.8, snow: 0.85, fog: 0.9, mud: 0.85, sandstorm: 0.8 };
const MOBILE_ATT_WEATHER_EXTRA: Record<string, number> = { mud: 0.82, snow: 0.92, storm: 0.9, rain: 0.95 };

const BASE_CAS = 0.006;      // fraction of manpower lost per round at parity
const BASE_ORG = 1.8;        // organisation points lost per round at parity
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

function eqRatio(u: Unit): number {
  let h = 0, a = 0;
  const held = u.equipment.held, auth = u.equipment.authorised;
  for (const k in auth) a += auth[k];
  if (a <= 0) return 1;
  for (const k in auth) h += Math.min(held[k] ?? 0, auth[k] * 1.2);
  return clamp(h / a, 0, 1.2);
}
function massOf(u: Unit): number {
  if (u.domain === 'air') {
    let n = 0;
    for (const k in u.equipment.held) n += u.equipment.held[k];
    return Math.max(0.2, n / 8) * eqRatio(u);
  }
  const w = EQ_WEIGHT[u.type];
  return (Math.max(0, u.manpower) / 1000) * (1 - w + w * Math.min(1, eqRatio(u)));
}
function quality(u: Unit): number {
  const exp = 0.75 + 0.5 * (u.experience / 100);
  const mor = 0.5 + 0.5 * (clamp(u.morale, 0, 100) / 100);
  const org = 0.4 + 0.6 * (clamp(u.organisation, 0, 100) / 100);
  const ammo = u.ammo >= 40 ? 1 : 0.5 + 0.5 * (Math.max(0, u.ammo) / 40);
  let fuel = 1;
  if (MOBILE.has(u.type)) fuel = u.fuel <= 0 ? 0.6 : u.fuel < 10 ? 0.8 : 1;
  const fat = 1 - 0.2 * (clamp(u.fatigue, 0, 100) / 100);
  return exp * mor * org * ammo * fuel * fat;
}

interface Part { u: Unit; role: 'att' | 'def'; base: number; mod: number }

interface Aggregates {
  power: number; raw: number; men: number; mass: number;
  org: number; morale: number; exp: number; ammo: number; entrench: number; terrainMod: number; eq: number;
}
const emptyAgg = (): Aggregates => ({ power: 0, raw: 0, men: 0, mass: 0, org: 0, morale: 0, exp: 0, ammo: 0, entrench: 0, terrainMod: 0, eq: 0 });

interface Env {
  state: GameState; ctx: SimContext; info: GridInfo;
  arty: Record<string, Unit[]>; air: Record<string, Unit[]>;
  usedSupport: Set<string>;
}

// ───────────────────────── main entry ─────────────────────────

export function updateCombat(state: GameState, ctx: SimContext): void {
  const meta = getSimMeta(state);
  const info = getGridInfo(ctx.terrain, ctx.infra);
  const midLat = (ctx.terrain.bbox.north + ctx.terrain.bbox.south) / 2;
  const land: Unit[] = [];
  const arty: Record<string, Unit[]> = { allies: [], axis: [] };
  const air: Record<string, Unit[]> = { allies: [], axis: [] };
  for (const id in state.units) {
    const u = state.units[id];
    if (!alive(u) || u.side === 'neutral') continue;
    if (u.domain === 'land') {
      land.push(u);
      if (u.type === 'artillery') arty[u.side].push(u);
    } else if (u.domain === 'air') air[u.side].push(u);
  }
  const env: Env = { state, ctx, info, arty, air, usedSupport: new Set() };
  // a routed unit that has stopped running, is out of contact and has recovered rejoins the pool
  for (const u of land) {
    if (u.combatStatus === 'routed' && !u.inBattle && u.moveStatus !== 'retreating' && u.organisation > 35 && u.morale > 20) u.combatStatus = u.encircled ? 'encircled' : 'idle';
  }

  // 1. contact graph → components
  const parent = new Int32Array(land.length);
  for (let i = 0; i < land.length; i++) parent[i] = i;
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const inContact = new Uint8Array(land.length);
  const hash = new SpatialHash<number>(CONTACT_KM, midLat);
  for (let i = 0; i < land.length; i++) hash.insert(i, land[i].pos);
  for (let i = 0; i < land.length; i++) {
    const a = land[i];
    // free-roaming retreaters are not drawn into new fights
    if (a.moveStatus === 'retreating' && !a.inBattle) continue;
    hash.query(a.pos, CONTACT_KM, (j) => {
      if (j <= i) return;
      const b = land[j];
      if (a.side === b.side) return;
      if (b.moveStatus === 'retreating' && !b.inBattle) return;
      if (fastKm(a.pos, b.pos) > CONTACT_KM) return;
      inContact[i] = 1; inContact[j] = 1;
      const ra = find(i), rb = find(j);
      if (ra !== rb) parent[ra] = rb;
    });
  }
  const comps = new Map<number, Unit[]>();
  for (let i = 0; i < land.length; i++) {
    if (!inContact[i]) continue;
    const r = find(i);
    const l = comps.get(r);
    if (l) l.push(land[i]); else comps.set(r, [land[i]]);
  }

  // 2. reconcile with existing battles
  const continuing = new Set<string>();
  const roster: { battle: Battle; members: Unit[] }[] = [];
  for (const members of comps.values()) {
    const ids = new Set<string>();
    for (const m of members) if (m.inBattle && state.battles[m.inBattle]) ids.add(m.inBattle);
    let keep: Battle | undefined;
    for (const id of ids) {
      const b = state.battles[id];
      if (!keep || b.startedAt < keep.startedAt || (b.startedAt === keep.startedAt && b.id < keep.id)) keep = b;
    }
    for (const id of ids) if (keep && id !== keep.id) endBattle(env, state.battles[id]);
    if (keep) {
      const bm = meta.battles[keep.id];
      if (!bm || !members.some((m) => m.side === bm.attackerSide && isAggressive(m))) { endBattle(env, keep); continue; }
      roster.push({ battle: keep, members });
      continuing.add(keep.id);
      continue;
    }
    const att = chooseAttackerSide(members);
    if (!att) continue; // standoff — nobody is pushing
    const b = startBattle(env, members, att);
    roster.push({ battle: b, members });
    continuing.add(b.id);
  }
  for (const id of Object.keys(state.battles)) if (!continuing.has(id)) endBattle(env, state.battles[id]);

  // 3. resolve one round per battle (insertion order)
  for (const { battle, members } of roster) {
    if (!state.battles[battle.id]) continue;
    resolveRound(env, battle, members);
  }
  // 4. close battles that reached the round limit
  for (const id of Object.keys(state.battles)) {
    const b = state.battles[id];
    if (b.rounds >= MAX_BATTLE_ROUNDS) rollOver(env, b);
  }
}

// ───────────────────────── battle lifecycle ─────────────────────────

const isAggressive = (u: Unit): boolean => {
  if (u.moveStatus === 'retreating' || u.combatStatus === 'routed') return false;
  if (u.type === 'recon' || u.type === 'hq' || u.type === 'logistics') return false;
  if (u.posture === 'attack') return true;
  const o = u.orders[0];
  // a unit held up by an enemy in its path (route still pending) is still pressing its attack
  return (u.moveStatus === 'moving' || !!u.inBattle || !!(u.route && u.route.length)) && !!o && o.status === 'active' && (o.kind === 'attack' || o.kind === 'capture' || o.kind === 'move' || o.kind === 'follow' || o.kind === 'support');
};
function chooseAttackerSide(members: Unit[]): 'allies' | 'axis' | null {
  let a = 0, x = 0;
  for (const m of members) if (isAggressive(m)) { if (m.side === 'allies') a += massOf(m) + 0.01; else if (m.side === 'axis') x += massOf(m) + 0.01; }
  if (a === 0 && x === 0) return null;
  return a >= x ? 'allies' : 'axis';
}
function centroid(us: Unit[]): LonLat {
  let x = 0, y = 0;
  for (const u of us) { x += u.pos[0]; y += u.pos[1]; }
  return [x / us.length, y / us.length];
}

function startBattle(env: Env, members: Unit[], att: 'allies' | 'axis'): Battle {
  const { state } = env;
  const id = 'B' + state.idCounter++;
  const def = att === 'allies' ? 'axis' : 'allies';
  const defenders = members.filter((m) => m.side === def);
  const pos = centroid(defenders.length ? defenders : members);
  const tIdx = cellIdxOf(env.info, pos);
  const terrain = (tIdx >= 0 ? env.info.terrain[tIdx] : Terrain.Plains) as Terrain;
  const b: Battle = {
    id, pos, attackers: [], defenders: [], startedAt: state.clock.minutes, rounds: 0, terrain, weather: state.weather.kind, log: [],
  };
  state.battles[id] = b;
  getSimMeta(state).battles[id] = {
    attackerSide: att, defenderSide: def, start: {}, killed: {}, wounded: {}, captured: {}, eqLoss: {}, retreated: [], destroyed: [], surrendered: [],
    luck: clamp(0.18 * env.ctx.gauss(), -0.4, 0.4), age: 0, ...computeSurprise(env, members, att, pos), weakAtt: 0, weakDef: 0, n: 0, sum: {}, terrainCode: terrain, startedPos: [pos[0], pos[1]],
  };
  return b;
}

const SURPRISE_CAP = 0.3;
const SURPRISE_WINDOW_MIN = 3 * 60;
/**
 * Opening surprise for the attackers, decided once when the battle starts (only with fog of war on):
 *  - freshness: 1 if the defending side never sighted the attacker (or the last sighting spell lapsed), falling to 0 when they
 *    were first sighted 3 h or more before contact;
 *  - mobility: armoured/mechanised/motorised/recon that were moving count fully, foot troops much less, stationary ones 0.4x;
 *  - reduced by defender recon nearby (x0.5), entrenchment (up to x0.6) and fortifications within 8 km (x0.5);
 *  - capped at +30% attacker power for the first 3 rounds.
 */
function computeSurprise(env: Env, members: Unit[], att: 'allies' | 'axis', pos: LonLat): { surprise: number; surpriseNote: string } {
  const none = { surprise: 0, surpriseNote: '' };
  const { state } = env;
  if (!state.settings.fogOfWar) return none;
  const def = att === 'allies' ? 'axis' : 'allies';
  const attackers = members.filter((m) => m.side === att);
  const defenders = members.filter((m) => m.side === def);
  if (!attackers.length || !defenders.length) return none;
  const fs = getSimMeta(state).firstSeen;
  let wSum = 0, fresh = 0, mob = 0, hoursNum = 0, hoursCnt = 0;
  for (const u of attackers) {
    const w = Math.max(0.1, massOf(u));
    const e = fs[u.id]?.[def];
    const sinceMin = e && state.clock.minutes - e[1] <= 360 ? state.clock.minutes - e[0] : -1;
    const f = sinceMin < 0 ? 1 : Math.max(0, 1 - sinceMin / SURPRISE_WINDOW_MIN);
    if (sinceMin >= 0) { hoursNum += sinceMin / 60; hoursCnt++; }
    const mobile = MOBILE.has(u.type) ? 1 : u.type === 'paratroop' ? 0.8 : 0.4;
    const m = mobile * (u.moveStatus === 'moving' ? 1 : 0.4);
    wSum += w; fresh += f * w; mob += m * w;
  }
  fresh /= wSum; mob /= wSum;
  let s = SURPRISE_CAP * fresh * mob;
  const notes: string[] = [];
  const ent = defenders.reduce((a, u) => a + u.entrenchment, 0) / defenders.length / 100;
  if (ent > 0.05) { s *= 1 - 0.4 * ent; notes.push(`defenders' entrenchment (${Math.round(ent * 100)}%) cut it`); }
  const recon = (env.state.units && Object.values(state.units).some((u) => u.side === def && u.type === 'recon' && !u.destroyed && !u.surrendered && fastKm(u.pos, pos) < 20));
  if (recon) { s *= 0.5; notes.push('defending reconnaissance nearby halved it'); }
  for (const id in state.locations) {
    const l = state.locations[id];
    if (l.kind === 'fortress' && fastKm(l.pos, pos) < 8) { s *= 0.5; notes.push(`the fortifications at ${l.name} halved it`); break; }
  }
  if (s < 0.01) return none;
  const seenTxt = hoursCnt === 0 ? 'unseen by the defenders before contact' : `first sighted about ${(hoursNum / hoursCnt).toFixed(1)} h before contact`;
  return { surprise: Math.round(s * 1000) / 1000, surpriseNote: `Surprise: attackers (${seenTxt}, ${Math.round(mob * 100)}% mobility) gained +${Math.round(s * 100)}% power in the opening rounds${notes.length ? '; ' + notes.join(', ') : ''}.` };
}

function nearestPlace(state: GameState, p: LonLat, maxKm: number): string | undefined {
  let best: string | undefined, bd = maxKm;
  for (const id in state.locations) {
    const l = state.locations[id];
    const d = fastKm(l.pos, p);
    if (d < bd) { bd = d; best = l.name; }
  }
  return best;
}

function endBattle(env: Env, b: Battle | undefined): void {
  if (!b) return;
  const { state } = env;
  const sm = getSimMeta(state);
  const m = sm.battles[b.id];
  for (const id in state.units) {
    const u = state.units[id];
    if (u.inBattle === b.id) {
      u.inBattle = undefined;
      if (u.combatStatus === 'attacking' || u.combatStatus === 'defending') u.combatStatus = u.encircled ? 'encircled' : 'idle';
    }
  }
  delete state.battles[b.id];
  delete sm.battles[b.id];
  if (!m || b.rounds === 0) return;
  fileReport(env, b, m);
}

/** Long battle: file a report for the period so far and carry on as the same battle (no end/restart churn). */
function rollOver(env: Env, b: Battle): void {
  const { state } = env;
  const m = getSimMeta(state).battles[b.id];
  if (!m) return;
  fileReport(env, b, m);
  m.start = {}; m.killed = {}; m.wounded = {}; m.captured = {}; m.eqLoss = {}; m.retreated = []; m.destroyed = []; m.surrendered = [];
  m.n = 0; m.sum = {};
  for (const id of [...b.attackers, ...b.defenders]) {
    const u = state.units[id];
    if (u && !u.destroyed) m.start[id] = { man: u.manpower, org: u.organisation, morale: u.morale, side: u.side };
  }
  b.startedAt = state.clock.minutes; b.rounds = 0; b.log = [];
}

function fileReport(env: Env, b: Battle, m: BattleMeta): void {
  const { state } = env;
  if (b.rounds === 0) return;
  const report = buildReport(env, b, m);
  // exchanges with negligible effect (dry guns, token skirmishes) are not worth a report
  const lost = report.casualties.reduce((a, c) => a + c.killed + c.wounded + c.captured, 0);
  const engaged = Object.values(m.start).reduce((a, s) => a + s.man, 0) || 1;
  const decisive = m.retreated.length > 0 || m.destroyed.length > 0 || m.surrendered.length > 0;
  // only fights that matter get a report: a real share of the force engaged, a meaningful absolute toll, or a collapse
  const quiet = !decisive && (lost / engaged < 0.015 || lost < 350);
  if (quiet) return;
  // renewed fighting between the same formations within half a day folds into the earlier report
  const ids = new Set(report.casualties.map((c) => c.unitId));
  for (let k = state.reports.length - 1; k >= 0 && k >= state.reports.length - 60; k--) {
    const p = state.reports[k];
    if (p.attackerSide !== report.attackerSide || report.startedAt - p.endedAt > 24 * TICK_MINUTES) continue;
    const pids = p.casualties.map((c) => c.unitId);
    const common = pids.filter((id) => ids.has(id)).length;
    if (common === 0 || common < 0.5 * Math.min(pids.length, ids.size)) continue;
    for (const c of report.casualties) {
      const e = p.casualties.find((x) => x.unitId === c.unitId);
      if (e) { e.killed += c.killed; e.wounded += c.wounded; e.captured += c.captured; } else p.casualties.push(c);
    }
    for (const kk in report.equipmentLosses) p.equipmentLosses[kk] = (p.equipmentLosses[kk] ?? 0) + report.equipmentLosses[kk];
    for (const o of report.orgChanges) {
      const e = p.orgChanges.find((x) => x.unitId === o.unitId);
      if (e) e.after = o.after; else p.orgChanges.push(o);
    }
    for (const r of report.retreats) if (!p.retreats.includes(r)) p.retreats.push(r);
    p.territoryChangeCells += report.territoryChangeCells;
    const total = p.casualties.reduce((a, c) => a + c.killed + c.wounded + c.captured, 0);
    const hours = Math.round((report.endedAt - p.startedAt) / 60);
    // the headline numbers must equal the merged ledger
    const sideLoss = (side: SideId) => p.casualties.filter((c) => state.units[c.unitId]?.side === side).reduce((a, c) => ({ k: a.k + c.killed, w: a.w + c.wounded, c: a.c + c.captured }), { k: 0, w: 0, c: 0 });
    const la = sideLoss(report.attackerSide), ld = sideLoss(report.attackerSide === 'allies' ? 'axis' : 'allies');
    const head = report.summary.replace(/Attackers lost .*$/, '');
    p.summary = `${head}Attackers lost ${la.k + la.w + la.c} men (${la.k} killed, ${la.w} wounded, ${la.c} captured); defenders lost ${ld.k + ld.w + ld.c} men (${ld.k} killed, ${ld.w} wounded, ${ld.c} captured). Continuing action: ${total} men lost in all over ${hours} h.`;
    p.reasons = report.reasons; p.outcome = report.outcome;
    for (const c of report.consequences) if (!p.consequences.includes(c)) p.consequences.push(c);
    p.endedAt = report.endedAt; p.pos = report.pos;
    env.ctx.log({ category: 'battle', pos: b.pos, severity: report.outcome === 'stalemate' ? 'info' : 'warn', text: report.summary });
    return;
  }
  state.reports.push(report);
  if (state.reports.length > MAX_REPORTS) state.reports.splice(0, state.reports.length - MAX_REPORTS);
  env.ctx.log({ category: 'battle', pos: b.pos, severity: report.outcome === 'stalemate' ? 'info' : 'warn', text: report.summary });
}

// ───────────────────────── round resolution ─────────────────────────

function evalUnit(env: Env, u: Unit, role: 'att' | 'def', opp: { armourShare: number; engineers: boolean }): Part {
  const { info, state } = env;
  const idx = cellIdxOf(info, u.pos);
  const t = idx >= 0 ? info.terrain[idx] : Terrain.Plains;
  const rating = RATING[u.type][role === 'att' ? 0 : 1];
  let rate = rating;
  if (role === 'def' && u.type === 'antitank') rate = rating * (1 + 1.2 * opp.armourShare);
  const base = massOf(u) * rate * quality(u);
  let mod = 1;
  if (role === 'def') {
    mod *= DEF_TERRAIN[t];
    if (nearOwnFortress(state, u)) mod *= 1.2; // prepared positions (fortress locations) strengthen the garrison
    const ent = (u.entrenchment / 100) * 0.5;
    mod *= 1 + (opp.engineers ? ent * 0.75 : ent);
    if (u.moveStatus === 'moving') mod *= 0.85; // caught on the march
  } else {
    mod *= ATT_TERRAIN[t];
    if (MOBILE.has(u.type)) {
      mod *= MOBILE_ATT_TERRAIN[t];
      mod *= MOBILE_ATT_WEATHER_EXTRA[state.weather.kind] ?? 1;
    }
    mod *= ATT_WEATHER[state.weather.kind] ?? 1;
  }
  return { u, role, base, mod };
}

const fortressCache = new WeakMap<object, Location[]>();
function nearOwnFortress(state: GameState, u: Unit): boolean {
  let list = fortressCache.get(state.locations);
  if (!list) { list = Object.values(state.locations).filter((l) => l.kind === 'fortress'); fortressCache.set(state.locations, list); }
  for (const l of list) if (state.nations[l.owner]?.side === u.side && fastKm(l.pos, u.pos) < 4) return true;
  return false;
}

function aggregate(parts: Part[]): Aggregates {
  const a = emptyAgg();
  for (const p of parts) {
    const u = p.u, m = Math.max(0.0001, p.base);
    a.power += p.base * p.mod; a.raw += p.base;
    a.men += u.manpower; a.mass += massOf(u);
    a.org += u.organisation * m; a.morale += u.morale * m; a.exp += u.experience * m; a.ammo += u.ammo * m;
    a.entrench += u.entrenchment * m; a.terrainMod += p.mod * m;
    a.eq += eqRatio(u) * m;
  }
  const w = Math.max(0.0001, parts.reduce((s, p) => s + Math.max(0.0001, p.base), 0));
  a.org /= w; a.morale /= w; a.exp /= w; a.ammo /= w; a.entrench /= w; a.terrainMod /= w; a.eq /= w;
  return a;
}

function flankBonus(attackers: Unit[], target: LonLat): number {
  if (attackers.length < 2) return 1;
  const b = attackers.map((u) => bearingDeg(target, u.pos)).sort((x, y) => x - y);
  let maxGap = 360 - b[b.length - 1] + b[0];
  for (let i = 1; i < b.length; i++) maxGap = Math.max(maxGap, b[i] - b[i - 1]);
  const spread = 360 - maxGap;
  return spread > 90 ? 1 + 0.25 * Math.min(1, (spread - 90) / 180) : 1;
}

/** Air support is a supplement to ground power, never a substitute: at most this share of the supported side's combat-troop power. */
const AIR_CAP_SHARE = 0.35;
const SORTIES_PER_DAY: Partial<Record<string, number>> = { air_bomber: 3, air_fighter: 4 };
/** [ammo %, fuel %, fraction of aircraft lost] per sortie */
const SORTIE_COST: Partial<Record<string, [number, number, number]>> = { air_bomber: [22, 14, 0.012], air_fighter: [9, 10, 0.006] };
const SUPPORT_EXCLUDED = new Set(['hq', 'logistics']);
/** Combat-troop power of a side's participants (HQs and supply columns do not call in air support). */
const combatPower = (parts: Part[]): number => parts.reduce((a, p) => (SUPPORT_EXCLUDED.has(p.u.type) ? a : a + p.base * p.mod), 0);

function supportPower(env: Env, side: SideId, at: LonLat, members: Set<string>, role: 'att' | 'def', weatherOk: number, airCap: number): { arty: number; air: number } {
  let artyP = 0, airP = 0;
  for (const u of env.arty[side] ?? []) {
    if (members.has(u.id) || u.inBattle || u.ammo < 5 || u.moveStatus === 'retreating') continue;
    const d = fastKm(u.pos, at);
    if (d > ARTILLERY_SUPPORT_KM) continue;
    if (env.usedSupport.has(u.id)) continue;
    env.usedSupport.add(u.id);
    artyP += massOf(u) * RATING.artillery[role === 'att' ? 0 : 1] * quality(u) * (1 - 0.5 * (d / ARTILLERY_SUPPORT_KM));
    u.ammo = Math.max(0, u.ammo - 2.5);
  }
  if (weatherOk > 0 && airCap > 0) {
    const sorties = getSimMeta(env.state).sorties;
    const day = Math.floor(env.state.clock.minutes / 1440);
    // nearest squadrons first; stop committing aircraft once the cap is reached (the rest stay in reserve and keep their sorties)
    const cands: { u: Unit; d: number }[] = [];
    for (const u of env.air[side] ?? []) {
      if (u.inBattle || u.destroyed || u.surrendered) continue;
      const cost = SORTIE_COST[u.type];
      if (!cost || u.ammo < cost[0] || u.fuel < cost[1] || u.organisation < 20) continue;
      const d = fastKm(u.pos, at);
      if (d > AIR_SUPPORT_KM || env.usedSupport.has(u.id + '#air')) continue;
      const sr = sorties[u.id];
      if (sr && sr[0] === day && sr[1] >= (SORTIES_PER_DAY[u.type] ?? 3)) continue;
      cands.push({ u, d });
    }
    cands.sort((a, b) => a.d - b.d || (a.u.id < b.u.id ? -1 : 1));
    for (const { u, d } of cands) {
      if (airP >= airCap) break;
      const cost = SORTIE_COST[u.type]!;
      env.usedSupport.add(u.id + '#air');
      const rate = u.type === 'air_bomber' ? 7 : 2;
      airP += massOf(u) * rate * quality(u) * weatherOk * (1 - 0.4 * (d / AIR_SUPPORT_KM));
      u.ammo = Math.max(0, u.ammo - cost[0]); u.fuel = Math.max(0, u.fuel - cost[1]);
      const sr = sorties[u.id];
      sorties[u.id] = sr && sr[0] === day ? [day, sr[1] + 1] : [day, 1];
      // flak and fighters: some aircraft do not come back
      let n = 0, key = '';
      for (const k in u.equipment.held) if (u.equipment.held[k] > n) { n = u.equipment.held[k]; key = k; }
      if (n > 0) {
        const exp = n * cost[2];
        const lost = Math.floor(exp) + (env.ctx.rand() < exp - Math.floor(exp) ? 1 : 0);
        if (lost > 0) { u.equipment.held[key] = Math.max(0, n - lost); u.manpower = Math.max(0, u.manpower - lost * 2); }
      }
    }
    airP = Math.min(airP, airCap);
  }
  return { arty: artyP, air: airP };
}

function resolveRound(env: Env, battle: Battle, members: Unit[]): void {
  const { state, ctx } = env;
  const sm = getSimMeta(state);
  const meta = sm.battles[battle.id];
  const attSide = meta.attackerSide, defSide = meta.defenderSide;
  const att = members.filter((u) => u.side === attSide);
  const def = members.filter((u) => u.side === defSide);
  if (!att.length || !def.length) return;
  for (const u of members) {
    if (!meta.start[u.id]) meta.start[u.id] = { man: u.manpower, org: u.organisation, morale: u.morale, side: u.side };
    u.inBattle = battle.id;
    if (u.combatStatus !== 'routed') u.combatStatus = u.encircled ? 'encircled' : u.side === attSide ? 'attacking' : 'defending';
  }
  battle.attackers = att.map((u) => u.id);
  battle.defenders = def.map((u) => u.id);
  const defCentre = centroid(def), attCentre = centroid(att);
  battle.pos = defCentre;
  const tIdx = cellIdxOf(env.info, defCentre);
  battle.terrain = (tIdx >= 0 ? env.info.terrain[tIdx] : Terrain.Plains) as Terrain;
  battle.weather = state.weather.kind;

  let attArm = 0, attMass = 0, attEng = false;
  for (const u of att) { const m = massOf(u); attMass += m; if (u.type === 'armoured' || u.type === 'mechanised') attArm += m; if (u.type === 'engineer') attEng = true; }
  const attParts = att.map((u) => evalUnit(env, u, 'att', { armourShare: 0, engineers: false }));
  const defParts = def.map((u) => evalUnit(env, u, 'def', { armourShare: attMass > 0 ? attArm / attMass : 0, engineers: attEng }));

  // river crossing penalty for attackers
  const riverIdx = cellIdxOf(env.info, defCentre);
  const river = riverIdx >= 0 && env.info.river[riverIdx] === 1 && env.info.road[riverIdx] === 0;
  const iceNow = iceOf(state);
  // frozen rivers are barely an obstacle: the penalty shrinks as the ice thickens
  const riverStrength = iceNow < 0.35 ? 1 : iceNow < 0.7 ? 0.6 : 0.2;
  if (river) for (const p of attParts) p.mod *= 1 - (1 - (attEng ? 0.9 : 0.8)) * riverStrength;

  const A = aggregate(attParts), D = aggregate(defParts);
  const flank = flankBonus(att, defCentre);
  let surprise = 1;
  if (meta.age < 3) {
    surprise = 1 + meta.surprise;
    if (def.every((u) => u.posture === 'rest' || u.posture === 'regroup')) surprise = Math.max(surprise, 1.1);
  }
  meta.age++;
  const encircledDef = def.every((u) => u.encircled) ? 1.2 : 1;
  const airOk = state.weather.kind === 'clear' || state.weather.kind === 'cloud' ? 1 : state.weather.kind === 'rain' ? 0.5 : 0;
  const memAtt = new Set(att.map((u) => u.id)), memDef = new Set(def.map((u) => u.id));
  const sa = supportPower(env, attSide, defCentre, memAtt, 'att', airOk, AIR_CAP_SHARE * combatPower(attParts) * flank * surprise);
  const sd = supportPower(env, defSide, defCentre, memDef, 'def', airOk, AIR_CAP_SHARE * combatPower(defParts));
  const diceA = clamp(Math.exp(0.14 * ctx.gauss()), 0.7, 1.4) * Math.exp(meta.luck);
  const diceD = clamp(Math.exp(0.14 * ctx.gauss()), 0.7, 1.4);
  const wAtt = ATT_WEATHER[state.weather.kind] ?? 1;

  const Pa = Math.max(1e-6, (A.power * flank * surprise * encircledDef + sa.arty * wAtt + sa.air) * diceA);
  const Pd = Math.max(1e-6, (D.power + sd.arty + sd.air) * diceD);
  const ratio = Pa / Pd;

  const s = meta.sum;
  const add = (k: string, v: number) => { s[k] = (s[k] ?? 0) + v; };
  meta.n++;
  add('Pa', Pa); add('Pd', Pd);
  add('menA', A.men); add('menD', D.men);
  add('orgA', A.org); add('orgD', D.org); add('morA', A.morale); add('morD', D.morale);
  add('expA', A.exp); add('expD', D.exp); add('ammoA', A.ammo); add('ammoD', D.ammo);
  add('entD', D.entrench); add('terrD', D.terrainMod); add('terrA', A.terrainMod);
  add('eqA', A.eq); add('eqD', D.eq);
  add('flank', flank); add('surprise', surprise); add('encl', encircledDef);
  add('artA', sa.arty / Pa); add('artD', sd.arty / Pd); add('airA', sa.air / Pa); add('airD', sd.air / Pd);
  add('diceA', diceA); add('diceD', diceD);
  add('river', river ? 1 : 0); add('iceRiver', river && iceNow >= 0.35 ? 1 : 0); add('armShare', attMass > 0 ? attArm / attMass : 0);
  add('weatherA', wAtt);

  // ── casualties, organisation, morale ──
  // dry guns kill few: intensity scales with the sides' mean ammunition (floor 15%)
  const intensity = 0.15 + 0.85 * Math.min(1, (A.ammo + D.ammo) / 2 / 25);
  add('intensity', intensity);
  const fracDef = clamp(BASE_CAS * Math.pow(ratio, 0.55) / Math.sqrt(Math.max(1, D.terrainMod)), 0.0004, 0.04) * intensity;
  const fracAtt = clamp(BASE_CAS * Math.pow(1 / ratio, 0.55) * (1 + 0.5 * (D.entrench / 100)), 0.0004, 0.04) * intensity;
  // dive-bombing shock: air support breaks cohesion (Sedan, 13 May 1940) on top of the raw firepower it adds
  const airShock = 5 * Math.min(0.5, sa.air / Pa);
  add('airShock', airShock);
  const orgDef = clamp(BASE_ORG * Math.pow(ratio, 0.6) + airShock, 0.2, 12);
  const orgAtt = clamp(BASE_ORG * Math.pow(1 / ratio, 0.6), 0.2, 9);

  const hurt = (list: Part[], frac: number, orgLoss: number, side: 'att' | 'def'): number => {
    let total = 0;
    for (const p of list) {
      const u = p.u;
      const exposure = CASUALTY_EXPOSURE[u.type] ?? 1;
      const f = clamp(frac * exposure * (0.8 + 0.4 * ctx.rand()), 0, 0.08);
      const x = f * u.manpower;
      let n = Math.floor(x);
      if (ctx.rand() < x - n) n++;
      n = Math.min(n, Math.floor(u.manpower));
      const trapped = u.encircled || u.combatStatus === 'routed' || (u.moveStatus === 'retreating' && side === 'def');
      const cap = Math.round(n * (trapped ? 0.3 : 0.06));
      const kil = Math.round((n - cap) * 0.25);
      const wnd = n - cap - kil;
      u.manpower -= n;
      meta.killed[u.id] = (meta.killed[u.id] ?? 0) + kil;
      meta.captured[u.id] = (meta.captured[u.id] ?? 0) + cap;
      meta.wounded[u.id] = (meta.wounded[u.id] ?? 0) + wnd;
      total += kil + cap;
      const eqExp = (EQUIP_EXPOSURE[u.type] ?? 1) * (side === 'att' ? 1 + 0.4 * (D.entrench / 100) : 1);
      const ef = f * eqExp;
      for (const k in u.equipment.held) {
        const held = u.equipment.held[k];
        if (held <= 0) continue;
        const ex = held * ef;
        let lost = Math.floor(ex);
        if (ctx.rand() < ex - lost) lost++;
        lost = Math.min(lost, held);
        if (lost > 0) { u.equipment.held[k] = held - lost; meta.eqLoss[k] = (meta.eqLoss[k] ?? 0) + lost; }
      }
      // dug-in defenders lose cohesion more slowly, and a defence that is holding (ratio under 1.5) does not collapse to nothing:
      // organisation only bottoms out when the position is genuinely being overwhelmed (or the unit is cut off / retreating)
      const dug = side === 'def' && !u.encircled && u.moveStatus !== 'retreating';
      const ol = orgLoss * (u.moveStatus === 'moving' ? 1.25 : 1) * (u.encircled ? 1.4 : 1) * (u.moveStatus === 'retreating' ? 1.3 : 1) * (dug ? 1 - 0.5 * (u.entrenchment / 100) : 1);
      const orgFloor = dug && ratio < 1.5 ? (u.entrenchment >= 50 ? 25 : 12) : 0;
      u.organisation = clamp(u.organisation - ol, Math.min(orgFloor, u.organisation), 100);
      u.morale = clamp(u.morale - (0.5 * ol + f * 60), 0, 100);
      u.experience = Math.min(100, u.experience + 0.12);
      u.ammo = Math.max(0, u.ammo - (u.type === 'artillery' ? 3 : 1.4));
      u.fuel = Math.max(0, u.fuel - (MOBILE.has(u.type) ? (side === 'att' ? 1.2 : 0.4) : 0.1));
      u.fatigue = Math.min(100, u.fatigue + 1.2);
      u.readiness = clamp(Math.round((u.organisation + u.morale + u.supply) / 3), 0, 100);
    }
    return total;
  };
  const killedDef = hurt(defParts, fracDef, orgDef, 'def');
  const killedAtt = hurt(attParts, fracAtt, orgAtt, 'att');
  if (ratio > 1.3) for (const p of attParts) p.u.morale = Math.min(100, p.u.morale + 0.4);
  else if (ratio < 0.77) for (const p of defParts) p.u.morale = Math.min(100, p.u.morale + 0.4);
  const credit = (list: Part[], kills: number) => {
    const tot = list.reduce((a, p) => a + p.base * p.mod, 0) || 1;
    for (const p of list) p.u.kills = r2(p.u.kills + (kills * (p.base * p.mod)) / tot);
  };
  credit(attParts, killedDef); credit(defParts, killedAtt);

  // ── breaking / retreat / destruction / surrender ──
  // attackers also break off when their guns are dry (nothing left to attack with)
  meta.weakAtt = ratio < 0.5 || A.ammo < 5 ? meta.weakAtt + 1 : 0;
  meta.weakDef = ratio > 2.8 ? meta.weakDef + 1 : 0;
  const attBreak = meta.weakAtt >= 4;
  const enemyOf = (side: string) => (side === attSide ? defCentre : attCentre);
  for (const p of [...attParts, ...defParts]) {
    const u = p.u;
    if (u.destroyed) continue;
    const isAtt = p.role === 'att';
    if (u.manpower <= Math.max(30, 0.04 * u.manpowerMax)) {
      u.destroyed = true; u.manpower = Math.max(0, u.manpower); u.moveStatus = 'stationary'; u.route = undefined; u.inBattle = undefined; u.combatStatus = 'idle';
      meta.destroyed.push(u.id);
      ctx.log({ category: 'battle', severity: 'critical', unitId: u.id, pos: u.pos, text: `${u.name} was destroyed in action.` });
      continue;
    }
    // surrender: only after a real spell in the pocket, and much less likely while supply (or an airlift) reaches it
    const cut = getSimMeta(state).cutSince;
    if (u.encircled) cut[u.id] ??= state.clock.minutes; else delete cut[u.id];
    const cutHours = u.encircled ? (state.clock.minutes - (cut[u.id] ?? state.clock.minutes)) / 60 : 0;
    const supplied = u.supply >= 40;
    const pocketChance = 0.12 * (supplied ? 0.3 : 1) * (u.type === 'paratroop' ? 0.5 : 1);
    // dug-in garrisons hold out longer and only give up when really broken
    const dugIn = clamp(u.entrenchment / 100, 0, 1);
    if (u.encircled && cutHours >= 24 + 48 * dugIn && u.manpower < (0.5 - 0.2 * dugIn) * u.manpowerMax && u.organisation < 30 && ctx.rand() < pocketChance) {
      surrender(u, meta, ctx, 'cut off and out of strength');
      continue;
    }
    const wantRetreat = u.moveStatus !== 'retreating' && (u.organisation <= 22 || u.morale <= 18 || (isAtt && attBreak));
    if (wantRetreat) {
      const rout = u.organisation <= 6 || u.morale <= 6;
      if (!startRetreat(env, u, enemyOf(u.side), rout)) {
        if (rout) u.combatStatus = 'routed';
        if (u.organisation <= 10 && cutHours >= 48 + 48 * dugIn && !supplied && u.manpower < (0.4 - 0.15 * dugIn) * u.manpowerMax && ctx.rand() < 0.08) surrender(u, meta, ctx, 'unable to break out');
      } else if (!meta.retreated.includes(u.id)) meta.retreated.push(u.id);
    }
  }
  battle.rounds++;
  if (battle.rounds === 1 || battle.rounds % 6 === 0) {
    battle.log.push(`Round ${battle.rounds}: attacker power ${r2(Pa)} vs defender power ${r2(Pd)} (x${r2(ratio)}); killed or captured: attackers ${killedAtt}, defenders ${killedDef}.`);
    if (battle.log.length > 40) battle.log.shift();
  }
}

function surrender(u: Unit, meta: BattleMeta, ctx: SimContext, why: string): void {
  meta.captured[u.id] = (meta.captured[u.id] ?? 0) + Math.round(u.manpower);
  u.surrendered = true; u.destroyed = true; u.inBattle = undefined; u.route = undefined; u.moveStatus = 'stationary'; u.combatStatus = 'idle';
  meta.surrendered.push(u.id);
  ctx.log({ category: 'battle', severity: 'critical', unitId: u.id, pos: u.pos, text: `${u.name} surrendered, ${why}.` });
}

// ───────────────────────── retreat ─────────────────────────

function startRetreat(env: Env, u: Unit, enemy: LonLat, rout: boolean): boolean {
  if (u.encircled) return false;
  const { state, ctx } = env;
  const base = bearingDeg(enemy, u.pos);
  const cls = moveClassOf(u.type);
  const dist = cls === 'foot' ? 18 : 32;
  const offs = [0, 35, -35, 70, -70, 110, -110];
  for (let pass = 0; pass < 2; pass++) {
    let tries = 0;
    for (const off of offs) {
      const tgt = destination(u.pos, base + off, dist);
      const idx = cellIdxOf(env.info, tgt);
      if (idx < 0 || !passableIce(cls, env.info.terrain[idx], iceOf(env.state))) continue;
      if (pass === 0) {
        const own = ownerSideAt(state, tgt);
        if (own !== null && own !== u.side && own !== 'neutral') continue; // don't retreat into enemy-held ground
      }
      if (++tries > 4) break;
      const r = findRoute(ctx.terrain, ctx.infra, u, tgt, state);
      if (!r || r.km > dist * 2.5) continue;
      const path = r.path.slice();
      if (path.length && haversineKm(path[0], u.pos) < 0.05) path.shift();
      u.route = path; u.routeEtaMinutes = Math.round(r.etaMinutes);
      u.moveStatus = 'retreating';
      getSimMeta(state).retreating[u.id] = true;
      if (rout) u.combatStatus = 'routed';
      u.posture = 'regroup';
      const o = u.orders[0];
      if (o && o.status === 'active' && (o.kind === 'attack' || o.kind === 'move' || o.kind === 'capture' || o.kind === 'support' || o.kind === 'follow')) {
        o.status = 'failed'; o.note = 'broke off and retreated';
      }
      return true;
    }
  }
  return false;
}

// ───────────────────────── report ─────────────────────────

const pct = (x: number) => Math.round(x * 100) + '%';
const list = (names: string[]) => (names.length <= 3 ? names.join(', ') : names.slice(0, 3).join(', ') + ` and ${names.length - 3} more`);

function buildReport(env: Env, b: Battle, m: BattleMeta): BattleReport {
  const { state } = env;
  const n = Math.max(1, m.n);
  const avg = (k: string) => (m.sum[k] ?? 0) / n;
  const ids = Object.keys(m.start);
  const att = ids.filter((id) => m.start[id].side === m.attackerSide);
  const def = ids.filter((id) => m.start[id].side === m.defenderSide);
  const nm = (id: string) => state.units[id]?.shortName || state.units[id]?.name || id;
  const sumLoss = (set: string[]) => set.reduce((a, id) => ({
    k: a.k + (m.killed[id] ?? 0), w: a.w + (m.wounded[id] ?? 0), c: a.c + (m.captured[id] ?? 0), start: a.start + m.start[id].man,
  }), { k: 0, w: 0, c: 0, start: 0 });
  const la = sumLoss(att), ld = sumLoss(def);
  const totA = la.k + la.w + la.c, totD = ld.k + ld.w + ld.c;
  const fracA = la.start ? totA / la.start : 0, fracD = ld.start ? totD / ld.start : 0;
  const gone = (id: string) => m.retreated.includes(id) || m.destroyed.includes(id) || m.surrendered.includes(id);
  const retA = att.filter(gone).length, retD = def.filter(gone).length;
  let outcome: BattleReport['outcome'] = 'stalemate';
  if (def.length && retD / def.length >= 0.5) outcome = 'attacker_victory';
  else if (att.length && retA / att.length >= 0.5) outcome = fracA < 0.08 && fracA <= fracD * 1.2 ? 'attacker_withdrew' : 'defender_victory';
  else if (b.rounds >= 6 && fracD > fracA * 1.6 && fracD > 0.04) outcome = 'attacker_victory';
  else if (b.rounds >= 6 && fracA > fracD * 1.6 && fracA > 0.04) outcome = 'defender_victory';

  const place = nearestPlace(state, b.pos, 15);
  const where = place ? `near ${place}` : `at ${b.pos[1].toFixed(2)}N ${b.pos[0].toFixed(2)}E`;
  const verdict: Record<BattleReport['outcome'], string> = {
    attacker_victory: retD > 0 ? 'the defenders were driven back' : 'the defenders took markedly heavier losses but held their ground',
    defender_victory: retA > 0 ? 'the attack was beaten off' : 'the attackers took markedly heavier losses and made no progress',
    stalemate: 'neither side gained a decisive result', attacker_withdrew: 'the attackers broke off the action',
  };
  const summary = `${list(att.map(nm))} (${m.attackerSide}) attacked ${list(def.map(nm))} (${m.defenderSide}) ${where} over ${b.rounds} hour${b.rounds === 1 ? '' : 's'}; ${verdict[outcome]}. ` +
    `Attackers lost ${totA} men (${la.k} killed, ${la.w} wounded, ${la.c} captured; ${pct(fracA)} of ${la.start}); defenders lost ${totD} men (${ld.k} killed, ${ld.w} wounded, ${ld.c} captured; ${pct(fracD)} of ${ld.start}).`;

  // reasons: only factors that were really computed and materially non-neutral
  const reasons: string[] = [];
  const powR = avg('Pa') / Math.max(1e-6, avg('Pd'));
  reasons.push(`Average effective combat power: attackers ${r2(avg('Pa'))} vs defenders ${r2(avg('Pd'))} (ratio ${r2(powR)}:1) after all modifiers.`);
  const menR = avg('menA') / Math.max(1, avg('menD'));
  if (menR > 1.25 || menR < 0.8) reasons.push(`Numbers: attackers fielded ${Math.round(avg('menA'))} men against ${Math.round(avg('menD'))} (${r2(menR)}:1).`);
  const tc = m.terrainCode;
  const tD = avg('terrD');
  if (tD >= 1.1) reasons.push(`Defenders fought in ${TERRAIN_NAME[tc]} and prepared positions: average defensive multiplier x${r2(tD)}.`);
  else if (tD <= 0.92) reasons.push(`Defenders gained no cover (${TERRAIN_NAME[tc]}); average defensive multiplier x${r2(tD)}.`);
  const tA = avg('terrA');
  if (tA <= 0.9) reasons.push(`Attackers were hampered by ${TERRAIN_NAME[tc]}${avg('armShare') > 0.3 ? ' (armour and mobile troops especially)' : ''}: average attack multiplier x${r2(tA)}.`);
  if (avg('entD') >= 20) reasons.push(`Defenders were entrenched (average ${Math.round(avg('entD'))}% fortification).`);
  if (avg('river') > 0.5) reasons.push(avg('iceRiver') > 0.5 ? 'Attackers crossed a frozen river line (the ice largely removed the river penalty).' : 'Attackers had to force a river line (x0.8, x0.9 with engineers).');
  const wA = avg('weatherA');
  if (wA < 0.97) reasons.push(`Weather (${b.weather}) reduced the attackers' effectiveness (x${r2(wA)}).`);
  if (Math.abs(avg('orgA') - avg('orgD')) >= 10) reasons.push(`Organisation: attackers ${Math.round(avg('orgA'))}% vs defenders ${Math.round(avg('orgD'))}%.`);
  if (Math.abs(avg('morA') - avg('morD')) >= 10) reasons.push(`Morale: attackers ${Math.round(avg('morA'))}% vs defenders ${Math.round(avg('morD'))}%.`);
  if (Math.abs(avg('expA') - avg('expD')) >= 10) reasons.push(`Experience: attackers ${Math.round(avg('expA'))} vs defenders ${Math.round(avg('expD'))}.`);
  if (avg('ammoA') < 5 && avg('ammoD') < 5) reasons.push('Both sides were out of ammunition; the fighting was largely ineffective.');
  else if (avg('ammoA') < 30) reasons.push(`Attackers were short of ammunition (average ${Math.round(avg('ammoA'))}%).`);
  if (avg('ammoD') < 30) reasons.push(`Defenders were short of ammunition (average ${Math.round(avg('ammoD'))}%).`);
  if (Math.abs(avg('eqA') - avg('eqD')) >= 0.12) reasons.push(`Equipment state: attackers at ${pct(avg('eqA'))} of establishment vs defenders ${pct(avg('eqD'))}.`);
  if (avg('artA') >= 0.08) reasons.push(`Supporting artillery supplied ${pct(avg('artA'))} of the attackers' power.`);
  if (avg('artD') >= 0.08) reasons.push(`Supporting artillery supplied ${pct(avg('artD'))} of the defenders' power.`);
  if (avg('airA') >= 0.04) reasons.push(`Attacking aircraft added ${pct(avg('airA'))} of attacker power.`);
  if (avg('airD') >= 0.04) reasons.push(`Defending aircraft added ${pct(avg('airD'))} of defender power.`);
  if (avg('flank') >= 1.03) reasons.push(`Attackers struck from several directions (flanking bonus x${r2(avg('flank'))}).`);
  if (m.surpriseNote) reasons.push(m.surpriseNote);
  else if (avg('surprise') > 1.01) reasons.push(`Attackers caught resting defenders unprepared in the opening rounds (average x${r2(avg('surprise'))}).`);
  if (avg('encl') > 1.01) reasons.push('Defenders were cut off and encircled (attackers x1.2).');
  const dr = avg('diceA') / avg('diceD');
  if (dr > 1.08 || dr < 0.92) reasons.push(`Chance favoured the ${dr > 1 ? 'attackers' : 'defenders'} (random combat factor ratio ${r2(dr)}).`);

  const casualties: BattleReport['casualties'] = [];
  const orgChanges: BattleReport['orgChanges'] = [];
  for (const id of ids) {
    const k = m.killed[id] ?? 0, w = m.wounded[id] ?? 0, c = m.captured[id] ?? 0;
    if (k + w + c > 0) casualties.push({ unitId: id, name: state.units[id]?.name ?? id, killed: k, wounded: w, captured: c });
    const u = state.units[id];
    if (u) orgChanges.push({ unitId: id, before: Math.round(m.start[id].org), after: Math.round(u.organisation) });
  }
  const consequences: string[] = [];
  if (m.destroyed.length) consequences.push(`Destroyed: ${m.destroyed.map(nm).join(', ')}.`);
  if (m.surrendered.length) consequences.push(`Surrendered: ${m.surrendered.map(nm).join(', ')}.`);
  const live = Array.from(new Set(m.retreated)).filter((id) => !m.destroyed.includes(id));
  if (live.length) consequences.push(`Retreated: ${live.map(nm).join(', ')}.`);
  const topEq = Object.entries(m.eqLoss).sort((a, c) => c[1] - a[1] || (a[0] < c[0] ? -1 : 1)).slice(0, 3);
  if (topEq.length) consequences.push(`Equipment lost: ${topEq.map(([k, v]) => `${v} ${k}`).join(', ')}.`);
  if (!consequences.length) consequences.push('No units broke; both sides held their ground.');

  return {
    id: 'R' + state.idCounter++, battleId: b.id, startedAt: b.startedAt, endedAt: state.clock.minutes, pos: b.pos, placeName: place,
    attackerSide: m.attackerSide, outcome, summary, reasons, casualties, equipmentLosses: { ...m.eqLoss }, orgChanges,
    retreats: Array.from(new Set(m.retreated)), territoryChangeCells: 0, consequences,
  };
}
