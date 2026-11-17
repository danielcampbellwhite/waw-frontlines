import { describe, expect, it } from 'vitest';
import type { Command, GameState, ReinforcementArrival } from '../src/core/types';
import {
  applyCommand, combatEffectiveness, createUnitFromTemplate, isImmobilised, processOrders, processReinforcements,
  updateUnitStats,
} from '../src/military';
import { makeCtx, makeLocation, makeScenario, makeState, makeUnit } from '../src/military/testing';

const scen = makeScenario({});
const ctx = () => makeCtx(scen);

function issue(state: GameState, ids: string[], order: Partial<Extract<Command, { type: 'issue_order' }>['order']> & { kind: Extract<Command, { type: 'issue_order' }>['order']['kind'] }, mode: 'replace' | 'append' = 'replace', as: 'allies' | 'axis' | 'any' = 'allies') {
  return applyCommand(state, { type: 'issue_order', unitIds: ids, order: { priority: 1, ...order } as never, mode }, as);
}

describe('createUnitFromTemplate', () => {
  it('builds a full-strength unit and honours overrides', () => {
    const u = createUnitFromTemplate('armoured', { id: 'a1', nation: 'GER', side: 'axis', manpower: 5000 });
    expect(u.type).toBe('armoured');
    expect(u.manpower).toBe(5000);
    expect(u.manpowerMax).toBeGreaterThanOrEqual(11000);
    expect(u.equipment.held.tank_medium).toBe(u.equipment.authorised.tank_medium);
    expect(() => createUnitFromTemplate('nope', {})).toThrow();
  });
  it('does not share equipment objects between units', () => {
    const a = createUnitFromTemplate('infantry', { id: 'a' });
    const b = createUnitFromTemplate('infantry', { id: 'b' });
    a.equipment.held.rifle = 1;
    expect(b.equipment.held.rifle).toBeGreaterThan(1);
  });
});

describe('side checks', () => {
  it('rejects commands on enemy units but allows "any"', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50]), makeUnit('infantry', 'g1', 'GER', [6, 50])] });
    expect(issue(s, ['g1'], { kind: 'move', target: [5, 50] }, 'replace', 'allies').ok).toBe(false);
    expect(s.units.g1.orders).toHaveLength(0);
    expect(issue(s, ['f1', 'g1'], { kind: 'hold' }, 'replace', 'allies').ok).toBe(false);
    expect(s.units.f1.orders).toHaveLength(0); // all-or-nothing on side violation
    expect(issue(s, ['g1'], { kind: 'move', target: [5, 50] }, 'replace', 'any').ok).toBe(true);
    expect(applyCommand(s, { type: 'set_posture', unitIds: ['g1'], posture: 'rest' }, 'allies').ok).toBe(false);
    expect(applyCommand(s, { type: 'rename', unitId: 'g1', name: 'x' }, 'allies').ok).toBe(false);
    expect(applyCommand(s, { type: 'cancel_orders', unitIds: ['g1'] }, 'allies').ok).toBe(false);
  });
  it('cannot target friendly units with attack or enemy units with support', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50]), makeUnit('infantry', 'f2', 'FRA', [3.1, 50]), makeUnit('infantry', 'g1', 'GER', [6, 50])] });
    expect(issue(s, ['f1'], { kind: 'attack', targetUnit: 'f2' }).ok).toBe(false);
    expect(issue(s, ['f1'], { kind: 'support', targetUnit: 'g1' }).ok).toBe(false);
    expect(issue(s, ['f1'], { kind: 'attack', targetUnit: 'g1' }).ok).toBe(true);
  });
});

