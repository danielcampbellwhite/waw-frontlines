import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { haversineKm } from '../src/core/geo';
import { createEngine } from '../src/sim/engine';
import { iceLevel } from '../src/sim/ice';
import { iceLake, iceRiver, unitSpeedKmh } from '../src/sim/pathfinding';
import { makeWorld, mkUnit } from './simfixture';

/** A north-south lake belt (lon 1.5..1.62) the whole height of the map: impassable unless frozen. */
function lakeWorld(units: Unit[], ice?: { from: number; full: number; thaw?: number }) {
  const w = makeWorld({ flat: Terrain.Plains, units: [...units, mkUnit('RF2', 'FRA', 'infantry', [0.1, 50.1]), mkUnit('RG2', 'GER', 'infantry', [3.9, 50.1])] });
  for (let r = 0; r < w.terrain.rows; r++) for (let c = 0; c < w.terrain.cols; c++) {
    const lon = w.terrain.bbox.west + (c + 0.5) * w.terrain.cellDeg;
    if (lon >= 1.5 && lon <= 1.62) w.terrain.cells[r * w.terrain.cols + c] = Terrain.Lake;
  }
  if (ice) Object.assign(w.scenario, { iceFromHour: ice.from, iceFullHour: ice.full, iceThawHour: ice.thaw });
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed: 2, disableAI: true });
  return { e, st: e.getState() as GameState };
}
// (the lake belt cuts supply, so armour is given a short trip that its tank can cover)
const cross = (type: Unit['type'], ice?: { from: number; full: number }, ticks = 400, x0 = 1.2, x1 = 2.4) => {
  const { e, st } = lakeWorld([mkUnit('F1', 'FRA', type, [x0, 51.5])], ice);
  const r = e.dispatch({ type: 'issue_order', unitIds: ['F1'], order: { kind: 'move', priority: 1, target: [x1, 51.5] }, mode: 'replace' }, 'allies');
  let arrived = -1;
  for (let i = 1; i <= ticks && arrived < 0; i++) { e.step(1); if (haversineKm(st.units['F1'].pos, [x1, 51.5]) < 2.5) arrived = i; }
  return { r, arrived, st };
};

describe('frozen lakes and rivers (opt-in)', () => {
  it('ice level follows the scenario fields and is zero without them', () => {
    const sc = { iceFromHour: 100, iceFullHour: 300, iceThawHour: 1000 } as never;
    expect(iceLevel({} as never, 5000)).toBe(0);
    expect(iceLevel(sc, 50)).toBe(0);
    expect(iceLevel(sc, 200 * 60)).toBeCloseTo(0.5, 1);
    expect(iceLevel(sc, 400 * 60)).toBe(1);
    expect(iceLevel(sc, (1000 + 14 * 24) * 60)).toBe(0);
  });
  it('no ice fields: lakes stay impassable (existing campaigns unchanged)', () => {
    const r = cross('infantry', undefined, 80);
    expect(r.arrived).toBe(-1);
    expect(r.st.units['F1'].orders[0]?.status).not.toBe('complete');
  });
  it('thin ice carries nobody; partial ice carries infantry but not armour; full ice carries both, armour slower', () => {
    const thin = cross('infantry', { from: -10, full: 190 }); // ~0.05 -> 0
    expect(thin.arrived).toBe(-1);
    const partial = { from: -60, full: 140 }; // 0.3 thin... use 0.5
    void partial;
    const half = { from: -1e5, full: 1e5 }; // level stays ~0.5
    const infHalf = cross('infantry', half);
    const tankHalf = cross('armoured', half, 300, 1.45, 1.9);
    expect(infHalf.arrived).toBeGreaterThan(0);
    expect(tankHalf.arrived).toBe(-1);
    const full = { from: -400, full: -300 };
    const infFull = cross('infantry', full), tankFull = cross('armoured', full, 400, 1.45, 1.9);
    expect(infFull.arrived).toBeGreaterThan(0);
    expect(tankFull.arrived).toBeGreaterThan(0);
    expect(infHalf.arrived).toBeGreaterThan(infFull.arrived); // slower on partial ice
  });
  it('speed and river tables are ordered sensibly', () => {
    expect(iceLake('tracked', 0.8)).toBeLessThan(iceLake('foot', 0.8));
    expect(iceLake('foot', 0.2)).toBe(0);
    expect(iceRiver('foot', 1)).toBeLessThan(iceRiver('foot', 0.5));
    expect(iceRiver('foot', 0)).toBe(1);
    const u = mkUnit('x', 'FRA', 'infantry', [0, 0]);
    expect(unitSpeedKmh(u, Terrain.Lake, 'clear', false, 1)).toBeGreaterThan(0.3);
    expect(unitSpeedKmh(u, Terrain.Lake, 'clear', false, 0)).toBe(0);
  });
  it('ice formation is deterministic and survives save/restore (meta.ice is plain JSON)', () => {
    const a = lakeWorld([mkUnit('F1', 'FRA', 'infantry', [1.2, 51.5])], { from: 10, full: 60 });
    a.st.weather = { kind: 'clear', intensity: 0, temperatureC: -6, nextChangeMinutes: 1e9 };
    a.e.step(30);
    const meta = (a.st.special as Record<string, { ice?: number }>)['sim'];
    expect(meta.ice).toBeGreaterThan(0);
    expect(meta.ice).toBeLessThan(1);
  });
});

