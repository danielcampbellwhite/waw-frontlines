import { describe, expect, it, beforeEach } from 'vitest';
import { validateEventEffects } from '../src/data/validate';
import { milSpecial } from '../src/military/context';
import { nextFloat } from '../src/core/rng';
import type { GameState, Location, NationId, Unit, UnitType } from '../src/core/types';
import {
  applyEventChoice, clearHistoricalTemplates, forceFireEvent, getEventTemplate, listEventTemplates, registerBuiltinTemplates,
  applyEffects, registerEventTemplate, registerHistoricalEvent, registerHistoricalEventsFromData, unregisterEventTemplate, updateEvents, type EventContext,
} from '../src/events';

let uid = 0;
function mkUnit(nation: NationId, type: UnitType, pos: [number, number], extra: Partial<Unit> = {}): Unit {
  const id = `${nation}_${type}_${++uid}`;
  const side = nation === 'GER' ? 'axis' : 'allies';
  return {
    id, name: id, shortName: id, nation, side, type, domain: 'land', pos, manpower: 900, manpowerMax: 1000,
    equipment: { held: { tank_medium: 40, truck: 80, rifle: 800 }, authorised: { tank_medium: 50, truck: 90, rifle: 900 } },
    organisation: 80, morale: 70, experience: 40, fuel: 70, ammo: 70, supply: 70, fatigue: 40, readiness: 80, entrenchment: 10,
    moveStatus: 'stationary', combatStatus: 'idle', posture: 'hold', orders: [], kills: 0, ...extra,
  };
}
const loc = (id: string, kind: Location['kind'], pos: [number, number], owner: NationId, original: NationId = owner, value = 5): Location =>
  ({ id, name: id, kind, pos, owner, originalOwner: original, value, supplyCapacity: 100 });

function world(opts: Partial<GameState['settings']> = {}, seed = 5): GameState {
  uid = 0;
  const us: Unit[] = [
    mkUnit('FRA', 'infantry', [1.0, 51.0], { entrenchment: 10, morale: 30, fatigue: 70 }), mkUnit('FRA', 'infantry', [1.1, 51.05]),
    mkUnit('FRA', 'armoured', [1.0, 51.1]), mkUnit('FRA', 'mechanised', [1.05, 51.1]), mkUnit('FRA', 'hq', [0.9, 51.0]),
    mkUnit('GER', 'infantry', [1.2, 51.0]), mkUnit('GER', 'armoured', [1.6, 51.0]), mkUnit('GER', 'infantry', [2.0, 51.0]), mkUnit('GER', 'hq', [2.0, 51.1]),
  ];
  us.find((u) => u.type === 'hq' && u.nation === 'FRA')!.id; // exists
  const st: GameState = {
    schema: 1, scenarioId: 't', playerNation: 'FRA', playerSide: 'allies',
    settings: { difficulty: 'normal', aiAggression: 0.5, fogOfWar: true, historicalDeployment: true, randomEvents: true, logisticsDifficulty: 1, reinforcementAvailability: 1, historicalEventFrequency: 1, ...opts },
    clock: { minutes: 0, speed: 1, startMinutes: 0, accumulatorMs: 0 }, rng: { s: seed }, seed, idCounter: 1, units: {},
    nations: {
      FRA: { id: 'FRA', side: 'allies', name: 'France', playable: true, resources: { manpower: 600, fuel: 600, ammo: 600, equipment: 600, supplyPoints: 600 }, income: { manpower: 0, fuel: 0, ammo: 0, equipment: 0, supplyPoints: 0 }, reinforcements: [] },
      GER: { id: 'GER', side: 'axis', name: 'Germany', playable: true, resources: { manpower: 600, fuel: 600, ammo: 600, equipment: 600, supplyPoints: 600 }, income: { manpower: 0, fuel: 0, ammo: 0, equipment: 0, supplyPoints: 0 }, reinforcements: [] },
    },
    locations: {}, control: { bbox: { west: 0, south: 50, east: 4, north: 52 }, cellDeg: 1, cols: 4, rows: 2, nations: ['NEUTRAL', 'FRA', 'GER'], owner: [1, 1, 2, 2, 1, 1, 2, 2], contested: new Array(8).fill(0) },
    weather: { kind: 'clear', intensity: 0, temperatureC: -8, nextChangeMinutes: 0 }, supply: { nodes: [], unitSupplyDistKm: {}, cutOffUnits: [] },
    battles: {}, reports: [], operations: {}, events: [], eventState: {}, log: [], objectives: [], aiState: {}, special: {}, history: [],
  };
  for (const u of us) st.units[u.id] = u;
  for (const l of [
    loc('fra_depot', 'depot', [0.8, 51.0], 'FRA'), loc('fra_bridge', 'bridge', [1.1, 51.0], 'FRA'), loc('fra_port', 'port', [0.5, 51.5], 'FRA'),
    loc('ger_depot', 'depot', [2.5, 51.0], 'GER'), loc('ger_bridge', 'bridge', [2.0, 51.2], 'GER'), loc('ger_city', 'city', [2.4, 51.2], 'GER'),
    loc('occupied', 'town', [1.9, 51.4], 'GER', 'FRA', 4), loc('lonely', 'city', [1.3, 51.0], 'FRA', 'FRA', 6),
  ]) st.locations[l.id] = l;
  // a thinly held enemy objective near our forces (for the opportunity event)
  st.locations.liberated = loc('liberated', 'town', [0.7, 51.4], 'FRA', 'GER', 4);
  st.locations.thin = loc('thin', 'city', [1.4, 51.3], 'GER', 'GER', 7);
  return st;
}
const seeded = (seed: number, scenario?: EventContext['scenario']): EventContext => { const r = { s: seed }; return { rand: () => nextFloat(r), scenario }; };
const NOOP = new Set(['accept', 'write_off', 'press_on', 'ignore', 'decline']);

