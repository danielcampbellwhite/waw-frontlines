import { describe, it, expect } from 'vitest';
import { validateScenario, getScenarioDefinition, getScenarioSidecar, listScenarios } from '../src/data/index.ts';

const ids = listScenarios().map((s) => s.id).filter((i) => getScenarioDefinition(i));
describe('ice fields', () => {
  it('only stalingrad.short sets ice, with From <= Full and no thaw', () => {
    for (const id of ids) {
      const d = getScenarioDefinition(id)!;
      if (id === 'stalingrad.short') {
        expect(d.iceFromHour).toBeDefined(); expect(d.iceFullHour).toBeGreaterThanOrEqual(d.iceFromHour!);
        expect(d.iceThawHour).toBeUndefined();
      } else { expect(d.iceFromHour).toBeUndefined(); expect(d.iceFullHour).toBeUndefined(); }
    }
  });
  it('validator rejects inverted or half-set ice', () => {
    const d = structuredClone(getScenarioDefinition('stalingrad.short')!); const sc = getScenarioSidecar('stalingrad.short');
    d.iceFullHour = d.iceFromHour! - 1; expect(validateScenario(d, sc).join()).toMatch(/iceFromHour/);
    const h = structuredClone(getScenarioDefinition('stalingrad.short')!); delete h.iceFullHour; expect(validateScenario(h, sc).join()).toMatch(/both/);
    const t = structuredClone(getScenarioDefinition('stalingrad.short')!); t.iceThawHour = t.iceFullHour! - 1; expect(validateScenario(t, sc).join()).toMatch(/iceThawHour/);
  });
});
describe('port and airlift fields', () => {
  it('Crusader carries the sourced N05 capacities', () => {
    const d = getScenarioDefinition('crusader.short')!;
    expect(d.locations.find((l) => l.id === 'tobruk')!.throughputTonsPerDay).toBe(1500);
    expect(d.locations.find((l) => l.id === 'benghazi')!.throughputTonsPerMonth).toBe(15000);
  });
  it('Stalingrad airlift is the 20% upper bound of 680 t/day', () => {
    const d = getScenarioDefinition('stalingrad.short')!;
    const sum = d.locations.reduce((a, l) => a + (l.airliftTonsPerDay ?? 0), 0); expect(sum).toBeGreaterThan(0); expect(sum).toBeLessThanOrEqual(0.2 * 680);
  });
  it('validator rejects bad values', () => {
    const sc = getScenarioSidecar('crusader.short');
    const a = structuredClone(getScenarioDefinition('crusader.short')!); a.locations[0].throughputTonsPerDay = -5; expect(validateScenario(a, sc).join()).toMatch(/throughputTonsPerDay/);
    const b = structuredClone(getScenarioDefinition('crusader.short')!); b.locations[0].besiegedShare = 1.5; expect(validateScenario(b, sc).join()).toMatch(/besiegedShare/);
    const c = structuredClone(getScenarioDefinition('crusader.short')!); c.locations[0].throughputTonsPerDay = 10; c.locations[0].throughputTonsPerMonth = 300; expect(validateScenario(c, sc).join()).toMatch(/both/);
  });
});

import { validateEventEffects } from '../src/data/validate.ts';
import { getHistoricalEvents } from '../src/data/index.ts';
describe('event effects', () => {
  const camp: Record<string, string[]> = { fall_of_france: ['fall_of_france.standard', 'fall_of_france.short'], bulge: ['bulge.short'], crusader: ['crusader.short'], stalingrad: ['stalingrad.short'] };
  for (const [c, scs] of Object.entries(camp)) {
    it(`${c} events have valid effects and notes`, () => {
      for (const sc of scs) for (const ev of getHistoricalEvents(c, sc)) expect(validateEventEffects(ev, getScenarioDefinition(sc)!)).toEqual([]);
    });
  }
  it('the Short omits the Dutch capitulation event it cannot apply, Standard keeps it', () => {
    expect(getHistoricalEvents('fall_of_france', 'fall_of_france.short').some((e) => e.id === 'fof.ev.dutch_capitulation')).toBe(false);
    expect(getHistoricalEvents('fall_of_france', 'fall_of_france.standard').some((e) => e.id === 'fof.ev.dutch_capitulation')).toBe(true);
  });
  it('flags unknown ops, missing fields and unknown locations', () => {
    const def = getScenarioDefinition('crusader.short')!;
    const bad = (effects: Record<string, unknown>[]) => validateEventEffects({ id: 'x', effects, effectsNote: 'n' }, def).join();
    expect(bad([{ op: 'portrelief', locationId: 'tobruk' }])).toMatch(/unknown effect op/);
    expect(bad([{ op: 'port_relief' }])).toMatch(/locationId/);
    expect(bad([{ op: 'port_relief', locationId: 'nowhere' }])).toMatch(/exists/);
    expect(validateEventEffects({ id: 'x', effectsNote: 'n' }, def).join()).toMatch(/effectsNote/);
    expect(bad([{ op: 'port_relief', locationId: 'tobruk' }])).toBe('');
  });
});
