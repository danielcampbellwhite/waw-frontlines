import { describe, expect, it } from 'vitest';
import type { GameState, Objective, Unit } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { createEngine } from '../src/sim/engine';
import { registerSpecialModule } from '../src/sim/special';
import { visibleTo } from '../src/sim/fog';
import { makeWorld, mkUnit } from './simfixture';

type World = ReturnType<typeof makeWorld>;
function boot(w: World, seed = 1, ai = false) {
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed, disableAI: !ai });
  return { e, st: e.getState() as GameState };
}
const owned = (st: GameState, nation: string) => { const i = st.control.nations.indexOf(nation as never); return st.control.owner.filter((o) => o === i).length; };
const order = (e: ReturnType<typeof boot>['e'], id: string, kind: 'move' | 'capture' | 'attack', extra: { target?: [number, number]; targetLocation?: string }) =>
  e.dispatch({ type: 'issue_order', unitIds: [id], order: { kind, priority: 1, ...extra }, mode: 'replace' }, id.startsWith('G') ? 'axis' : 'allies');

describe('territory', () => {
  it('control shifts behind an unopposed advance, and locations are captured by occupation', () => {
    const obj: Objective = {
      id: 'o1', tier: 'primary', side: 'allies', title: 'Take Aachen', description: '', points: 60, status: 'pending',
      condition: { kind: 'capture_location', locationId: 'aachen' },
    };
    const w = makeWorld({ flat: Terrain.Plains, objectives: [obj], units: [
      mkUnit('F1', 'FRA', 'infantry', [1.9, 51.5]), mkUnit('F2', 'FRA', 'infantry', [1.9, 51.45]),
    ] });
    const { e, st } = boot(w);
    const ger0 = owned(st, 'GER'), fra0 = owned(st, 'FRA');
    expect(st.locations['aachen'].owner).toBe('GER');
    order(e, 'F1', 'capture', { targetLocation: 'aachen' });
    order(e, 'F2', 'move', { target: [2.5, 51.45] });
    e.step(150);
    expect(st.locations['aachen'].owner).toBe('FRA');
    expect(st.objectives[0].status).toBe('achieved');
    expect(owned(st, 'GER')).toBeLessThan(ger0 - 20);
    expect(owned(st, 'FRA')).toBeGreaterThan(fra0 + 20);
    expect(st.history.some((h) => /captured Aachen/.test(h.text))).toBe(true);
    // the cell under the armoured unit now belongs to France
    const spec = w.terrain;
    const col = Math.floor((st.units['F1'].pos[0] - spec.bbox.west) / spec.cellDeg), row = Math.floor((spec.bbox.north - st.units['F1'].pos[1]) / spec.cellDeg);
    expect(st.control.nations[st.control.owner[row * st.control.cols + col]]).toBe('FRA');
  });

  it('territory does not flip without units, and contested cells appear where forces face each other', () => {
    const w = makeWorld({ flat: Terrain.Plains, units: [
      mkUnit('F1', 'FRA', 'infantry', [1.93, 51.5]), mkUnit('G1', 'GER', 'infantry', [2.07, 51.5]),
    ] });
    const { e, st } = boot(w);
    const before = st.control.owner.slice();
    e.step(3);
    expect(st.control.contested.some((c) => c > 0)).toBe(true);
    expect(st.control.owner.filter((o, i) => o !== before[i]).length).toBeLessThan(6);
    e.step(40);
    // far-away cells never change
    expect(st.control.owner[0]).toBe(before[0]);
  });

  it('a unit pushed far beyond its lines is flagged cut off; at home it is not; surrounded => encircled', () => {
    const w = makeWorld({ flat: Terrain.Plains, units: [
      mkUnit('F1', 'FRA', 'infantry', [3.2, 51.0]), mkUnit('F2', 'FRA', 'infantry', [0.8, 51.0]),
    ] });
    const { e, st } = boot(w);
    e.step(3);
    expect(st.supply.cutOffUnits).toContain('F1');
    expect(st.supply.cutOffUnits).not.toContain('F2');
    expect(st.units['F1'].encircled).toBeFalsy();
  });
});