beforeEach(() => { registerBuiltinTemplates(); clearHistoricalTemplates(); });

describe('template library', () => {
  it('ships at least 15 dynamic/random templates, each complete', () => {
    const ts = listEventTemplates().filter((t) => t.kind !== 'historical');
    expect(ts.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ts.map((t) => t.id)).size).toBe(ts.length);
    for (const t of ts) {
      expect(t.title).toBeTruthy();
      for (const c of t.choices ?? []) { expect(c.label).toBeTruthy(); expect(c.effectSummary.length).toBeGreaterThan(10); }
      if (t.choices?.length) { expect(t.defaultChoiceId).toBeTruthy(); expect(t.choices.some((c) => c.id === t.defaultChoiceId)).toBe(true); }
    }
  });

  it('every choice of every template has a real effect on state (except explicit no-op choices)', () => {
    const ts = listEventTemplates().filter((t) => t.kind !== 'historical' && t.choices?.length);
    expect(ts.length).toBeGreaterThanOrEqual(12);
    for (const t of ts) {
      const base = world();
      base.weather.kind = t.id === 'evt_mud_thaw' ? 'rain' : 'clear';
      const ev = forceFireEvent(base, seeded(11), t.id, 'allies');
      expect(ev, `${t.id} should be fireable in the test world`).toBeTruthy();
      expect(ev!.choices!.length).toBeGreaterThan(0);
      for (const c of ev!.choices!) {
        const s = structuredClone(base);
        const before = JSON.stringify({ ...s, events: [], log: [], history: [], eventState: {} });
        const res = applyEventChoice(s, ev!.id, c.id);
        expect(res.ok, `${t.id}/${c.id}`).toBe(true);
        const after = JSON.stringify({ ...s, events: [], log: [], history: [], eventState: {} });
        if (NOOP.has(c.id)) continue;
        expect(after, `${t.id}/${c.id} should change state`).not.toBe(before);
        expect(s.events.find((e) => e.id === ev!.id)!.resolved).toBe(true);
        expect(s.events.find((e) => e.id === ev!.id)!.chosen).toBe(c.id);
      }
    }
  });
});

