// @vitest-environment jsdom
import { createElement as h } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command } from '../src/core/types';
import { createMockEngine } from '../src/ui/dev/mockEngine';
import { GameContext, createActions, createGameStore, type GameCtx } from '../src/ui/game/gameStore';
import { OrderControls } from '../src/ui/game/RightPanel';
import { LeftPanel } from '../src/ui/game/LeftPanel';
import { EventModal } from '../src/ui/game/Overlays';
import { TopBar } from '../src/ui/game/TopBar';
import { useEngineState } from '../src/ui/hooks/useEngineState';

function setup() {
  const { engine, scenario } = createMockEngine('GER');
  const store = createGameStore();
  const actions = createActions(engine, scenario, store);
  const calls: Command[] = [];
  const orig = engine.dispatch.bind(engine);
  engine.dispatch = (cmd, as) => { calls.push(cmd); return orig(cmd, as); };
  const ctx: GameCtx = { engine, scenario, store, actions };
  const wrap = (el: React.ReactElement) => h(GameContext.Provider, { value: ctx }, el);
  return { engine, scenario, store, actions, calls, wrap };
}

beforeEach(() => { vi.useRealTimers(); });
afterEach(cleanup);

describe('UI -> engine.dispatch wiring', () => {
  it('order button + map click dispatches issue_order with target', () => {
    const t = setup();
    t.actions.select(['g-2']);
    render(t.wrap(h(OrderControls, { unitIds: ['g-2'] })));
    fireEvent.click(screen.getByRole('button', { name: /^Move/ }));
    expect(t.store.get().targeting?.kind).toBe('move');
    act(() => t.actions.mapClick([5.5, 50.2]));
    const c = t.calls.find(x => x.type === 'issue_order')!;
    expect(c).toMatchObject({ type: 'issue_order', unitIds: ['g-2'], mode: 'replace', order: { kind: 'move', target: [5.5, 50.2] } });
    expect(t.store.get().targeting).toBeNull();
  });
  it('immediate orders (hold) dispatch without targeting, queue mode appends', () => {
    const t = setup(); t.actions.select(['g-2']); t.store.set({ orderMode: 'append' });
    render(t.wrap(h(OrderControls, { unitIds: ['g-2'] })));
    fireEvent.click(screen.getByRole('button', { name: /^HoldH$/ }));
    expect(t.calls[0]).toMatchObject({ type: 'issue_order', mode: 'append', order: { kind: 'hold' } });
  });
  it('refuses to order enemy units', () => {
    const t = setup(); t.actions.select(['f-1']); t.actions.startOrder('move');
    expect(t.store.get().targeting).toBeNull(); expect(t.calls).toHaveLength(0);
  });
  it('posture buttons dispatch set_posture', () => {
    const t = setup(); render(t.wrap(h(OrderControls, { unitIds: ['g-2', 'g-3'] })));
    fireEvent.click(screen.getByRole('button', { name: 'Entrench' }));
    expect(t.calls.at(-1)).toMatchObject({ type: 'set_posture', unitIds: ['g-2', 'g-3'], posture: 'entrench' });
  });
  it('cancel_orders and attack-on-unit targeting', () => {
    const t = setup(); t.actions.select(['g-1']); t.actions.startOrder('attack');
    act(() => t.actions.mapSelect(['f-1'], false));
    expect(t.calls.at(-1)).toMatchObject({ type: 'issue_order', order: { kind: 'attack', targetUnit: 'f-1' } });
    t.actions.cancelOrders(['g-1']);
    expect(t.calls.at(-1)).toMatchObject({ type: 'cancel_orders', unitIds: ['g-1'] });
  });
  it('event modal shows choices and dispatches resolve_event', () => {
    const t = setup(); t.engine.step(3);
    render(t.wrap(h(EventModal)));
    expect(screen.getByText('Request for air support')).toBeTruthy();
    fireEvent.click(screen.getByText('Commit the Stukas'));
    expect(t.calls.at(-1)).toEqual({ type: 'resolve_event', eventId: 'ev1', choiceId: 'accept' });
  });
  it('operations planner flow creates an operation via create_operation', () => {
    const t = setup();
    t.store.set({ draft: { name: 'Sichelschnitt', delayMinutes: 0, phases: [{ name: 'Phase 1', unitIds: ['g-1'], kind: 'move', target: [5, 50], startAfterMinutes: 0, priority: 1 }] } });
    const r = t.actions.createOperation();
    expect(r?.ok).toBe(true); expect(t.calls.at(-1)).toMatchObject({ type: 'create_operation', operation: { name: 'Sichelschnitt', side: 'axis' } });
  });
  it('rejects an incomplete operation draft without dispatching', () => {
    const t = setup(); t.store.set({ draft: { name: 'x', delayMinutes: 0, phases: [{ name: 'P', unitIds: [], kind: 'move', startAfterMinutes: 0, priority: 1 }] } });
    expect(t.actions.createOperation()).toBeNull(); expect(t.calls).toHaveLength(0);
  });
});

describe('panels render engine data', () => {
  it('order of battle lists own units as a tree and selects on click', () => {
    const t = setup(); render(t.wrap(h(LeftPanel)));
    expect(screen.getByText('HGr A')).toBeTruthy(); expect(screen.getByText('1.PzD')).toBeTruthy(); expect(screen.queryByText('102e DI')).toBeNull();
    fireEvent.click(screen.getByText('1.PzD'));
    expect(t.store.get().selection).toEqual(['g-1']);
  });
  it('speed buttons call setSpeed', () => {
    const t = setup(); const spy = vi.spyOn(t.engine, 'setSpeed');
    render(t.wrap(h(TopBar)));
    fireEvent.click(screen.getByRole('button', { name: 'Speed 4' }));
    expect(spy).toHaveBeenCalledWith(4);
  });
});

describe('useEngineState', () => {
  it('throttles to ~10 Hz and skips renders when the selection is unchanged', async () => {
    const t = setup(); let renders = 0;
    function C() { const m = useEngineState(t.engine, s => s.clock.minutes, Object.is); renders++; return h('span', { 'data-testid': 'm' }, m); }
    render(h(C)); const base = renders;
    await act(async () => { for (let i = 0; i < 50; i++) t.engine.setSpeed(0); await new Promise(r => setTimeout(r, 250)); });
    expect(renders - base).toBe(0);                      // minutes never changed
    await act(async () => { for (let i = 0; i < 40; i++) { t.engine.step(1); } await new Promise(r => setTimeout(r, 250)); });
    expect(renders - base).toBeLessThanOrEqual(2);       // 40 notifications collapsed
    expect(screen.getByTestId('m').textContent).toBe(String(t.engine.getState().clock.minutes));
  });
});
