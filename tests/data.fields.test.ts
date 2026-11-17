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
  const camp: Record<string, string[]> = { fall_of_france: ['fall_of_france.standard', 'fall_of_france.short'], bulge: ['bulge.short'], crusader: ['crusader.short'], stalingrad: ['stalingrad.short'], normandy: ['normandy.short'] };
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

describe('normandy scenario fields', () => {
  const sid = 'normandy.short';
  const base = () => structuredClone(getScenarioDefinition(sid)!);
  const side = getScenarioSidecar(sid);
  const errs = (d: ReturnType<typeof base>) => validateScenario(d, side).join('|');
  it('validates cleanly', () => { expect(errs(base())).toBe(''); });
  it('rejects bad landing values', () => {
    const d = base(); d.reinforcements.find((r) => r.landing)!.landing = { kind: 'amphibious', casualties: 0.9 };
    expect(errs(d)).toMatch(/landing\.casualties/);
    const d2 = base(); (d2.reinforcements.find((r) => r.landing)!.landing as { kind: string }).kind = 'glider';
    expect(errs(d2)).toMatch(/landing\.kind/);
  });
  it('rejects bad airSupremacy and carpetBombings', () => {
    const d = base(); d.airSupremacy = [{ side: 'allies', speedMul: 2 }];
    expect(errs(d)).toMatch(/speedMul/);
    const d2 = base(); d2.carpetBombings![0].radiusKm = 0;
    expect(errs(d2)).toMatch(/radiusKm/);
    const d3 = base(); d3.carpetBombings![0].pos = [10, 10];
    expect(errs(d3)).toMatch(/outside bbox/);
    const d4 = base(); d4.carpetBombings![1].id = d4.carpetBombings![0].id;
    expect(errs(d4)).toMatch(/duplicate carpetBombing/);
  });
  it('rejects bad location availableFromHour and rampHours', () => {
    const d = base(); d.locations.find((l) => l.id === 'arromanches')!.availableFromHour = -1;
    expect(errs(d)).toMatch(/availableFromHour/);
    const d2 = base(); d2.locations.find((l) => l.id === 'arromanches')!.rampHours = -5;
    expect(errs(d2)).toMatch(/rampHours/);
  });
  it('normandy events have valid effects', () => {
    for (const ev of getHistoricalEvents('normandy', sid)) expect(validateEventEffects(ev, getScenarioDefinition(sid)!)).toEqual([]);
  });
  it('rejects port ops on unknown locations', () => {
    const def = getScenarioDefinition(sid)!;
    const bad = (effects: Record<string, unknown>[]) => validateEventEffects({ id: 'x', effects, effectsNote: 'n' }, def).join();
    expect(bad([{ op: 'port_throughput', locationId: 'nowhere', factor: 0.1 }])).toMatch(/port_throughput/);
    expect(bad([{ op: 'port_available', locationId: 'cherbourg', fromHour: 'x' }])).toMatch(/port_available/);
    expect(bad([{ op: 'weather', kind: 'storm', hours: -1 }])).toMatch(/hours/);
  });
});

describe('seaSupply and weatherControl', () => {
  const sid = 'normandy.short';
  it('normandy sets both and validates', () => {
    const d = getScenarioDefinition(sid)!;
    expect(d.seaSupply).toBe(true); expect(d.weatherControl?.stormScale).toBe(0);
    expect(validateScenario(d, getScenarioSidecar(sid))).toEqual([]);
  });
  it('rejects bad values', () => {
    const d = structuredClone(getScenarioDefinition(sid)!);
    (d as { seaSupply: unknown }).seaSupply = 'yes'; d.weatherControl = { stormScale: -1, suppress: ['hail' as never] };
    const e = validateScenario(d, getScenarioSidecar(sid)).join('|');
    expect(e).toMatch(/seaSupply/); expect(e).toMatch(/stormScale/); expect(e).toMatch(/suppress/);
  });
  it('other scenarios do not set them', () => {
    for (const id of ['bulge.short', 'crusader.short', 'stalingrad.short']) expect(getScenarioDefinition(id)!.seaSupply).toBeUndefined();
  });
});

describe('captureBlockKm', () => {
  it('only normandy sets it, to 6.5', () => {
    expect(getScenarioDefinition('normandy.short')!.captureBlockKm).toBe(6.5);
    for (const id of ['fall_of_france.standard', 'fall_of_france.short', 'bulge.short', 'crusader.short', 'stalingrad.short']) expect(getScenarioDefinition(id)!.captureBlockKm).toBeUndefined();
  });
  it('rejects values outside 4..15', () => {
    for (const v of [3, 16, NaN]) {
      const d = structuredClone(getScenarioDefinition('normandy.short')!); d.captureBlockKm = v;
      expect(validateScenario(d, getScenarioSidecar('normandy.short')).join('|')).toMatch(/captureBlockKm/);
    }
  });
});

describe('capture-activated supply hubs', () => {
  const sid = 'normandy.short';
  const errs = (d: ReturnType<typeof structuredClone>) => validateScenario(d as never, getScenarioSidecar(sid)).join('|');
  it('allows an enemy-owned location with rampHours as a source', () => {
    const d = structuredClone(getScenarioDefinition(sid)!);
    expect(d.locations.find((l) => l.id === 'cherbourg')!.rampHours).toBeDefined();
    d.supplySources.USA = [...d.supplySources.USA, 'cherbourg'];
    expect(errs(d)).toBe('');
  });
  it('rejects an enemy-owned location without rampHours', () => {
    const d = structuredClone(getScenarioDefinition(sid)!);
    d.supplySources.USA = [...d.supplySources.USA, 'caen'];
    expect(errs(d)).toMatch(/not the same side/);
  });
});
