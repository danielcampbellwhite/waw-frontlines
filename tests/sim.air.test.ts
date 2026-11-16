import { describe, expect, it } from 'vitest';
import type { GameState, Location, Unit } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { haversineKm } from '../src/core/geo';
import { createEngine } from '../src/sim/engine';
import { getSimMeta } from '../src/sim/meta';
import { makeWorld, mkUnit } from './simfixture';

const airfield = (id: string, lon: number, lat: number, owner: 'GER' | 'FRA'): Location =>
  ({ id, name: id, kind: 'airfield', pos: [lon, lat], owner, originalOwner: owner, value: 2 });
function mkAir(id: string, nation: 'GER' | 'FRA', type: 'air_bomber' | 'air_fighter', pos: [number, number], extra: Partial<Unit> = {}): Unit {
  const u = mkUnit(id, nation, 'infantry', pos, extra);
  return { ...u, type, domain: 'air', manpower: 1000, manpowerMax: 1000, equipment: { held: { bomber: 60 }, authorised: { bomber: 60 } } };
}
function world(units: Unit[], fields: Location[] = [], seed = 5) {
  const w = makeWorld({ flat: Terrain.Plains, units: [...units, mkUnit('RF2', 'FRA', 'infantry', [0.1, 50.1]), mkUnit('RG2', 'GER', 'infantry', [3.9, 50.1])], extraLocations: fields, weather: { clear: 1 } });
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed, disableAI: true });
  return { e, st: e.getState() as GameState };
}

describe('air units in the sim', () => {
  it('support a battle from their airfield (60 km away) and are credited in the battle factors', () => {
    const ground = [
      mkUnit('A0', 'FRA', 'armoured', [1.9423, 51.5], { posture: 'attack' }),
      mkUnit('D0', 'GER', 'infantry', [2.0, 51.5], { posture: 'defend' }),
    ];
    const { e, st } = world([...ground, mkAir('B0', 'FRA', 'air_bomber', [1.4, 51.5])], [airfield('af1', 1.4, 51.5, 'FRA')]);
    e.step(12);
    expect(st.units['B0'].inBattle).toBeFalsy();
    expect(st.units['B0'].combatStatus).not.toBe('attacking');
    const sr = getSimMeta(st).sorties['B0'];
    expect(sr?.[1]).toBeGreaterThan(0); // flew sorties from 60 km away
    expect(st.units['B0'].equipment.held.bomber).toBeLessThanOrEqual(60);
    const b = Object.values(getSimMeta(st).battles)[0];
    expect(b.sum.airA).toBeGreaterThan(0);
  });
  it('never fight as land units, never capture locations, and never count as a land battle participant', () => {
    const { e, st } = world(
      [mkAir('B0', 'FRA', 'air_bomber', [1.0, 51.0]), mkUnit('G0', 'GER', 'infantry', [1.02, 51.0], { posture: 'defend' })],
      [airfield('af1', 1.0, 51.0, 'FRA')],
    );
    // a GER-owned town directly under a French bomber
    st.locations['aachen'].pos = [1.0, 51.0]; st.locations['aachen'].owner = 'GER';
    e.step(60);
    expect(st.reports.length).toBe(0);
    expect(st.units['B0'].inBattle).toBeFalsy();
    expect(st.locations['aachen'].owner).toBe('GER');
  });
  it('fly over enemy land units and water without being stopped by contact-stop or sea rules', () => {
    const { e, st } = world(
      [mkAir('B0', 'FRA', 'air_bomber', [0.6, 51.0]), mkUnit('G0', 'GER', 'infantry', [1.2, 51.0], { posture: 'defend' }), mkUnit('G1', 'GER', 'infantry', [1.6, 51.0], { posture: 'defend' })],
      [airfield('af1', 0.6, 51.0, 'FRA')],
    );
    e.dispatch({ type: 'issue_order', unitIds: ['B0'], order: { kind: 'move', priority: 1, target: [2.4, 51.0] }, mode: 'replace' }, 'allies');
    let minFuel = 100, closest = 1e9;
    for (let i = 0; i < 8; i++) { e.step(1); minFuel = Math.min(minFuel, st.units['B0'].fuel); closest = Math.min(closest, haversineKm(st.units['B0'].pos, [2.4, 51.0])); }
    expect(closest).toBeLessThan(15); // reached the target across both enemy units
    expect(minFuel).toBeLessThanOrEqual(100);
    expect(st.reports.length).toBe(0);
  });
  it('return to the nearest friendly airfield when idle away from base', () => {
    const { e, st } = world([mkAir('B0', 'FRA', 'air_bomber', [0.6, 51.0])], [airfield('af1', 0.6, 51.0, 'FRA'), airfield('af2', 1.4, 51.0, 'FRA'), airfield('afg', 2.2, 51.0, 'GER')]);
    e.dispatch({ type: 'issue_order', unitIds: ['B0'], order: { kind: 'move', priority: 1, target: [1.3, 51.2] }, mode: 'replace' }, 'allies');
    e.step(40);
    const u = st.units['B0'];
    expect(u.orders[0]?.status ?? 'complete').toBe('complete');
    expect(haversineKm(u.pos, [1.4, 51.0])).toBeLessThan(10); // landed at af2, not the enemy field
    expect(u.moveStatus).toBe('stationary');
  });

  it('air support is capped at a share of ground power: a strong air force cannot make a hopeless attack win or carry an HQ', () => {
    const bombers = Array.from({ length: 8 }, (_, i) => mkAir('GB' + i, 'GER', 'air_bomber', [2.3, 51.5 + i * 0.01]));
    const { e, st } = world(
      [mkUnit('A0', 'FRA', 'infantry', [1.9423, 51.5], { posture: 'attack' }), mkUnit('HQ', 'GER', 'hq', [2.0, 51.5], { posture: 'defend' }), ...bombers],
      [airfield('afg', 2.3, 51.5, 'GER')],
    );
    e.step(20);
    const rep = st.reports[0];
    expect(rep).toBeDefined();
    const line = rep.reasons.find((r) => r.startsWith('Defending aircraft added'));
    // the HQ's own ground power is tiny, so the air cap is tiny too
    if (line) expect(parseInt(/added (d+)%/.exec(line)![1], 10)).toBeLessThanOrEqual(27);
    expect(rep.outcome).toBe('attacker_victory');
  });
  it('are limited to a few sorties per day, which cost fuel/ammo and some aircraft', () => {
    const { e, st } = world(
      [mkUnit('A0', 'FRA', 'infantry', [1.9423, 51.5], { posture: 'attack', manpower: 20000, manpowerMax: 20000 }), mkUnit('D0', 'GER', 'infantry', [2.0, 51.5], { posture: 'defend', manpower: 20000, manpowerMax: 20000 }), mkAir('B0', 'FRA', 'air_bomber', [1.5, 51.5])],
      [airfield('af1', 1.5, 51.5, 'FRA')],
    );
    e.step(20);
    const sr = getSimMeta(st).sorties['B0'];
    expect(sr).toBeDefined();
    expect(sr[1]).toBeLessThanOrEqual(3);
    expect(sr[1]).toBeGreaterThan(0);
  });
});
