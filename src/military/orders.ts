/**
 * Order validation, queues, operations, completion/failure detection and command application.
 * Deterministic: order ids come from state.idCounter, no wall-clock, no Math.random.
 */
import { haversineKm, pathLengthKm } from '../core/geo';
import type {
  Command, CommandResult, GameState, LonLat, Operation, Order, OrderKind, Posture, SideId, Unit, UnitId,
} from '../core/types';
import { TICK_MINUTES } from '../core/types';
import { NON_COMBAT_TYPES, templateForType } from './catalog';
import { addLog, clamp, isAlive, milSpecial, type MilitaryContext } from './context';

export const MAX_QUEUE = 12;
export const ARRIVE_KM = 1.5;
export const TAKEOVER_KM = 3;
export const SUPPORT_RANGE_KM = 10;
export const ENTRENCH_DONE = 90;
export const ETA_REFRESH_MINUTES = 6 * TICK_MINUTES;

type OrderSpec = Omit<Order, 'id' | 'issuedAt' | 'status'>;

const LAND_ONLY: ReadonlySet<OrderKind> = new Set<OrderKind>(['entrench', 'capture', 'defensive_line']);
const ROUTED_OK: ReadonlySet<OrderKind> = new Set<OrderKind>(['withdraw', 'rest', 'regroup', 'hold']);
const MOVING_KINDS: ReadonlySet<OrderKind> = new Set<OrderKind>(['move', 'attack', 'withdraw', 'recon', 'reinforce', 'follow', 'capture', 'defend', 'defensive_line', 'support']);

export const POSTURE_FOR: Record<OrderKind, Posture> = {
  move: 'hold', attack: 'attack', defend: 'defend', hold: 'hold', withdraw: 'hold', entrench: 'entrench',
  recon: 'recon', regroup: 'regroup', rest: 'rest', reinforce: 'hold', support: 'hold', follow: 'hold',
  capture: 'attack', defensive_line: 'defend',
};

const isLonLat = (p: unknown): p is LonLat =>
  Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

/** Can this unit execute this kind of order at all? Returns an error string or null. */
export function orderUnitError(unit: Unit, kind: OrderKind): string | null {
  if (unit.destroyed || unit.surrendered) return `${unit.name} is no longer in action`;
  if (LAND_ONLY.has(kind) && unit.domain !== 'land') return `${unit.name} cannot ${kind}`;
  if ((kind === 'attack' || kind === 'capture') && NON_COMBAT_TYPES.has(unit.type)) return `${unit.name} is a non-combat unit and cannot ${kind}`;
  if (unit.combatStatus === 'routed' && !ROUTED_OK.has(kind)) return `${unit.name} is routed and can only withdraw, rest, regroup or hold`;
  return null;
}

/** Structural validation of an order spec (independent of the unit). Returns error or null. */
export function validateOrderSpec(state: GameState, spec: OrderSpec, side: SideId | 'any'): string | null {
  const k = spec.kind;
  if (spec.target !== undefined && !isLonLat(spec.target)) return 'Invalid target coordinates';
  if (spec.line !== undefined && (!Array.isArray(spec.line) || spec.line.some(p => !isLonLat(p)))) return 'Invalid line coordinates';
  const tu = spec.targetUnit ? state.units[spec.targetUnit] : undefined;
  if (spec.targetUnit && !tu) return `Unknown target unit ${spec.targetUnit}`;
  switch (k) {
    case 'move': case 'recon':
      if (!spec.target) return `${k} needs a target position`;
      break;
    case 'attack':
      if (!spec.target && !spec.targetUnit) return 'attack needs a target position or target unit';
      if (tu && side !== 'any' && tu.side === side) return 'Cannot attack a friendly unit';
      break;
    case 'support': case 'follow': case 'reinforce':
      if (!spec.targetUnit && !(k === 'reinforce' && spec.target)) return `${k} needs a friendly target unit`;
      if (tu && side !== 'any' && tu.side !== side) return `${k} target must be a friendly unit`;
      break;
    case 'capture': {
      const loc = spec.targetLocation ? state.locations[spec.targetLocation] : undefined;
      if (!loc) return 'capture needs a valid target location';
      if (side !== 'any' && state.nations[loc.owner]?.side === side) return `${loc.name} is already held by our side`;
      break;
    }
    case 'defensive_line':
      if (!spec.line || spec.line.length < 2) return 'defensive_line needs at least two points';
      break;
    case 'withdraw': case 'defend': case 'hold': case 'entrench': case 'regroup': case 'rest':
      break;
    default:
      return `Unknown order kind ${String(k)}`;
  }
  return null;
}

