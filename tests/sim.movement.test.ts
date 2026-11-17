import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { haversineKm } from '../src/core/geo';
import { createEngine } from '../src/sim/engine';
import { findRoute, unitSpeedKmh } from '../src/sim/pathfinding';
import { makeWorld, mkUnit } from './simfixture';

function setup(units: Unit[], opts: Parameters<typeof makeWorld>[0] = {}) {
  const w = makeWorld({ flat: Terrain.Plains, units, ...opts });
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed: 1 });
  return { e, w, st: e.getState() as GameState };
}
const move = (e: ReturnType<typeof setup>['e'], id: string, target: [number, number], kind: 'move' | 'attack' = 'move') =>
  e.dispatch({ type: 'issue_order', unitIds: [id], order: { kind, priority: 1, target }, mode: 'replace' }, id.startsWith('G') ? 'axis' : 'allies');

function ticksToArrive(e: ReturnType<typeof setup>['e'], id: string, max = 200): number {
  const st = e.getState();
  for (let i = 1; i <= max; i++) {
    e.step(1);
    const u = st.units[id];
    if (u.orders.length === 0 || u.orders[0].status === 'complete') return i;
  }
  return -1;
}

describe('route + speed', () => {
  it('infantry on open ground: ticks == distance / 1.1 km/h (matches findRoute ETA)', () => {
    const { e, w, st } = setup([mkUnit('F1', 'FRA', 'infantry', [0.5, 51.0])]);
    const to: [number, number] = [1.0, 51.0];
    const r = findRoute(w.terrain, w.infra, st.units['F1'], to, st)!;
    const straight = haversineKm([0.5, 51.0], to);
    expect(r.km).toBeGreaterThanOrEqual(straight - 0.01);
    expect(r.km).toBeLessThan(straight * 1.02); // path smoothing leaves a straight line on uniform terrain
    expect(r.etaMinutes / 60).toBeCloseTo(r.km / 1.1, 1);
    move(e, 'F1', to);
    const ticks = ticksToArrive(e, 'F1');
    expect(ticks).toBeGreaterThan(0);
    // marching fatigue (military module) slows the column by up to 30%, so it takes between ETA and ETA x 1.4
    expect(ticks).toBeGreaterThanOrEqual(Math.floor(r.km / 1.1));
    expect(ticks).toBeLessThanOrEqual(Math.ceil((r.km / 1.1) * 1.4));
    expect(haversineKm(st.units['F1'].pos, to)).toBeLessThan(2);
  });

  it('unit never moves faster than its speed in a tick', () => {
    const { e, st } = setup([mkUnit('G1', 'GER', 'armoured', [1.0, 51.0])]);
    move(e, 'G1', [3.0, 51.0]);
    let prev = st.units['G1'].pos;
    for (let i = 0; i < 12; i++) {
      e.step(1);
      const d = haversineKm(prev, st.units['G1'].pos);
      expect(d).toBeLessThanOrEqual(1.81);
      prev = st.units['G1'].pos;
    }
    expect(haversineKm([1.0, 51.0], prev)).toBeGreaterThan(14);
  });

  it('roads speed up wheeled units; speed table is sane', () => {
    const road = [{ id: 'r1', kind: 'road' as const, historical: true, coords: [[0.4, 51.025], [1.3, 51.025]] as [number, number][] }];
    const mk = () => [mkUnit('F1', 'FRA', 'motorised', [0.5, 51.025])];
    const a = setup(mk()), b = setup(mk(), { infra: road });
    move(a.e, 'F1', [1.2, 51.025]); move(b.e, 'F1', [1.2, 51.025]);
    const off = ticksToArrive(a.e, 'F1'), on = ticksToArrive(b.e, 'F1');
    expect(on).toBeLessThan(off);
    const u = mkUnit('x', 'FRA', 'infantry', [0, 0]);
    expect(unitSpeedKmh(u, Terrain.Plains, 'clear', false)).toBeCloseTo(1.1, 5);
    expect(unitSpeedKmh(u, Terrain.Bocage, 'clear', false)).toBeCloseTo(0.6 * 1.1, 5);
    expect(unitSpeedKmh(mkUnit('T', 'GER', 'armoured', [2, 51.5]), Terrain.Bocage, 'clear', false)).toBeCloseTo(0.4 * 1.8, 5);
    expect(unitSpeedKmh(u, Terrain.Mountains, 'clear', false)).toBeLessThan(unitSpeedKmh(u, Terrain.Hills, 'clear', false));
    expect(unitSpeedKmh(u, Terrain.Sea, 'clear', false)).toBe(0);
  });

  it('mud and snow slow movement; roads blunt the penalty; low fuel/org hurt', () => {
    const tank = mkUnit('t', 'GER', 'armoured', [0, 0]);
    const clear = unitSpeedKmh(tank, Terrain.Plains, 'clear', false);
    const mud = unitSpeedKmh(tank, Terrain.Plains, 'mud', false);
    const snow = unitSpeedKmh(tank, Terrain.Plains, 'snow', false);
    expect(mud).toBeLessThan(clear * 0.6);
    expect(snow).toBeLessThan(clear * 0.7);
    const roadClear = unitSpeedKmh(tank, Terrain.Plains, 'clear', true), roadMud = unitSpeedKmh(tank, Terrain.Plains, 'mud', true);
    expect(roadMud / roadClear).toBeGreaterThan(mud / clear);
    expect(unitSpeedKmh({ ...tank, fuel: 0 }, Terrain.Plains, 'clear', false)).toBeLessThan(clear * 0.3);
    expect(unitSpeedKmh({ ...tank, organisation: 10 }, Terrain.Plains, 'clear', false)).toBeLessThan(clear * 0.7);
    // engine-level: same order, mud covers less ground in 5 ticks
    const dist = (kind: 'clear' | 'mud') => {
      const { e, st } = setup([mkUnit('G1', 'GER', 'armoured', [1, 51])]);
      st.weather = { kind, intensity: 1, temperatureC: 10, nextChangeMinutes: 1e9 };
      move(e, 'G1', [3, 51]); e.step(5);
      return haversineKm([1, 51], st.units['G1'].pos);
    };
    expect(dist('mud')).toBeLessThan(dist('clear') * 0.6);
  });

  it('land units cannot path into the sea; naval units cannot path onto land; terrain slows', () => {
    const w = makeWorld({ units: [mkUnit('F1', 'FRA', 'infantry', [0.5, 51.5]), mkUnit('N1', 'FRA', 'naval', [1.0, 52.95], { domain: 'sea' })] });
    const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed: 1 });
    const st = e.getState() as GameState;
    expect(findRoute(w.terrain, w.infra, st.units['F1'], [1.0, 52.95], st)).toBeNull();
    expect(findRoute(w.terrain, w.infra, st.units['N1'], [3.0, 52.95], st)).not.toBeNull();
    expect(findRoute(w.terrain, w.infra, st.units['N1'], [1.0, 51.0], st)).toBeNull();
    // forest block (lon 1.5-1.8, lat 51-52): a straight run through it is slower than the route chosen
    const r = findRoute(w.terrain, w.infra, st.units['F1'], [2.5, 51.5], st)!;
    expect(r.etaMinutes / 60).toBeLessThan(haversineKm([0.5, 51.5], [2.5, 51.5]) / 1.1 / 0.75 + 1);
    expect(r.km).toBeGreaterThan(haversineKm([0.5, 51.5], [2.5, 51.5]) - 0.1);
  });

  it('routes detour to a bridge instead of forcing a river (tracked units)', () => {
    const infra = [
      { id: 'river', kind: 'river' as const, historical: true, coords: [[0.75, 50.0], [0.75, 52.0]] as [number, number][] },
      { id: 'road', kind: 'road' as const, historical: true, coords: [[0.3, 51.06], [1.2, 51.06]] as [number, number][] },
    ];
    const { w, st } = setup([mkUnit('G1', 'GER', 'armoured', [0.4, 51.0])], { infra });
    const r = findRoute(w.terrain, w.infra, st.units['G1'], [1.1, 51.0], st)!;
    // find where the path crosses the river line
    let crossLat = NaN;
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1], b = r.path[i];
      if ((a[0] - 0.75) * (b[0] - 0.75) <= 0 && a[0] !== b[0]) crossLat = a[1] + ((0.75 - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
    }
    expect(Math.abs(crossLat - 51.06)).toBeLessThan(0.06);
  });

  it('stacking: a full cell stops further friendly units entering it', () => {
    const units: Unit[] = [];
    for (let i = 0; i < 4; i++) units.push(mkUnit('A' + i, 'FRA', 'infantry', [1.52 + i * 0.001, 51.025]));
    units.push(mkUnit('B', 'FRA', 'infantry', [1.4, 51.025]));
    const { e, st } = setup(units);
    move(e, 'B', [1.56, 51.025]);
    e.step(60);
    const cellOf = (p: [number, number]) => `${Math.floor(p[0] / 0.05)}`;
    const inCell = Object.values(st.units).filter((u) => cellOf(u.pos) === cellOf([1.52, 51])).length;
    expect(inCell).toBeLessThanOrEqual(4);
    expect(st.units['B'].pos[0]).toBeLessThan(1.5);
  });

  it('moving units stop short of enemy units instead of walking through them', () => {
    const { e, st } = setup([mkUnit('F1', 'FRA', 'armoured', [1.0, 51.0]), mkUnit('G1', 'GER', 'infantry', [1.5, 51.0], { posture: 'defend' })]);
    move(e, 'F1', [2.5, 51.0], 'attack');
    e.step(20);
    expect(st.units['F1'].pos[0]).toBeLessThan(1.55);
  });
});

