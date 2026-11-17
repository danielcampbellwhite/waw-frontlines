import { describe, expect, it } from 'vitest';
import { reportHeadline } from '../src/ui/game/reportText';
import { diffAct, observeAct, summariseTriggers, contactPos } from '../src/ui/game/autoSlow';
import { previewOrder, terrainAt } from '../src/ui/game/orderPreview';
import { diffCues, observe } from '../src/audio/cues';
import { buildDispatches } from '../src/ui/game/dispatches';
import { Terrain } from '../src/core/types';

type A = Parameters<typeof diffAct>[1];
const unit = (id: string, side: string, pos: [number, number], o: Record<string, unknown> = {}) => ({ id, side, nation: side === 'axis' ? 'GER' : 'FRA', name: id, shortName: id, pos, destroyed: false, combatStatus: 'idle', visibleTo: [side], ...o });
const loc = (id: string, owner: string, o: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), kind: 'city', pos: [5, 50], owner, value: 6, ...o });
const nations = { GER: { name: 'Germany' }, FRA: { name: 'France' } };
const snap = (o: Record<string, unknown> = {}): A => ({ units: {}, battles: {}, locations: {}, events: [], objectives: [], playerSide: 'allies', nations, ...o }) as unknown as A;

describe('auto-slow triggers', () => {
  it('first contact fires once, from a battle or a nearby visible enemy', () => {
    const quiet = snap({ units: { a: unit('a', 'allies', [5, 50]), e: unit('e', 'axis', [9, 50], { visibleTo: ['axis'] }) } });
    const mem = observeAct(quiet);
    expect(diffAct(mem, quiet)).toEqual([]);
    const contact = snap({ units: { a: unit('a', 'allies', [5, 50]), e: unit('e', 'axis', [5.05, 50], { visibleTo: ['axis', 'allies'] }) } });
    expect(contactPos(contact)).toBeDefined();
    expect(diffAct(mem, contact).map(t => t.kind)).toEqual(['contact']);
    expect(diffAct(mem, contact)).toEqual([]);
  });
  it('a city changing hands, a unit destroyed or routed, and a historical event each fire once', () => {
    const before = snap({ locations: { sedan: loc('sedan', 'FRA'), hamlet: loc('hamlet', 'FRA', { kind: 'town', value: 1 }) }, units: { a: unit('a', 'allies', [5, 50]), b: unit('b', 'allies', [5, 51]) } });
    const mem = observeAct(before);
    const after = snap({
      locations: { sedan: loc('sedan', 'GER'), hamlet: loc('hamlet', 'GER', { kind: 'town', value: 1 }) },
      units: { a: unit('a', 'allies', [5, 50], { destroyed: true }), b: unit('b', 'allies', [5, 51], { combatStatus: 'routed' }) },
      events: [{ id: 'h1', kind: 'historical', title: 'Crossing of the Meuse', side: undefined }, { id: 'r1', kind: 'random', title: 'Rain' }],
    });
    const t = diffAct(mem, after);
    expect(t.filter(x => x.kind === 'capture')).toHaveLength(1);      // the hamlet is not worth slowing for
    expect(t.filter(x => x.kind === 'unit')).toHaveLength(2);
    expect(t.filter(x => x.kind === 'event').map(x => x.text)).toEqual(['Crossing of the Meuse']);
    expect(summariseTriggers(t)!.text).toContain('SEDAN');
    expect(diffAct(mem, after)).toEqual([]);
  });
});

describe('battle report headline', () => {
  it('says who attacked whom, where, the outcome and the losses', () => {
    const units = { g: unit('g', 'axis', [5, 50]), f: unit('f', 'allies', [5, 50]) };
    const r = { attackerSide: 'axis', outcome: 'attacker_victory', placeName: 'Sedan', casualties: [{ unitId: 'g', killed: 10, wounded: 20, captured: 0 }, { unitId: 'f', killed: 100, wounded: 50, captured: 30 }] };
    const h = reportHeadline(r as never, units as never, id => nations[id as 'GER' | 'FRA'].name);
    expect(h).toBe('Germany attacked France at Sedan: the attack succeeded. Losses: 30 attackers, 180 defenders.');
  });
});

describe('distinct report cue', () => {
  it('a battle lost by the player sounds the alert cue, a win the plain report cue', () => {
    const base = { playerSide: 'allies', battles: {}, events: [], objectives: [], units: {}, result: undefined };
    const prev = observe({ ...base, reports: [] } as never);
    const lost = { ...base, reports: [{ id: 'r', attackerSide: 'axis', outcome: 'attacker_victory' }] } as never;
    const won = { ...base, reports: [{ id: 'r', attackerSide: 'axis', outcome: 'defender_victory' }] } as never;
    expect(diffCues(prev, observe(lost), lost)).toEqual(['alert']);
    expect(diffCues(prev, observe(won), won)).toEqual(['report']);
  });
});

describe('order preview', () => {
  const terrain = { bbox: { west: 0, south: 40, east: 10, north: 50 }, cellDeg: 1, cols: 10, rows: 10, cells: Array.from({ length: 100 }, (_, i) => (i === 0 ? Terrain.Sea : Terrain.Plains)) };
  it('reads terrain from the NW corner and is undefined off the map', () => {
    expect(terrainAt(terrain, [0.5, 49.5])).toBe(Terrain.Sea);
    expect(terrainAt(terrain, [5.5, 45.5])).toBe(Terrain.Plains);
    expect(terrainAt(terrain, [20, 45])).toBeUndefined();
  });
  it('warns about open water, thin supply and low fuel; stays quiet for a short, supplied move', () => {
    const state = { units: { u: { id: 'u', side: 'allies', type: 'armoured', domain: 'land', name: 'Tank div', shortName: 'Tank div', pos: [5, 45], fuel: 3, destroyed: false } }, locations: { d: { id: 'd', kind: 'depot', owner: 'FRA', pos: [5, 45], name: 'Depot', value: 1 } }, nations: { FRA: { side: 'allies' } }, settings: { logisticsDifficulty: 1 }, special: {}, clock: { minutes: 0 }, control: { nations: [] }, supply: { nodes: [], unitSupplyDistKm: {}, cutOffUnits: [] } } as never;
    const scenario = { supplySources: { FRA: ['d'] } } as never;
    const water = previewOrder(state, terrain, scenario, ['u'], { kind: 'move', target: [0.5, 49.5] });
    expect(water!.warnings.join(' ')).toContain('open water');
    const far = previewOrder(state, terrain, scenario, ['u'], { kind: 'move', target: [9.5, 40.5] });
    expect(far!.warnings.join(' ')).toMatch(/fuel/);
    expect(far!.etaMinutes).toBeGreaterThan(0);
    expect(previewOrder(state, terrain, scenario, ['u'], { kind: 'hold' })).toBeNull();
  });
});

describe('dispatches', () => {
  it('are built only from historical event text and objective changes', () => {
    const s = { playerSide: 'allies', events: [{ id: 'h', kind: 'historical', firedAt: 600, title: 'Crossing of the Meuse', body: 'First sentence. Second sentence.' }, { id: 'r', kind: 'random', firedAt: 700, title: 'Rain', body: 'x' }], objectives: [{ id: 'o', side: 'allies', title: 'Hold Sedan', status: 'achieved', achievedAt: 800 }] } as never;
    const d = buildDispatches(s);
    expect(d.map(x => x.headline)).toEqual(['Objective achieved: Hold Sedan', 'Crossing of the Meuse']);
    expect(d[1].body).toBe('First sentence.');
  });
});