function newOrder(state: GameState, spec: OrderSpec): Order {
  const o: Order = {
    id: `ord_${state.idCounter++}`,
    kind: spec.kind,
    issuedAt: state.clock.minutes,
    priority: Math.round(clamp(spec.priority ?? 1, 0, 3)),
    status: 'queued',
  };
  if (spec.target) o.target = [spec.target[0], spec.target[1]];
  if (spec.targetUnit) o.targetUnit = spec.targetUnit;
  if (spec.targetLocation) o.targetLocation = spec.targetLocation;
  if (spec.line) o.line = spec.line.map(p => [p[0], p[1]] as LonLat);
  if (spec.operationId) o.operationId = spec.operationId;
  if (spec.note) o.note = spec.note;
  return o;
}

function clearMotion(u: Unit): void {
  u.route = undefined;
  u.routeEtaMinutes = undefined;
}

function insertOrder(u: Unit, order: Order, mode: 'replace' | 'append'): void {
  if (mode === 'replace') {
    for (const o of u.orders) if (o.status === 'queued' || o.status === 'active') o.status = 'cancelled';
    u.orders = [order];
    clearMotion(u);
    return;
  }
  if (u.orders.length === 0) { u.orders.push(order); return; }
  const head = u.orders[0];
  if (order.priority > head.priority) {
    head.status = 'queued';
    clearMotion(u);
    u.orders.unshift(order);
    return;
  }
  let i = 1;
  while (i < u.orders.length && u.orders[i].priority >= order.priority) i++;
  u.orders.splice(i, 0, order);
}

/** Core issuing routine shared by applyCommand and operation phases. */
export function issueOrders(
  state: GameState, unitIds: UnitId[], spec: OrderSpec, mode: 'replace' | 'append', as: SideId | 'any',
): CommandResult {
  if (!unitIds || unitIds.length === 0) return { ok: false, error: 'No units selected' };
  const specErr = validateOrderSpec(state, spec, as);
  if (specErr) return { ok: false, error: specErr };
  const units: Unit[] = [];
  for (const id of unitIds) {
    const u = state.units[id];
    if (!u) return { ok: false, error: `Unknown unit ${id}` };
    if (as !== 'any' && u.side !== as) return { ok: false, error: `Unit ${u.name} does not belong to your side` };
    units.push(u);
  }
  const ids: string[] = [];
  const skipped: string[] = [];
  for (const u of units) {
    const err = orderUnitError(u, spec.kind);
    if (err) { skipped.push(err); continue; }
    if (mode === 'append' && u.orders.length >= MAX_QUEUE) { skipped.push(`${u.name}: order queue full`); continue; }
    const s: OrderSpec = { ...spec };
    if (spec.kind === 'defend' && !s.target) s.target = [u.pos[0], u.pos[1]];
    if (spec.kind === 'capture' && spec.targetLocation && !s.target) s.target = state.locations[spec.targetLocation].pos;
    const o = newOrder(state, s);
    insertOrder(u, o, mode);
    ids.push(o.id);
  }
  if (ids.length === 0) return { ok: false, error: skipped.join('; ') || 'No unit could accept the order' };
  return skipped.length ? { ok: true, ids, error: `Skipped: ${skipped.join('; ')}` } : { ok: true, ids };
}