describe('order validation', () => {
  it('requires targets and rejects bad coordinates', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50])] });
    expect(issue(s, ['f1'], { kind: 'move' }).ok).toBe(false);
    expect(issue(s, ['f1'], { kind: 'move', target: [Number.NaN, 5] }).ok).toBe(false);
    expect(issue(s, ['f1'], { kind: 'defensive_line', line: [[3, 50]] }).ok).toBe(false);
    expect(issue(s, ['f1'], { kind: 'capture', targetLocation: 'nowhere' }).ok).toBe(false);
    expect(issue(s, [], { kind: 'hold' }).ok).toBe(false);
  });
  it('rejects capture of a friendly location and attack/capture by non-combat units', () => {
    const s = makeState({
      units: [makeUnit('infantry', 'f1', 'FRA', [3, 50]), makeUnit('logistics', 'l1', 'FRA', [3, 50])],
      locations: [makeLocation('mine', 'town', [3, 50], 'FRA'), makeLocation('theirs', 'town', [6, 50], 'GER')],
    });
    expect(issue(s, ['f1'], { kind: 'capture', targetLocation: 'mine' }).ok).toBe(false);
    expect(issue(s, ['l1'], { kind: 'capture', targetLocation: 'theirs' }).ok).toBe(false);
    const r = issue(s, ['f1', 'l1'], { kind: 'capture', targetLocation: 'theirs' });
    expect(r.ok).toBe(true);
    expect(r.error).toMatch(/non-combat/);
    expect(s.units.f1.orders).toHaveLength(1);
    expect(s.units.l1.orders).toHaveLength(0);
  });
  it('air units cannot entrench; routed units only accept retreat-like orders', () => {
    const s = makeState({ units: [makeUnit('air_fighter', 'a1', 'FRA', [3, 50]), makeUnit('infantry', 'f1', 'FRA', [3, 50], { combatStatus: 'routed' })] });
    expect(issue(s, ['a1'], { kind: 'entrench' }).ok).toBe(false);
    expect(issue(s, ['f1'], { kind: 'attack', target: [4, 50] }).ok).toBe(false);
    expect(issue(s, ['f1'], { kind: 'withdraw', target: [2, 50] }).ok).toBe(true);
  });
});

describe('order queues', () => {
  const base = () => makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50])] });
  it('replace discards the queue; append keeps order; ids are unique and deterministic', () => {
    const s = base();
    const a = issue(s, ['f1'], { kind: 'move', target: [3.5, 50] });
    const b = issue(s, ['f1'], { kind: 'move', target: [4, 50] }, 'append');
    const c = issue(s, ['f1'], { kind: 'hold' }, 'append');
    expect(s.units.f1.orders.map(o => o.id)).toEqual([a.ids![0], b.ids![0], c.ids![0]]);
    expect(new Set(s.units.f1.orders.map(o => o.id)).size).toBe(3);
    issue(s, ['f1'], { kind: 'rest' }, 'replace');
    expect(s.units.f1.orders.map(o => o.kind)).toEqual(['rest']);
  });
  it('higher priority preempts the active order and low priority sorts behind', () => {
    const s = base();
    issue(s, ['f1'], { kind: 'move', target: [3.5, 50], priority: 1 });
    processOrders(s, ctx());
    expect(s.units.f1.orders[0].status).toBe('active');
    issue(s, ['f1'], { kind: 'hold', priority: 0 }, 'append');
    issue(s, ['f1'], { kind: 'move', target: [4, 50], priority: 2 }, 'append');
    expect(s.units.f1.orders.map(o => o.kind)).toEqual(['move', 'move', 'hold']);
    expect(s.units.f1.orders[0].priority).toBe(2);
    expect(s.units.f1.orders[1].status).toBe('queued'); // preempted order waits
  });
  it('clamps priority and caps queue length', () => {
    const s = base();
    issue(s, ['f1'], { kind: 'hold', priority: 99 });
    expect(s.units.f1.orders[0].priority).toBe(3);
    for (let i = 0; i < 20; i++) issue(s, ['f1'], { kind: 'hold', priority: 0 }, 'append');
    expect(s.units.f1.orders.length).toBeLessThanOrEqual(12);
  });
  it('cancel_orders removes one or all and stops movement', () => {
    const s = base();
    const a = issue(s, ['f1'], { kind: 'move', target: [3.5, 50] });
    issue(s, ['f1'], { kind: 'move', target: [4, 50] }, 'append');
    processOrders(s, ctx());
    s.units.f1.moveStatus = 'moving';
    expect(applyCommand(s, { type: 'cancel_orders', unitIds: ['f1'], orderId: a.ids![0] }, 'allies').ok).toBe(true);
    expect(s.units.f1.orders).toHaveLength(1);
    expect(s.units.f1.moveStatus).toBe('stationary');
    expect(applyCommand(s, { type: 'cancel_orders', unitIds: ['f1'], orderId: 'bogus' }, 'allies').ok).toBe(false);
    applyCommand(s, { type: 'cancel_orders', unitIds: ['f1'] }, 'allies');
    expect(s.units.f1.orders).toHaveLength(0);
  });
});

