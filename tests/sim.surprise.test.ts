import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { createEngine } from '../src/sim/engine';
import { getSimMeta } from '../src/sim/meta';
import { makeWorld, mkUnit } from './simfixture';

interface O { fog?: boolean; attType?: Unit['type']; moving?: boolean; dug?: number; firstSeenHoursAgo?: number; recon?: boolean; attCount?: number; defCount?: number }
function setup(seed: number, o: O = {}) {
  const units: Unit[] = [];
  const na = o.attCount ?? 1, nd = o.defCount ?? 1;
  for (let i = 0; i < na; i++) units.push(mkUnit('A' + i, 'FRA', o.attType ?? 'armoured', [1.9423, 51.5 + i * 0.012], { posture: 'attack', moveStatus: o.moving === false ? 'stationary' : 'moving' }));
  for (let i = 0; i < nd; i++) units.push(mkUnit('D' + i, 'GER', 'infantry', [2.0, 51.5 + i * 0.012], { posture: 'defend', entrenchment: o.dug ?? 0 }));
  if (o.recon) units.push(mkUnit('R', 'GER', 'recon', [2.02, 51.5], { posture: 'defend' }));
  const w = makeWorld({ flat: Terrain.Plains, units, weather: { clear: 1 }, fog: o.fog ?? true });
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'GER', settings: w.settings, seed, disableAI: true });
  const st = e.getState() as GameState;
  if (o.firstSeenHoursAgo !== undefined) {
    const fs = getSimMeta(st).firstSeen;
    for (let i = 0; i < na; i++) fs['A' + i] = { axis: [st.clock.minutes - o.firstSeenHoursAgo * 60, st.clock.minutes] };
  }
  e.step(1);
  return { st, e };
}
const firstBattle = (st: GameState) => Object.values(getSimMeta(st).battles)[0];

describe('first-seen surprise', () => {
  it('unseen mobile armour gets a modest, capped opening bonus and says so in the report', () => {
    const { st, e } = setup(3);
    const b = firstBattle(st);
    expect(b.surprise).toBeGreaterThan(0.05);
    expect(b.surprise).toBeLessThanOrEqual(0.3);
    e.step(40);
    const rep = st.reports[0];
    expect(rep.reasons.some((r) => r.startsWith('Surprise:'))).toBe(true);
  });
  it('no bonus without fog of war, for stationary foot troops barely, or when sighted 3+ hours earlier', () => {
    expect(firstBattle(setup(3, { fog: false }).st).surprise).toBe(0);
    expect(firstBattle(setup(3, { firstSeenHoursAgo: 4 }).st).surprise).toBe(0);
    const inf = setup(3, { attType: 'infantry', moving: false }).st;
    expect(firstBattle(inf)?.surprise ?? 0).toBeLessThan(0.06);
  });
  it('a lapsed sighting counts as unseen; a recent one fades the bonus', () => {
    const lapsed = firstBattle(setup(3, { firstSeenHoursAgo: 4 }).st).surprise; // last seen 0 min ago -> still current spell, 4 h old
    const fresh = firstBattle(setup(3, { firstSeenHoursAgo: 1 }).st).surprise;
    const never = firstBattle(setup(3).st).surprise;
    expect(lapsed).toBe(0);
    expect(fresh).toBeGreaterThan(0);
    expect(fresh).toBeLessThan(never);
  });
  it('entrenchment and recon reduce it', () => {
    const base = firstBattle(setup(3).st).surprise;
    expect(firstBattle(setup(3, { dug: 80 }).st).surprise).toBeLessThan(base);
    expect(firstBattle(setup(3, { recon: true }).st).surprise).toBeLessThan(base);
  });
  it('cannot make a weak attack win', () => {
    let wins = 0;
    for (let s = 1; s <= 30; s++) {
      const { st, e } = setup(s * 7919, { attType: 'infantry', defCount: 3, dug: 40 });
      e.step(36);
      const a = st.units['A0'];
      const dAlive = ['D0', 'D1', 'D2'].some((id) => !st.units[id].destroyed && st.units[id].moveStatus !== 'retreating');
      if ((a.destroyed || a.moveStatus === 'retreating') === false && !dAlive) wins++;
    }
    expect(wins).toBeLessThanOrEqual(1);
  });
});
