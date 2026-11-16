/**
 * WORLD AT WAR: FRONTLINES AI — `aiThink(state, nation, ctx): Command[]`
 *
 * A commander, not a random walker:
 *   perception (fog-filtered, decaying contact memory)  →  front analysis (sectors, salients, pockets)
 *   →  posture (attack / defend / withdraw / consolidate)  →  objective & force allocation
 *   →  coordinated Operations (recon → fires → assault → envelopment), defensive lines & entrenchment,
 *      counter-attacks on salients / penetrations, supply raids, break-outs, reinforcement requests.
 *
 * Pure with respect to game state: it returns the same `Command` union the player uses. The only thing it
 * writes is its own memory slot `state.aiState[nation]`. All randomness comes from `ctx.rand()`.
 */
import { bearingDeg, destination } from '../core/geo';
import type { Command, GameState, Location, LocationId, LonLat, NationId, Operation, Order, SideId, Unit, UnitId } from '../core/types';
import { analyseFront, buildClassGrid, classAt, inOwnSalient, type FrontAnalysis, type Sector } from './analysis';
import { resolveDoctrine, scheduledPosture, type AiPosture, type ResolvedDoctrine } from './doctrine';
import {
  clamp, difficultyProfile, fastKm, isAlive, isMobileType, opposite, roleOf, sideOfNation, sigOf, unitPower,
  type AiContext, type DifficultyProfile, type Role,
} from './model';
import { getMemory, perceive, type AiMemory, type Contact } from './perception';

export type { AiContext } from './model';
export type { AiDoctrine, AiPosture } from './doctrine';
export { resolveDoctrine, registerAiDoctrine } from './doctrine';
import './doctrines';

type OrderSpec = Omit<Order, 'id' | 'issuedAt' | 'status'>;

interface P {
  state: Readonly<GameState>;
  nation: NationId;
  side: SideId;
  ctx: AiContext;
  mem: AiMemory;
  doc: ResolvedDoctrine;
  diff: DifficultyProfile;
  now: number;
  aggr: number;
  posture: AiPosture;
  mine: Unit[];
  /** own air groups (domain air): they support any battle within ~120 km automatically */
  air: Unit[];
  contacts: Contact[];
  fa: FrontAnalysis;
  cmds: Command[];
  used: Set<UnitId>;
  committed: Set<UnitId>;
  reserve: Set<UnitId>;
  targeted: Set<LocationId>;
  objW: Record<LocationId, number>;
  /** 0..1: how far the national fuel pool has fallen (only with doctrine.fuelAware) */
  fuelStress: number;
  ownPower: number;
  enemyPower: number;
  ratio: number;
  enemyLocs: Location[];
  ownLocs: Location[];
  cutOff: Set<UnitId>;
  activeOps: number;
  /** designated Schwerpunkt armour group (excluded from general operations) */
  axis: Set<UnitId>;
  /** strategic goals: enemy-held locations the campaign rewards, with weight */
  goals: { loc: Location; w: number }[];
}

const gauss = (c: AiContext): number =>
  c.gauss ? c.gauss() : (c.rand() + c.rand() + c.rand() + c.rand() - 2) * 1.7320508;

// ───────────────────────────── small helpers ─────────────────────────────

function isIdle(u: Unit): boolean {
  return u.orders.length === 0 || u.orders.every((o) => o.status === 'complete' || o.status === 'failed' || o.status === 'cancelled');
}

function available(p: P, u: Unit): boolean {
  if (p.used.has(u.id) || p.committed.has(u.id)) return false;
  if (u.inBattle && p.posture !== 'withdraw') return false;
  if (u.combatStatus === 'routed' && u.organisation < 35) return false; // truly broken; recovered units are usable again
  const a = p.mem.assigned[u.id];
  if (!a || a.epoch !== p.mem.epoch) return true;
  if (isIdle(u)) return true;
  return p.now - a.t > 720;
}

function availOf(p: P, ...roles: Role[]): Unit[] {
  return p.mine.filter((u) => roles.includes(roleOf(u)) && available(p, u) && !p.cutOff.has(u.id) && !p.axis.has(u.id));
}

/** True when the unit already carries an equivalent live order (same kind and nearly the same target). */
function hasEquivalentOrder(u: Unit, order: OrderSpec, mode: 'replace' | 'append'): boolean {
  const os = u.orders;
  if (!os.length) return false;
  if (mode === 'replace' && os.length !== 1) return false; // a replace would also clear the queue
  for (const o of os) {
    if ((o.status !== 'active' && o.status !== 'queued') || o.kind !== order.kind || o.operationId) continue;
    if (order.targetLocation !== undefined ? o.targetLocation !== order.targetLocation : o.targetLocation !== undefined) continue;
    if (order.targetUnit !== undefined && o.targetUnit !== order.targetUnit) continue;
    if (order.target) { if (!o.target || fastKm(o.target, order.target) > 3) continue; } else if (o.target) continue;
    return true;
  }
  return false;
}

function issue(p: P, units: Unit[], order: OrderSpec, mode: 'replace' | 'append' = 'replace'): boolean {
  if (!units.length || p.cmds.length >= p.doc.maxCommands) return false;
  const sig = sigOf(order.kind, order.targetLocation ?? order.target);
  const todo = units.filter((u) => !hasEquivalentOrder(u, order, mode));
  for (const u of units) { p.used.add(u.id); p.mem.assigned[u.id] = { sig, t: p.now, epoch: p.mem.epoch }; }
  if (!todo.length) return true; // already doing exactly this
  p.cmds.push({ type: 'issue_order', unitIds: todo.map((u) => u.id), order, mode });
  return true;
}

function setPosture(p: P, units: Unit[], posture: Unit['posture']): void {
  const todo = units.filter((u) => u.posture !== posture);
  for (const u of units) p.used.add(u.id);
  if (!todo.length || p.cmds.length >= p.doc.maxCommands) return;
  p.cmds.push({ type: 'set_posture', unitIds: todo.map((u) => u.id), posture });
}

const AIR_SUPPORT_KM = 120;
/** Expected air contribution to a battle at `pos`, in AI power units (a full infantry division is about 1): bombers weigh 3.5x fighters. */
function airSupport(p: P, pos: LonLat): number {
  let s = 0;
  for (const u of p.air) {
    if (u.fuel < 15 || u.ammo < 15 || u.inBattle) continue;
    const d = fastKm(u.pos, pos);
    if (d > AIR_SUPPORT_KM) continue;
    let n = 0; for (const k in u.equipment.held) n += u.equipment.held[k];
    const q = (0.75 + 0.5 * clamp(u.experience / 100, 0, 1)) * (0.5 + 0.5 * clamp(u.morale / 100, 0, 1));
    s += Math.max(0.2, n / 8) * (u.type === 'air_bomber' ? 7 : 2) * q * (1 - 0.4 * d / AIR_SUPPORT_KM) / 60;
  }
  return s;
}

/** Base the air groups within reach of the main effort (Schwerpunkt group centre, else the first open armour objective). */
function planAir(p: P): void {
  if (!p.air.length || !p.doc.redeployAir) return;
  const axisU = p.mine.filter((u) => p.axis.has(u.id));
  let focus: LonLat | null = axisU.length ? centroid(axisU) : null;
  if (!focus && p.fa.sectors.length) {
    // no Schwerpunkt: support the most threatened sector (defence) or the most promising one (attack)
    const key = p.posture === 'attack' ? (x: { opportunity: number }) => x.opportunity : (x: { threat: number }) => x.threat;
    let best = p.fa.sectors[0];
    for (const x of p.fa.sectors) if ((key as (s: typeof x) => number)(x) > (key as (s: typeof x) => number)(best)) best = x;
    focus = best.anchor;
  }
  if (!focus) { const l = p.doc.armourObjectives.map((id) => p.state.locations[id]).find((x) => x && p.enemyLocs.some((e) => e.id === x.id)); focus = l ? l.pos : null; }
  if (!focus) return;
  // air groups return to the nearest friendly airfield when idle, so base them on airfields (spread over the nearest few)
  const bases = p.ownLocs.filter((l) => l.kind === 'airfield').sort((a, b) => fastKm(a.pos, focus!) - fastKm(b.pos, focus!)).slice(0, 4);
  if (!bases.length) return;
  let k = 0;
  for (const u of p.air) {
    if (p.used.has(u.id) || u.inBattle || u.fuel < 20) continue;
    if (fastKm(u.pos, focus) <= 90) continue;
    const a = p.mem.assigned[u.id];
    if (a && p.now - a.t < 720) continue;
    const base = bases[k++ % bases.length];
    if (fastKm(u.pos, base.pos) < 15 || fastKm(u.pos, base.pos) >= fastKm(u.pos, focus)) continue; // the base must actually bring them closer
    issue(p, [u], { kind: 'move', priority: 2, target: base.pos, note: 'redeploy air group to support the main effort' });
  }
}

function powerSum(us: Unit[]): number { let s = 0; for (const u of us) s += unitPower(u); return s; }