describe('processOrders', () => {
  it('leaves a retreating unit without orders retreating (sim moves it afterwards)', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50])] });
    s.units.f1.moveStatus = 'retreating';
    processOrders(s, ctx());
    expect(s.units.f1.moveStatus).toBe('retreating');
  });
  it('activates, sets posture, estimates ETA and completes on arrival, then advances the queue', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50])] });
    issue(s, ['f1'], { kind: 'move', target: [3.2, 50] });
    issue(s, ['f1'], { kind: 'entrench' }, 'append');
    const c = ctx();
    processOrders(s, c);
    const u = s.units.f1;
    expect(u.orders[0].status).toBe('active');
    expect(u.orders[0].startedAt).toBe(0);
    expect(u.routeEtaMinutes).toBeGreaterThan(0);
    u.pos = [3.2, 50]; // movement engine arrives
    processOrders(s, c);
    expect(u.orders.map(o => o.kind)).toEqual(['entrench']);
    expect(u.orders[0].status).toBe('active');
    expect(u.posture).toBe('entrench');
    expect(c.logs.some(l => /move order complete/.test(l.text))).toBe(true);
  });
  it('uses ctx.findRoute for ETA and fails a move with no route', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50]), makeUnit('infantry', 'f2', 'FRA', [3, 50.5])] });
    issue(s, ['f1'], { kind: 'move', target: [4, 50] });
    const c = makeCtx(scen, [], { findRoute: (_u, to) => (to[0] === 4 ? { path: [to], km: 71, etaMinutes: 1234.2 } : null) });
    processOrders(s, c);
    expect(s.units.f1.routeEtaMinutes).toBe(1235);
    issue(s, ['f2'], { kind: 'move', target: [5, 50] });
    processOrders(s, c);
    expect(s.units.f2.orders).toHaveLength(0);
    expect(c.logs.some(l => /no route/.test(l.text))).toBe(true);
  });
  it('attack on a unit completes when it is destroyed and fails when the attacker routs', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50]), makeUnit('infantry', 'f2', 'FRA', [3, 50.1]), makeUnit('infantry', 'g1', 'GER', [3.3, 50])] });
    issue(s, ['f1', 'f2'], { kind: 'attack', targetUnit: 'g1' });
    const c = ctx();
    processOrders(s, c);
    expect(s.units.f1.orders[0].target).toEqual([3.3, 50]); // tracks target position
    s.units.g1.destroyed = true;
    s.units.f2.combatStatus = 'routed';
    processOrders(s, c);
    expect(s.units.f1.orders).toHaveLength(0);
    expect(s.units.f2.orders).toHaveLength(0);
  });
  it('capture completes once the location changes to our side', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50])], locations: [makeLocation('town', 'town', [3.2, 50], 'GER')] });
    issue(s, ['f1'], { kind: 'capture', targetLocation: 'town' });
    processOrders(s, ctx());
    expect(s.units.f1.orders[0].target).toEqual([3.2, 50]);
    s.locations.town.owner = 'FRA';
    processOrders(s, ctx());
    expect(s.units.f1.orders).toHaveLength(0);
  });
  it('standing orders yield to queued orders; follow tracks its leader; support fails when leader dies', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50]), makeUnit('armoured', 'f2', 'FRA', [3.5, 50])] });
    issue(s, ['f1'], { kind: 'hold' });
    issue(s, ['f1'], { kind: 'move', target: [3.4, 50] }, 'append');
    processOrders(s, ctx());
    expect(s.units.f1.orders[0].kind).toBe('move');
    issue(s, ['f1'], { kind: 'follow', targetUnit: 'f2' });
    s.units.f2.pos = [3.7, 50.1];
    processOrders(s, ctx());
    expect(s.units.f1.orders[0].target).toEqual([3.7, 50.1]);
    s.units.f2.destroyed = true;
    processOrders(s, ctx());
    expect(s.units.f1.orders).toHaveLength(0);
  });
  it('withdraw without a target picks a friendly location away from the enemy, or fails', () => {
    const s = makeState({
      units: [makeUnit('infantry', 'f1', 'FRA', [5, 50]), makeUnit('infantry', 'g1', 'GER', [5.5, 50])],
      locations: [makeLocation('rear', 'town', [3, 50], 'FRA'), makeLocation('front', 'town', [6, 50], 'FRA')],
    });
    issue(s, ['f1'], { kind: 'withdraw' });
    processOrders(s, ctx());
    expect(s.units.f1.orders[0].target).toEqual([3, 50]);
    delete s.locations.rear;
    issue(s, ['f1'], { kind: 'withdraw' });
    processOrders(s, ctx());
    expect(s.units.f1.orders).toHaveLength(0);
  });
  it('fog of war: attack target tracking uses last known position when unseen', () => {
    const s = makeState({ units: [makeUnit('infantry', 'f1', 'FRA', [3, 50]), makeUnit('infantry', 'g1', 'GER', [4, 50], { lastSeenBy: { allies: { pos: [3.8, 50], minutes: 0 } } })] });
    s.settings.fogOfWar = true;
    issue(s, ['f1'], { kind: 'attack', targetUnit: 'g1' });
    processOrders(s, ctx());
    expect(s.units.f1.orders[0].target).toEqual([3.8, 50]);
  });
});