describe('fog of war', () => {
  it('own units always visible; enemies only inside detection range (recon sees further); memory kept', () => {
    const w = makeWorld({ flat: Terrain.Plains, fog: true, units: [
      mkUnit('F1', 'FRA', 'infantry', [1.0, 51.5], { posture: 'defend' }),
      mkUnit('G1', 'GER', 'infantry', [1.25, 51.5], { posture: 'defend' }),   // ~17 km: beyond infantry range
      mkUnit('G2', 'GER', 'infantry', [1.05, 51.5], { posture: 'defend' }),   // ~3.5 km: seen
    ] });
    const { e, st } = boot(w);
    e.step(1);
    const seen = e.visibleUnits('allies').map((u) => u.id).sort();
    expect(seen).toContain('F1'); expect(seen).toContain('G2'); expect(seen).not.toContain('G1');
    expect(e.visibleUnits('axis').map((u) => u.id)).toContain('F1');
    expect(visibleTo(st, 'allies').map((u) => u.id).sort()).toEqual(seen);
    expect(st.units['G2'].lastSeenBy?.allies?.minutes).toBe(60);
    // a recon unit extends the picture
    st.units['R1'] = mkUnit('R1', 'FRA', 'recon', [1.0, 51.55]);
    e.step(1);
    expect(e.visibleUnits('allies').map((u) => u.id)).toContain('G1');
    // bad weather shrinks it again
    st.weather = { kind: 'fog', intensity: 1, temperatureC: 8, nextChangeMinutes: 1e9 };
    e.step(1);
    expect(e.visibleUnits('allies').map((u) => u.id)).not.toContain('G1');
  });
  it('fog off shows everything', () => {
    const w = makeWorld({ flat: Terrain.Plains, fog: false, units: [mkUnit('F1', 'FRA', 'infantry', [0.5, 51.5]), mkUnit('G1', 'GER', 'infantry', [3.5, 51.5])] });
    const { e } = boot(w);
    e.step(1);
    expect(e.visibleUnits('allies').length).toBeGreaterThanOrEqual(2);
  });
});

describe('weather', () => {
  it('follows the monthly profile deterministically and changes over time', () => {
    const w = makeWorld({ flat: Terrain.Plains, weather: { rain: 2, mud: 1, clear: 1 } });
    const { e, st } = boot(w, 4);
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) { e.step(1); kinds.add(st.weather.kind); }
    expect(kinds.size).toBeGreaterThan(1);
    for (const k of kinds) expect(['rain', 'mud', 'clear']).toContain(k);
    const w2 = makeWorld({ flat: Terrain.Plains, weather: { rain: 2, mud: 1, clear: 1 } });
    const b = boot(w2, 4); b.e.step(400);
    expect(JSON.stringify(b.st.weather)).toBe(JSON.stringify(st.weather));
  });
});