function contactPowerNear(p: P, pos: LonLat, km: number): number {
  let s = 0;
  for (const c of p.contacts) if (fastKm(c.pos, pos) <= km) s += c.power * c.conf;
  return s;
}

/** Power that can actually engage at a point: nearby defenders count fully, distant ones fade out (only part of a sector fights). */
function defenderPower(p: P, pos: LonLat, km = 35): number {
  let s = 0;
  for (const c of p.contacts) {
    const d = fastKm(c.pos, pos);
    if (d <= km) s += c.power * c.conf * Math.max(0.1, 1 - d / km);
  }
  return s;
}

/** Minutes since we last had any contact near `pos` (large when we have no intel). */
function intelAge(p: P, pos: LonLat, km = 40): number {
  let best = Infinity;
  for (const c of p.contacts) if (fastKm(c.pos, pos) <= km) best = Math.min(best, p.now - c.minutes);
  return best === Infinity ? 99999 : best;
}


const byDist = (pos: LonLat) => (a: Unit, b: Unit) => fastKm(a.pos, pos) - fastKm(b.pos, pos) || (a.id < b.id ? -1 : 1);

function centroid(us: { pos: LonLat }[]): LonLat | null {
  if (!us.length) return null;
  let x = 0, y = 0;
  for (const u of us) { x += u.pos[0]; y += u.pos[1]; }
  return [x / us.length, y / us.length];
}

/** Point `km` beyond `from` away from the enemy, stepping back while it stays out of enemy-held ground. */
function retreatPoint(p: P, from: LonLat, maxKm: number): LonLat {
  let nearest: Contact | null = null; let nd = Infinity;
  for (const c of p.contacts) { const d = fastKm(c.pos, from); if (d < nd) { nd = d; nearest = c; } }
  let away: number;
  if (nearest && nd < 150) away = (bearingDeg(from, nearest.pos) + 180) % 360;
  else if (p.fa.enemyCentroid) away = (bearingDeg(from, p.fa.enemyCentroid) + 180) % 360;
  else if (p.fa.ownCentroid) away = bearingDeg(p.fa.enemyCentroid ?? from, from);
  else away = 180;
  let best: LonLat = from;
  for (let d = 12; d <= maxKm; d += 12) {
    const pt = destination(from, away, d);
    const k = classAt(p.fa.cg, pt);
    if (k === 2) break;
    if (k === 1) best = pt;
  }
  if (best === from) best = destination(from, away, Math.min(maxKm, 25));
  return best;
}

// ───────────────────────────── posture ─────────────────────────────

function attackNeed(p: P): number {
  // the combat model needs roughly 2:1 for a reliable attack (parity attacks mostly fail)
  return (p.doc.ratioToAttack ?? 2.1 - 0.7 * p.aggr) + 0.5 * p.fuelStress;
}
function withdrawThreshold(p: P): number {
  return p.doc.ratioToWithdraw ?? 0.4 - 0.15 * p.aggr;
}

function choosePosture(p: P): { posture: AiPosture; reason: string; emergency: boolean } {
  const fixed = scheduledPosture(p.doc, p.now);
  if (fixed === 'attack' && p.doc.fuelAware && p.fuelStress > 0.85) return { posture: 'consolidate', reason: 'fuel pool exhausted: offensive halted', emergency: false };
  if (fixed !== 'auto') return { posture: fixed, reason: `doctrine: ${fixed}`, emergency: true };

  const noise = Math.exp(gauss(p.ctx) * p.diff.noise * 0.5);
  const ratio = p.ratio * noise;
  const cutFrac = p.mine.length ? p.cutOff.size / p.mine.length : 0;
  let readiness = 0, n = 0;
  for (const u of p.mine) if (unitPower(u) > 0) { readiness += u.readiness; n++; }
  readiness = n ? readiness / n : 100;
  const lossFrac = p.mem.peakPower > 0 ? 1 - p.ownPower / p.mem.peakPower : 0;

  let wThr = withdrawThreshold(p);
  const holdObjective = p.doc.holdLocations.length > 0 || p.state.objectives.some(
    (o) => o.status === 'pending' && o.side === p.side && o.condition.kind === 'hold_location');
  if (holdObjective) wThr *= 0.6;
  const aThr = attackNeed(p);

  if (!p.doc.noWithdraw && (ratio < wThr || (cutFrac > 0.4 && ratio < 1))) {
    return { posture: 'withdraw', reason: `hopeless odds ${ratio.toFixed(2)} (cut-off ${(cutFrac * 100).toFixed(0)}%)`, emergency: ratio < wThr * 0.6 };
  }
  if (p.contacts.length === 0) {
    const goals = p.enemyLocs.length > 0 && p.aggr >= 0.3;
    return { posture: goals ? 'attack' : 'defend', reason: 'no enemy contact; probe objectives', emergency: false };
  }
  if (ratio >= aThr) {
    if (readiness < 45 || cutFrac > 0.2 || lossFrac > 0.3) return { posture: 'consolidate', reason: `favourable ${ratio.toFixed(2)} but exhausted`, emergency: false };
    return { posture: 'attack', reason: `force ratio ${ratio.toFixed(2)} >= ${aThr.toFixed(2)}`, emergency: false };
  }
  if (ratio >= aThr * 0.8 && (readiness < 50 || lossFrac > 0.25)) return { posture: 'consolidate', reason: `recover (readiness ${readiness.toFixed(0)}, losses ${(lossFrac * 100).toFixed(0)}%)`, emergency: false };
  return { posture: 'defend', reason: `force ratio ${ratio.toFixed(2)} below offensive threshold`, emergency: false };
}

// ───────────────────────────── operations bookkeeping ─────────────────────────────

function refreshOperations(p: P): void {
  const mem = p.mem;
  const mineOps = Object.values(p.state.operations).filter((o) => o.nation === p.nation && (o.status === 'planned' || o.status === 'active'));
  const names = new Set(Object.values(p.state.operations).map((o) => o.name));
  mem.ops = mem.ops.filter((o) => p.now - o.createdAt < 2160 && (!names.has(o.name) || mineOps.some((m) => m.name === o.name)));
  for (const op of mineOps) {
    const age = p.now - op.startMinutes;
    const span = Math.max(0, ...op.phases.map((ph) => ph.startAfterMinutes)) + 240;
    const units = op.phases.flatMap((ph) => ph.unitIds);
    const alive = units.filter((id) => state_alive(p, id));
    // finished: every phase has had time to be issued and all participants are idle again (or it is simply too old)
    if ((age > span && alive.every((id) => isIdle(p.state.units[id]))) || age > span + 4320 || alive.length === 0) {
      p.cmds.push({ type: 'cancel_operation', operationId: op.id });
      continue;
    }
    p.activeOps++;
    for (const id of alive) p.committed.add(id);
  }
  for (const o of mem.ops) {
    if (names.has(o.name)) continue; // already materialised
    p.activeOps++;
    for (const id of o.unitIds) p.committed.add(id);
  }
}
function state_alive(p: P, id: UnitId): boolean { const u = p.state.units[id]; return !!u && isAlive(u); }

function cancelAllOperations(p: P): void {
  for (const op of Object.values(p.state.operations)) {
    if (op.nation === p.nation && (op.status === 'planned' || op.status === 'active')) p.cmds.push({ type: 'cancel_operation', operationId: op.id });
  }
  p.mem.ops = [];
  p.committed.clear();
  p.activeOps = 0;
}

function createOperation(p: P, name: string, phases: Operation['phases']): boolean {
  if (p.cmds.length >= p.doc.maxCommands) return false;
  const full = `${p.nation} Op ${++p.mem.opCounter}: ${name}`;
  const clean = phases.filter((ph) => ph.unitIds.length > 0);
  if (!clean.length) return false;
  p.cmds.push({ type: 'create_operation', operation: { name: full, side: p.side, nation: p.nation, phases: clean, startMinutes: p.now } });
  const ids = [...new Set(clean.flatMap((ph) => ph.unitIds))];
  p.mem.ops.push({ name: full, unitIds: ids, createdAt: p.now });
  for (const id of ids) { p.used.add(id); p.committed.add(id); p.mem.assigned[id] = { sig: `op:${full}`, t: p.now, epoch: p.mem.epoch }; }
  p.activeOps++;
  return true;
}

// ───────────────────────────── planning pieces ─────────────────────────────

function pickReserve(p: P): void {
  const manoeuvre = availOf(p, 'armour', 'infantry');
  if (!manoeuvre.length) return;
  let frac = p.doc.reserveFraction;
  if (p.posture === 'attack') frac *= p.doc.armour === 'breakthrough' ? 0.4 : 0.8;
  if (p.posture === 'withdraw') frac = 0;
  const sorted = [...manoeuvre].sort((a, b) => (b.readiness + unitPower(b) * 20) - (a.readiness + unitPower(a) * 20) || (a.id < b.id ? -1 : 1));
  const armour = sorted.filter((u) => roleOf(u) === 'armour');
  const inf = sorted.filter((u) => roleOf(u) === 'infantry');
  const want = Math.round(manoeuvre.length * frac);
  const picks: Unit[] = [];
  if (p.doc.armour === 'reserve') picks.push(...armour);
  else if (p.doc.armour === 'balanced' || p.posture !== 'attack') picks.push(...armour.slice(0, Math.max(0, Math.ceil(want / 2))));
  for (const u of inf) { if (picks.length >= want) break; picks.push(u); }
  if (p.posture !== 'attack' && p.doc.armour !== 'breakthrough') for (const u of armour) if (picks.length < want && !picks.includes(u)) picks.push(u);
  for (const u of picks) p.reserve.add(u.id);
}