describe('robustness', () => {
  it('every template can fire for either side without throwing, including on a degenerate world', () => {
    for (const t of listEventTemplates().filter((x) => x.kind !== 'historical')) {
      for (const side of ['allies', 'axis'] as const) {
        const s = world(); forceFireEvent(s, seeded(3), t.id, side);
        const empty = world(); empty.units = {}; empty.locations = {};
        expect(() => forceFireEvent(empty, seeded(3), t.id, side)).not.toThrow();
      }
    }
  });
});

describe('applyEventChoice', () => {
  it('validates events and choices and refuses double resolution', () => {
    const s = world();
    const ev = forceFireEvent(s, seeded(1), 'evt_hard_frost', 'allies')!;
    expect(applyEventChoice(s, 'nope', 'x').ok).toBe(false);
    expect(applyEventChoice(s, ev.id, 'bogus').ok).toBe(false);
    expect(applyEventChoice(s, ev.id, 'winter_kit').ok).toBe(true);
    expect(applyEventChoice(s, ev.id, 'endure').ok).toBe(false);
    expect(s.history.length).toBeGreaterThan(0);
  });

  it('charges real resources: winter kit costs equipment', () => {
    const s = world();
    const ev = forceFireEvent(s, seeded(1), 'evt_hard_frost', 'allies')!;
    const before = s.nations.FRA.resources.equipment;
    applyEventChoice(s, ev.id, 'winter_kit');
    expect(s.nations.FRA.resources.equipment).toBe(before - 40);
  });

  it('hides choices the player cannot afford', () => {
    const s = world();
    s.nations.FRA.resources.equipment = 5;
    const ev = forceFireEvent(s, seeded(1), 'evt_hard_frost', 'allies')!;
    expect(ev.choices!.map((c) => c.id)).toEqual(['endure']);
  });

  it('unanswered choice events expire onto their default choice', () => {
    const s = world({ randomEvents: false });
    const ev = forceFireEvent(s, seeded(1), 'evt_hard_frost', 'allies')!;
    expect(ev.resolved).toBe(false);
    s.clock.minutes += 721;
    updateEvents(s, seeded(2));
    const e = s.events.find((x) => x.id === ev.id)!;
    expect(e.resolved).toBe(true);
    expect(e.chosen).toBe('endure');
  });
});

