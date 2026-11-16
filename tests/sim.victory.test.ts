import { describe, expect, it } from 'vitest';
import type { GameState, Objective } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { createEngine } from '../src/sim/engine';
import { makeWorld, mkUnit } from './simfixture';

const obj = (id: string, tier: Objective['tier'], points: number, condition: Objective['condition']): Objective =>
  ({ id, tier, side: 'allies', title: id, description: id, condition, points, status: 'pending' });

function game(objectives: Objective[]) {
  const w = makeWorld({ flat: Terrain.Plains, units: [mkUnit('F1', 'FRA', 'infantry', [0.5, 51.2]), mkUnit('G1', 'GER', 'infantry', [3.5, 51.2])], objectives });
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed: 1, disableAI: true });
  return { e, st: e.getState() as GameState, total: Math.round((Date.parse(w.scenario.endDate) - Date.parse(w.scenario.startDate)) / 60000) };
}

describe('early campaign endings need a decisive reason', () => {
  const primaries = () => [
    obj('hold', 'primary', 100, { kind: 'hold_location', locationId: 'paris' }),
    obj('take', 'primary', 100, { kind: 'capture_location', locationId: 'aachen' }),
    obj('extra', 'secondary', 600, { kind: 'capture_location', locationId: 'berlin' }),
  ];
  it('one early failure plus one early success does not end a long campaign', () => {
    const { e, st } = game(primaries());
    st.locations['paris'].owner = 'GER';      // hold lost on day 0
    st.locations['aachen'].owner = 'FRA';     // capture achieved
    e.step(10);
    expect(st.objectives.find((o) => o.id === 'hold')!.status).toBe('failed');
    expect(st.objectives.find((o) => o.id === 'take')!.status).toBe('achieved');
    expect(st.result).toBeUndefined();
  });
  it('the same position ends the campaign once half the scenario has been played', () => {
    const { e, st, total } = game(primaries());
    st.locations['paris'].owner = 'GER'; st.locations['aachen'].owner = 'FRA';
    st.clock.minutes = Math.round(0.55 * total);
    e.step(2);
    expect(st.result).toBeDefined();
  });
  it('all primaries achieved with a strategic-or-better score ends early; with a low score it does not', () => {
    const hi = game([obj('a', 'primary', 700, { kind: 'capture_location', locationId: 'aachen' }), obj('b', 'secondary', 100, { kind: 'capture_location', locationId: 'berlin' })]);
    hi.st.locations['aachen'].owner = 'FRA';
    hi.e.step(3);
    expect(hi.st.result?.ending).toMatch(/victory/);
    const lo = game([obj('a', 'primary', 100, { kind: 'capture_location', locationId: 'aachen' }), obj('b', 'secondary', 900, { kind: 'capture_location', locationId: 'berlin' })]);
    lo.st.locations['aachen'].owner = 'FRA';
    lo.e.step(3);
    expect(lo.st.result).toBeUndefined();
  });
  it('every objective resolved ends the campaign (nothing left to play for)', () => {
    const { e, st } = game([obj('a', 'primary', 100, { kind: 'capture_location', locationId: 'aachen' }), obj('b', 'secondary', 100, { kind: 'capture_location', locationId: 'berlin' })]);
    st.locations['aachen'].owner = 'FRA'; st.locations['berlin'].owner = 'FRA';
    e.step(3);
    expect(st.result).toBeDefined();
  });
});

import { loadWorld, mkEngine } from './qa/harness';
describe('real scenarios: no campaign ends before half its duration unless a side is annihilated', () => {
  it.each([['bulge.short', 'USA', 6], ['crusader.short', 'GBR', 6], ['stalingrad.short', 'SOV', 5]] as const)('%s passive %s', (scen, player, seed) => {
    const w = loadWorld(scen);
    const e = mkEngine(w, player as never, seed);
    e.step(2000);
    const s = e.getState() as GameState;
    const total = Math.round((Date.parse(w.def.endDate) - Date.parse(w.def.startDate)) / 60000);
    expect(s.result).toBeDefined();
    const landAlive = Object.values(s.units).some((u) => u.side === s.playerSide && u.domain === 'land' && !u.destroyed && !u.surrendered);
    if (landAlive) expect(s.result!.endedAt).toBeGreaterThanOrEqual(0.5 * total);
    // an end before the end date is only legitimate when every primary objective of the player's side was resolved
    if (s.result!.endedAt < total) expect(s.objectives.filter((o) => o.side === s.playerSide && o.tier === 'primary').every((o) => o.status !== 'pending')).toBe(true);
  }, 600000);
});
