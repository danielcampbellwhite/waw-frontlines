import { describe, expect, it } from 'vitest';
import type { ScenarioDefinition } from '../src/core/types.ts';
import { getHistoricalEvents, getScenarioDefinition, getScenarioSidecar, listScenarios, loadScenario, validateScenario } from '../src/data/index.ts';

const IDS = ['fall_of_france.standard', 'fall_of_france.short'];
const clone = <T,>(x: T): T => structuredClone(x);
const get = (id: string) => clone(getScenarioDefinition(id)!);

describe('delivered scenarios validate', () => {
  for (const id of IDS) {
    it(`${id} passes validator (with sidecar)`, () => {
      expect(validateScenario(getScenarioDefinition(id)!, getScenarioSidecar(id))).toEqual([]);
    });
    it(`${id} has the playable nations GER, FRA, GBR`, () => {
      expect(getScenarioDefinition(id)!.playableNations.map((p) => p.nation).sort()).toEqual(['FRA', 'GBR', 'GER']);
    });
  }
  it('standard scenario has all ten panzer divisions and 3 army groups', () => {
    const d = get('fall_of_france.standard');
    for (let n = 1; n <= 10; n++) expect(d.units.some((u) => u.id === `ger.pz.${String(n).padStart(3, '0')}`), `Pz ${n}`).toBe(true);
    expect(d.units.filter((u) => u.id.startsWith('ger.hq.hg')).length).toBe(3);
  });
  it('event data dates are within the campaign and have sources', () => {
    const ev = getHistoricalEvents('fall_of_france');
    expect(ev.length).toBeGreaterThan(10);
    for (const e of ev) { expect(e.src.length).toBeGreaterThan(0); expect(e.date >= '1940-05-10' && e.date <= '1940-06-25').toBe(true); }
  });
});

describe('validator rejects broken scenarios', () => {
  const base = 'fall_of_france.standard';
  const cases: [string, (d: ScenarioDefinition) => void, RegExp][] = [
    ['duplicate unit id', (d) => { d.units[1].id = d.units[0].id; }, /duplicate unit id/],
    ['unknown parent', (d) => { d.units[5].parentId = 'nope'; }, /parentId nope unknown/],
    ['unit outside bbox', (d) => { d.units[0].pos = [50, 50]; }, /outside bbox/],
    ['invalid nation', (d) => { (d.units[0] as { nation: string }).nation = 'XXX'; }, /invalid nation/],
    ['objective references missing location', (d) => { (d.objectives[0].condition as { locationId: string }).locationId = 'atlantis'; }, /location atlantis unknown/],
    ['supply source references missing location', (d) => { d.supplySources.GER = ['atlantis']; }, /supplySources GER: location atlantis unknown/],
    ['location outside bbox', (d) => { d.locations[0].pos = [100, 0]; }, /outside bbox/],
    ['duplicate location', (d) => { d.locations[1].id = d.locations[0].id; }, /duplicate location/],
    ['empty sources', (d) => { d.sources = []; }, /sources\[\] empty/],
    ['playable nation missing', (d) => { d.playableNations[0].nation = 'USA'; }, /not in nations/],
    ['weather probs not 1', (d) => { d.weatherProfile[0].probs = { clear: 0.9, rain: 0.9 }; }, /probabilities sum/],
    ['end before start', (d) => { d.endDate = '1900-01-01T00:00:00Z'; }, /endDate must be after/],
  ];
  for (const [name, mutate, re] of cases) {
    it(name, () => {
      const d = get(base);
      mutate(d);
      expect(validateScenario(d, getScenarioSidecar(base)).join('\n')).toMatch(re);
    });
  }
  it('unit without sourceRef in sidecar fails', () => {
    const d = get(base);
    const sc = clone(getScenarioSidecar(base)!);
    delete sc.units[d.units[0].id];
    expect(validateScenario(d, sc).join('\n')).toMatch(/has no sourceRef/);
  });
  it('sidecar referencing unknown source id fails', () => {
    const d = get(base);
    const sc = clone(getScenarioSidecar(base)!);
    sc.units[d.units[0].id].sources = ['S99'];
    expect(validateScenario(d, sc).join('\n')).toMatch(/unknown source id S99/);
  });
  it('location without sourceRef fails', () => {
    const d = get(base);
    const sc = clone(getScenarioSidecar(base)!);
    delete sc.locations[d.locations[0].id];
    expect(validateScenario(d, sc).join('\n')).toMatch(/location .* has no sourceRef/);
  });
});