function planCutOff(p: P): void {
  let units = p.mine.filter((u) => p.cutOff.has(u.id) && isAlive(u) && roleOf(u) !== 'other' && (isIdle(u) || p.mem.assigned[u.id]?.epoch !== p.mem.epoch) && !p.used.has(u.id));
  // a besieged garrison at a doctrine hold location (Tobruk) stays and holds: it does not break out and abandon the port
  const holds = p.doc.holdLocations.map((id) => p.ownLocs.find((l) => l.id === id)).filter((l): l is Location => !!l);
  if (holds.length) {
    const stay = units.filter((u) => holds.some((l) => fastKm(u.pos, l.pos) <= 30));
    if (stay.length) {
      for (const u of stay) {
        const l = holds.reduce((b0, x) => (fastKm(u.pos, x.pos) < fastKm(u.pos, b0.pos) ? x : b0));
        if (fastKm(u.pos, l.pos) > 5) issue(p, [u], { kind: 'defend', priority: 3, target: l.pos, targetLocation: l.id, note: 'hold the besieged position' });
        else { p.used.add(u.id); if (u.entrenchment < 80) setPosture(p, [u], 'entrench'); }
      }
      units = units.filter((u) => !stay.includes(u));
    }
  }
  if (!units.length) return;
  const c = centroid(units)!;
  // nearest friendly formation / holding that is NOT cut off
  let target: LonLat | null = null; let bd = Infinity;
  for (const u of p.mine) { if (p.cutOff.has(u.id) || !isAlive(u)) continue; const d = fastKm(u.pos, c); if (d < bd) { bd = d; target = u.pos; } }
  for (const l of p.ownLocs) { const d = fastKm(l.pos, c); if (d < bd) { bd = d; target = l.pos; } }
  const fit = units.filter((u) => u.morale >= 25 && u.fuel > 5);
  if (target && fit.length && p.ratio > 0.2) {
    issue(p, fit, { kind: 'attack', priority: 3, target, note: 'break out of encirclement' });
    setPosture(p, units.filter((u) => !fit.includes(u)), 'entrench');
  } else {
    setPosture(p, units, 'entrench');
  }
}

function planSupportUnits(p: P): void {
  for (const u of p.mine) {
    const r = roleOf(u);
    if (r !== 'support' || !available(p, u) || p.cutOff.has(u.id)) continue;
    if (contactPowerNear(p, u.pos, 25) > 0.25) issue(p, [u], { kind: 'withdraw', priority: 2, target: retreatPoint(p, u.pos, 40), note: 'displace rear services' });
  }
}

function planRecon(p: P): void {
  const recon = availOf(p, 'recon');
  if (!recon.length) return;
  const pts: { pos: LonLat; base: number }[] = [];
  for (const s of p.fa.sectors) {
    const pos = s.enemyAnchor ? destination(s.enemyAnchor, s.enemyDir, 18) : destination(s.anchor, s.enemyDir, 45);
    pts.push({ pos, base: 0.3 + s.valueEnemy * 0.03 });
  }
  for (const l of p.enemyLocs) pts.push({ pos: l.pos, base: 0.2 + l.value * 0.06 * (p.objW[l.id] ?? 1) });
  if (!pts.length) return;
  const chosen: LonLat[] = [];
  for (const u of recon) {
    let best = -Infinity; let bp: LonLat | null = null;
    for (const pt of pts) {
      if (chosen.some((c) => fastKm(c, pt.pos) < 25)) continue;
      const stale = Math.min(720, intelAge(p, pt.pos)) / 720;
      const dist = fastKm(u.pos, pt.pos);
      const sc = (pt.base + stale) / (1 + dist / 150) * (1 + p.diff.noise * gauss(p.ctx) * 0.5);
      if (sc > best) { best = sc; bp = pt.pos; }
    }
    if (!bp) break;
    chosen.push(bp);
    issue(p, [u], { kind: 'recon', priority: 1, target: bp, note: 'locate enemy dispositions' });
  }
}

function attackReach(u: Unit): number { return roleOf(u) === 'armour' || u.type === 'motorised' ? 330 : 170; }

/** Realistic march rates (km/h, cross-country average) used to time phases: infantry ~1.3, armour 1.7, motorised 1.8, recon 2.6. */
function marchKmh(u: Unit): number {
  switch (u.type) { case 'recon': return 2.6; case 'motorised': return 1.8; case 'armoured': case 'mechanised': return 1.7; default: return 1.3; }
}
/** Minutes for the slowest of `units` to reach `pos` (with 15% allowance for terrain and contact halts). */
function etaMinutes(units: Unit[], pos: LonLat): number {
  let worst = 0;
  for (const u of units) worst = Math.max(worst, (fastKm(u.pos, pos) / marchKmh(u)) * 60 * 1.15);
  return Math.round(worst);
}
/** Hours a force must stand on an objective of this value before it changes hands (sim capture rules). */
function holdHours(l: Location): number { return l.value < 8 ? 2 + 2.5 * l.value : 24 + 6 * (l.value - 8); }

/** Defender terrain/fortification multiplier for an objective of this kind. */
function defenceMod(l: Location): number {
  switch (l.kind) { case 'fortress': return 1.8; case 'city': return 1.3; case 'port': return 1.2; case 'town': return 1.15; default: return 1; }
}

/** Campaign pacing gate: may the AI select this location as an operational objective yet? */
function gated(p: P, id: LocationId): boolean {
  const g = p.doc.objectiveSchedule[id];
  return (g !== undefined && p.now < g) || (p.mem.opTargets?.[id] ?? 0) > p.now;
}

function claimTarget(p: P, id: LocationId, hours = 18): void { (p.mem.opTargets ??= {})[id] = p.now + hours * 60; p.targeted.add(id); }


/**
 * Recon before commitment: when we have no fresh intelligence on an objective and the force is still far away,
 * advance to a staging area first (so the approach reveals the defenders), then plan the attack on real contacts.
 * Returns true if an approach operation was created instead of an attack.
 */
function stageApproach(p: P, loc: Location, force: Unit[]): boolean {
  const stagedAt = p.mem.staged?.[loc.id];
  if (stagedAt !== undefined && p.now - stagedAt < 24 * 60) return false;
  if (intelAge(p, loc.pos, 45) <= 360) return false;
  const fc = centroid(force);
  if (!fc || force.some((u) => fastKm(u.pos, loc.pos) < 70)) return false;
  const stage = destination(loc.pos, bearingDeg(loc.pos, fc), 32);
  const recon = availOf(p, 'recon').filter((u) => !p.used.has(u.id) && fastKm(u.pos, loc.pos) < 300).sort(byDist(loc.pos)).slice(0, 2);
  const phases: Operation['phases'] = [];
  if (recon.length) phases.push({ name: 'Reconnaissance', unitIds: recon.map((u) => u.id), order: { kind: 'recon', priority: 2, target: loc.pos }, startAfterMinutes: 0 });
  phases.push({ name: 'Approach march', unitIds: force.map((u) => u.id), order: { kind: 'move', priority: 2, target: stage, note: 'close up on the objective and gain contact' }, startAfterMinutes: 0 });
  if (!createOperation(p, `Approach ${loc.name}`, phases)) return false;
  (p.mem.staged ??= {})[loc.id] = p.now;
  claimTarget(p, loc.id, 30);
  return true;
}

/** Pull of strategic goals on a candidate stepping-stone location. */
function goalPull(p: P, pos: LonLat, from: LonLat): number {
  let best = 0;
  for (const g of p.goals) {
    const dg = fastKm(pos, g.loc.pos);
    if (dg > fastKm(from, g.loc.pos) + 20) continue; // must make progress towards the goal
    best = Math.max(best, g.w / (1 + dg / 130));
  }
  return best;
}

