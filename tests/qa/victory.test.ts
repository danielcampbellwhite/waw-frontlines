import { describe, expect, it } from 'vitest';
import type { Ending, Objective, ScenarioDefinition } from '../../src/core/types';
import { Terrain } from '../../src/core/types';
import { createEngine } from '../../src/sim';
import { makeWorld, mkUnit, SETTINGS } from '../simfixture';
import { J, loadWorld, mkEngine } from './harness';

const ENDINGS: Ending[] = ['decisive_victory', 'strategic_victory', 'limited_victory', 'stalemate', 'defeat'];
function obj(id: string, tier: Objective['tier'], side: Objective['side'], points: number, condition: Objective['condition']): Objective {
  return { id, tier, side, title: id, description: id, condition, points, status: 'pending' };
}
function fixture(objectives: Objective[], tiers?: ScenarioDefinition['victoryTiers'], extraUnits: ReturnType<typeof mkUnit>[] = [], endDate?: string) {
  const w = makeWorld({ flat: Terrain.Plains, objectives, units: extraUnits });
  if (tiers) w.scenario.victoryTiers = tiers;
  if (endDate) w.scenario.endDate = endDate;
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'GER', settings: { ...SETTINGS, randomEvents: false }, seed: 3, disableAI: true });
  return { w, e };
}