describe('listScenarios / loadScenario', () => {
  it('lists available and planned entries; planned are not playable', () => {
    const l = listScenarios();
    expect(l.filter((s) => s.playable).map((s) => s.id).sort()).toEqual([...IDS, 'bulge.short', 'crusader.short', 'stalingrad.short'].sort());
    const planned = l.filter((s) => s.status === 'planned');
    expect(planned.length).toBeGreaterThanOrEqual(6);
    for (const p of planned) { expect(p.playable).toBe(false); expect(p.statusLabel).toBe('Coming in Phase 4'); }
  });
  it('refuses to load planned and unknown scenarios', async () => {
    const planned = listScenarios().find((s) => s.status === 'planned')!;
    await expect(loadScenario(planned.id, async () => ({}))).rejects.toThrow(/planned/);
    await expect(loadScenario('nope', async () => ({}))).rejects.toThrow(/Unknown/);
  });
  it('loads via injected loader', async () => {
    const terrain = { bbox: { west: -6, south: 44, east: 10, north: 55 }, cellDeg: 1, cols: 16, rows: 11, cells: new Array(176).fill(1) };
    const calls: string[] = [];
    const r = await loadScenario('fall_of_france.standard', async (f) => { calls.push(f); return f.startsWith('terrain') ? terrain : []; });
    expect(calls.sort()).toEqual(['infra_westeurope.json', 'terrain_westeurope.json']);
    expect(r.def.units.length).toBeGreaterThan(100);
    expect(r.infra).toEqual([]);
  });
  it('rejects terrain that does not cover the bbox', async () => {
    const terrain = { bbox: { west: 0, south: 48, east: 5, north: 51 }, cellDeg: 1, cols: 1, rows: 1, cells: [1] };
    await expect(loadScenario('fall_of_france.standard', async (f) => (f.startsWith('terrain') ? terrain : []))).rejects.toThrow(/cover/);
  });
});

describe('historical event effects', () => {
  const std = getScenarioDefinition('fall_of_france.standard')!;
  const locs = new Set(std.locations.map((l) => l.id));
  const nations = new Set(std.nations.map((n) => n.id));
  const unitIds = new Set(std.units.map((u) => u.id));
  const OPS = ['resource', 'unit_stat', 'unit_manpower', 'location_owner', 'location_damage', 'weather', 'reinforce', 'log'];
  type Fx = { op: string; nation?: string; owner?: string; locationId?: string; unitIds?: string[]; fraction?: number; delta?: number; text?: string };
  const events = getHistoricalEvents('fall_of_france') as unknown as { id: string; src: string[]; effects?: Fx[]; effectsNote?: string }[];
  it('some events carry structured effects, each with a rationale', () => {
    const withFx = events.filter((e) => e.effects?.length);
    expect(withFx.length).toBeGreaterThanOrEqual(2);
    for (const e of withFx) expect(e.effectsNote, e.id).toBeTruthy();
  });
  it('every effect is a known op with valid references', () => {
    for (const e of events) for (const fx of e.effects ?? []) {
      expect(OPS, `${e.id} op`).toContain(fx.op);
      if (fx.nation) expect(nations.has(fx.nation as never), `${e.id} nation ${fx.nation}`).toBe(true);
      if (fx.op === 'location_owner') { expect(locs.has(fx.locationId!), `${e.id} loc`).toBe(true); expect(nations.has(fx.owner as never)).toBe(true); }
      if (fx.op === 'location_damage') expect(locs.has(fx.locationId!)).toBe(true);
      for (const u of fx.unitIds ?? []) expect(unitIds.has(u), `${e.id} unit ${u}`).toBe(true);
      if (fx.op === 'unit_manpower') expect(fx.fraction! >= -1 && fx.fraction! <= 1).toBe(true);
      if (fx.op === 'log') expect(fx.text).toBeTruthy();
    }
  });
  it('events validate via the event engine spec validator and apply without throwing', async () => {
    const { validateHistoricalSpec, applyEffects } = await import('../src/events/historical.ts');
    for (const e of events as unknown as Record<string, unknown>[]) {
      const spec = { ...(e as object), sources: e.src, date: e.date } as Parameters<typeof validateHistoricalSpec>[0];
      expect(validateHistoricalSpec(spec), String(e.id)).toEqual([]);
    }
    const logs: string[] = [];
    const state = { units: { a: { id: 'a', nation: 'NED', side: 'allies', manpower: 100, manpowerMax: 100, destroyed: false } }, locations: { rotterdam: { owner: 'NED' }, the_hague: { owner: 'NED' }, amsterdam: { owner: 'NED' } }, nations: {}, weather: { temperatureC: 10 } };
    const env = { state, now: 0, log: (t: string) => logs.push(t) } as unknown as Parameters<typeof applyEffects>[0];
    applyEffects(env, events.find((x) => x.id === 'fof.ev.dutch_capitulation')!.effects as Parameters<typeof applyEffects>[1]);
    expect(state.locations.rotterdam.owner).toBe('GER');
    expect(state.units.a.manpower).toBe(0);
    expect(logs.length).toBe(1);
  });
});