describe('victory and special modules', () => {
  const objs = (): Objective[] => [
    { id: 'cap', tier: 'primary', side: 'allies', title: 'Take Aachen', description: '', points: 60, status: 'pending', condition: { kind: 'capture_location', locationId: 'aachen' } },
    { id: 'hold', tier: 'primary', side: 'allies', title: 'Hold Paris', description: '', points: 40, status: 'pending', condition: { kind: 'hold_location', locationId: 'paris' } },
  ];
  it('wins decisively when both objectives are met at the campaign end', () => {
    const w = makeWorld({ flat: Terrain.Plains, objectives: objs(), units: [mkUnit('F1', 'FRA', 'infantry', [1.9, 51.5]), mkUnit('F2', 'FRA', 'infantry', [0.35, 51.5], { posture: 'defend' })] });
    const { e, st } = boot(w);
    order(e, 'F1', 'capture', { targetLocation: 'aachen' });
    e.step(2000);
    expect(st.result?.ending).toBe('decisive_victory');
    expect(st.result?.score).toBe(100);
    const t = st.clock.minutes;
    e.step(10);
    expect(st.clock.minutes).toBe(t); // sim stops after the campaign ends
    expect(e.dispatch({ type: 'set_posture', unitIds: ['F1'], posture: 'hold' }).ok).toBe(false);
  });
  it('limited result when only the hold objective is achieved; defeat when the enemy takes Paris', () => {
    const w = makeWorld({ flat: Terrain.Plains, objectives: objs(), units: [mkUnit('F2', 'FRA', 'infantry', [0.35, 51.5], { posture: 'defend' })] });
    const a = boot(w);
    a.e.step(2000);
    expect(['stalemate', 'limited_victory']).toContain(a.st.result?.ending);
    expect(a.st.objectives.find((o) => o.id === 'hold')!.status).toBe('achieved');

    const w2 = makeWorld({ flat: Terrain.Plains, objectives: objs(), units: [mkUnit('F1', 'FRA', 'infantry', [0.1, 50.2]), mkUnit('G1', 'GER', 'armoured', [0.6, 51.5])] });
    w2.scenario.locations.find((l) => l.id === 'paris')!.value = 6; // cut-off raiders lose morale; a mid-value town stays takeable
    const b = boot(w2);
    order(b.e, 'G1', 'capture', { targetLocation: 'paris' });
    b.e.step(100);
    expect(b.st.locations['paris'].owner).toBe('GER');
    expect(b.st.objectives.find((o) => o.id === 'hold')!.status).toBe('failed');
    b.e.step(2000);
    expect(b.st.result?.ending).toBe('defeat');
  });
  it('registered special modules are initialised, updated every tick, and can decide custom objectives', () => {
    registerSpecialModule({
      id: 'test_counter',
      init: (s) => { s.special['test_counter'] = { n: 0 }; },
      update: (s) => { (s.special['test_counter'] as { n: number }).n++; },
      evaluate: (script, _o, s) => (script === 'ten_ticks' ? ((s.special['test_counter'] as { n: number }).n >= 10 ? 'achieved' : 'pending') : undefined),
    });
    const w = makeWorld({ flat: Terrain.Plains, objectives: [
      { id: 'c', tier: 'secondary', side: 'allies', title: 'Custom', description: '', points: 5, status: 'pending', condition: { kind: 'custom', script: 'ten_ticks' } },
    ] });
    w.scenario.specialSystems = ['test_counter', 'not_registered'];
    const { e, st } = boot(w);
    e.step(9);
    expect(st.objectives[0].status).toBe('pending');
    e.step(1);
    expect((st.special['test_counter'] as { n: number }).n).toBe(10);
    expect(st.objectives[0].status).toBe('achieved');
  });
  it('destroy_units and survive_until objectives evaluate from state', () => {
    const w = makeWorld({ flat: Terrain.Plains, objectives: [
      { id: 'd', tier: 'secondary', side: 'allies', title: 'Kill', description: '', points: 5, status: 'pending', condition: { kind: 'destroy_units', side: 'axis', fraction: 0.5 } },
      { id: 's', tier: 'secondary', side: 'allies', title: 'Survive', description: '', points: 5, status: 'pending', condition: { kind: 'survive_until', minutes: 900 } },
    ], units: [mkUnit('F1', 'FRA', 'infantry', [0.5, 51.5]), mkUnit('G1', 'GER', 'infantry', [3.5, 51.5]), mkUnit('G2', 'GER', 'infantry', [3.5, 51.0])] });
    const { e, st } = boot(w);
    e.step(5);
    expect(st.objectives[0].status).toBe('pending');
    (st.units['G1'] as Unit).destroyed = true;
    e.step(1);
    expect(st.objectives[0].status).toBe('achieved');
    e.step(5);
    expect(st.objectives[1].status).toBe('pending');
    e.step(4);
    expect(st.objectives[1].status).toBe('achieved');
  });
});