function planOffensive(p: P): void {
  const need = attackNeed(p);
  let slots = p.doc.maxOperations - p.activeOps;
  if (slots <= 0 || !p.enemyLocs.length) return;

  interface Cand { loc: Location; defP: number }
  // minor airfields (value 1) are raid/occupation targets, not operational objectives
  const cands: Cand[] = p.enemyLocs.filter((l) => l.kind !== 'airfield' || l.value >= 2 || p.doc.captureLocations.includes(l.id)).map((loc) => ({
    loc,
    defP: (defenderPower(p, loc.pos) + (intelAge(p, loc.pos) > 720 ? 0.8 : 0.15)) * defenceMod(loc),
  }));

  while (slots-- > 0) {
    const pool = availOf(p, 'infantry', 'armour').filter((u) => !p.reserve.has(u.id) && u.readiness >= 30 && u.fuel > (isMobileType(u.type) ? 35 : 5) && u.ammo > 25);
    if (!pool.length) return;
    let best: { c: Cand; score: number; force: Unit[]; ratio: number } | null = null;
    for (const c of cands) {
      if (p.targeted.has(c.loc.id) || gated(p, c.loc.id)) continue;
      const near = pool.filter((u) => fastKm(u.pos, c.loc.pos) <= attackReach(u)).sort(byDist(c.loc.pos));
      if (!near.length) continue;
      const atk = powerSum(near) + airSupport(p, c.loc.pos);
      const ratio = atk / c.defP;
      if (ratio < need * 0.75) continue;
      const dist = fastKm(near[0].pos, c.loc.pos);
      const w = (p.objW[c.loc.id] ?? 1) * (0.4 + c.loc.value / 5) + 0.7 * goalPull(p, c.loc.pos, near[0].pos);
      let sc = w * Math.pow(Math.min(ratio, 3), 0.8) / (1 + dist / 120);
      for (const s of p.fa.sectors) if (s.enemySalient && fastKm(s.enemySalient, c.loc.pos) < 45) sc *= 1.3;
      sc /= 1 + holdHours(c.loc) / 120;
      sc *= 1 + p.diff.noise * gauss(p.ctx);
      if (!best || sc > best.score) best = { c, score: sc, force: near, ratio };
    }
    if (!best) return;
    const { loc, defP } = best.c;
    // size the force: enough to reach the required ratio with margin, not more than 12 formations
    const want = need * defP * 1.3;
    const force: Unit[] = []; let pw = airSupport(p, loc.pos);
    for (const u of best.force) {
      if (roleOf(u) !== 'infantry') continue;
      if (pw >= want && force.length >= 2) break;
      if (force.length >= 24) break;
      force.push(u); pw += unitPower(u);
    }
    // armour joins as the exploitation / envelopment arm (up to 4 formations)
    const armPick = best.force.filter((u) => roleOf(u) === 'armour').slice(0, 8);
    for (const u of armPick) { force.push(u); pw += unitPower(u); }
    if (pw < need * defP * 0.75) { p.targeted.add(loc.id); continue; }
    if (!stageApproach(p, loc, force)) { buildAttackOperation(p, loc, defP, force); claimTarget(p, loc.id, Math.ceil(etaMinutes(force, loc.pos) / 60) + holdHours(loc) + 12); }
    p.targeted.add(loc.id);
  }
}

function buildAttackOperation(p: P, loc: Location, defP: number, force: Unit[]): void {
  const inf = force.filter((u) => roleOf(u) === 'infantry');
  let arm = force.filter((u) => roleOf(u) === 'armour');
  let assault = inf;
  if (!assault.length) { assault = arm; arm = []; }
  const fc = centroid(force)!;
  const axis = bearingDeg(fc, loc.pos);
  const phases: Operation['phases'] = [];

  const recon = availOf(p, 'recon').filter((u) => !p.reserve.has(u.id) && fastKm(u.pos, loc.pos) < 260).sort(byDist(loc.pos)).slice(0, 2);
  if (recon.length) phases.push({ name: 'Reconnaissance', unitIds: recon.map((u) => u.id), order: { kind: 'recon', priority: 2, target: loc.pos }, startAfterMinutes: 0 });
  const lead = [...assault].sort((a, b) => unitPower(b) - unitPower(a))[0];
  const arty = availOf(p, 'artillery').filter((u) => fastKm(u.pos, loc.pos) < 200).sort(byDist(loc.pos)).slice(0, 3);
  if (arty.length && lead) phases.push({ name: 'Fire support', unitIds: arty.map((u) => u.id), order: { kind: 'support', priority: 2, targetUnit: lead.id, target: loc.pos }, startAfterMinutes: 60 });
  const delay = recon.length ? 120 : 0;
  const eta = etaMinutes(assault, loc.pos);
  phases.push({ name: 'Assault', unitIds: assault.map((u) => u.id), order: { kind: 'attack', priority: 2, target: loc.pos }, startAfterMinutes: delay });
  phases.push({ name: 'Secure objective', unitIds: assault.map((u) => u.id), order: { kind: 'capture', priority: 2, target: loc.pos, targetLocation: loc.id }, startAfterMinutes: delay + Math.round(eta * 0.85) });

  let envelop = false;
  if (arm.length) {
    const cut = destination(loc.pos, axis, 30);
    if (p.doc.encirclement && arm.length >= 2 && classAt(p.fa.cg, cut) !== 1 && defP >= 0.6) {
      const left = destination(loc.pos, (axis + 270) % 360, 28), right = destination(loc.pos, (axis + 90) % 360, 28);
      const stage = contactPowerNear(p, left, 20) <= contactPowerNear(p, right, 20) ? left : right;
      phases.push({ name: 'Flank march', unitIds: arm.map((u) => u.id), order: { kind: 'move', priority: 2, target: stage, note: 'wide hook around the objective' }, startAfterMinutes: delay });
      phases.push({ name: 'Envelopment (cut line of retreat)', unitIds: arm.map((u) => u.id), order: { kind: 'attack', priority: 2, target: cut, note: 'cut off the garrison from supply and reinforcement' }, startAfterMinutes: delay + Math.round(etaMinutes(arm, stage) * 0.9) });
      envelop = true;
    } else {
      phases.push({ name: 'Armoured thrust', unitIds: arm.map((u) => u.id), order: { kind: 'attack', priority: 2, target: loc.pos }, startAfterMinutes: delay });
    }
  }
  createOperation(p, `${envelop ? 'Envelop' : 'Assault'} ${loc.name}`, phases);
}