function cancelOrders(state: GameState, unitIds: UnitId[], orderId: string | undefined, as: SideId | 'any'): CommandResult {
  const ids: string[] = [];
  for (const id of unitIds) {
    const u = state.units[id];
    if (!u) return { ok: false, error: `Unknown unit ${id}` };
    if (as !== 'any' && u.side !== as) return { ok: false, error: `Unit ${u.name} does not belong to your side` };
  }
  for (const id of unitIds) {
    const u = state.units[id];
    const wasActive = u.orders[0];
    const keep: Order[] = [];
    for (const o of u.orders) {
      if (orderId === undefined || o.id === orderId) { o.status = 'cancelled'; ids.push(o.id); } else keep.push(o);
    }
    u.orders = keep;
    if (wasActive && wasActive.status === 'cancelled') {
      clearMotion(u);
      if (u.moveStatus !== 'retreating') u.moveStatus = 'stationary';
    }
  }
  if (orderId !== undefined && ids.length === 0) return { ok: false, error: `Order ${orderId} not found` };
  return { ok: true, ids };
}

function createOperation(state: GameState, op: Omit<Operation, 'id' | 'status'>, as: SideId | 'any'): CommandResult {
  if (as !== 'any' && op.side !== as) return { ok: false, error: 'Operation side does not match issuing side' };
  if (!op.phases || op.phases.length === 0) return { ok: false, error: 'Operation needs at least one phase' };
  for (const ph of op.phases) {
    if (!ph.unitIds?.length) return { ok: false, error: `Phase "${ph.name}" has no units` };
    const e = validateOrderSpec(state, ph.order, op.side);
    if (e) return { ok: false, error: `Phase "${ph.name}": ${e}` };
    for (const id of ph.unitIds) {
      const u = state.units[id];
      if (!u) return { ok: false, error: `Phase "${ph.name}": unknown unit ${id}` };
      if (u.side !== op.side) return { ok: false, error: `Phase "${ph.name}": unit ${u.name} is not on the operation's side` };
    }
    if (!(ph.startAfterMinutes >= 0)) return { ok: false, error: `Phase "${ph.name}": invalid delay` };
  }
  const id = `op_${state.idCounter++}`;
  const startMinutes = Math.max(op.startMinutes, state.clock.minutes);
  const operation: Operation = { ...op, id, status: 'planned', startMinutes, phases: op.phases.map(p => ({ ...p, unitIds: [...p.unitIds], order: { ...p.order, operationId: id } })) };
  state.operations[id] = operation;
  milSpecial(state).opIssued[id] = operation.phases.map(() => false);
  addLog(state, { category: 'order', severity: 'info', text: `Operation "${op.name}" planned` });
  return { ok: true, ids: [id] };
}

function cancelOperation(state: GameState, operationId: string, as: SideId | 'any'): CommandResult {
  const op = state.operations[operationId];
  if (!op) return { ok: false, error: `Unknown operation ${operationId}` };
  if (as !== 'any' && op.side !== as) return { ok: false, error: 'Operation belongs to the other side' };
  if (op.status === 'complete' || op.status === 'cancelled') return { ok: false, error: `Operation already ${op.status}` };
  op.status = 'cancelled';
  for (const u of Object.values(state.units)) {
    if (u.orders.some(o => o.operationId === operationId)) {
      const head = u.orders[0];
      u.orders = u.orders.filter(o => o.operationId !== operationId);
      if (head?.operationId === operationId) { clearMotion(u); if (u.moveStatus !== 'retreating') u.moveStatus = 'stationary'; }
    }
  }
  addLog(state, { category: 'order', severity: 'info', text: `Operation "${op.name}" cancelled` });
  return { ok: true, ids: [operationId] };
}

