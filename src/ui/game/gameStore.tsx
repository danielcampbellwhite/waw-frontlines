import type { Command, CommandResult, Engine, LonLat, Location, Operation, Order, OrderKind, ScenarioDefinition, SideId, Unit, UnitId } from '../../core/types';
import { haversineKm } from '../../core/geo';
import { createStore, type Store } from '../store';
import type { FocusRequest, MapOverlays, MapView } from '../mapAdapter';
import type { SaveApi } from '../saveApi';
import { orderMeta, fmtPos } from '../format';
import { audio, cueForCommand } from '../../audio';

export type BottomTab = 'notifications' | 'events' | 'reports' | 'history';
export type ModalId = null | 'objectives' | 'ops' | 'help' | 'save' | 'settings' | 'menu';
export interface Toast { id: number; text: string; severity: 'info' | 'warn' | 'critical' | 'ok'; pos?: LonLat }
export interface Targeting { kind: OrderKind; unitIds: UnitId[]; points: LonLat[]; forPhase?: number }
export type OobStatusFilter = 'all' | 'moving' | 'combat' | 'low_supply' | 'low_org';
export interface PhaseDraft { name: string; unitIds: UnitId[]; kind: OrderKind; target?: LonLat; line?: LonLat[]; targetUnit?: UnitId; startAfterMinutes: number; priority: number }
export interface OpsDraft { name: string; delayMinutes: number; phases: PhaseDraft[] }

export interface GameUi {
  selection: UnitId[];
  leftOpen: boolean; rightOpen: boolean; bottomOpen: boolean;
  bottomTab: BottomTab; selectedReport?: string;
  targeting: Targeting | null;
  ctxMenu: { x: number; y: number; pos: LonLat } | null;
  modal: ModalId; saveMode: 'save' | 'load';
  toasts: Toast[];
  focus?: FocusRequest;
  view: MapView | null;
  overlays: MapOverlays;
  query: string; typeFilter: 'all' | 'land' | 'air' | 'sea'; statusFilter: OobStatusFilter;
  orderMode: 'replace' | 'append'; priority: number;
  draft: OpsDraft;
  notifSeen: number;           // notification count seen
  lastSpeed: 1 | 2 | 4 | 8;
  pausedByEvent?: boolean;
}

export const emptyDraft = (): OpsDraft => ({ name: 'Operation ', delayMinutes: 0, phases: [] });

export function createGameStore(): Store<GameUi> {
  return createStore<GameUi>({
    selection: [], leftOpen: true, rightOpen: true, bottomOpen: true, bottomTab: 'notifications',
    targeting: null, ctxMenu: null, modal: null, saveMode: 'save', toasts: [], view: null,
    overlays: { routes: true, supply: false, battles: true, fog: true },
    query: '', typeFilter: 'all', statusFilter: 'all', orderMode: 'replace', priority: 1,
    draft: emptyDraft(), notifSeen: 0, lastSpeed: 1,
  });
}

export interface GameActions {
  select(ids: UnitId[], additive?: boolean): void;
  startOrder(kind: OrderKind): void;
  cancelTargeting(): void;
  finishLine(): void;
  mapClick(pos: LonLat, button?: number): void;
  mapSelect(ids: UnitId[], additive: boolean): void;
  contextAt(pos: LonLat): void;
  issue(unitIds: UnitId[], order: Omit<Order, 'id' | 'issuedAt' | 'status' | 'priority'> & { priority?: number }, mode?: 'replace' | 'append'): CommandResult;
  cancelOrders(unitIds: UnitId[], orderId?: string): void;
  setPosture(unitIds: UnitId[], posture: Unit['posture']): void;
  rename(unitId: UnitId, name: string): void;
  focusOn(pos: LonLat, zoom?: number): void;
  toast(text: string, severity?: Toast['severity'], pos?: LonLat): void;
  dismissToast(id: number): void;
  togglePause(): void;
  setSpeed(s: 0 | 1 | 2 | 4 | 8): void;
  resolveEvent(eventId: string, choiceId: string): void;
  createOperation(): CommandResult | null;
  cancelOperation(id: string): void;
  ownUnits(): Unit[];
  dispatch(cmd: Command): CommandResult;
}

export interface GameCtx { engine: Engine; scenario: ScenarioDefinition; store: Store<GameUi>; actions: GameActions; saveApi?: SaveApi; onExit?: () => void }
// The context object lives in its own tiny module so hot-reloading this file can never create a second context identity.
export { GameContext, useGame } from './gameContext';

let toastId = 1;
const NEAREST_LOC_KM = 30;

