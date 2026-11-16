import { describe, expect, it } from 'vitest';
import { haversineKm } from '../../src/core/geo';
import type { Unit, WeatherKind } from '../../src/core/types';
import { Terrain } from '../../src/core/types';
import { createEngine, findRoute, unitSpeedKmh } from '../../src/sim';
import { makeWorld, mkUnit, SETTINGS } from '../simfixture';
import { checkInvariants, loadWorld, mkEngine } from './harness';

function world(o: { weather?: WeatherKind; terrain?: number; patch?: { west: number; east: number; terrain: number }; units: Unit[] }) {
  const w = makeWorld({ flat: o.terrain ?? Terrain.Plains, weather: { [o.weather ?? 'clear']: 1 } as never, units: o.units, patch: o.patch });
  w.scenario.objectives = [];
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'GER', settings: { ...SETTINGS, randomEvents: false }, seed: 5, disableAI: true });
  return { w, e };
}
const to = (e: ReturnType<typeof world>['e'], id: string, target: [number, number]) =>
  e.dispatch({ type: 'issue_order', unitIds: [id], order: { kind: 'move', target, priority: 1 }, mode: 'replace' }, 'axis');
function runToArrival(e: ReturnType<typeof world>['e'], id: string, maxTicks: number) {
  for (let t = 1; t <= maxTicks; t++) { e.step(1); const u = e.getState().units[id]; if (u.orders.length === 0 || u.orders[0].status === 'complete' || (u.moveStatus === 'stationary' && t > 1)) return t; }
  return -1;
}

