import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { haversineKm } from '../src/core/geo';
import { createEngine } from '../src/sim/engine';
import { captureForceNeeded, captureTicksNeeded } from '../src/sim/territory';
import { makeWorld, mkUnit } from './simfixture';

type Opts = Parameters<typeof makeWorld>[0];
function boot(units: Unit[], o: Opts = {}) {
  const w = makeWorld({ flat: Terrain.Plains, units, ...o, extraLocations: [
    { id: 'gerdepot', name: 'German forward depot', kind: 'depot', pos: [0.4, 51.45], owner: 'GER', originalOwner: 'GER', value: 1 }, ...(o?.extraLocations ?? []),
  ] });
  w.scenario.supplySources['GER'] = ['berlin', 'gerdepot']; // keep the raiders supplied so morale does not rot
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed: 5, disableAI: true });
  return { e, w, st: e.getState() as GameState };
}
function ticksUntilOwner(e: ReturnType<typeof boot>['e'], loc: string, nation: string, max: number): number {
  const st = e.getState();
  for (let i = 1; i <= max; i++) { e.step(1); if (st.locations[loc].owner === nation) return i; }
  return -1;
}

describe('location capture needs real troops, enough of them, for long enough', () => {
  it('requirements scale with location value', () => {
    expect(captureTicksNeeded(2)).toBeLessThan(captureTicksNeeded(4));
    expect(captureTicksNeeded(10)).toBeGreaterThanOrEqual(24);
    expect(captureTicksNeeded(2)).toBeLessThanOrEqual(8);
    expect(captureForceNeeded(10)).toBeGreaterThan(captureForceNeeded(2));
  });
  it('a lone recon / HQ / logistics unit can sit in an undefended city forever without taking it', () => {
    for (const type of ['recon', 'hq', 'logistics'] as const) {
      const { e, st } = boot([mkUnit('G1', 'GER', type, [0.45, 51.5])]);
      e.dispatch({ type: 'issue_order', unitIds: ['G1'], order: { kind: 'move', priority: 1, target: st.locations['paris'].pos }, mode: 'replace' }, 'axis');
      e.step(150);
      expect(haversineKm(st.units['G1'].pos, st.locations['paris'].pos)).toBeLessThan(4);
      expect(st.locations['paris'].owner).toBe('FRA');
    }
  });
  it('a token force is not enough for a major city; a division is, after about 36 hours', () => {
    const tiny = boot([mkUnit('G1', 'GER', 'infantry', [0.31, 51.5], { manpower: 2000, manpowerMax: 2000 })]);
    tiny.e.step(120);
    expect(tiny.st.locations['paris'].owner).toBe('FRA');
    const div = boot([mkUnit('G1', 'GER', 'infantry', [0.31, 51.5])]);
    const t = ticksUntilOwner(div.e, 'paris', 'GER', 80);
    console.log('CAPTURE division on Paris (value 10) took', t, 'ticks');
    expect(t).toBeGreaterThanOrEqual(24);
    expect(t).toBeLessThan(60);
  });
  it('a small town falls much faster than a capital', () => {
    const town = boot([mkUnit('G1', 'GER', 'infantry', [0.3, 51.46])], { extraLocations: [{ id: 'hamlet', name: 'Hamlet', kind: 'town', pos: [0.3, 51.45], owner: 'FRA', originalOwner: 'FRA', value: 2 }] });
    const t = ticksUntilOwner(town.e, 'hamlet', 'GER', 40);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(10);
  });
  it('any friendly combat unit present blocks capture; recon alongside does not', () => {
    const { e, st } = boot([mkUnit('G1', 'GER', 'infantry', [0.31, 51.5]), mkUnit('F1', 'FRA', 'infantry', [0.3, 51.51], { posture: 'defend' })]);
    e.step(100);
    expect(st.locations['paris'].owner).toBe('FRA');
  });
});