export function applyCommand(state: GameState, cmd: Command, as: SideId | 'any'): CommandResult {
  if (as === 'neutral') return { ok: false, error: 'Neutral side cannot issue commands' };
  switch (cmd.type) {
    case 'issue_order':
      return issueOrders(state, cmd.unitIds, cmd.order, cmd.mode, as);
    case 'cancel_orders':
      return cancelOrders(state, cmd.unitIds, cmd.orderId, as);
    case 'create_operation':
      return createOperation(state, cmd.operation, as);
    case 'cancel_operation':
      return cancelOperation(state, cmd.operationId, as);
    case 'set_posture': {
      for (const id of cmd.unitIds) {
        const u = state.units[id];
        if (!u) return { ok: false, error: `Unknown unit ${id}` };
        if (as !== 'any' && u.side !== as) return { ok: false, error: `Unit ${u.name} does not belong to your side` };
      }
      const valid: Posture[] = ['hold', 'defend', 'entrench', 'attack', 'rest', 'recon', 'regroup'];
      if (!valid.includes(cmd.posture)) return { ok: false, error: `Invalid posture ${String(cmd.posture)}` };
      let n = 0;
      for (const id of cmd.unitIds) {
        const u = state.units[id];
        if (!isAlive(u)) continue;
        if ((cmd.posture === 'entrench') && u.domain !== 'land') continue;
        u.posture = cmd.posture;
        n++;
      }
      return n ? { ok: true } : { ok: false, error: 'No unit could change posture' };
    }
    case 'request_reinforcement':
      return requestReinforcement(state, cmd.locationId, cmd.unitId, as);
    case 'rename': {
      const u = state.units[cmd.unitId];
      if (!u) return { ok: false, error: `Unknown unit ${cmd.unitId}` };
      if (as !== 'any' && u.side !== as) return { ok: false, error: 'Unit does not belong to your side' };
      const name = (cmd.name ?? '').trim();
      if (name.length < 1 || name.length > 60) return { ok: false, error: 'Name must be 1-60 characters' };
      u.name = name;
      return { ok: true };
    }
    case 'resolve_event':
      return { ok: false, error: 'resolve_event is handled by the events module' };
    default:
      return { ok: false, error: 'Unknown command' };
  }
}

export const EXPEDITE_COST = 20;
export const EXPEDITE_MIN_MINUTES = 4 * TICK_MINUTES;

/** Expedite a pending reinforcement to arrive at a friendly location sooner, for supply points. */
function requestReinforcement(state: GameState, locationId: string, unitId: UnitId, as: SideId | 'any'): CommandResult {
  const loc = state.locations[locationId];
  if (!loc) return { ok: false, error: `Unknown location ${locationId}` };
  const locSide = state.nations[loc.owner]?.side;
  for (const nation of Object.values(state.nations)) {
    if (as !== 'any' && nation.side !== as) continue;
    const arr = nation.reinforcements.find(r => !r.arrived && r.unit.id === unitId);
    if (!arr) continue;
    if (locSide !== nation.side) return { ok: false, error: `${loc.name} is not held by our side` };
    const target = state.clock.minutes + EXPEDITE_MIN_MINUTES;
    if (arr.atMinutes <= target) return { ok: false, error: 'Reinforcement is already arriving' };
    if (nation.resources.supplyPoints < EXPEDITE_COST) return { ok: false, error: `Need ${EXPEDITE_COST} supply points to expedite` };
    nation.resources.supplyPoints = Math.max(0, nation.resources.supplyPoints - EXPEDITE_COST);
    arr.atMinutes = target;
    arr.locationId = locationId;
    arr.pos = undefined;
    addLog(state, { category: 'supply', severity: 'info', text: `${arr.unit.name} expedited to ${loc.name}`, pos: loc.pos });
    return { ok: true, ids: [arr.id] };
  }
  return { ok: false, error: `No pending reinforcement for unit ${unitId} available to your side` };
}

// ───────────────────────────── ETA ─────────────────────────────

/** Straight-line ETA estimate (minutes) using catalog speeds. */
export function estimateEtaMinutes(unit: Unit, to: LonLat, fromPos: LonLat = unit.pos): number {
  const tpl = templateForType(unit.type);
  const km = haversineKm(fromPos, to) * (unit.domain === 'land' ? 1.3 : 1);
  const speed = Math.max(0.5, tpl.speedKmh.road * 0.35 + tpl.speedKmh.offroad * 0.65);
  return Math.ceil((km / speed) * 60);
}

function computeEta(state: GameState, ctx: MilitaryContext | undefined, u: Unit, to: LonLat): { eta: number | undefined; routeFailed: boolean } {
  if (ctx?.findRoute) {
    const r = ctx.findRoute(u, to, state);
    if (!r) return { eta: undefined, routeFailed: true };
    return { eta: Math.ceil(r.etaMinutes), routeFailed: false };
  }
  if (u.route && u.route.length) {
    const km = pathLengthKm([u.pos, ...u.route]);
    const speed = Math.max(0.5, templateForType(u.type).speedKmh.road * 0.35 + templateForType(u.type).speedKmh.offroad * 0.65);
    return { eta: Math.ceil((km / speed) * 60), routeFailed: false };
  }
  return { eta: estimateEtaMinutes(u, to), routeFailed: false };
}