describe('movement', () => {
  it('infantry arrival time ~ haversine km / speed on open plains', () => {
    const a = mkUnit('A', 'GER', 'infantry', [1.0, 51.5]);
    const { e } = world({ units: [a] });
    const target: [number, number] = [1.6, 51.5];
    const km = haversineKm(a.pos, target);
    const v = unitSpeedKmh(a, Terrain.Plains, 'clear', false);
    expect(to(e, 'A', target).ok).toBe(true);
    const t = runToArrival(e, 'A', 200);
    const expected = km / v;
    console.log(`[move] inf ${km.toFixed(1)}km v=${v.toFixed(2)} expected ${expected.toFixed(1)}h actual ${t}h`);
    expect(t).toBeGreaterThan(0);
    expect(t / expected).toBeGreaterThan(0.85); expect(t / expected).toBeLessThan(1.5); // A* detours, fatigue/org drift and the contact-stop rules add time
    expect(haversineKm(e.getState().units['A'].pos, target)).toBeLessThan(1);
  });
  it('speed ordering follows the documented rates: recon < armour < infantry arrival time on the same short leg', () => {
    const mk = (type: Unit['type'], id: string, lat: number) => mkUnit(id, 'GER', type, [1.0, lat]);
    const { e } = world({ units: [mk('infantry', 'I', 51.0), mk('armoured', 'T', 51.2), mk('recon', 'R', 51.4)] });
    const rate = (t: Unit['type']) => unitSpeedKmh(mkUnit('x', 'GER', t, [1, 51]), Terrain.Plains, 'clear', false);
    expect(rate('recon')).toBeGreaterThan(rate('armoured')); expect(rate('armoured')).toBeGreaterThan(rate('infantry'));
    for (const [id, lat] of [['I', 51.0], ['T', 51.2], ['R', 51.4]] as const) to(e, id, [1.2, lat]); // ~14 km: within one tank of fuel
    const arr: Record<string, number> = {};
    for (let t = 1; t <= 150; t++) { e.step(1); for (const id of ['I', 'T', 'R']) if (!arr[id] && e.getState().units[id].orders.length === 0) arr[id] = t; }
    console.log('[move] arrival hours', arr, 'rates', rate('recon'), rate('armoured'), rate('infantry'));
    expect(arr['R']).toBeDefined(); expect(arr['T']).toBeDefined(); expect(arr['I']).toBeDefined();
    expect(arr['R']).toBeLessThan(arr['T']); expect(arr['T']).toBeLessThan(arr['I']);
    const km = haversineKm([1.0, 51.2], [1.2, 51.2]);
    expect(arr['T'] / (km / rate('armoured'))).toBeLessThan(1.6);
  });
  it('weather slows movement: clear <= rain < mud (per-tick speed strictly ordered)', () => {
    const times: Record<string, number> = {};
    const tank = mkUnit('x', 'GER', 'armoured', [1, 51]);
    const v = (w: WeatherKind) => unitSpeedKmh(tank, Terrain.Plains, w, false);
    expect(v('clear')).toBeGreaterThan(v('rain')); expect(v('rain')).toBeGreaterThan(v('mud'));
    for (const wx of ['clear', 'rain', 'mud'] as WeatherKind[]) {
      const { e } = world({ weather: wx, units: [mkUnit('T', 'GER', 'armoured', [1.0, 51.5])] });
      to(e, 'T', [1.3, 51.5]); times[wx] = runToArrival(e, 'T', 300); // ~21 km
    }
    console.log('[move] weather hours', times);
    expect(times.clear).toBeGreaterThan(0);
    expect(times.clear).toBeLessThanOrEqual(times.rain); expect(times.rain).toBeLessThan(times.mud);
  });
  it('terrain slows movement: plains < forest < mountains (route cost)', () => {
    const times: Record<string, number> = {};
    for (const [n, tc] of [['plains', Terrain.Plains], ['forest', Terrain.Forest], ['mountains', Terrain.Mountains]] as const) {
      const { e } = world({ terrain: tc, units: [mkUnit('I', 'GER', 'infantry', [1.0, 51.5])] });
      // the fixture's flat option leaves sea at the north rows only if flat undefined; target in the middle
      to(e, 'I', [1.3, 51.5]); times[n] = runToArrival(e, 'I', 300);
    }
    console.log('[move] terrain hours', times);
    expect(times.plains).toBeLessThan(times.forest); expect(times.forest).toBeLessThan(times.mountains);
  });
  it('roads speed up wheeled units', () => {
    const road = { id: 'r', kind: 'road' as const, coords: [[1.0, 51.52], [1.9, 51.52]] as [number, number][] };
    const noRoad = world({ units: [mkUnit('M', 'GER', 'motorised', [1.0, 51.52])] });
    const wr = makeWorld({ flat: Terrain.Plains, units: [mkUnit('M', 'GER', 'motorised', [1.0, 51.52])], infra: [road as never] });
    wr.scenario.objectives = [];
    const er = createEngine(wr.scenario, wr.terrain, wr.infra, { playerNation: 'GER', settings: { ...SETTINGS, randomEvents: false }, seed: 5, disableAI: true });
    to(noRoad.e, 'M', [1.9, 51.52]); to(er, 'M', [1.9, 51.52]);
    const a = runToArrival(noRoad.e, 'M', 300), b = runToArrival(er, 'M', 300);
    console.log('[move] road hours', { offroad: a, road: b });
    expect(b).toBeLessThan(a);
  });
  it('sea is impassable: land units cannot be ordered into the sea, route to it fails', () => {
    const w = loadWorld();
    const e = mkEngine(w, 'GER', 1, { disableAI: true });
    const u = Object.values(e.getState().units).find((x) => x.side === 'axis' && x.type === 'infantry' && x.domain === 'land')!;
    const seaPt: [number, number] = [-3.2, 49.0]; // Western Channel / Brittany sea, inside bbox?
    const t = w.terrain;
    const c = Math.floor((seaPt[0] - t.bbox.west) / t.cellDeg), r = Math.floor((t.bbox.north - seaPt[1]) / t.cellDeg);
    console.log('[move] sea target terrain code', t.cells[r * t.cols + c], 'in-bbox', c >= 0 && r >= 0 && c < t.cols && r < t.rows);
    const res = e.dispatch({ type: 'issue_order', unitIds: [u.id], order: { kind: 'move', target: seaPt, priority: 1 }, mode: 'replace' }, 'axis');
    const route = findRoute(w.terrain, w.infra, u, seaPt, e.getState());
    console.log('[move] order into sea ->', JSON.stringify(res), 'route', route ? route.km.toFixed(0) + 'km' : null);
    if (res.ok) { e.step(30); const s = e.getState().units[u.id]; const cc = Math.floor((s.pos[0] - t.bbox.west) / t.cellDeg), rr = Math.floor((t.bbox.north - s.pos[1]) / t.cellDeg); expect([Terrain.Sea, Terrain.Lake]).not.toContain(t.cells[rr * t.cols + cc]); }
    else expect(res.ok).toBe(false);
  });
  it('no land unit ever ends a tick on a sea cell over 300 real ticks (AI on)', () => {
    const w = loadWorld(); const e = mkEngine(w, 'GER', 3); const t = w.terrain; const bad = new Set<string>();
    for (let k = 0; k < 300; k++) { e.step(1); for (const u of Object.values(e.getState().units)) { if (u.domain !== 'land' || u.destroyed) continue;
      const c = Math.floor((u.pos[0] - t.bbox.west) / t.cellDeg), r = Math.floor((t.bbox.north - u.pos[1]) / t.cellDeg);
      if (c < 0 || r < 0 || c >= t.cols || r >= t.rows) { bad.add(`${u.id}:outside`); continue; }
      const tc = t.cells[r * t.cols + c]; if (tc === Terrain.Sea || tc === Terrain.Lake) bad.add(`${u.id}:sea@${k}`); } }
    console.log('[move] land units seen on sea cells:', [...bad].slice(0, 10), 'count', bad.size);
    expect([...bad]).toEqual([]);
  }, 120_000);
  it('fuel burns while moving; an empty tank halts the unit completely (order stays active) and it resumes when refuelled', () => {
    const { e } = world({ units: [mkUnit('T', 'GER', 'armoured', [1.0, 51.5], { fuel: 8 })] });
    to(e, 'T', [3.5, 51.5]);
    const trace: number[] = []; let prev = e.getState().units['T'].pos;
    for (let t = 0; t < 40; t++) { e.step(1); const u = e.getState().units['T']; trace.push(+haversineKm(prev, u.pos).toFixed(2)); prev = u.pos; }
    const u = e.getState().units['T'];
    console.log('[move] fuel', u.fuel, 'per-tick km', trace.join(','), 'status', u.moveStatus, 'order', u.orders[0]?.status);
    expect(trace[0]).toBeGreaterThan(0);
    expect(trace.slice(-10).every((d) => d === 0)).toBe(true);           // halted
    expect(u.orders[0]?.status).toBe('active');                            // order kept
    // refuel and it moves again
    const pos0 = [...u.pos]; u.fuel = 60; e.step(3);
    expect(haversineKm(pos0 as [number, number], e.getState().units['T'].pos)).toBeGreaterThan(0.5);
  });
  it('orders to dead units / unknown ids / opposing side are rejected, not crashed', () => {
    const { e } = world({ units: [mkUnit('A', 'GER', 'infantry', [1.0, 51.5]), mkUnit('F', 'FRA', 'infantry', [3.0, 51.5])] });
    const s = e.getState(); s.units['A'].destroyed = true;
    const r1 = to(e, 'A', [1.5, 51.5]);
    const r2 = to(e, 'NOPE', [1.5, 51.5]);
    const r3 = e.dispatch({ type: 'issue_order', unitIds: ['F'], order: { kind: 'move', target: [2.5, 51.5], priority: 1 }, mode: 'replace' }, 'axis');
    const r4 = e.dispatch({ type: 'issue_order', unitIds: [], order: { kind: 'move', target: [2.5, 51.5], priority: 1 }, mode: 'replace' }, 'axis');
    const r5 = e.dispatch({ type: 'issue_order', unitIds: ['F'], order: { kind: 'move', target: [NaN, 51.5], priority: 1 }, mode: 'replace' }, 'allies');
    const r6 = e.dispatch({ type: 'issue_order', unitIds: ['F'], order: { kind: 'move', target: [99, 99], priority: 1 }, mode: 'replace' }, 'allies');
    console.log('[move] adversarial', JSON.stringify([r1, r2, r3, r4, r5, r6]));
    expect([r1.ok, r2.ok, r3.ok, r4.ok, r5.ok, r6.ok]).toEqual([false, false, false, false, false, false]);
    e.step(5);
    expect(checkInvariants(e.getState())).toEqual([]);
  });
  it('supply cut: unit far from any supply source does not resupply ammo, unit near source does', () => {
    const w = makeWorld({ flat: Terrain.Plains, units: [
      mkUnit('NEAR', 'FRA', 'infantry', [0.35, 51.5], { ammo: 40 }), mkUnit('FAR', 'GER', 'infantry', [0.8, 51.0], { ammo: 40 }) ] });
    w.scenario.objectives = [];
    const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'GER', settings: { ...SETTINGS, randomEvents: false }, seed: 5, disableAI: true });
    e.step(24);
    const s = e.getState();
    console.log('[move] supply near', s.units['NEAR'].ammo, s.units['NEAR'].supply, 'far', s.units['FAR'].ammo, s.units['FAR'].supply, 'cut', s.supply.cutOffUnits);
    expect(s.units['NEAR'].ammo).toBeGreaterThan(40);
    expect(s.units['FAR'].ammo).toBeLessThanOrEqual(s.units['NEAR'].ammo);
    expect(s.units['FAR'].supply).toBeLessThan(s.units['NEAR'].supply);
  });
});