describe('fuel exhaustion', () => {
  it('halts armour mid-move, keeps the order active and resumes after refuel', () => {
    const s = makeState({ units: [makeUnit('armoured', 't1', 'FRA', [3, 50], { fuel: 5 })] });
    issue(s, ['t1'], { kind: 'move', target: [5, 50] });
    const c = ctx();
    processOrders(s, c);
    const u = s.units.t1;
    s.supply.cutOffUnits = ['t1']; // no resupply
    u.moveStatus = 'moving';
    updateUnitStats(s, c);
    expect(u.fuel).toBeCloseTo(1.5);
    expect(u.moveStatus).toBe('moving');
    updateUnitStats(s, c);
    expect(u.fuel).toBe(0);
    expect(u.moveStatus).toBe('stationary');
    expect(isImmobilised(u)).toBe(true);
    expect(c.logs.some(l => /out of fuel/.test(l.text))).toBe(true);
    u.moveStatus = 'moving'; // movement engine ignorant
    processOrders(s, c);
    expect(u.moveStatus).toBe('stationary');
    expect(u.orders[0].status).toBe('active');
    expect(u.orders[0].note).toMatch(/fuel/);
    // supply restored
    s.supply.cutOffUnits = [];
    u.supply = 100;
    updateUnitStats(s, c);
    expect(u.fuel).toBeGreaterThan(0);
    processOrders(s, c);
    expect(isImmobilised(u)).toBe(false);
    expect(u.orders[0].note).toBeUndefined();
  });
  it('does not affect infantry', () => {
    const s = makeState({ units: [makeUnit('infantry', 'i1', 'FRA', [3, 50], { fuel: 0 })] });
    expect(isImmobilised(s.units.i1)).toBe(false);
  });
});

describe('operations', () => {
  it('launches phases after their delays and completes when all phase orders are done', () => {
    const s = makeState({ units: [makeUnit('infantry', 'a', 'FRA', [3, 50]), makeUnit('armoured', 'b', 'FRA', [3, 50.2]), makeUnit('infantry', 'g', 'GER', [4, 50])] });
    const r = applyCommand(s, {
      type: 'create_operation',
      operation: {
        name: 'Op Test', side: 'allies', nation: 'FRA', startMinutes: 60,
        phases: [
          { name: 'Fix', unitIds: ['a'], startAfterMinutes: 0, order: { kind: 'move', priority: 1, target: [3.1, 50] } },
          { name: 'Exploit', unitIds: ['b'], startAfterMinutes: 120, order: { kind: 'move', priority: 1, target: [3.2, 50.2] } },
        ],
      },
    }, 'allies');
    expect(r.ok).toBe(true);
    const opId = r.ids![0];
    expect(s.operations[opId].status).toBe('planned');
    const c = ctx();
    s.clock.minutes = 0; processOrders(s, c);
    expect(s.units.a.orders).toHaveLength(0);
    s.clock.minutes = 60; processOrders(s, c);
    expect(s.operations[opId].status).toBe('active');
    expect(s.units.a.orders[0].operationId).toBe(opId);
    expect(s.units.b.orders).toHaveLength(0);
    s.clock.minutes = 120; processOrders(s, c);
    expect(s.units.b.orders).toHaveLength(0);
    s.clock.minutes = 180; processOrders(s, c);
    expect(s.units.b.orders).toHaveLength(1);
    expect(s.operations[opId].status).toBe('active');
    s.units.a.pos = [3.1, 50]; s.units.b.pos = [3.2, 50.2];
    s.clock.minutes = 240; processOrders(s, c);
    s.clock.minutes = 300; processOrders(s, c); // completion is detected the tick after the last order finishes
    expect(s.operations[opId].status).toBe('complete');
  });
  it('enforces side on operations and supports cancellation', () => {
    const s = makeState({ units: [makeUnit('infantry', 'a', 'FRA', [3, 50]), makeUnit('infantry', 'g', 'GER', [4, 50])] });
    const mk = (unit: string, side: 'allies' | 'axis') => ({
      type: 'create_operation', operation: { name: 'X', side, nation: side === 'allies' ? 'FRA' : 'GER', startMinutes: 0, phases: [{ name: 'p', unitIds: [unit], startAfterMinutes: 0, order: { kind: 'hold', priority: 1 } }] },
    } as Command);
    expect(applyCommand(s, mk('g', 'axis'), 'allies').ok).toBe(false);
    expect(applyCommand(s, mk('g', 'allies'), 'allies').ok).toBe(false); // enemy unit in allied op
    const r = applyCommand(s, mk('a', 'allies'), 'allies');
    expect(r.ok).toBe(true);
    processOrders(s, ctx());
    expect(s.units.a.orders).toHaveLength(1);
    expect(applyCommand(s, { type: 'cancel_operation', operationId: r.ids![0] }, 'axis').ok).toBe(false);
    expect(applyCommand(s, { type: 'cancel_operation', operationId: r.ids![0] }, 'allies').ok).toBe(true);
    expect(s.units.a.orders).toHaveLength(0);
    expect(s.operations[r.ids![0]].status).toBe('cancelled');
  });
});