// ───────────────────────────── processing ─────────────────────────────

/** Position of a tracked unit as the tracker is allowed to know it (honours fog of war). */
function trackedPos(state: GameState, tracker: Unit, target: Unit): LonLat | undefined {
  if (target.side === tracker.side || !state.settings.fogOfWar) return target.pos;
  if (target.visibleTo?.includes(tracker.side)) return target.pos;
  return target.lastSeenBy?.[tracker.side]?.pos;
}

function nearestEnemy(state: GameState, u: Unit, from: LonLat = u.pos): { unit: Unit; km: number } | null {
  let best: { unit: Unit; km: number } | null = null;
  for (const e of Object.values(state.units)) {
    if (!isAlive(e) || e.side === u.side || e.side === 'neutral' || e.domain !== 'land') continue;
    const km = haversineKm(from, e.pos);
    if (!best || km < best.km) best = { unit: e, km };
  }
  return best;
}

function enemyNear(state: GameState, u: Unit, p: LonLat, km: number): boolean {
  for (const e of Object.values(state.units)) {
    if (!isAlive(e) || e.side === u.side || e.side === 'neutral') continue;
    if (haversineKm(e.pos, p) <= km) return true;
  }
  return false;
}

/** Choose a rally point for a withdraw order lacking an explicit target. */
function pickWithdrawTarget(state: GameState, u: Unit): LonLat | null {
  const en = nearestEnemy(state, u);
  let best: { p: LonLat; km: number } | null = null;
  for (const loc of Object.values(state.locations)) {
    if (state.nations[loc.owner]?.side !== u.side) continue;
    if (!['city', 'town', 'depot', 'port', 'fortress', 'airfield'].includes(loc.kind)) continue;
    const d = haversineKm(u.pos, loc.pos);
    if (d < 8) continue;
    if (en && haversineKm(loc.pos, en.unit.pos) <= en.km) continue; // must be farther from the enemy than we are
    if (!best || d < best.km) best = { p: loc.pos, km: d };
  }
  return best ? best.p : null;
}

type Verdict = 'continue' | 'complete' | 'failed';

function evaluate(state: GameState, u: Unit, o: Order, queueBehind: boolean): { v: Verdict; note?: string } {
  const tu = o.targetUnit ? state.units[o.targetUnit] : undefined;
  const dist = (p: LonLat) => haversineKm(u.pos, p);
  switch (o.kind) {
    case 'move': case 'recon': case 'withdraw': {
      if (!o.target) return { v: 'failed', note: 'no destination' };
      return dist(o.target) <= ARRIVE_KM ? { v: 'complete' } : { v: 'continue' };
    }
    case 'reinforce': {
      if (tu) {
        if (!isAlive(tu)) return { v: 'failed', note: 'unit to reinforce was lost' };
        const p = trackedPos(state, u, tu);
        if (p) o.target = [p[0], p[1]];
        return dist(tu.pos) <= TAKEOVER_KM ? { v: 'complete' } : { v: 'continue' };
      }
      return o.target && dist(o.target) <= ARRIVE_KM ? { v: 'complete' } : { v: 'continue' };
    }
    case 'attack': {
      if (u.combatStatus === 'routed') return { v: 'failed', note: 'unit routed' };
      if (u.organisation < 15 && u.combatStatus !== 'attacking') return { v: 'failed', note: 'organisation collapsed' };
      if (tu) {
        if (!isAlive(tu)) return { v: 'complete', note: 'target destroyed' };
        const p = trackedPos(state, u, tu);
        if (p) o.target = [p[0], p[1]];
        return { v: 'continue' };
      }
      if (o.target && dist(o.target) <= TAKEOVER_KM && !enemyNear(state, u, o.target, TAKEOVER_KM)) return { v: 'complete', note: 'objective taken' };
      return { v: 'continue' };
    }
    case 'capture': {
      const loc = o.targetLocation ? state.locations[o.targetLocation] : undefined;
      if (!loc) return { v: 'failed', note: 'unknown location' };
      if (u.combatStatus === 'routed') return { v: 'failed', note: 'unit routed' };
      if (state.nations[loc.owner]?.side === u.side) return { v: 'complete', note: `${loc.name} secured` };
      o.target = [loc.pos[0], loc.pos[1]];
      return { v: 'continue' };
    }
    case 'follow': case 'support': {
      if (!tu || !isAlive(tu)) return { v: 'failed', note: 'supported unit was lost' };
      const p = trackedPos(state, u, tu);
      if (o.kind === 'follow') { if (p) o.target = [p[0], p[1]]; return { v: 'continue' }; }
      // support: stay within range of the supported unit
      if (p && dist(p) > SUPPORT_RANGE_KM) o.target = [p[0], p[1]]; else o.target = undefined;
      return { v: 'continue' };
    }
    case 'defend': case 'defensive_line': {
      const arrived = !o.target || dist(o.target) <= ARRIVE_KM;
      return arrived && queueBehind ? { v: 'complete' } : { v: 'continue' };
    }
    case 'hold':
      return queueBehind ? { v: 'complete' } : { v: 'continue' };
    case 'entrench':
      return u.entrenchment >= ENTRENCH_DONE ? { v: 'complete' } : { v: 'continue' };
    case 'rest':
      return u.fatigue <= 10 && u.organisation >= 90 ? { v: 'complete' } : { v: 'continue' };
    case 'regroup':
      return u.organisation >= 85 ? { v: 'complete' } : { v: 'continue' };
    default:
      return { v: 'failed', note: 'unknown order' };
  }
}

