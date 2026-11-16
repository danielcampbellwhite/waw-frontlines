import { describe, expect, it } from 'vitest';
import { haversineKm } from '../src/core/geo';
import { updateUnitStats } from '../src/military';
import { makeCtx, makeState, makeUnit } from '../src/military/testing';
import { loadWorld, mkEngine } from './qa/harness';

/** Regression: armour that keeps moving used to never refuel (refuel needed moveStatus 'stationary'), so it ran dry
 *  far from the start while the nation's fuel pool grew unused. */
describe('refuel while advancing', () => {
  it('a supplied armoured group advancing >100 km on the Standard scenario keeps its fuel', () => {
    const w = loadWorld();
    const e = mkEngine(w, 'GER', 5, { disableAI: true });
    const s0 = e.getState();
    const ids = Object.values(s0.units).filter(u => u.nation === 'GER' && (u.type === 'armoured' || u.type === 'mechanised')).map(u => u.id);
    const start = Object.fromEntries(ids.map(id => [id, [...s0.units[id].pos] as [number, number]]));
    expect(e.dispatch({ type: 'issue_order', unitIds: ids, order: { kind: 'move', priority: 1, target: [2.3, 49.5] }, mode: 'replace' }, 'axis').ok).toBe(true);
    let minFuel = 100;
    for (let t = 0; t < 72; t++) {
      e.step(1);
      for (const id of ids) minFuel = Math.min(minFuel, e.getState().units[id].fuel);
    }
    const s = e.getState();
    const us = ids.map(id => s.units[id]);
    const km = us.map(u => haversineKm(start[u.id], u.pos));
    expect(km.reduce((a, b) => a + b, 0) / km.length).toBeGreaterThan(60);   // actually advanced
    expect(Math.max(...km)).toBeGreaterThan(100);
    expect(minFuel).toBeGreaterThan(30);                                      // never starved (was ~11 before the fix)
    expect(us.filter(u => u.fuel <= 0)).toHaveLength(0);
    expect(s.nations.GER.resources.fuel).toBeGreaterThan(0);
  }, 300000);

  it('moving refuel is slower than halted refuel, and absent when cut off', () => {
    const mk = (id: string, moving: boolean) => makeUnit('armoured', id, 'FRA', [3, 50], { fuel: 50, moveStatus: moving ? 'moving' : 'stationary' });
    const s = makeState({ units: [mk('m', true), mk('h', false), makeUnit('armoured', 'c', 'FRA', [3, 50.1], { fuel: 50, moveStatus: 'moving' })] });
    s.supply.cutOffUnits = ['c'];
    updateUnitStats(s, makeCtx(({ supplySources: {} }) as never));
    const gainM = s.units.m.fuel - (50 - 3.5), gainH = s.units.h.fuel - 50;
    expect(gainM).toBeGreaterThan(0);
    expect(gainH).toBeGreaterThan(gainM);
    expect(s.units.c.fuel).toBeCloseTo(50 - 3.5);
  });
});