/** Schwerpunkt: concentrate the armour into one deep thrust at the doctrine's first open armour objective. */
function planArmourThrust(p: P): void {
  if (p.doc.armour === 'reserve') return;
  const need = attackNeed(p);
  if (p.now - (p.mem.lastThrust ?? -99999) < 60 + 720 * p.fuelStress) return; // fuel-starved armies pause between thrusts
  for (let k = 0; k < 2; k++) {
    const useAxis = p.doc.armourObjectives.length > 0;
    if (!useAxis && p.activeOps >= p.doc.maxOperations + 1) return; // the Schwerpunkt is never starved by other operations
    const arm = (useAxis ? p.mine.filter((u) => p.axis.has(u.id) && available(p, u) && !p.cutOff.has(u.id)) : availOf(p, 'armour'))
      .filter((u) => !p.reserve.has(u.id) && u.fuel >= 50 && u.ammo >= 30 && u.readiness >= 40 && (p.state.supply?.unitSupplyDistKm?.[u.id] ?? 0) !== -1);
    if (!arm.length) return;
    if (useAxis && arm.length < Math.min(2, p.axis.size)) return; // operational pause: wait until the group is refuelled and re-formed
    // 1) doctrine sequence: first open, ungated, unclaimed armour objective
    let target: Location | null = null;
    for (const id of p.doc.armourObjectives) {
      const l = p.enemyLocs.find((x) => x.id === id);
      const sg = p.doc.objectiveSchedule[id];
      if (!l || (sg !== undefined && p.now < sg)) continue; // pacing gate only: claims by infantry operations do not stop the armour
      // other (infantry) operations may already be working on it; the armour still joins unless its own thrust is under way
      const own = Object.values(p.state.operations).some((o) => o.nation === p.nation && (o.status === 'active' || o.status === 'planned') && o.name.includes(`Armoured thrust on ${l.name}`) && o.phases.some((ph) => ph.unitIds.some((uid) => p.state.units[uid]?.orders.some((x) => x.operationId === o.id && (x.status === 'active' || x.status === 'queued')))));
      if (!own) { target = l; break; }
    }
    let grp: Unit[];
    if (useAxis && !target) return; // the Schwerpunkt waits for its next objective (pacing gate / already under way)
    if (target) {
      grp = [...arm].sort(byDist(target.pos)).filter((u) => fastKm(u.pos, target!.pos) <= 480).slice(0, 10);
    } else {
      // 2) no doctrine sequence: best-scoring reachable goal for the group nearest the top open goal
      let top: Location | null = null, tw = -1;
      for (const g of p.goals) if (!gated(p, g.loc.id) && g.w > tw) { tw = g.w; top = g.loc; }
      const seed = top ? [...arm].sort(byDist(top.pos))[0] : arm[0];
      grp = [...arm].sort(byDist(seed.pos)).filter((u) => fastKm(u.pos, seed.pos) <= (top ? 330 : 220)).slice(0, 8);
      if (grp.length < 3 && p.doc.armour !== 'breakthrough') return;
      const c = centroid(grp)!;
      const pw = powerSum(grp) + airSupport(p, centroid(grp)!);
      let best: { loc: Location; sc: number } | null = null;
      for (const loc of p.enemyLocs) {
        if (p.targeted.has(loc.id) || gated(p, loc.id)) continue;
        const d = fastKm(c, loc.pos);
        if (d < 12 || d > 300) continue;
        const defP = (defenderPower(p, loc.pos) + (intelAge(p, loc.pos) > 720 ? 0.8 : 0.15)) * defenceMod(loc);
        const ratio = pw / defP;
        if (ratio < need * 0.75) continue;
        const goal = p.goals.find((g) => g.loc.id === loc.id)?.w ?? 0;
        const w = (p.objW[loc.id] ?? 1) * 0.3 + goal + loc.value / 6 + 0.5 * goalPull(p, loc.pos, c);
        const sc = w / (1 + d / 250) * Math.sqrt(Math.min(ratio, 3)) / (1 + holdHours(loc) / 120) * (1 + p.diff.noise * gauss(p.ctx));
        if (!best || sc > best.sc) best = { loc, sc };
      }
      if (!best) return;
      target = best.loc;
    }
    const loc = target;
    if (!grp.length) return;
    // fix the defenders first: infantry pin the formations around the thrust's next destination, then armour goes in
    {
      const c0 = centroid(grp)!;
      const dest0 = fastKm(c0, loc.pos) > 125 ? destination(c0, bearingDeg(c0, loc.pos), 110) : loc.pos;
      if (planFix(p, dest0, loc.id)) return;
    }
    // supply-aware legs: armour burns about 1 fuel per hour of marching and is cut off beyond truck range of the network,
    // so drive in bounds sized to the tank, and only start the next bound once the group is refuelled
    {
      const c0 = centroid(grp)!;
      const d0 = fastKm(c0, loc.pos);
      const minFuel = Math.min(...grp.map((u) => u.fuel));
      let legKm = clamp((minFuel - 20) / 1.2, 30, 65) * (1 - 0.5 * p.fuelStress); // measured burn is about 1.3-1.5 fuel per km, so a full tank is about 55 km
      // inside our own (supplied) territory the tank is refilled en route: bound further, straight at the objective
      if (classAt(p.fa.cg, c0) === 1 && classAt(p.fa.cg, destination(c0, bearingDeg(c0, loc.pos), Math.min(120, d0))) === 1) legKm = Math.max(legKm, Math.min(120, (minFuel - 10) * 1.2));
      // unopposed approach march (no known defenders along the line): take it in one stride while the tanks are full
      if (minFuel >= 70) {
        const reach = Math.min(110, d0, (minFuel - 20) / 1.2);
        const mid = destination(c0, bearingDeg(c0, loc.pos), reach * 0.5), far = destination(c0, bearingDeg(c0, loc.pos), reach);
        if (defenderPower(p, mid, 35) < 0.3 && defenderPower(p, far, 35) < 0.3) legKm = Math.max(legKm, reach);
      }
      if (d0 > legKm + 15) {
        // route the bound around concentrated defenders: weigh the direct line against 30 and 55 degree sidesteps
        const b0 = bearingDeg(c0, loc.pos);
        let wp = destination(c0, b0, legKm), wpScore = Infinity;
        for (const off of [0, -30, 30, -55, 55]) {
          const cand = destination(c0, (b0 + off + 360) % 360, legKm);
          if (classAt(p.fa.cg, cand) === 0) continue;
          const sc = defenderPower(p, cand, 30) + 0.35 * Math.abs(off) / 30 + 0.02 * fastKm(cand, loc.pos) / 10;
          if (sc < wpScore) { wpScore = sc; wp = cand; }
        }
        const ph: Operation['phases'] = [{ name: 'Advance (bound)', unitIds: grp.map((u) => u.id), order: { kind: 'attack', priority: 3, target: wp, note: 'supply-limited bound toward ' + loc.name }, startAfterMinutes: 0 }];
        if (createOperation(p, `Armoured thrust toward ${loc.name}`, ph)) p.mem.lastThrust = p.now;
        continue;
      }
    }
    p.targeted.add(loc.id); // (the supply-limited bounds above already stage the group)
    const recon = availOf(p, 'recon').filter((u) => fastKm(u.pos, loc.pos) < 400).sort(byDist(loc.pos)).slice(0, 1);
    const phases: Operation['phases'] = [];
    if (recon.length) phases.push({ name: 'Reconnaissance in force', unitIds: recon.map((u) => u.id), order: { kind: 'recon', priority: 2, target: loc.pos }, startAfterMinutes: 0 });
    const eta = etaMinutes(grp, loc.pos);
    phases.push({ name: 'Breakthrough', unitIds: grp.map((u) => u.id), order: { kind: 'attack', priority: 3, target: loc.pos, note: 'armoured thrust (Schwerpunkt)' }, startAfterMinutes: 0 });
    phases.push({ name: 'Seize objective', unitIds: grp.map((u) => u.id), order: { kind: 'capture', priority: 3, target: loc.pos, targetLocation: loc.id }, startAfterMinutes: Math.round(eta * 0.8) });
    if (createOperation(p, `Armoured thrust on ${loc.name}`, phases)) { p.mem.lastThrust = p.now; claimTarget(p, loc.id, Math.ceil(eta / 60) + holdHours(loc) + 12); }
  }
}

/**
 * Pinning attacks: before armour drives into a strongly held area, nearby infantry attack the known formations
 * there so they cannot reposition against the thrust. Returns true while the armour should hold (fix under way, max 12 h).
 */
function planFix(p: P, dest: LonLat, objId: string): boolean {
  const dp = defenderPower(p, dest, 40);
  if (dp < 1.5) return false;
  const key = objId;
  const fixAt = (p.mem.fixAt ??= {});
  let started: number | undefined = fixAt[key];
  if (started !== undefined && p.now - started >= 48 * 60) { delete fixAt[key]; started = undefined; } // cooldown over
  if (started !== undefined && p.now - started >= 6 * 60) return false; // waited long enough: go
  const tgs = p.contacts.filter((c) => c.conf >= 0.5 && fastKm(c.pos, dest) <= 45 && p.now - c.minutes <= 720).sort((a, b) => b.power - a.power || (a.id < b.id ? -1 : 1)).slice(0, 3);
  if (!tgs.length) return false;
  let pool = availOf(p, 'infantry').filter((u) => !p.reserve.has(u.id) && u.readiness >= 40 && fastKm(u.pos, dest) <= 170).sort(byDist(dest));
  const arty = availOf(p, 'artillery').filter((u) => u.ammo >= 25 && fastKm(u.pos, dest) <= 150).sort(byDist(dest)).slice(0, 3);
  let issued = 0;
  for (const t of tgs) {
    const team: Unit[] = []; let pw = 0;
    for (const u of pool) { team.push(u); pw += unitPower(u); if (pw >= t.power * 0.8 || team.length >= 4) break; }
    if (!team.length || pw < t.power * 0.6) continue;
    pool = pool.filter((u) => !team.includes(u));
    const phases: Operation['phases'] = [];
    if (arty.length && issued === 0) phases.push({ name: 'Fire support', unitIds: arty.map((u) => u.id), order: { kind: 'support', priority: 2, targetUnit: team[0].id, target: t.pos }, startAfterMinutes: 30 });
    phases.push({ name: 'Fixing attack', unitIds: team.map((u) => u.id), order: { kind: 'attack', priority: 2, target: t.pos, note: 'pin defenders ahead of the armoured thrust' }, startAfterMinutes: 0 });
    if (createOperation(p, 'Fix defenders near thrust axis', phases)) issued++;
    if (issued >= 2) break;
  }
  if (issued) { if (started === undefined) fixAt[key] = p.now; return true; }
  return started !== undefined && p.now - started < 6 * 60;
}

/** Infantry take and hold: occupy enemy-held locations we have seen empty (armour or air cleared them, or nobody defended). */
function planOccupy(p: P): void {
  let n = 0;
  const cands = p.enemyLocs.filter((l) => !p.targeted.has(l.id) && !gated(p, l.id) && l.value >= 2)
    .map((l) => ({ l, w: ((p.goals.find((g) => g.loc.id === l.id)?.w ?? 0) + l.value / 4) }))
    .sort((a, b) => b.w - a.w || (a.l.id < b.l.id ? -1 : 1));
  for (const { l } of cands) {
    if (n >= 3) break;
    if (defenderPower(p, l.pos, 25) > 0.2 || intelAge(p, l.pos, 25) > 720) continue; // must be seen empty recently
    const pool = availOf(p, 'infantry').filter((u) => fastKm(u.pos, l.pos) < 160 && u.readiness >= 30 && (!isMobileType(u.type) || u.fuel > 15)).sort(byDist(l.pos));
    const need = 1.5 + 0.5 * l.value;
    const team: Unit[] = []; let men = 0;
    for (const u of pool) { team.push(u); men += u.manpower / 1000; if (men >= need * 1.6 || team.length >= 3) break; }
    if (!team.length || men < need) continue;
    if (issue(p, team, { kind: 'capture', priority: 2, target: l.pos, targetLocation: l.id, note: 'take and hold' })) { claimTarget(p, l.id, Math.ceil(etaMinutes(team, l.pos) / 60) + holdHours(l) + 6); n++; }
  }
}