describe('objectives / victory', () => {
  it('forced capture: German unit on a French town flips it, achieves the primary and ends the campaign with an Ending', () => {
    const g = mkUnit('G', 'GER', 'infantry', [1.2, 51.5]);
    const { w, e } = fixture([obj('cap', 'primary', 'axis', 100, { kind: 'capture_location', locationId: 'lille' })], undefined, [g]);
    const lille = w.scenario.locations.find((l) => l.id === 'lille')!;
    e.getState().units['G'].pos = [lille.pos[0], lille.pos[1]];
    e.step(80);
    const s = e.getState();
    console.log('[victory] capture ->', JSON.stringify(s.result), 'lille owner', s.locations['lille'].owner, 'at tick', s.clock.minutes / 60);
    expect(s.locations['lille'].owner).toBe('GER');
    expect(s.objectives[0].status).toBe('achieved');
    expect(s.result).toBeDefined();
    expect(ENDINGS).toContain(s.result!.ending);
    expect(['decisive_victory', 'strategic_victory']).toContain(s.result!.ending);
    expect(s.result!.score).toBe(100);
    // post-result: sim frozen, commands refused
    const m = s.clock.minutes; e.step(10); expect(e.getState().clock.minutes).toBe(m);
    expect(e.dispatch({ type: 'set_posture', unitIds: ['G'], posture: 'hold' }, 'axis').ok).toBe(false);
    expect(e.advance(5000)).toBe(0);
  });
  it('hold objective fails when the location is lost, achieved at untilMinutes', () => {
    const { e } = fixture([obj('hold', 'primary', 'allies', 100, { kind: 'hold_location', locationId: 'lille', untilMinutes: 24 * 60 })], undefined, [], '1940-05-20T00:00:00Z');
    e.step(250);
    const s = e.getState();
    expect(s.objectives[0].status).toBe('achieved');
    expect(s.result).toBeDefined();
  });
  it('time up with nothing achieved resolves to a defined ending (never undefined/NaN score)', () => {
    const { e } = fixture([obj('x', 'primary', 'axis', 100, { kind: 'capture_location', locationId: 'paris' })], undefined, [], '1940-05-12T00:00:00Z');
    e.step(60);
    const r = e.getState().result!;
    console.log('[victory] timeup/no objectives ->', JSON.stringify(r));
    expect(r).toBeDefined(); expect(ENDINGS).toContain(r.ending); expect(Number.isFinite(r.score)).toBe(true); expect(r.endedAt).toBeGreaterThanOrEqual(48 * 60);
  });
  it('victoryTiers are honoured: lenient vs strict tiers change the ending for the same score', () => {
    const run = (tiers: ScenarioDefinition['victoryTiers']) => {
      const g = mkUnit('G', 'GER', 'infantry', [1.2, 51.5]);
      const { w, e } = fixture([obj('cap', 'secondary', 'axis', 40, { kind: 'capture_location', locationId: 'lille' }), obj('p', 'primary', 'axis', 60, { kind: 'capture_location', locationId: 'paris' })], tiers, [g], '1940-05-14T00:00:00Z');
      const lille = w.scenario.locations.find((l) => l.id === 'lille')!;
      e.getState().units['G'].pos = [lille.pos[0], lille.pos[1]];
      e.step(120); return e.getState().result!;
    };
    const lenient = run({ axis: { decisive: 0.4, strategic: 0.3, limited: 0.2, stalemate: 0.1 }, allies: { decisive: 1, strategic: 1, limited: 1, stalemate: 1 } });
    const strict = run({ axis: { decisive: 1, strategic: 0.95, limited: 0.9, stalemate: 0.8 }, allies: { decisive: 1, strategic: 1, limited: 1, stalemate: 1 } });
    console.log('[victory] tiers lenient', lenient.ending, 'strict', strict.ending);
    expect(lenient.score).toBe(40); expect(strict.score).toBe(40);
    expect(lenient.ending).toBe('decisive_victory');
    expect(strict.ending).toBe('defeat');
  });
  it('elimination of the player ends the campaign as defeat', () => {
    const { e } = fixture([obj('x', 'primary', 'axis', 100, { kind: 'capture_location', locationId: 'paris' })], undefined, [mkUnit('G', 'GER', 'infantry', [3, 51.5])]);
    for (const u of Object.values(e.getState().units)) if (u.side === 'axis') u.destroyed = true;
    e.step(2);
    expect(e.getState().result?.ending).toBe('defeat');
  });
  it('control_fraction and destroy_units conditions evaluate', () => {
    const { e } = fixture([obj('cf', 'secondary', 'allies', 10, { kind: 'control_fraction', fraction: 0.3 }), obj('du', 'secondary', 'axis', 10, { kind: 'destroy_units', side: 'allies', fraction: 0.5 })], undefined, [mkUnit('F2', 'FRA', 'infantry', [0.5, 51.0])]);
    for (const u of Object.values(e.getState().units)) if (u.side === 'allies') u.destroyed = true;
    e.step(6);
    const o = e.getState().objectives;
    expect(o.find((x) => x.id === 'cf')?.status).toBe('achieved');
    expect(o.find((x) => x.id === 'du')?.status).toBe('achieved');
  });
});

describe('real campaign runs to its end date', () => {
  for (const nation of ['GER', 'FRA', 'GBR'] as const) {
    it(`standard, player=${nation}: result present at/after end date or earlier via primaries`, () => {
      const w = loadWorld();
      const e = mkEngine(w, nation, 2024);
      const endMin = Math.round((Date.parse(w.def.endDate) - Date.parse(w.def.startDate)) / 60000);
      let guard = 0; while (!e.getState().result && guard++ < 1300) e.step(10);
      const s = e.getState();
      console.log(`[victory] real ${nation}:`, JSON.stringify(s.result), 'ticks', s.clock.minutes / 60, 'end tick', endMin / 60, 'objectives', s.objectives.filter((o) => o.side === s.playerSide).map((o) => o.id.split('.').pop() + ':' + o.status).join(' '));
      expect(s.result).toBeDefined();
      expect(ENDINGS).toContain(s.result!.ending);
      expect(s.result!.endedAt).toBeLessThanOrEqual(endMin + 600);
      expect(Number.isFinite(s.result!.score)).toBe(true);
      expect(s.history.some((h) => /Campaign ended/.test(h.text))).toBe(true);
      const j = J(s); e.step(5); expect(J(e.getState())).toBe(j); // frozen
    }, 300_000);
  }
});