function describe(o: Order): string {
  return o.kind.replace('_', ' ');
}

function activate(state: GameState, ctx: MilitaryContext | undefined, u: Unit, o: Order): boolean {
  o.status = 'active';
  o.startedAt = state.clock.minutes;
  if (o.kind === 'withdraw' && !o.target) {
    const t = pickWithdrawTarget(state, u);
    if (!t) { o.status = 'failed'; o.note = 'no safe place to withdraw'; return false; }
    o.target = t;
  }
  if (o.kind === 'defensive_line' && o.line && o.line.length) {
    let best = o.line[0], bd = Infinity;
    for (const p of o.line) { const d = haversineKm(u.pos, p); if (d < bd) { bd = d; best = p; } }
    o.target = [best[0], best[1]];
  }
  if (o.kind === 'follow' || o.kind === 'support' || o.kind === 'attack') {
    const tu = o.targetUnit ? state.units[o.targetUnit] : undefined;
    if (tu) { const p = trackedPos(state, u, tu); if (p) o.target = [p[0], p[1]]; }
  }
  if (o.kind === 'capture' && o.targetLocation) o.target = state.locations[o.targetLocation].pos;
  u.posture = POSTURE_FOR[o.kind];
  clearMotion(u);
  if (o.target && MOVING_KINDS.has(o.kind)) {
    const { eta, routeFailed } = computeEta(state, ctx, u, o.target);
    if (routeFailed && (o.kind === 'move' || o.kind === 'withdraw')) { o.status = 'failed'; o.note = 'no route to destination'; return false; }
    u.routeEtaMinutes = eta;
  }
  return true;
}

function logFor(state: GameState, ctx: MilitaryContext | undefined, u: Unit, text: string, severity: 'info' | 'warn'): void {
  if (u.side !== state.playerSide) return; // don't leak enemy order traffic into the player's log
  const e = { category: 'order' as const, text, pos: u.pos, unitId: u.id, severity };
  if (ctx) ctx.log(e); else addLog(state, e);
}

/** True if the unit cannot move at all (no fuel for a fuel-using unit). Sim movement must honour this. */
export function isImmobilised(u: Unit): boolean {
  return templateForType(u.type).usesFuel && u.fuel <= 0;
}