describe('unit stats', () => {
  it('entrench raises entrenchment over time, movement erodes it', () => {
    const s = makeState({ units: [makeUnit('infantry', 'i', 'FRA', [3, 50])] });
    s.units.i.posture = 'entrench';
    const c = ctx();
    for (let i = 0; i < 10; i++) updateUnitStats(s, c);
    expect(s.units.i.entrenchment).toBeGreaterThanOrEqual(35);
    const e = s.units.i.entrenchment;
    s.units.i.posture = 'hold';
    s.units.i.moveStatus = 'moving';
    s.units.i.pos = [3.1, 50]; // marched ~7 km this tick
    updateUnitStats(s, c);
    expect(s.units.i.entrenchment).toBeLessThan(e);
  });
  it('engineers dig faster than armour', () => {
    const s = makeState({ units: [makeUnit('engineer', 'e', 'FRA', [3, 50], { posture: 'entrench' }), makeUnit('armoured', 't', 'FRA', [3, 50.1], { posture: 'entrench' })] });
    for (let i = 0; i < 5; i++) updateUnitStats(s, ctx());
    expect(s.units.e.entrenchment).toBeGreaterThan(s.units.t.entrenchment);
  });
  it('rest recovers fatigue and organisation faster than holding', () => {
    const mk = (posture: 'rest' | 'hold') => makeUnit('infantry', posture, 'FRA', [3, 50], { fatigue: 60, organisation: 40, posture });
    const s = makeState({ units: [mk('rest'), mk('hold')] });
    for (let i = 0; i < 5; i++) updateUnitStats(s, ctx());
    expect(s.units.rest.fatigue).toBeLessThan(s.units.hold.fatigue);
    expect(s.units.rest.organisation).toBeGreaterThan(s.units.hold.organisation);
  });
  it('a quiet, supplied unit at organisation 0 recovers past 50 within 30 ticks', () => {
    const s = makeState({ units: [makeUnit('infantry', 'z', 'FRA', [3, 50], { organisation: 0, supply: 60 })] });
    for (let i = 0; i < 30; i++) updateUnitStats(s, ctx());
    expect(s.units.z.organisation).toBeGreaterThan(50);
  });
  it('org 0, morale 0, fatigue 77, supply 66 and quiet: org, morale and fatigue all recover over 30 ticks', () => {
    const s = makeState({ units: [makeUnit('infantry', 'z', 'USA', [3, 50], { organisation: 0, morale: 0, fatigue: 77, supply: 66 })] });
    for (let i = 0; i < 30; i++) updateUnitStats(s, ctx());
    const u = s.units.z;
    expect(u.organisation).toBeGreaterThan(40);
    expect(u.morale).toBeGreaterThan(15);
    expect(u.fatigue).toBeLessThan(77);
  });
  it('entrenchment is lost only by real displacement or retreat, not by a standing moving/attack flag', () => {
    const mk = (id: string, o: Record<string, unknown>) => makeUnit('infantry', id, 'USA', [3, 50], { entrenchment: 60, ...o } as never);
    const s = makeState({ units: [mk('held', { moveStatus: 'moving' }), mk('atk', { posture: 'attack' }), mk('march', { moveStatus: 'moving' }), mk('retreat', { moveStatus: 'retreating' }), mk('slow', { moveStatus: 'moving' })] });
    updateUnitStats(s, ctx()); // records start positions
    for (const id of ['held', 'atk', 'march', 'retreat', 'slow']) s.units[id].entrenchment = 60;
    s.units.march.pos = [3.1, 50]; // ~7 km
    s.units.slow.pos = [3.0, 50.0135]; // ~1.5 km
    updateUnitStats(s, ctx());
    expect(s.units.held.entrenchment).toBe(60);
    expect(s.units.atk.entrenchment).toBe(60);
    expect(s.units.march.entrenchment).toBe(52);
    expect(s.units.retreat.entrenchment).toBe(52);
    expect(s.units.slow.entrenchment).toBeGreaterThan(52);
    expect(s.units.slow.entrenchment).toBeLessThan(60);
  });
  it('combat burns ammo (artillery more) and the line is resupplied only slowly; marching tires units', () => {
    const s = makeState({ units: [makeUnit('artillery', 'a', 'FRA', [3, 50], { inBattle: 'b1' }), makeUnit('infantry', 'i', 'FRA', [3, 50.1], { inBattle: 'b1' }), makeUnit('infantry', 'm', 'FRA', [3, 50.2], { moveStatus: 'moving' })] });
    updateUnitStats(s, ctx());
    expect(s.units.a.ammo).toBeLessThan(s.units.i.ammo);
    expect(s.units.a.ammo).toBeLessThan(100);
    expect(s.units.m.fatigue).toBeGreaterThan(0);
  });
  it('replacements draw on nation pools when supplied, not when cut off or pools empty', () => {
    const mk = (id: string, y: number) => makeUnit('infantry', id, 'FRA', [3, y], { manpower: 6000, supply: 100 });
    const s = makeState({ units: [mk('ok', 50), mk('cut', 50.1)] });
    s.units.ok.equipment.held.rifle = 5000;
    s.supply.cutOffUnits = ['cut'];
    const before = s.nations.FRA.resources.manpower;
    updateUnitStats(s, ctx());
    expect(s.units.ok.manpower).toBeGreaterThan(6000);
    expect(s.units.ok.equipment.held.rifle).toBeGreaterThan(5000);
    expect(s.units.cut.manpower).toBe(6000);
    expect(s.nations.FRA.resources.manpower).toBeLessThan(before);
    s.nations.FRA.resources.manpower = 0;
    const m = s.units.ok.manpower;
    updateUnitStats(s, ctx());
    expect(s.units.ok.manpower).toBe(m);
  });
  it('shortages reduce readiness; out of ammo cripples combat effectiveness', () => {
    const s = makeState({ units: [makeUnit('armoured', 'good', 'FRA', [3, 50]), makeUnit('armoured', 'bad', 'FRA', [3, 50.1], { fuel: 0, ammo: 0, supply: 10 })] });
    s.supply.cutOffUnits = ['bad'];
    updateUnitStats(s, ctx());
    expect(s.units.bad.readiness).toBeLessThan(s.units.good.readiness * 0.5);
    expect(combatEffectiveness(s.units.bad)).toBeLessThan(0.2);
  });
  it('morale decays when cut off; fuel refills from pool while supplied', () => {
    const s = makeState({ units: [makeUnit('armoured', 'c', 'FRA', [3, 50]), makeUnit('armoured', 'f', 'FRA', [3, 50.1], { fuel: 20, morale: 60 })] });
    s.supply.cutOffUnits = ['c'];
    const pool = s.nations.FRA.resources.fuel;
    updateUnitStats(s, ctx());
    expect(s.units.c.morale).toBeLessThan(75);
    expect(s.units.f.fuel).toBeGreaterThan(20);
    expect(s.nations.FRA.resources.fuel).toBeLessThan(pool);
  });
});