export function createActions(engine: Engine, scenario: ScenarioDefinition, store: Store<GameUi>): GameActions {
  const state = () => engine.getState();
  const side = (): SideId => state().playerSide;
  const ownUnits = () => Object.values(state().units).filter(u => u.side === side() && !u.destroyed && !u.surrendered);
  const isOwn = (id: UnitId) => { const u = state().units[id]; return !!u && u.side === side(); };
  const toast: GameActions['toast'] = (text, severity = 'info', pos) => {
    const id = toastId++;
    store.set(s => ({ toasts: [...s.toasts.slice(-4), { id, text, severity, pos }] }));
    setTimeout(() => store.set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), severity === 'critical' ? 9000 : 6000);
  };
  const dispatch = (cmd: Command): CommandResult => {
    const r = engine.dispatch(cmd, side());
    if (!r.ok) toast(r.error ? `Order rejected: ${r.error}` : 'Order rejected', 'warn');
    const cue = cueForCommand(cmd, r); if (cue) audio.cue(cue);
    return r;
  };
  const nearestLocation = (pos: LonLat): Location | undefined => {
    let best: Location | undefined, bd = NEAREST_LOC_KM;
    for (const l of Object.values(state().locations)) { const d = haversineKm(l.pos, pos); if (d < bd) { bd = d; best = l; } }
    return best;
  };

  const a: GameActions = {
    ownUnits, dispatch, toast,
    dismissToast: id => store.set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
    select(ids, additive) {
      store.set(s => ({ selection: additive ? Array.from(new Set([...s.selection, ...ids])) : ids, ctxMenu: null }));
      if (ids.length) audio.cue('select');
    },
    issue(unitIds, order, mode) {
      const ids = unitIds.filter(isOwn);
      if (!ids.length) { toast('Select one of your own units first.', 'warn'); return { ok: false, error: 'no own units' }; }
      const st = store.get();
      const r = dispatch({ type: 'issue_order', unitIds: ids, order: { priority: st.priority, ...order }, mode: mode ?? st.orderMode });
      return r;
    },
    startOrder(kind) {
      const sel = store.get().selection.filter(isOwn);
      if (!sel.length) { toast('Select one of your own units first.', 'warn'); return; }
      const meta = orderMeta(kind);
      if (meta.need === 'none') { a.issue(sel, { kind }); return; }
      store.set({ targeting: { kind, unitIds: sel, points: [] }, ctxMenu: null });
      audio.sfx('click');
    },
    cancelTargeting() { store.set({ targeting: null }); },
    finishLine() {
      const t = store.get().targeting; if (!t || t.kind !== 'defensive_line') return;
      if (t.points.length < 2) { toast('A defensive line needs at least two points.', 'warn'); return; }
      if (t.forPhase !== undefined) {
        store.set(s => ({ draft: { ...s.draft, phases: s.draft.phases.map((p, i) => i === t.forPhase ? { ...p, line: t.points } : p) }, targeting: null }));
      } else { a.issue(t.unitIds, { kind: 'defensive_line', line: t.points, target: t.points[0] }); store.set({ targeting: null }); }
    },
    mapClick(pos, button) {
      if (button === 2) return; // right-click: the map follows up with onContextOrder
      const st = store.get(); const t = st.targeting;
      if (t && (orderMeta(t.kind).need === 'unit' || t.kind === 'attack')) {
        // the map reports every click as a point while targeting; resolve a unit near the click
        const v = st.view; const tol = v ? (v.bounds[2] - v.bounds[0]) * 0.02 : 0.05;
        let best: Unit | undefined, bd = tol;
        for (const u of Object.values(state().units)) { if (u.destroyed) continue; const d = Math.hypot(u.pos[0] - pos[0], (u.pos[1] - pos[1]) * 1.5); if (d < bd) { bd = d; best = u; } }
        if (best) { a.mapSelect([best.id], false); return; }
      }
      if (!t) { store.set({ selection: [], ctxMenu: null }); return; }
      const meta = orderMeta(t.kind);
      const phase = t.forPhase;
      const setPhase = (patch: Partial<PhaseDraft>) => store.set(s => ({ draft: { ...s.draft, phases: s.draft.phases.map((p, i) => i === phase ? { ...p, ...patch } : p) }, targeting: null }));
      if (meta.need === 'line') { store.set({ targeting: { ...t, points: [...t.points, pos] } }); return; }
      if (meta.need === 'location') {
        const l = nearestLocation(pos);
        if (!l) { toast(`No town, port or depot within ${NEAREST_LOC_KM} km of that point.`, 'warn'); return; }
        if (phase !== undefined) { setPhase({ target: l.pos }); return; }
        a.issue(t.unitIds, { kind: t.kind, targetLocation: l.id, target: l.pos, note: l.name }); store.set({ targeting: null }); return;
      }
      if (meta.need === 'unit') { toast('Click a friendly unit on the map to pick the target.', 'info'); return; }
      if (phase !== undefined) { setPhase({ target: pos }); return; }
      a.issue(t.unitIds, { kind: t.kind, target: pos });
      store.set({ targeting: null });
    },
    mapSelect(ids, additive) {
      const st = store.get(); const t = st.targeting; const units = state().units;
      if (t) {
        const meta = orderMeta(t.kind); const target = units[ids[0]];
        if (target && (meta.need === 'unit' || t.kind === 'attack')) {
          if (t.forPhase !== undefined) {
            store.set(s => ({ draft: { ...s.draft, phases: s.draft.phases.map((p, i) => i === t.forPhase ? { ...p, targetUnit: target.id, target: target.pos } : p) }, targeting: null }));
            return;
          }
          if (t.unitIds.includes(target.id)) { toast('A unit cannot target itself.', 'warn'); return; }
          a.issue(t.unitIds, { kind: t.kind, targetUnit: target.id, target: target.pos }); store.set({ targeting: null }); return;
        }
        if (target) { a.mapClick(target.pos); return; }
      }
      a.select(ids, additive);
    },
    contextAt(pos) {
      const cur = lastPointer;
      store.set({ ctxMenu: { x: cur.x, y: cur.y, pos } });
    },
    cancelOrders(unitIds, orderId) {
      const ids = unitIds.filter(isOwn); if (!ids.length) return;
      const r = dispatch({ type: 'cancel_orders', unitIds: ids, orderId });
      if (r.ok) toast(orderId ? 'Order cancelled.' : `Orders cancelled for ${ids.length} unit${ids.length > 1 ? 's' : ''}.`, 'info');
    },
    setPosture(unitIds, posture) { const ids = unitIds.filter(isOwn); if (ids.length) dispatch({ type: 'set_posture', unitIds: ids, posture }); },
    rename(unitId, name) { const n = name.trim(); if (n && isOwn(unitId)) dispatch({ type: 'rename', unitId, name: n }); },
    focusOn(pos, zoom) { store.set(s => ({ focus: { pos, zoom, nonce: (s.focus?.nonce ?? 0) + 1 } })); },
    togglePause() {
      const c = state().clock;
      if (c.speed === 0) { engine.setSpeed(store.get().lastSpeed); audio.cue('resume'); }
      else { store.set({ lastSpeed: c.speed as 1 | 2 | 4 | 8 }); engine.setSpeed(0); audio.cue('pause'); }
    },
    setSpeed(s) { if (s) store.set({ lastSpeed: s as 1 | 2 | 4 | 8 }); engine.setSpeed(s); audio.cue(s === 0 ? 'pause' : 'speed'); },
    resolveEvent(eventId, choiceId) {
      const r = dispatch({ type: 'resolve_event', eventId, choiceId });
      if (r.ok) { if (store.get().pausedByEvent) { engine.setSpeed(store.get().lastSpeed); store.set({ pausedByEvent: false }); } }
    },
    createOperation() {
      const d = store.get().draft; const st = state();
      if (!d.name.trim()) { toast('Name the operation first.', 'warn'); return null; }
      if (!d.phases.length) { toast('Add at least one phase.', 'warn'); return null; }
      for (const [i, p] of d.phases.entries()) {
        const need = orderMeta(p.kind).need;
        if (!p.unitIds.length) { toast(`Phase ${i + 1} has no units assigned.`, 'warn'); return null; }
        if ((need === 'point' || need === 'location' || need === 'unit') && !p.target) { toast(`Phase ${i + 1} needs a target on the map.`, 'warn'); return null; }
        if (need === 'line' && (!p.line || p.line.length < 2)) { toast(`Phase ${i + 1} needs a line of at least two points.`, 'warn'); return null; }
      }
      const operation: Omit<Operation, 'id' | 'status'> = {
        name: d.name.trim(), side: st.playerSide, nation: st.playerNation, startMinutes: st.clock.minutes + d.delayMinutes,
        phases: d.phases.map(p => ({
          name: p.name, unitIds: p.unitIds, startAfterMinutes: p.startAfterMinutes,
          order: { kind: p.kind, priority: p.priority, target: p.target, targetUnit: p.targetUnit, line: p.line, note: p.target ? fmtPos(p.target) : undefined },
        })),
      };
      const r = dispatch({ type: 'create_operation', operation });
      if (r.ok) { toast(`Operation "${operation.name}" created.`, 'ok'); store.set({ draft: emptyDraft() }); }
      return r;
    },
    cancelOperation(id) { dispatch({ type: 'cancel_operation', operationId: id }); },
  };
  void scenario;
  return a;
}

/** Latest pointer position (for placing the context menu where the right-click happened). */
export const lastPointer = { x: 200, y: 200 };
if (typeof window !== 'undefined') window.addEventListener('pointermove', e => { lastPointer.x = e.clientX; lastPointer.y = e.clientY; }, { passive: true });
if (typeof window !== 'undefined') window.addEventListener('pointerdown', e => { lastPointer.x = e.clientX; lastPointer.y = e.clientY; }, { passive: true, capture: true });