/** Do not run mobile formations dry or empty: pause low fuel/ammo units (operational pause) until resupplied. */
function planRefit(p: P): void {
  for (const u of p.mine) {
    if (p.used.has(u.id) || p.committed.has(u.id) || u.inBattle || p.cutOff.has(u.id)) continue;
    const r = roleOf(u);
    if (r === 'other' || r === 'support') continue;
    const low = (isMobileType(u.type) && u.fuel < 25) || u.ammo < 8;
    if (!low) continue;
    const a = p.mem.assigned[u.id];
    if (a && a.sig.startsWith('regroup') && p.now - a.t < 360) continue;
    const k = u.orders[0]?.kind;
    if (!k || k === 'regroup' || k === 'rest') continue;
    issue(p, [u], { kind: 'regroup', priority: 2, target: u.pos, note: 'operational pause: resupply' });
  }
}

/** Opportunistic strikes on isolated / weak known enemy elements near our forces. */
function planStrikes(p: P): void {
  const need = attackNeed(p);
  const targets = p.contacts.filter((c) => c.conf >= 0.6 && p.now - c.minutes <= 360).sort((a, b) => a.power - b.power || (a.id < b.id ? -1 : 1));
  let strikes = 0;
  for (const c of targets) {
    if (strikes >= 3) break;
    const pool = availOf(p, 'infantry', 'armour').filter((u) => !p.reserve.has(u.id) && u.readiness >= 30 && u.fuel > 10 && u.ammo > 10 && fastKm(u.pos, c.pos) <= 45).sort(byDist(c.pos));
    if (!pool.length) continue;
    const defP = contactPowerNear(p, c.pos, 12) + 0.1;
    const force: Unit[] = []; let pw = 0;
    for (const u of pool) { force.push(u); pw += unitPower(u); if (pw >= need * defP * 1.2 || force.length >= 5) break; }
    const ratio = pw / (defP * (1 + p.diff.noise * Math.abs(gauss(p.ctx)) * 0.3));
    if (ratio < need) continue;
    issue(p, force, { kind: 'attack', priority: 2, target: c.pos, targetUnit: c.conf >= 1 ? c.id : undefined, note: 'strike weak point' });
    strikes++;
  }
}

function planRaids(p: P): void {
  if (!p.doc.raidSupply) return;
  const prefer = (l: Location) => (l.kind === 'depot' ? 3 : l.kind === 'port' ? 2 : l.kind === 'airfield' ? 1.5 : l.kind === 'bridge' ? 1.3 : 0.7);
  const raiders = availOf(p, 'recon', 'armour').filter((u) => (u.type === 'recon' || u.type === 'mechanised' || u.type === 'armoured') && !p.reserve.has(u.id) && u.fuel > 40 && u.readiness >= 40);
  if (!raiders.length) return;
  let best: { l: Location; sc: number; team: Unit[] } | null = null;
  for (const l of p.enemyLocs) {
    if (p.targeted.has(l.id) || gated(p, l.id) || (l.kind !== 'depot' && l.kind !== 'port' && l.kind !== 'bridge' && l.kind !== 'airfield')) continue;
    const defP = contactPowerNear(p, l.pos, 25) + 0.1;
    const team = raiders.filter((u) => fastKm(u.pos, l.pos) < 240).sort(byDist(l.pos)).slice(0, 2);
    if (!team.length || powerSum(team) < defP * 1.4) continue;
    const sc = prefer(l) * (0.5 + l.value / 8) / (1 + fastKm(team[0].pos, l.pos) / 150) * (1 + p.diff.noise * gauss(p.ctx));
    if (!best || sc > best.sc) best = { l, sc, team };
  }
  if (best) {
    issue(p, best.team, { kind: 'capture', priority: 1, target: best.l.pos, targetLocation: best.l.id, note: 'raid supply infrastructure' });
    p.targeted.add(best.l.id);
  }
}

function planCounterattacks(p: P): void {
  if (p.activeOps >= p.doc.maxOperations + 1) return;
  const forcePool = () => [...(p.posture === 'attack' ? availOf(p, 'infantry') : availOf(p, 'armour', 'infantry'))].filter((u) => u.readiness >= 25 && u.fuel > 10 && u.ammo > 10);

  // 1) enemy penetrations: contacts standing on ground we control
  const pens = (p.now - (p.mem.lastCounter ?? -99999) < (p.posture === 'attack' ? 1440 : 720) ? [] : p.contacts.filter((c) => c.conf >= 0.8 && classAt(p.fa.cg, c.pos) === 1 && (p.posture !== 'attack' || p.ownLocs.some((l) => l.value >= 5 && fastKm(l.pos, c.pos) < 35)))).sort((a, b) => b.power - a.power || (a.id < b.id ? -1 : 1));
  for (const c of pens.slice(0, 1)) {
    if (p.activeOps >= p.doc.maxOperations + 1) break;
    const defP = contactPowerNear(p, c.pos, 15) + 0.1;
    const pool = forcePool().filter((u) => fastKm(u.pos, c.pos) < 110).sort((a, b) => (p.reserve.has(a.id) ? 0 : 1) - (p.reserve.has(b.id) ? 0 : 1) || byDist(c.pos)(a, b));
    const force: Unit[] = []; let pw = 0;
    for (const u of pool) { force.push(u); pw += unitPower(u); if (pw >= defP * 1.5 || force.length >= 6) break; }
    if (pw < defP * 1.1) continue;
    const arty = availOf(p, 'artillery').filter((u) => fastKm(u.pos, c.pos) < 120).sort(byDist(c.pos)).slice(0, 2);
    const lead = force[0];
    const phases: Operation['phases'] = [];
    if (arty.length) phases.push({ name: 'Fire support', unitIds: arty.map((u) => u.id), order: { kind: 'support', priority: 3, targetUnit: lead.id, target: c.pos }, startAfterMinutes: 0 });
    phases.push({ name: 'Counter-attack', unitIds: force.map((u) => u.id), order: { kind: 'attack', priority: 3, target: c.pos, targetUnit: c.conf >= 1 ? c.id : undefined, note: 'eject penetration' }, startAfterMinutes: 0 });
    if (createOperation(p, 'Counter-attack on penetration', phases)) p.mem.lastCounter = p.now;
  }

  // 2) pinch off exposed enemy salients (defensive postures only; an offensive posture is already attacking them)
  for (const s of p.posture === 'attack' || p.now - (p.mem.lastCounter ?? -99999) < 720 ? [] : p.fa.sectors) {
    if (!s.enemySalient || p.activeOps >= p.doc.maxOperations + 1) continue;
    const dist = fastKm(s.enemySalient, s.anchor);
    const neck = destination(s.anchor, s.enemyDir, Math.max(5, dist * 0.4));
    const defP = contactPowerNear(p, s.enemySalient, 40) + 0.2;
    const pool = forcePool().filter((u) => fastKm(u.pos, neck) < 120).sort(byDist(neck));
    const force: Unit[] = []; let pw = 0;
    for (const u of pool) { force.push(u); pw += unitPower(u); if (pw >= defP * 1.4 || force.length >= 8) break; }
    if (pw < defP * 1.15 || force.length < 2) continue;
    const half = Math.ceil(force.length / 2);
    const a = destination(neck, (s.enemyDir + 270) % 360, 12), b = destination(neck, (s.enemyDir + 90) % 360, 12);
    if (createOperation(p, 'Pinch off enemy salient', [
      { name: 'Northern shoulder', unitIds: force.slice(0, half).map((u) => u.id), order: { kind: 'attack', priority: 2, target: a, note: 'attack shoulder of salient' }, startAfterMinutes: 0 },
      { name: 'Southern shoulder', unitIds: force.slice(half).map((u) => u.id), order: { kind: 'attack', priority: 2, target: b, note: 'attack shoulder of salient' }, startAfterMinutes: 0 },
    ])) p.mem.lastCounter = p.now;
  }
}

function slotPos(s: Sector, k: number): LonLat {
  const lateral = ((k % 7) - 3) * 7;
  const depth = 3 + Math.floor(k / 7) * 4;
  const back = destination(s.anchor, (s.enemyDir + 180) % 360, depth);
  return destination(back, (s.enemyDir + 90) % 360, lateral);
}

/**
 * Garrison the doctrine's must-hold locations: enough formations to match the enemy force known nearby (at least one),
 * preferring those already there. Garrisons dig in on the spot and are not drawn into counter-attacks or sector lines.
 */
/**
 * Encircled pocket (e.g. Stalingrad): formations near the pocket's locations stand and dig in (the airfield inside the
 * pocket is what airlift supply reaches), instead of joining offensives or counter-attacks.
 */
function planPocket(p: P): void {
  const locs = p.doc.pocketLocations.map((id) => p.state.locations[id]).filter((l): l is Location => !!l && sideOfNation(p.state, l.owner) === p.side);
  if (!locs.length) return;
  for (const u of p.mine) {
    if (p.used.has(u.id) || u.inBattle) continue;
    let near: Location | null = null, nd = 55;
    for (const l of locs) { const d = fastKm(u.pos, l.pos); if (d < nd) { nd = d; near = l; } }
    if (!near) continue;
    if (nd > 30) issue(p, [u], { kind: 'defend', priority: 3, target: near.pos, targetLocation: near.id, note: 'hold the pocket' });
    else { p.used.add(u.id); if (u.entrenchment < 80) setPosture(p, [u], 'entrench'); }
  }
}