describe('reinforcements', () => {
  const arrival = (id: string, at: number, locationId?: string): ReinforcementArrival => ({ id: `arr_${id}`, atMinutes: at, locationId, unit: makeUnit('infantry', id, 'FRA', [0, 0]) });
  it('places due units at their location and announces them once', () => {
    const s = makeState({ locations: [makeLocation('port', 'port', [2, 49], 'FRA')] });
    s.nations.FRA.reinforcements = [arrival('r1', 120, 'port'), arrival('r2', 600, 'port')];
    s.clock.minutes = 60; processReinforcements(s);
    expect(s.units.r1).toBeUndefined();
    s.clock.minutes = 120; processReinforcements(s);
    expect(s.units.r1.pos).toEqual([2, 49]);
    expect(s.units.r1.side).toBe('allies');
    expect(s.nations.FRA.reinforcements[0].arrived).toBe(true);
    expect(s.units.r2).toBeUndefined();
    const n = s.log.length;
    processReinforcements(s);
    expect(s.log).toHaveLength(n);
    expect(s.log[0].text).toMatch(/Reinforcements arrive/);
  });
  it('diverts to another friendly location when the target was lost, postpones if none', () => {
    const s = makeState({ locations: [makeLocation('port', 'port', [2, 49], 'GER'), makeLocation('city', 'city', [3, 50], 'FRA')] });
    s.nations.FRA.reinforcements = [arrival('r1', 0, 'port')];
    processReinforcements(s);
    expect(s.units.r1.pos).toEqual([3, 50]);
    s.locations.city.owner = 'GER';
    s.nations.FRA.reinforcements = [arrival('r2', 0, 'port')];
    processReinforcements(s);
    expect(s.units.r2).toBeUndefined();
    expect(s.nations.FRA.reinforcements[0].atMinutes).toBeGreaterThan(0);
  });
  it('request_reinforcement expedites for supply points and checks side', () => {
    const s = makeState({ locations: [makeLocation('port', 'port', [2, 49], 'FRA')] });
    s.nations.FRA.reinforcements = [arrival('r1', 5000, 'port')];
    expect(applyCommand(s, { type: 'request_reinforcement', locationId: 'port', unitId: 'r1' }, 'axis').ok).toBe(false);
    const pts = s.nations.FRA.resources.supplyPoints;
    expect(applyCommand(s, { type: 'request_reinforcement', locationId: 'port', unitId: 'r1' }, 'allies').ok).toBe(true);
    expect(s.nations.FRA.reinforcements[0].atMinutes).toBeLessThan(5000);
    expect(s.nations.FRA.resources.supplyPoints).toBeLessThan(pts);
    expect(applyCommand(s, { type: 'request_reinforcement', locationId: 'port', unitId: 'r1' }, 'allies').ok).toBe(false); // already imminent
  });
});