describe('dynamic event scheduling', () => {
  function run(seed: number, ticks = 600, opts: Partial<GameState['settings']> = {}) {
    const s = world(opts, seed);
    const ctx = seeded(seed);
    const seq: string[] = [];
    for (let i = 0; i < ticks; i++) {
      s.clock.minutes += 60;
      // keep weather moving so weather templates are eligible sometimes
      if (i % 40 === 0) s.weather.kind = 'clear';
      const n = s.events.length;
      updateEvents(s, ctx);
      for (let k = n; k < s.events.length; k++) seq.push(s.events[k].templateId);
      for (const e of s.events) if (!e.resolved && e.choices?.length && s.clock.minutes - e.firedAt > 60) applyEventChoice(s, e.id, e.choices[0].id);
    }
    return { s, seq };
  }

  it('fires a reasonable number of events and is reproducible for the same seed', () => {
    const a = run(3), b = run(3);
    const ai = ((a.s.eventState.aiLog as unknown[]) ?? []).length;
    expect(a.seq.length + ai).toBeGreaterThan(8);
    expect(a.seq.length).toBeGreaterThan(2);
    expect(a.seq).toEqual(b.seq);
    expect(JSON.stringify(a.s.eventState)).toBe(JSON.stringify(b.s.eventState));
  });

  it('different seeds give different event sequences', () => {
    const seqs = [1, 2, 3, 4].map((x) => run(x).seq.join(','));
    expect(new Set(seqs).size).toBeGreaterThan(1);
    expect(new Set(seqs).size).toBeGreaterThanOrEqual(3);
  });

  it('randomEvents=false disables dynamic/random events', () => {
    expect(run(3, 300, { randomEvents: false }).seq).toHaveLength(0);
  });

  it('honours template cooldowns and the pending-choice cap', () => {
    const s = world();
    const ctx = seeded(1);
    expect(forceFireEvent(s, ctx, 'evt_hard_frost', 'allies')).toBeTruthy();
    // no auto-resolution: pending stays at 1; roll many ticks, never exceeds cap + forced one
    for (let i = 0; i < 400; i++) { s.clock.minutes += 60; updateEvents(s, ctx); }
    const pending = s.events.filter((e) => !e.resolved && e.choices?.length);
    expect(pending.length).toBeLessThanOrEqual(3);
    // cooldown: hard frost (96h) may not fire twice within its cooldown window
    const frosts = s.events.filter((e) => e.templateId === 'evt_hard_frost' && e.side === 'allies').map((e) => e.firedAt);
    for (let i = 1; i < frosts.length; i++) expect(frosts[i] - frosts[i - 1]).toBeGreaterThanOrEqual(96 * 60);
  });

  it('events on the AI side are applied silently with no player-visible event', () => {
    const s = world();
    const before = s.nations.GER.resources.supplyPoints;
    const ev = forceFireEvent(s, seeded(2), 'evt_convoy_loss', 'axis');
    expect(ev).toBeNull();
    expect(s.events).toHaveLength(0);
    expect(s.nations.GER.resources.supplyPoints).toBeLessThan(before);
    expect((s.eventState.aiLog as { templateId: string }[])[0].templateId).toBe('evt_convoy_loss');
  });

  it('enemy reinforcements schedule a real arrival for the enemy nation', () => {
    const s = world();
    forceFireEvent(s, seeded(2), 'evt_enemy_reinforcements');
    expect(s.nations.GER.reinforcements.length).toBe(1);
    const arr = s.nations.GER.reinforcements[0];
    expect(arr.unit.nation).toBe('GER');
    expect(arr.atMinutes).toBeGreaterThan(s.clock.minutes);
    expect(s.units[arr.unit.id]).toBeUndefined(); // not on the map until the arrival processor places it
  });

  it('strategic reserve choice spends resources and schedules an arrival', () => {
    const s = world();
    const ev = forceFireEvent(s, seeded(2), 'evt_strategic_reserve', 'allies')!;
    const m = s.nations.FRA.resources.manpower;
    expect(applyEventChoice(s, ev.id, 'infantry').ok).toBe(true);
    expect(s.nations.FRA.resources.manpower).toBe(m - 100);
    expect(s.nations.FRA.reinforcements.length).toBe(1);
  });

  it('intelligence breakthrough writes real intel memory for the beneficiary', () => {
    const s = world();
    const ev = forceFireEvent(s, seeded(2), 'evt_intel_breakthrough', 'allies')!;
    applyEventChoice(s, ev.id, 'distribute');
    const revealed = Object.values(s.units).filter((u) => u.side === 'axis' && u.lastSeenBy?.allies);
    expect(revealed.length).toBeGreaterThan(0);
  });

  it('is deterministic when resolving choices (uses state.rng only)', () => {
    const a = world(), b = world();
    const ea = forceFireEvent(a, seeded(9), 'evt_breakdowns', 'allies')!;
    const eb = forceFireEvent(b, seeded(9), 'evt_breakdowns', 'allies')!;
    applyEventChoice(a, ea.id, 'field_repairs'); applyEventChoice(b, eb.id, 'field_repairs');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('historical events', () => {
  const scenario = { startDate: '1940-05-10T00:00:00Z', eventTemplateIds: ['hist_a', 'hist_b', 'hist_c'] } as EventContext['scenario'];

  it('rejects events without a date or citations (no invented history)', () => {
    expect(() => registerHistoricalEvent({ id: 'bad1', date: '1940-05-10T00:00:00Z', title: 't', body: 'b', sources: [] })).toThrow(/sources/);
    expect(() => registerHistoricalEvent({ id: 'bad2', date: 'someday', title: 't', body: 'b', sources: ['x'] })).toThrow(/date/);
    expect(() => registerEventTemplate({ id: 'bad3', kind: 'historical', title: 't', body: 'b' })).toThrow();
  });

  it('fires once, at its date, applying declarative effects', () => {
    registerHistoricalEvent({
      id: 'hist_a', date: '1940-05-12T06:00:00Z', title: 'Test crossing', body: 'A crossing happened.', sources: ['src_test'],
      effects: [{ op: 'resource', nation: 'FRA', key: 'fuel', delta: -100 }, { op: 'unit_stat', side: 'axis', stat: 'morale', delta: 10 }, { op: 'log', text: 'extra log' }],
    });
    const s = world({ randomEvents: false });
    const ctx = seeded(1, scenario);
    s.clock.minutes = 2 * 24 * 60; // 12 May 00:00 - before 06:00
    updateEvents(s, ctx);
    expect(s.events).toHaveLength(0);
    s.clock.minutes += 6 * 60;
    const m0 = s.units[Object.keys(s.units).find((k) => s.units[k].side === 'axis')!].morale;
    updateEvents(s, ctx);
    expect(s.events).toHaveLength(1);
    expect(s.events[0].kind).toBe('historical');
    expect(s.nations.FRA.resources.fuel).toBe(500);
    expect(s.units[Object.keys(s.units).find((k) => s.units[k].side === 'axis')!].morale).toBe(m0 + 10);
    updateEvents(s, ctx); s.clock.minutes += 600; updateEvents(s, ctx);
    expect(s.events).toHaveLength(1); // only once
    expect(getEventTemplate('hist_a')!.sources).toEqual(['src_test']);
  });

  it('port_relief effect marks a port as relieved by sea (and can end it)', () => {
    registerHistoricalEvent({
      id: 'hist_relief', date: '1940-05-10T00:00:00Z', title: 'Sea relief', body: 'Ships get through.', sources: ['s'],
      effects: [{ op: 'port_relief', locationId: 'fra_port' }, { op: 'port_relief', locationId: 'no_such_port' }],
    });
    const s = world({ randomEvents: false });
    s.clock.minutes = 3 * 24 * 60;
    updateEvents(s, seeded(1, { ...scenario, eventTemplateIds: ['hist_relief'] } as EventContext['scenario']));
    expect(milSpecial(s).portRelief.fra_port).toBe(true);
    expect(milSpecial(s).portRelief.no_such_port).toBeUndefined();
    applyEffects({ state: s } as never, [{ op: 'port_relief', locationId: 'fra_port', on: false }]);
    expect(milSpecial(s).portRelief.fra_port).toBeUndefined();
  });

  it('port_throughput, port_available and weather ops model the Great Storm (wreck, hold weather, repair)', () => {
    const s = world({ randomEvents: false });
    s.clock.minutes = 312 * 60; // 19 Jun 1944 from 6 Jun 00:00
    applyEffects({ state: s, now: s.clock.minutes, log: () => undefined } as never, [
      { op: 'port_throughput', locationId: 'fra_port', factor: 0.1, hours: 72 },
      { op: 'port_throughput', locationId: 'no_such_port', factor: 0 },
      { op: 'port_available', locationId: 'fra_port', fromHour: 400, rampHours: 24 },
      { op: 'weather', kind: 'storm', intensity: 0.9, hours: 72 },
    ]);
    const m = milSpecial(s);
    expect(m.portMods.fra_port).toEqual({ factor: 0.1, untilMinutes: 312 * 60 + 72 * 60 });
    expect(m.portMods.no_such_port).toBeUndefined();
    expect(m.availability.fra_port).toEqual({ fromMinutes: 400 * 60, rampHours: 24 });
    expect(s.weather.kind).toBe('storm');
    expect(s.weather.intensity).toBe(0.9);
    expect(s.weather.nextChangeMinutes).toBe(312 * 60 + 72 * 60);
    // repair: factor 1 clears the modifier
    applyEffects({ state: s, now: s.clock.minutes, log: () => undefined } as never, [{ op: 'port_throughput', locationId: 'fra_port', factor: 1 }]);
    expect(m.portMods.fra_port).toBeUndefined();
  });

  it('validateEventEffects accepts and rejects the port and weather ops', () => {
    const def = { locations: [{ id: 'mulberry_a' }], nations: [], units: [] } as never;
    const v = (effects: Record<string, unknown>[]) => validateEventEffects({ id: 'x', effects, effectsNote: 'n' }, def).join();
    expect(v([{ op: 'port_throughput', locationId: 'mulberry_a', factor: 0.1, hours: 72 }, { op: 'port_available', locationId: 'mulberry_a', fromHour: 300, rampHours: 24 }, { op: 'weather', kind: 'storm', intensity: 0.9, hours: 72 }])).toBe('');
    expect(v([{ op: 'port_throughput', locationId: 'nope', factor: 0 }])).toMatch(/port_throughput/);
    expect(v([{ op: 'port_throughput', locationId: 'mulberry_a', factor: -1 }])).toMatch(/port_throughput/);
    expect(v([{ op: 'port_throughput', locationId: 'mulberry_a', factor: 0, hours: 0 }])).toMatch(/port_throughput/);
    expect(v([{ op: 'port_available', locationId: 'mulberry_a' }])).toMatch(/port_available/);
    expect(v([{ op: 'weather', kind: 'storm', hours: -3 }])).toMatch(/hours/);
  });

  it('registerHistoricalEventsFromData forwards effects (port_relief applies)', () => {
    registerHistoricalEventsFromData([{ id: 'hist_data_relief', date: '1940-05-10T00:00:00Z', title: 'Relieved', body: 'b', src: ['s'], effects: [{ op: 'port_relief', locationId: 'fra_port' }] }]);
    const s = world({ randomEvents: false });
    s.clock.minutes = 3 * 24 * 60;
    updateEvents(s, seeded(1, { ...scenario, eventTemplateIds: ['hist_data_relief'] } as EventContext['scenario']));
    expect(milSpecial(s).portRelief.fra_port).toBe(true);
  });

  it('only fires events listed in the scenario eventTemplateIds', () => {
    registerHistoricalEvent({ id: 'hist_unlisted', date: '1940-05-11T00:00:00Z', title: 'x', body: 'y', sources: ['s'] });
    const s = world({ randomEvents: false });
    s.clock.minutes = 5 * 24 * 60;
    updateEvents(s, seeded(1, scenario));
    expect(s.events.find((e) => e.templateId === 'hist_unlisted')).toBeUndefined();
  });

  it('supports choice events with effects and honours historicalEventFrequency', () => {
    registerHistoricalEvent({
      id: 'hist_b', date: '1940-05-11T00:00:00Z', title: 'Decision', body: 'Choose.', sources: ['s'],
      choices: [
        { id: 'a', label: 'Fuel', effectSummary: 'Gain 50 fuel', effects: [{ op: 'resource', nation: 'FRA', key: 'fuel', delta: 50 }] },
        { id: 'b', label: 'Ammo', effectSummary: 'Gain 50 ammo', effects: [{ op: 'resource', nation: 'FRA', key: 'ammo', delta: 50 }] },
      ],
    });
    registerHistoricalEvent({ id: 'hist_c', date: '1940-05-11T00:00:00Z', title: 'Minor', body: 'minor', sources: ['s'] });
    const s = world({ randomEvents: false, historicalEventFrequency: 0 });
    s.clock.minutes = 3 * 24 * 60;
    updateEvents(s, seeded(1, scenario));
    expect(s.events).toHaveLength(0); // frequency 0 suppresses non-essential

    const s2 = world({ randomEvents: false });
    s2.clock.minutes = 3 * 24 * 60;
    updateEvents(s2, seeded(1, scenario));
    const ev = s2.events.find((e) => e.templateId === 'hist_b')!;
    expect(ev.resolved).toBe(false);
    expect(applyEventChoice(s2, ev.id, 'b').ok).toBe(true);
    expect(s2.nations.FRA.resources.ammo).toBe(650);
  });

  it('essential historical events fire even at frequency 0', () => {
    registerHistoricalEvent({ id: 'hist_a', date: '1940-05-11T00:00:00Z', title: 'Big', body: 'big', sources: ['s'], essential: true });
    const s = world({ randomEvents: false, historicalEventFrequency: 0 });
    s.clock.minutes = 3 * 24 * 60;
    updateEvents(s, seeded(1, scenario));
    expect(s.events).toHaveLength(1);
  });
});

describe('side and nation relevance', () => {
  const evtTitles = (st: GameState) => st.events.map((e) => `${e.title} ${e.body}`).join(' | ');

  it('a German player never sees an "Allied" shipment, and an Allied player does', () => {
    const ger = world(); ger.playerNation = 'GER'; ger.playerSide = 'axis';
    const evG = forceFireEvent(ger, seeded(1), 'evt_aid_shipment', 'axis');
    expect(evG).not.toBeNull();
    expect(`${evG!.title} ${evG!.body}`).not.toMatch(/allied/i);
    const fra = world();
    const evF = forceFireEvent(fra, seeded(1), 'evt_aid_shipment', 'allies');
    expect(evF!.title).toMatch(/Allied/);
  });

  it('player-facing text of every event, across seeds, never names the opposing faction as the beneficiary', () => {
    for (const player of ['GER', 'FRA'] as const) {
      const side = player === 'GER' ? 'axis' : 'allies';
      for (let seed = 1; seed <= 25; seed++) {
        const st = world({}, seed); st.playerNation = player; st.playerSide = side;
        const ctx = seeded(seed);
        for (let t = 0; t < 1500; t++) { st.clock.minutes = t * 60; updateEvents(st, ctx); }
        for (const e of st.events) {
          if (side === 'axis') expect(`${e.title} ${e.body}`, e.templateId).not.toMatch(/allied (shipment|consignment)/i);
          expect(e.side).toBe(side); // random events are only ever shown for the player's own side
        }
      }
    }
  });

  it('templates declaring sides/nations only ever happen to those sides/nations', () => {
    registerEventTemplate({
      id: 'evt_test_axis_only', kind: 'random', title: 'Axis only', body: 'x', target: 'any', sides: ['axis'], weight: 50, cooldownMinutes: 0,
    });
    registerEventTemplate({
      id: 'evt_test_fra_only', kind: 'random', title: 'France only', body: 'x', target: 'any', nations: ['FRA'], weight: 50, cooldownMinutes: 0,
    });
    const st = world(); // French (allied) player: AI-side firings return null by design, so assert via eventState stats
    const fired = (id: string, side: 'axis' | 'allies') => (st.eventState[`stat:${id}|${side}`] as { count: number } | undefined)?.count ?? 0;
    forceFireEvent(st, seeded(1), 'evt_test_axis_only', 'allies');
    forceFireEvent(st, seeded(1), 'evt_test_axis_only', 'axis');
    forceFireEvent(st, seeded(1), 'evt_test_fra_only', 'axis');
    forceFireEvent(st, seeded(1), 'evt_test_fra_only', 'allies');
    expect(fired('evt_test_axis_only', 'allies')).toBe(0);
    expect(fired('evt_test_axis_only', 'axis')).toBe(1);
    expect(fired('evt_test_fra_only', 'axis')).toBe(0);
    expect(fired('evt_test_fra_only', 'allies')).toBe(1);
    // rolled events respect it too: as a German player the France-only template never appears
    const g = world(); g.playerNation = 'GER'; g.playerSide = 'axis';
    const ctx = seeded(3);
    for (let t = 0; t < 3000; t++) { g.clock.minutes = t * 60; updateEvents(g, ctx); }
    expect(evtTitles(g)).not.toMatch(/France only/);
    expect(g.events.some((e) => e.templateId === 'evt_test_axis_only')).toBe(true);
    expect(g.events.some((e) => e.templateId === 'evt_test_fra_only')).toBe(false);
    unregisterEventTemplate('evt_test_axis_only'); unregisterEventTemplate('evt_test_fra_only');
  });
});