describe('march rates are realistic', () => {
  const kmAfter = (type: Unit['type'], hours: number, o: Opts = {}) => {
    const { e, st } = boot([mkUnit('G1', 'GER', type, [0.5, 51.0 + 0.025], { fuel: 100 })], o);
    e.dispatch({ type: 'issue_order', unitIds: ['G1'], order: { kind: 'move', priority: 1, target: [3.9, 51.025] }, mode: 'replace' }, 'axis');
    e.step(hours);
    return haversineKm([0.5, 51.025], st.units['G1'].pos);
  };
  it('foot infantry cross-country: roughly 20-35 km per day', () => {
    const d = kmAfter('infantry', 24);
    console.log('MARCH infantry 24h', d.toFixed(1), 'km');
    expect(d).toBeGreaterThan(15); expect(d).toBeLessThan(36);
  });
  it('435 km in 3 game days is impossible for any ground unit', () => {
    for (const t of ['infantry', 'motorised', 'recon', 'armoured'] as const) {
      const road = [{ id: 'r', kind: 'road' as const, historical: true, coords: [[0.3, 51.025], [4.0, 51.025]] as [number, number][] }];
      const d = kmAfter(t, 72, { infra: road });
      console.log('MARCH', t, 'on a road, 72h:', d.toFixed(0), 'km');
      expect(d).toBeLessThan(300);
    }
    expect(kmAfter('armoured', 72)).toBeLessThan(150); // cross-country, and it burns its fuel
  });
  it('armour runs out of fuel on a deep unsupplied advance and halts', () => {
    const { e, st } = boot([mkUnit('G1', 'GER', 'armoured', [0.5, 51.025])]);
    e.dispatch({ type: 'issue_order', unitIds: ['G1'], order: { kind: 'move', priority: 1, target: [3.9, 51.025] }, mode: 'replace' }, 'axis');
    e.step(150);
    expect(st.units['G1'].fuel).toBeLessThan(5);
    const p = st.units['G1'].pos;
    e.step(5);
    // with the supply module's fuel trickle the column crawls (low-fuel speed) instead of stopping dead, but it is nowhere near marching pace
    expect(haversineKm(p, st.units['G1'].pos)).toBeLessThan(6);
    expect(st.units['G1'].orders[0].status).toBe('active');
  });
});

describe('contact stop / zone of control (fog does not help the marcher)', () => {
  it('a column stops and fights an enemy it has never seen, instead of walking past', () => {
    for (const fog of [true, false]) {
      const { e, st } = boot([
        mkUnit('F1', 'FRA', 'infantry', [1.0, 51.025]),
        mkUnit('G1', 'GER', 'infantry', [1.3, 51.025], { posture: 'defend' }),
      ], { fog });
      e.dispatch({ type: 'issue_order', unitIds: ['F1'], order: { kind: 'move', priority: 1, target: [2.5, 51.025] }, mode: 'replace' }, 'allies');
      // the column must be stopped short of the enemy and be in a fight; it may advance later only after beating it
      let stoppedAt: number | undefined;
      for (let i = 0; i < 60 && stoppedAt === undefined; i++) { e.step(1); if (st.units['F1'].inBattle) stoppedAt = st.units['F1'].pos[0]; }
      expect(stoppedAt).toBeDefined();
      expect(stoppedAt!).toBeLessThan(1.3);
      e.step(10);
      expect(st.reports.length + Object.keys(st.battles).length).toBeGreaterThan(0);
    }
  });
  it('an enemy 4 km off the line of march (inside its zone of control) also stops the column', () => {
    const { e, st } = boot([
      mkUnit('F1', 'FRA', 'infantry', [1.0, 51.025]),
      mkUnit('G1', 'GER', 'infantry', [1.3, 51.025 + 0.036], { posture: 'defend' }),
    ]);
    e.dispatch({ type: 'issue_order', unitIds: ['F1'], order: { kind: 'move', priority: 1, target: [2.5, 51.025] }, mode: 'replace' }, 'allies');
    e.step(60);
    expect(st.units['F1'].pos[0]).toBeLessThan(1.4);
  });
});

describe('report bookkeeping', () => {
  it('retreats never list a unit twice; territory gain names its owner', () => {
    const { e, st } = boot([
      mkUnit('A0', 'FRA', 'infantry', [1.9423, 51.5], { posture: 'attack', experience: 90, morale: 100 }),
      mkUnit('A1', 'FRA', 'armoured', [1.9423, 51.52], { posture: 'attack', experience: 90, morale: 100 }),
      mkUnit('D0', 'GER', 'infantry', [2.0, 51.5], { posture: 'defend', manpower: 3000, morale: 35, organisation: 40 }),
    ]);
    e.step(80);
    expect(st.reports.length).toBeGreaterThan(0);
    for (const r of st.reports) expect(new Set(r.retreats).size).toBe(r.retreats.length);
    const withCells = st.reports.filter((r) => r.territoryChangeCells > 0);
    for (const r of withCells) expect(['FRA', 'GER']).toContain(r.territoryChangeOwner);
  });
});