describe('determinism & state hygiene', () => {
  it('state stays JSON round-trippable and runs reproduce exactly', () => {
    const run = () => {
      const s = makeState({ units: [makeUnit('armoured', 't', 'FRA', [3, 50]), makeUnit('infantry', 'i', 'FRA', [3, 50.2])] });
      issue(s, ['t', 'i'], { kind: 'move', target: [3.5, 50] });
      const c = ctx();
      for (let k = 0; k < 8; k++) { s.clock.minutes = k * 60; processOrders(s, c); s.units.t.moveStatus = 'moving'; updateUnitStats(s, c); }
      return s;
    };
    const a = run(), b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
    expect(JSON.stringify(a)).not.toContain('NaN');
  });
});

describe('pool arithmetic', () => {
  it('never leaves a nation pool negative through float error when a pool runs dry mid-refuel', () => {
    const units = Array.from({ length: 12 }, (_, i) => makeUnit('armoured', `t${i}`, 'FRA', [3, 50 + i * 0.01], { fuel: 3.3 + i * 0.37, ammo: 10 + i }));
    const s = makeState({ units, pool: 1 });
    s.nations.FRA.resources.fuel = 0.7; s.nations.FRA.resources.ammo = 0.9;
    for (let k = 0; k < 6; k++) updateUnitStats(s, ctx());
    for (const v of Object.values(s.nations.FRA.resources)) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe('air servicing', () => {
  const air = (extra: Partial<import('../src/core/types').Unit> = {}, fieldDamage = 0, away = false) => {
    const s = makeState({
      units: [makeUnit('air_bomber', 'w', 'FRA', away ? [5, 51] : [3, 50.02], { fuel: 10, ammo: 10, ...extra })],
      locations: [makeLocation('af', 'airfield', [3, 50], 'FRA', { damaged: fieldDamage })],
    });
    return s;
  };
  it('refuels and rearms slowly, only at a serviceable friendly airfield, drawing on the pools', () => {
    const s = air();
    const fuel0 = s.nations.FRA.resources.fuel;
    updateUnitStats(s, ctx());
    const u = s.units.w;
    expect(u.fuel).toBeGreaterThan(10);
    expect(u.fuel).toBeLessThanOrEqual(10 + 5 + 1e-9);
    expect(u.ammo).toBeLessThanOrEqual(10 + 4 + 1e-9);
    expect(s.nations.FRA.resources.fuel).toBeLessThan(fuel0);
    const away = air({}, 0, true);
    updateUnitStats(away, ctx());
    expect(away.units.w.fuel).toBe(10);
    expect(away.units.w.ammo).toBe(10);
    const wrecked = air({}, 85);
    updateUnitStats(wrecked, ctx());
    expect(wrecked.units.w.fuel).toBe(10);
    const hurt = air({}, 50);
    updateUnitStats(hurt, ctx());
    expect(hurt.units.w.fuel - 10).toBeLessThan(u.fuel - 10);
  });
  it('needs ~20 ticks to refill an empty wing, not one', () => {
    const s = air({ fuel: 0, ammo: 0 });
    for (let t = 0; t < 5; t++) { s.clock.minutes += 60; updateUnitStats(s, ctx()); }
    expect(s.units.w.fuel).toBeLessThan(30);
    expect(s.units.w.ammo).toBeLessThan(25);
  });
  it('replaces at most one aircraft per six ticks, from the equipment pool, only at an airfield', () => {
    const s = air();
    s.units.w.equipment.held.aircraft_bomber = 30;
    const eq0 = s.nations.FRA.resources.equipment;
    for (let t = 0; t < 12; t++) { s.clock.minutes += 60; updateUnitStats(s, ctx()); }
    const got = s.units.w.equipment.held.aircraft_bomber - 30;
    expect(got).toBeGreaterThanOrEqual(1);
    expect(got).toBeLessThanOrEqual(2);
    expect(s.nations.FRA.resources.equipment).toBeLessThan(eq0);
    const away = air({}, 0, true);
    away.units.w.equipment.held.aircraft_bomber = 30;
    for (let t = 0; t < 12; t++) { away.clock.minutes += 60; updateUnitStats(away, ctx()); }
    expect(away.units.w.equipment.held.aircraft_bomber).toBe(30);
  });
});

describe('ammunition over a multi-day battle', () => {
  const fight = (cut: boolean, supply: number, hours: number) => {
    const s = makeState({ units: [makeUnit('armoured', 'pz', 'GER', [6, 50], { inBattle: 'b1', combatStatus: 'defending', supply }), makeUnit('artillery', 'art', 'GER', [6, 50.1], { inBattle: 'b1', combatStatus: 'defending', supply })] });
    if (cut) s.supply.cutOffUnits = ['pz', 'art'];
    let dryAt = -1;
    for (let h = 0; h < hours; h++) {
      s.clock.minutes += 60;
      // what sim/combat burns per battle round (1.4%, artillery 3%)
      s.units.pz.ammo = Math.max(0, s.units.pz.ammo - 1.4);
      s.units.art.ammo = Math.max(0, s.units.art.ammo - 3);
      updateUnitStats(s, ctx());
      if (dryAt < 0 && s.units.pz.ammo < 8) dryAt = h;
    }
    return { s, dryAt };
  };
  it('a supplied armoured division fights a 3-day battle without running dry', () => {
    const { s, dryAt } = fight(false, 60, 72);
    expect(dryAt).toBe(-1);
    expect(s.units.pz.ammo).toBeGreaterThan(20);
    expect(s.units.art.ammo).toBeLessThan(s.units.pz.ammo); // guns are ammunition-hungry
  });
  it('basic load alone lasts longer than a day but not a week; cut-off units run dry', () => {
    const { s, dryAt } = fight(true, 60, 72);
    expect(dryAt).toBeGreaterThan(24);
    expect(dryAt).toBeLessThan(72);
    expect(s.units.pz.ammo).toBeLessThan(8);
  });
});