function planGarrison(p: P): void {
  if (!p.doc.holdLocations.length) return;
  const pool = availOf(p, 'infantry', 'armour').filter((u) => !p.reserve.has(u.id) && !p.axis.has(u.id)); // the Schwerpunkt is never drafted as garrison
  for (const id of p.doc.holdLocations) {
    const l = p.ownLocs.find((x) => x.id === id);
    if (!l) continue;
    const threat = contactPowerNear(p, l.pos, 45);
    const need = Math.max(1.0, 1.4 * threat);
    // a unit already standing at another hold location (within 15 km) belongs to that position: it is never drafted away from it
    const mine = pool.filter((u) => !p.used.has(u.id) && fastKm(u.pos, l.pos) < 130
      && (fastKm(u.pos, l.pos) < 15 || !p.doc.holdLocations.some((id2) => { const o = p.ownLocs.find((x) => x.id === id2); return !!o && o.id !== l.id && fastKm(u.pos, o.pos) < 15; }))).sort(byDist(l.pos));
    const team: Unit[] = []; let pw = 0;
    for (const u of mine) {
      if (roleOf(u) === 'armour' && threat < 0.8) continue; // armour only garrisons against a real threat
      team.push(u); pw += unitPower(u);
      if (pw >= need || team.length >= (threat >= 2.5 ? 8 : 4)) break; // a besieged key position draws in the whole nearby reserve
    }
    for (const u of team) {
      if (fastKm(u.pos, l.pos) > 6) issue(p, [u], { kind: 'defend', priority: 3, target: l.pos, targetLocation: l.id, note: 'garrison' });
      else { p.used.add(u.id); if (u.entrenchment < 80) setPosture(p, [u], 'entrench'); }
    }
  }
}

function planDefence(p: P, advance = false): void {
  const pool = availOf(p, 'infantry', 'engineer', 'artillery').filter((u) => !p.reserve.has(u.id));
  const reserveUnits = p.mine.filter((u) => p.reserve.has(u.id) && available(p, u) && !p.cutOff.has(u.id));

  // garrison valuable own locations that are threatened
  const infPool = pool.filter((u) => roleOf(u) === 'infantry');
  for (const l of p.ownLocs) {
    const hold = p.doc.holdLocations.includes(l.id);
    if (!hold && l.value < 4) continue;
    if (contactPowerNear(p, l.pos, 90) <= 0.05 && !hold) continue;
    if (p.mine.some((u) => roleOf(u) === 'infantry' && fastKm(u.pos, l.pos) < 12 && isAlive(u))) continue;
    const cand = infPool.filter((u) => available(p, u) && fastKm(u.pos, l.pos) < 160).sort(byDist(l.pos))[0];
    if (cand) issue(p, [cand], { kind: 'defend', priority: hold ? 3 : 2, target: l.pos, targetLocation: l.id, note: 'garrison' });
  }

  const sectors = p.fa.sectors;
  const rest = pool.filter((u) => available(p, u));
  if (sectors.length) {
    const need = sectors.map((s) => s.threat + 0.3);
    const got = sectors.map(() => 0);
    const slot = sectors.map(() => 0);
    const entrenchers: Unit[] = [];
    for (const u of rest) {
      let bi = 0, bs = -Infinity;
      for (let i = 0; i < sectors.length; i++) {
        const d = fastKm(u.pos, sectors[i].anchor);
        const sc = (need[i] - got[i]) / (1 + d / 100);
        if (sc > bs) { bs = sc; bi = i; }
      }
      const s = sectors[bi];
      got[bi] += unitPower(u);
      const rear = roleOf(u) === 'artillery' ? 10 : 0;
      let pos = slotPos(s, slot[bi]++);
      if (rear) pos = destination(pos, (s.enemyDir + 180) % 360, rear);
      if (classAt(p.fa.cg, pos) === 2) pos = s.anchor;
      if (advance && !rear && u.ammo > 25 && u.readiness >= 35 && (!isMobileType(u.type) || u.fuel > 30) && s.ratio >= attackNeed(p) * 0.6) {
        issue(p, [u], { kind: 'attack', priority: 1, target: destination(pos, s.enemyDir, 22), note: 'advance to contact' });
        continue;
      }
      if (fastKm(u.pos, pos) > 6) issue(p, [u], { kind: 'defend', priority: 1, target: pos, note: 'occupy sector line' });
      else entrenchers.push(u);
    }
    setPosture(p, entrenchers.filter((u) => u.entrenchment < 80), 'entrench');
  } else {
    setPosture(p, rest.filter((u) => u.entrenchment < 80 && isIdle(u)), 'entrench');
  }

  // reserves behind the most threatened sector
  if (reserveUnits.length) {
    let top: Sector | null = null;
    for (const s of sectors) if (!top || s.threat > top.threat) top = s;
    let k = 0;
    for (const u of reserveUnits) {
      if (top) {
        const rp = destination(destination(top.anchor, (top.enemyDir + 180) % 360, 22), (top.enemyDir + 90) % 360, ((k++ % 5) - 2) * 6);
        if (fastKm(u.pos, rp) > 9) issue(p, [u], { kind: 'defend', priority: 1, target: rp, note: 'operational reserve' });
        else p.used.add(u.id);
      } else p.used.add(u.id);
    }
  }
}

function fallbackFor(p: P, u: Unit): LocationId | null {
  const away = p.fa.enemyCentroid ?? (p.contacts[0]?.pos ?? null);
  if (!away) return null;
  const dNow = fastKm(u.pos, away);
  const pref = p.doc.fallbackLocations.filter((id) => p.ownLocs.some((l) => l.id === id));
  const list = pref.length ? p.ownLocs.filter((l) => pref.includes(l.id)) : p.ownLocs.filter((l) => l.kind === 'city' || l.kind === 'town' || l.kind === 'depot' || l.kind === 'fortress' || l.kind === 'port');
  let best: Location | null = null; let bs = Infinity;
  for (const l of list) {
    if (fastKm(l.pos, away) < dNow + 10) continue;
    const d = fastKm(u.pos, l.pos);
    if (d > 220 || contactPowerNear(p, l.pos, 25) > 0.3) continue;
    const sc = d - l.value * 6;
    if (sc < bs) { bs = sc; best = l; }
  }
  return best ? best.id : null;
}

function planWithdrawal(p: P): void {
  const movers = p.mine.filter((u) => roleOf(u) !== 'other' && roleOf(u) !== 'support' && available(p, u) && !p.cutOff.has(u.id));
  const inf = movers.filter((u) => roleOf(u) === 'infantry').sort((a, b) => (b.organisation + b.morale) - (a.organisation + a.morale) || (a.id < b.id ? -1 : 1));
  const rear = new Set<UnitId>(inf.slice(0, Math.ceil(inf.length * 0.25)).filter((u) => u.morale > 30 && u.organisation > 35).map((u) => u.id));
  const groups = new Map<string, { units: Unit[]; target: LonLat; locId?: LocationId }>();
  for (const u of movers) {
    if (rear.has(u.id)) { issue(p, [u], { kind: 'defend', priority: 2, target: u.pos, note: 'rearguard: delay the enemy' }); continue; }
    const fid = fallbackFor(p, u);
    const loc = fid ? p.state.locations[fid] : null;
    const key = loc ? `L${loc.id}` : `P${retreatPoint(p, u.pos, 90).map((x) => x.toFixed(1)).join(',')}`;
    let g = groups.get(key);
    if (!g) { g = { units: [], target: loc ? loc.pos : retreatPoint(p, u.pos, 90), locId: loc?.id }; groups.set(key, g); }
    g.units.push(u);
  }
  for (const g of groups.values()) issue(p, g.units, { kind: 'withdraw', priority: 2, target: g.target, targetLocation: g.locId, note: 'strategic withdrawal to preserve the force' });
  setPosture(p, [...rear].map((id) => p.state.units[id]), 'entrench');
}

function planConsolidation(p: P): void {
  const depots = p.ownLocs.filter((l) => l.kind === 'depot' || l.kind === 'city' || l.kind === 'port' || l.kind === 'town');
  const tired = p.mine.filter((u) => roleOf(u) !== 'other' && roleOf(u) !== 'recon' && available(p, u) && !p.cutOff.has(u.id)
    && (u.readiness < 50 || u.supply < 35 || u.fuel < 20 || u.ammo < 20 || u.organisation < 35) && unitPower(u) + (roleOf(u) === 'support' ? 1 : 0) > 0);
  for (const u of tired) {
    if (u.inBattle) continue;
    const l = depots.filter((d) => contactPowerNear(p, d.pos, 25) < 0.3).sort((a, b) => fastKm(a.pos, u.pos) - fastKm(b.pos, u.pos))[0];
    if (l && fastKm(l.pos, u.pos) > 6) issue(p, [u], { kind: 'regroup', priority: 1, target: l.pos, targetLocation: l.id, note: 'rest, refit and resupply' });
    else setPosture(p, [u], 'rest');
  }
  // straighten the line: pull units out of our own salients
  for (const u of p.mine) {
    if (roleOf(u) !== 'infantry' || !available(p, u) || p.cutOff.has(u.id)) continue;
    if (inOwnSalient(p.fa, u.pos)) issue(p, [u], { kind: 'withdraw', priority: 1, target: retreatPoint(p, u.pos, 30), note: 'straighten the line' });
  }
  planDefence(p);
}