describe('units held up by an enemy in their path', () => {
  it('are stationary (no marching fuel burn) when they do not advance, and fight when in contact range', () => {
    const { e, st } = setup([
      mkUnit('F1', 'FRA', 'armoured', [0.5, 51.0]),
      mkUnit('G1', 'GER', 'infantry', [0.62, 51.0], { posture: 'defend' }),
    ]);
    move(e, 'F1', [0.9, 51.0], 'move');
    let fought = false;
    for (let i = 0; i < 40; i++) {
      const before: [number, number] = [...st.units['F1'].pos];
      const fuel = st.units['F1'].fuel;
      e.step(1);
      const u = st.units['F1'];
      if (u.inBattle) fought = true;
      if (haversineKm(before, u.pos) < 0.05 && !u.inBattle) {
        expect(u.moveStatus).not.toBe('moving');
        expect(u.fuel).toBeGreaterThanOrEqual(fuel - 0.5); // idle fuel use only, not marching
      }
    }
    expect(fought || st.reports.length > 0).toBe(true);
  });
});

describe('entrenchment is kept by a garrison that does not really move', () => {
  const lillePos = (st: GameState) => st.locations['lille'].pos;
  it('a stationary unit on its own location keeps its dig-in when the posture changes, one in open ground loses it', () => {
    const { e, st } = setup([mkUnit('G1', 'FRA', 'infantry', [2, 51.5], { posture: 'defend', entrenchment: 80 }), mkUnit('G2', 'FRA', 'infantry', [2, 51.3], { posture: 'defend', entrenchment: 80 })]);
    const lp = lillePos(st);
    st.units['G1'].pos = [lp[0] + 0.005, lp[1]]; st.units['G2'].pos = [lp[0] + 0.4, lp[1] + 0.1];
    st.units['G1'].posture = 'attack'; st.units['G2'].posture = 'attack';
    for (let i = 0; i < 20; i++) e.step(1);
    expect(st.units['G1'].entrenchment).toBe(80);
    expect(st.units['G2'].entrenchment).toBeLessThan(75);
  });
  it('a short shuffle on own ground costs little, a real march resets it', () => {
    const { e, st } = setup([mkUnit('F1', 'FRA', 'infantry', [2, 51.5], { posture: 'defend', entrenchment: 80 }), mkUnit('F2', 'FRA', 'infantry', [2, 51.3], { posture: 'defend', entrenchment: 80 })]);
    const lp = lillePos(st);
    st.units['F1'].pos = [lp[0], lp[1]]; st.units['F2'].pos = [lp[0] + 0.4, lp[1] + 0.1];
    move(e, 'F1', [lp[0] + 0.012, lp[1]]);
    move(e, 'F2', [lp[0] + 0.5, lp[1] + 0.1]);
    for (let i = 0; i < 2; i++) e.step(1);
    expect(st.units['F1'].entrenchment).toBeGreaterThan(70);
    expect(st.units['F2'].entrenchment).toBeLessThan(65);
  });
});