function processOperations(state: GameState, ctx: MilitaryContext): void {
  const sp = milSpecial(state);
  const now = state.clock.minutes;
  for (const op of Object.values(state.operations)) {
    if (op.status === 'complete' || op.status === 'cancelled') continue;
    if (now < op.startMinutes) continue;
    if (op.status === 'planned') {
      op.status = 'active';
      addLog(state, { category: 'order', severity: 'info', text: `Operation "${op.name}" begins` });
    }
    const issued = (sp.opIssued[op.id] ??= op.phases.map(() => false));
    op.phases.forEach((ph, i) => {
      if (issued[i] || now < op.startMinutes + ph.startAfterMinutes) return;
      issued[i] = true;
      const alive = ph.unitIds.filter(id => isAlive(state.units[id]) && state.units[id].side === op.side);
      if (!alive.length) return;
      const res = issueOrders(state, alive, { ...ph.order, operationId: op.id }, 'append', op.side);
      const text = res.ok
        ? `Operation "${op.name}": phase "${ph.name}" launched (${res.ids?.length ?? 0} units)`
        : `Operation "${op.name}": phase "${ph.name}" could not be issued (${res.error})`;
      if (op.side === state.playerSide) ctx.log({ category: 'order', severity: res.ok ? 'info' : 'warn', text });
    });
    if (issued.every(Boolean)) {
      const pending = Object.values(state.units).some(u => isAlive(u) && u.orders.some(o => o.operationId === op.id));
      if (!pending) {
        op.status = 'complete';
        if (op.side === state.playerSide) ctx.log({ category: 'order', severity: 'info', text: `Operation "${op.name}" complete` });
      }
    }
  }
}

export function processOrders(state: GameState, ctx: MilitaryContext): void {
  processOperations(state, ctx);
  const now = state.clock.minutes;
  for (const u of Object.values(state.units)) {
    if (!isAlive(u)) continue;
    // Drop finished orders.
    if (u.orders.some(o => o.status === 'complete' || o.status === 'failed' || o.status === 'cancelled')) {
      u.orders = u.orders.filter(o => o.status === 'queued' || o.status === 'active');
    }
    let guard = 0;
    while (u.orders.length && guard++ < MAX_QUEUE + 2) {
      const o = u.orders[0];
      if (o.status === 'queued') {
        if (!activate(state, ctx, u, o)) {
          logFor(state, ctx, u, `${u.shortName}: ${describe(o)} order failed (${o.note ?? 'cannot execute'})`, 'warn');
          u.orders.shift();
          continue;
        }
        logFor(state, ctx, u, `${u.shortName}: ${describe(o)} order begun`, 'info');
      }
      const { v, note } = evaluate(state, u, o, u.orders.length > 1);
      if (v === 'continue') break;
      o.status = v;
      if (note) o.note = note;
      logFor(state, ctx, u, `${u.shortName}: ${describe(o)} order ${v === 'complete' ? 'complete' : 'failed'}${note ? ` (${note})` : ''}`, v === 'complete' ? 'info' : 'warn');
      u.orders.shift();
      clearMotion(u);
    }
    const head = u.orders[0];
    if (!head) {
      if (u.moveStatus !== 'stationary' && u.moveStatus !== 'retreating' && u.combatStatus !== 'routed') u.moveStatus = 'stationary';
      continue;
    }
    // Fuel exhaustion halts motorised units; keep the order active so it resumes after resupply.
    if (isImmobilised(u) && MOVING_KINDS.has(head.kind)) {
      if (u.moveStatus !== 'stationary' && u.moveStatus !== 'retreating') u.moveStatus = 'stationary';
      u.route = undefined;
      u.routeEtaMinutes = undefined;
      if (head.note !== 'Halted: out of fuel') {
        head.note = 'Halted: out of fuel';
        logFor(state, ctx, u, `${u.shortName} has run out of fuel and is halted`, 'warn');
      }
      continue;
    }
    if (head.note === 'Halted: out of fuel') head.note = undefined;
    // Refresh ETA periodically.
    if (head.target && MOVING_KINDS.has(head.kind) && (u.routeEtaMinutes === undefined || (now - (head.startedAt ?? now)) % ETA_REFRESH_MINUTES === 0)) {
      u.routeEtaMinutes = computeEta(state, ctx, u, head.target).eta;
    }
    void now;
  }
}

/** All sides' units that currently hold an order from operation `opId`. */
export function unitsInOperation(state: GameState, opId: string): Unit[] {
  return Object.values(state.units).filter(u => u.orders.some(o => o.operationId === opId));
}