function planReinforcements(p: P): void {
  const ns = p.state.nations[p.nation];
  if (!ns || ns.resources.manpower <= 50) return;
  let n = 0;
  for (const u of p.mine) {
    if (n >= 3 || p.cmds.length >= p.doc.maxCommands) return;
    if (roleOf(u) === 'other' || u.manpowerMax <= 0 || u.manpower / u.manpowerMax >= 0.55 || u.inBattle) continue;
    if (p.now - (p.mem.reinforceReq[u.id] ?? -99999) < 720) continue;
    const l = p.ownLocs.filter((x) => (x.kind === 'city' || x.kind === 'town' || x.kind === 'depot' || x.kind === 'port') && fastKm(x.pos, u.pos) < 60 && x.owner === p.nation)
      .sort((a, b) => fastKm(a.pos, u.pos) - fastKm(b.pos, u.pos))[0];
    if (!l) continue;
    p.cmds.push({ type: 'request_reinforcement', locationId: l.id, unitId: u.id });
    p.mem.reinforceReq[u.id] = p.now;
    n++;
  }
}

// ───────────────────────────── entry point ─────────────────────────────

/**
 * Decide what `nation` does this think. Pure w.r.t. game state (returns Commands); writes only `state.aiState[nation]`.
 */
export function aiThink(state: Readonly<GameState>, nation: NationId, ctx: AiContext): Command[] {
  const side = sideOfNation(state, nation);
  if (side === 'neutral') return [];
  const mem = getMemory(state, nation);
  const now = state.clock.minutes;
  const doc = resolveDoctrine(state, nation);
  const diff = difficultyProfile(state.settings);

  const mine: Unit[] = [];
  const airU: Unit[] = [];
  for (const id in state.units) {
    const u = state.units[id];
    if (u.nation !== nation || !isAlive(u)) continue;
    if (u.domain === 'land') mine.push(u);
    else if (u.domain === 'air' && (u.type === 'air_bomber' || u.type === 'air_fighter')) airU.push(u);
  }
  mem.thinkCount++;
  mem.lastThinkAt = now;
  for (const id in mem.assigned) { const u = state.units[id]; if (!u || !isAlive(u)) delete mem.assigned[id]; }
  if (!mine.length) return [];

  const { contacts } = perceive(state, nation, side, mine, ctx, diff);
  const cg = buildClassGrid(state, side);
  const objW: Record<LocationId, number> = { ...doc.locationWeights };
  for (const id of doc.captureLocations) objW[id] = (objW[id] ?? 1) * 2;
  for (const id of doc.holdLocations) objW[id] = (objW[id] ?? 1) * 2;
  for (const o of state.objectives) {
    if (o.status !== 'pending' || o.side !== side) continue;
    if (o.condition.kind === 'capture_location' || o.condition.kind === 'hold_location') {
      objW[o.condition.locationId] = (objW[o.condition.locationId] ?? 1) * (1 + 0.25 * o.points / 10 + 1);
    }
  }
  const fa = analyseFront(state, cg, mine, contacts, side, objW);

  const enemyLocs: Location[] = [], ownLocs: Location[] = [];
  for (const id in state.locations) {
    const l = state.locations[id];
    const ls = sideOfNation(state, l.owner);
    if (ls === side) ownLocs.push(l); else if (ls === opposite(side)) enemyLocs.push(l);
  }

  const goals: { loc: Location; w: number }[] = [];
  for (const l of enemyLocs) {
    let w = (doc.captureLocations.includes(l.id) ? 3 : 0) + (doc.locationWeights[l.id] ?? 0);
    for (const o of state.objectives) {
      if (o.status === 'pending' && o.side === side && o.condition.kind === 'capture_location' && o.condition.locationId === l.id) w += o.points / 50;
    }
    if (w > 0) goals.push({ loc: l, w });
  }
  const ownPower = powerSum(mine);
  let known = 0;
  for (const c of contacts) known += c.power * c.conf;
  // under fog, assume the enemy is not negligible just because we cannot see it (prior: ~half our own strength)
  const enemyPower = Math.max(known * 1.15, state.settings.fogOfWar ? ownPower * 0.5 : 0) + 0.4;
  mem.peakPower = Math.max(ownPower, mem.peakPower * 0.995);
  mem.lastPower = ownPower;

  const aggr = clamp(state.settings.aiAggression * diff.aggression + doc.aggressionBias, 0, 1);
  const cutOff = new Set<UnitId>();
  for (const id of state.supply?.cutOffUnits ?? []) if (state.units[id]?.nation === nation) cutOff.add(id);
  for (const u of mine) if (u.encircled || u.combatStatus === 'encircled') cutOff.add(u.id);

  let fuelStress = 0;
  if (doc.fuelAware) {
    const pool = state.nations[nation]?.resources.fuel ?? 0;
    if (mem.fuel0 === undefined || pool > mem.fuel0) mem.fuel0 = pool;
    fuelStress = mem.fuel0 > 0 ? clamp((0.8 - pool / mem.fuel0) / 0.5, 0, 1) : 0;
  }
  const p: P = {
    state, nation, side, ctx, mem, doc, diff, now, aggr, posture: (mem.posture as AiPosture) ?? 'defend', mine, air: airU, contacts, fa,
    cmds: [], used: new Set(), committed: new Set(), reserve: new Set(), targeted: new Set(), objW,
    fuelStress, ownPower, enemyPower, ratio: ownPower / enemyPower, enemyLocs, ownLocs, cutOff, activeOps: 0, axis: new Set(), goals,
  };

  // ── posture with decision latency ──
  const want = choosePosture(p);
  const reaction = doc.reactionMinutes * diff.latency;
  let adopted = false;
  if (!mem.posture) adopted = true;
  else if (want.posture === mem.posture) mem.candidate = undefined;
  else if (want.emergency) adopted = true;
  else if (!mem.candidate || mem.candidate.posture !== want.posture) mem.candidate = { posture: want.posture, since: now };
  else if (now - mem.candidate.since >= reaction) adopted = true;
  if (adopted) {
    const changed = mem.posture !== want.posture;
    mem.posture = want.posture; mem.postureSince = now; mem.candidate = undefined;
    if (changed) mem.epoch++;
    p.posture = want.posture;
    if (changed && want.posture === 'withdraw') cancelAllOperations(p);
  }
  mem.postureReason = want.reason;
  p.posture = mem.posture as AiPosture;

  if (p.posture !== 'withdraw') refreshOperations(p); else p.activeOps = 0;

  // Schwerpunkt group: persistent, chosen from the armour nearest the first open armour objective
  if (doc.armourObjectives.length && p.posture === 'attack') {
    const ids = (mem.axisGroup ?? []).filter((id) => state.units[id] && isAlive(state.units[id]));
    const first = doc.armourObjectives.map((id) => state.locations[id]).find((l) => l && sideOfNation(state, l.owner) !== side);
    if (ids.length < doc.axisSize && first) {
      const armour = mine.filter((u) => roleOf(u) === 'armour' && !ids.includes(u.id)).sort((a, b) => fastKm(a.pos, first.pos) - fastKm(b.pos, first.pos) || (a.id < b.id ? -1 : 1));
      for (const u of armour) { if (ids.length >= doc.axisSize) break; ids.push(u.id); }
    }
    mem.axisGroup = ids;
    for (const id of ids) p.axis.add(id);
  }

  // ── plan ──
  planCutOff(p);
  pickReserve(p);
  planPocket(p);
  if (p.posture !== 'withdraw') planGarrison(p);
  switch (p.posture) {
    case 'attack':
      planCounterattacks(p);
      planOffensive(p);
      planArmourThrust(p);
      planOccupy(p);
      planStrikes(p);
      planRaids(p);
      planDefence(p, true);
      break;
    case 'defend':
      planCounterattacks(p);
      planDefence(p);
      break;
    case 'consolidate':
      planCounterattacks(p);
      planConsolidation(p);
      break;
    case 'withdraw':
      planWithdrawal(p);
      break;
  }
  planAir(p);
  planRefit(p);
  planRecon(p);
  planSupportUnits(p);
  planReinforcements(p);

  return p.cmds.slice(0, doc.maxCommands + 8);
}

/** Debug / UI helper: current posture and reasoning of an AI nation (reads memory only). */
export function describeAi(state: Readonly<GameState>, nation: NationId): { posture?: string; reason: string; since: number } {
  const m = (state.aiState as Record<string, AiMemory | undefined>)[nation];
  return { posture: m?.posture, reason: m?.postureReason ?? '', since: m?.postureSince ?? 0 };
}