describe('amphibious and airborne arrivals', () => {
  const landed = (seed: number, kind: 'amphibious' | 'airborne') => {
    const w = makeWorld({ flat: Terrain.Plains, units: [mkUnit('F0', 'FRA', 'infantry', [1.5, 51.4])] });
    const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed, disableAI: true });
    const st = e.getState() as GameState;
    const u = mkUnit('LND', 'FRA', 'infantry', [2, 51.5], { manpower: 10000, manpowerMax: 10000, organisation: 100 });
    st.nations['FRA'].reinforcements.push({ id: 'r.land', atMinutes: 0, pos: [2, 51.5], unit: u, landing: { kind, casualties: 0.2, dispersionKm: 8, penaltyHours: 6 } });
    e.step(1);
    return { st, u: Object.values(st.units).find((x) => x.name === u.name && x.id.startsWith('LND'))! };
  };
  it('applies losses, scatter and disorder, deterministically', () => {
    const a = landed(5, 'amphibious'), b = landed(5, 'amphibious');
    expect(a.u).toBeTruthy();
    expect(a.u.manpower).toBeLessThan(9000);
    expect(a.u.organisation).toBeLessThanOrEqual(66);
    expect(haversineKm(a.u.pos, [2, 51.5])).toBeLessThan(8.5);
    expect(a.st.special['sim']).toBeTruthy();
    expect((a.st.special['sim'] as { landing: Record<string, number> }).landing[a.u.id]).toBeGreaterThan(a.st.clock.minutes);
    expect(b.u.pos).toEqual(a.u.pos);
    expect(b.u.manpower).toBe(a.u.manpower);
  });
  it('airborne drops start at higher organisation than a beach landing', () => {
    expect(landed(5, 'airborne').u.organisation).toBeGreaterThan(landed(5, 'amphibious').u.organisation);
  });
});