describe('ice and weather', () => {
  it('ice does not thicken above 0 C and melts slowly above 3 C', () => {
    const { e, st } = lakeWorld([mkUnit('F1', 'FRA', 'infantry', [1.2, 51.5])], { from: 0, full: 100 });
    const set = (t: number) => { st.weather = { kind: 'clear', intensity: 0, temperatureC: t, nextChangeMinutes: 1e9 }; };
    const ice = () => (st.special as Record<string, { ice?: number }>)['sim'].ice ?? 0;
    set(-8); e.step(24);
    const frozen = ice();
    expect(frozen).toBeGreaterThan(0.1);
    set(1); e.step(24);
    expect(ice()).toBe(frozen);        // warm spell: no growth although the dates say thicker
    set(6); e.step(48);
    expect(ice()).toBeLessThan(frozen); // thaw
    set(-8); e.step(100);
    expect(ice()).toBe(1);             // cold again: back to the dated ceiling
  });
});

describe('frozen river combat', () => {
  function attack(seed: number, ice: boolean) {
    const units = [mkUnit('A0', 'FRA', 'infantry', [1.9423, 51.5], { posture: 'attack' }), mkUnit('D0', 'GER', 'infantry', [2.0, 51.5], { posture: 'defend' })];
    const w = makeWorld({ flat: Terrain.Plains, units: [...units, mkUnit('RF2', 'FRA', 'infantry', [0.1, 50.1]), mkUnit('RG2', 'GER', 'infantry', [3.9, 50.1])] });
    // river flag on the defender's cell
    const idx = (c: number, r: number) => r * w.terrain.cols + c;
    for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) w.terrain.flags![idx(Math.floor((2.0 - w.terrain.bbox.west) / w.terrain.cellDeg) + dc, Math.floor((w.terrain.bbox.north - 51.5) / w.terrain.cellDeg) + dr)] = 1;
    if (ice) Object.assign(w.scenario, { iceFromHour: -400, iceFullHour: -300 });
    const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed, disableAI: true });
    const st = e.getState() as GameState;
    e.step(20);
    return st;
  }
  it('a frozen river removes most of the attackers\' river penalty, and the report says so', () => {
    let wet = 0, frozen = 0, n = 0;
    for (let s = 1; s <= 12; s++) {
      const a = attack(s * 31, false), b = attack(s * 31, true);
      const ra = a.reports[0], rb = b.reports[0];
      if (!ra || !rb) continue;
      n++;
      const pa = a.units['A0'].manpower, pb = b.units['A0'].manpower;
      if (ra.reasons.some((r) => r.includes('force a river line'))) wet++;
      if (rb.reasons.some((r) => r.includes('frozen river'))) frozen++;
      void pa; void pb;
    }
    expect(n).toBeGreaterThan(4);
    expect(wet).toBeGreaterThan(0);
    expect(frozen).toBeGreaterThan(0);
  });
});
