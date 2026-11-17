import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { createEngine } from '../src/sim/engine';
import { interdictionFor } from '../src/sim/airwar';
import { makeWorld, mkUnit } from './simfixture';

function build(extra: Record<string, unknown>, weather: Record<string, number> = { clear: 1 }) {
  const units = [mkUnit('F1', 'FRA', 'infantry', [2, 51.5]), mkUnit('G1', 'GER', 'infantry', [2.3, 51.5], { entrenchment: 40 }), mkUnit('G2', 'GER', 'infantry', [3.5, 52.5])];
  const w = makeWorld({ flat: Terrain.Plains, units, weather });
  Object.assign(w.scenario, extra);
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed: 2, disableAI: true });
  return { e, st: e.getState() as GameState, w };
}

describe('air interdiction and carpet bombing', () => {
  it('slows the other side near the beneficiary front, only inside the window and in flying weather', () => {
    const { st, w } = build({ airSupremacy: [{ side: 'allies', radiusKm: 60, speedMul: 0.5, fromMinutes: 0, toMinutes: 600 }] });
    const ctx = { scenario: w.scenario } as never;
    const f = interdictionFor(st, ctx)!;
    expect(f(st.units['G1'])).toBe(0.5);   // near the Allied units
    expect(f(st.units['G2'])).toBe(1);     // far from them
    expect(f(st.units['F1'])).toBe(1);     // own side is never slowed
    st.weather = { ...st.weather, kind: 'storm' };
    expect(interdictionFor(st, ctx)).toBeUndefined();
    st.weather = { ...st.weather, kind: 'clear' };
    st.clock.minutes = 700;
    expect(interdictionFor(st, ctx)).toBeUndefined();
  });
  it('a scheduled carpet bombing hurts enemy units around the aim point once, deterministically', () => {
    const run = () => {
      const { e, st } = build({ carpetBombings: [{ id: 'cb1', atMinutes: 60, pos: [2.3, 51.5], radiusKm: 10, side: 'allies', casualtyPct: 0.2, orgLoss: 40 }] });
      const before = st.units['G1'].manpower;
      e.step(3);
      return { before, g1: st.units['G1'], g2: st.units['G2'], f1: st.units['F1'] };
    };
    const a = run(), b = run();
    expect(a.g1.manpower).toBeLessThan(a.before * 0.9);
    expect(a.g1.organisation).toBeLessThan(80);
    expect(a.g1.entrenchment).toBeLessThan(40);
    expect(a.g2.manpower).toBe(a.g2.manpowerMax);
    expect(a.f1.manpower).toBe(a.f1.manpowerMax);
    expect(b.g1.manpower).toBe(a.g1.manpower);
  });
  it('a carpet bombing waits for flying weather', () => {
    const { e, st } = build({ carpetBombings: [{ id: 'cb1', atMinutes: 60, pos: [2.3, 51.5], radiusKm: 10, side: 'allies' }] }, { storm: 1 });
    st.weather = { kind: 'storm', intensity: 1, temperatureC: 10, nextChangeMinutes: 1e9 };
    e.step(5);
    expect(st.units['G1'].manpower).toBe(st.units['G1'].manpowerMax);
  });
});

describe('forced storm', () => {
  it('an event that sets storm weather with a change time holds it for its duration', () => {
    const { e, st } = build({});
    st.weather = { kind: 'storm', intensity: 1, temperatureC: 8, nextChangeMinutes: st.clock.minutes + 12 * 60 };
    e.step(10);
    expect(st.weather.kind).toBe('storm');
  });
});
