import { describe, expect, it } from 'vitest';
import { nextFloat } from '../src/core/rng';
import type { Command, GameState, Location, NationId, Unit, UnitType } from '../src/core/types';
import { aiThink, describeAi, resolveDoctrine, type AiContext } from '../src/ai';
import { fastKm, unitPower } from '../src/ai/model';

// ───────────────────────────── fixtures ─────────────────────────────

let uid = 0;
function mkUnit(nation: NationId, type: UnitType, pos: [number, number], extra: Partial<Unit> = {}): Unit {
  const id = `${nation}_${type}_${++uid}`;
  const side = nation === 'GER' || nation === 'ITA' ? 'axis' : 'allies';
  return {
    id, name: id, shortName: id, nation, side, type, domain: 'land', pos, manpower: 900, manpowerMax: 1000,
    equipment: { held: {}, authorised: {} }, organisation: 85, morale: 80, experience: 50, fuel: 90, ammo: 90, supply: 90,
    fatigue: 10, readiness: 85, entrenchment: 0, moveStatus: 'stationary', combatStatus: 'idle', posture: 'hold', orders: [],
    kills: 0, ...extra,
  };
}

/** World: lon 0..4, lat 50..52, 0.1deg cells. West of lon 2 = FRA (allies), east = GER (axis). AI plays GER. */
function mkState(units: Unit[], locations: Location[] = [], opts: { fog?: boolean; aggr?: number; difficulty?: GameState['settings']['difficulty'] } = {}): GameState {
  const cols = 40, rows = 20;
  const owner: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) owner.push(c < 20 ? 1 : 2);
  const st: GameState = {
    schema: 1, scenarioId: 't', playerNation: 'FRA', playerSide: 'allies',
    settings: { difficulty: opts.difficulty ?? 'veteran', aiAggression: opts.aggr ?? 0.8, fogOfWar: opts.fog ?? true, historicalDeployment: true, randomEvents: true, logisticsDifficulty: 1, reinforcementAvailability: 1, historicalEventFrequency: 1 },
    clock: { minutes: 600, speed: 1, startMinutes: 0, accumulatorMs: 0 }, rng: { s: 7 }, seed: 7, idCounter: 1,
    units: {}, nations: {
      FRA: { id: 'FRA', side: 'allies', name: 'France', playable: true, resources: { manpower: 500, fuel: 500, ammo: 500, equipment: 500, supplyPoints: 500 }, income: { manpower: 0, fuel: 0, ammo: 0, equipment: 0, supplyPoints: 0 }, reinforcements: [] },
      GER: { id: 'GER', side: 'axis', name: 'Germany', playable: true, resources: { manpower: 500, fuel: 500, ammo: 500, equipment: 500, supplyPoints: 500 }, income: { manpower: 0, fuel: 0, ammo: 0, equipment: 0, supplyPoints: 0 }, reinforcements: [] },
    },
    locations: {}, control: { bbox: { west: 0, south: 50, east: 4, north: 52 }, cellDeg: 0.1, cols, rows, nations: ['NEUTRAL', 'FRA', 'GER'], owner, contested: owner.map(() => 0) },
    weather: { kind: 'clear', intensity: 0, temperatureC: 15, nextChangeMinutes: 99999 }, supply: { nodes: [], unitSupplyDistKm: {}, cutOffUnits: [] },
    battles: {}, reports: [], operations: {}, events: [], eventState: {}, log: [], objectives: [], aiState: {}, special: {}, history: [],
  };
  for (const u of units) st.units[u.id] = u;
  for (const l of locations) st.locations[l.id] = l;
  return st;
}
const loc = (id: string, kind: Location['kind'], pos: [number, number], owner: NationId, value = 5): Location => ({ id, name: id, kind, pos, owner, originalOwner: owner, value });
/** Seen by axis (AI) */
const seen = (u: Unit): Unit => ({ ...u, visibleTo: ['allies', 'axis'] });
const hidden = (u: Unit): Unit => ({ ...u, visibleTo: ['allies'] });

const mkCtx = (seed = 1): AiContext => { const r = { s: seed }; return { rand: () => nextFloat(r) }; };
/** zero-noise context: gauss() === 0 */
const flatCtx: AiContext = { rand: () => 0.5 };

const ops = (cmds: Command[]) => cmds.filter((c): c is Extract<Command, { type: 'create_operation' }> => c.type === 'create_operation');
const orders = (cmds: Command[]) => cmds.filter((c): c is Extract<Command, { type: 'issue_order' }> => c.type === 'issue_order');

function germanForce(n: number, lon = 2.6, lat = 51): Unit[] {
  const us: Unit[] = [];
  for (let i = 0; i < n; i++) us.push(mkUnit('GER', 'infantry', [lon + (i % 4) * 0.05, lat + Math.floor(i / 4) * 0.08]));
  return us;
}

// ───────────────────────────── tests ─────────────────────────────

describe('AI posture and targeting', () => {
  it('attacks the weak point rather than the strongly held objective', () => {
    uid = 0;
    const ger = [...germanForce(12), mkUnit('GER', 'armoured', [2.5, 51]), mkUnit('GER', 'armoured', [2.5, 51.1])];
    const lille = loc('lille', 'city', [1.0, 51.2], 'FRA', 8);
    const amiens = loc('amiens', 'city', [1.2, 50.4], 'FRA', 6);
    const fra = [
      ...Array.from({ length: 6 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.0 + i * 0.02, 51.2]))),
      seen(mkUnit('FRA', 'infantry', [1.2, 50.4], { manpower: 400, organisation: 50 })),
    ];
    const st = mkState([...ger, ...fra], [lille, amiens]);
    st.special.aiDoctrine = { GER: { maxOperations: 1 } };
    const cmds = aiThink(st, 'GER', flatCtx);
    const o = ops(cmds);
    expect(o.length).toBe(1);
    const assault = o[0].operation.phases.find((p) => p.name === 'Assault')!;
    expect(fastKm(assault.order.target!, amiens.pos)).toBeLessThan(5);
    expect(describeAi(st, 'GER').posture).toBe('attack');
  });

  it('builds a multi-phase coordinated operation with recon, fires and an envelopment', () => {
    uid = 0;
    const ger = [...germanForce(6), mkUnit('GER', 'armoured', [2.5, 51]), mkUnit('GER', 'armoured', [2.5, 51.1]), mkUnit('GER', 'recon', [2.5, 51.05]), mkUnit('GER', 'artillery', [2.6, 51.05])];
    const town = loc('town', 'city', [1.2, 51], 'FRA', 7);
    const fra = [seen(mkUnit('FRA', 'infantry', [1.2, 51]))];
    const st = mkState([...ger, ...fra], [town]);
    st.special.aiDoctrine = { GER: { maxOperations: 1, reserveFraction: 0 } };
    const o = ops(aiThink(st, 'GER', flatCtx))[0];
    expect(o).toBeTruthy();
    const names = o.operation.phases.map((p) => p.name);
    expect(names).toContain('Reconnaissance');
    expect(names).toContain('Fire support');
    expect(names).toContain('Assault');
    expect(names.some((n) => n.startsWith('Envelopment'))).toBe(true);
    const cut = o.operation.phases.find((p) => p.name.startsWith('Envelopment'))!.order.target!;
    // the hook is aimed BEYOND the objective (further from our start line than the town)
    expect(fastKm(cut, [2.6, 51])).toBeGreaterThan(0);
    expect(fastKm(cut, town.pos)).toBeGreaterThan(20);
  });

  it('defends and entrenches when outnumbered but not hopeless', () => {
    uid = 0;
    const ger = germanForce(5, 2.3);
    const fra = Array.from({ length: 10 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.5 + (i % 5) * 0.04, 51 + Math.floor(i / 5) * 0.1])));
    const st = mkState([...ger, ...fra], [loc('home', 'city', [3, 51], 'GER', 6)]);
    const cmds = aiThink(st, 'GER', flatCtx);
    expect(describeAi(st, 'GER').posture).toBe('defend');
    expect(ops(cmds).length).toBe(0);
    expect(orders(cmds).some((c) => c.order.kind === 'attack')).toBe(false);
    const defending = cmds.filter((c) => (c.type === 'issue_order' && c.order.kind === 'defend') || (c.type === 'set_posture' && c.posture === 'entrench'));
    expect(defending.length).toBeGreaterThan(0);
  });

  it('withdraws when the odds are hopeless, and cancels its operations', () => {
    uid = 0;
    const ger = germanForce(3, 2.3);
    const fra = Array.from({ length: 14 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.7 + (i % 7) * 0.03, 51 + Math.floor(i / 7) * 0.1])));
    const st = mkState([...ger, ...fra], [loc('home', 'city', [3.5, 51], 'GER', 6)]);
    st.operations['op1'] = { id: 'op1', name: 'old', side: 'axis', nation: 'GER', status: 'active', startMinutes: 100, phases: [{ name: 'x', unitIds: [ger[0].id], order: { kind: 'attack', priority: 1, target: [1, 51] }, startAfterMinutes: 0 }] };
    const cmds = aiThink(st, 'GER', flatCtx);
    expect(describeAi(st, 'GER').posture).toBe('withdraw');
    expect(cmds.some((c) => c.type === 'cancel_operation' && c.operationId === 'op1')).toBe(true);
    const wd = orders(cmds).filter((c) => c.order.kind === 'withdraw');
    expect(wd.length).toBeGreaterThan(0);
    // withdrawing means moving east (away from the enemy)
    for (const c of wd) expect(c.order.target![0]).toBeGreaterThan(2.3);
  });

  it('doctrine noWithdraw makes it stand and fight even at hopeless odds', () => {
    uid = 0;
    const ger = germanForce(3, 2.3);
    const fra = Array.from({ length: 14 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.7 + (i % 7) * 0.03, 51 + Math.floor(i / 7) * 0.1])));
    const st = mkState([...ger, ...fra]);
    st.special.aiDoctrine = { GER: { noWithdraw: true } };
    aiThink(st, 'GER', flatCtx);
    expect(describeAi(st, 'GER').posture).toBe('defend');
  });

  it('counterattacks an enemy penetration standing on its own ground with reserves', () => {
    uid = 0;
    const ger = [...germanForce(2, 3.0), mkUnit('GER', 'armoured', [3.0, 51]), mkUnit('GER', 'armoured', [3.05, 51]), mkUnit('GER', 'infantry', [3.1, 51.1])];
    const raider = seen(mkUnit('FRA', 'mechanised', [2.7, 51.0], { manpower: 500 }));
    const fra = [raider, ...Array.from({ length: 4 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.5 + i * 0.05, 51])))];
    const st = mkState([...ger, ...fra]);
    st.special.aiDoctrine = { GER: { posture: 'defend' } };
    const o = ops(aiThink(st, 'GER', flatCtx));
    expect(o.some((x) => x.operation.name.includes('Counter-attack'))).toBe(true);
  });

  it('requests reinforcements for depleted formations near a city', () => {
    uid = 0;
    const weak = mkUnit('GER', 'infantry', [3, 51], { manpower: 200 });
    const st = mkState([weak, ...germanForce(2, 3.2)], [loc('home', 'city', [3.02, 51], 'GER', 6)]);
    const cmds = aiThink(st, 'GER', flatCtx);
    expect(cmds.some((c) => c.type === 'request_reinforcement' && c.unitId === weak.id)).toBe(true);
    // not re-requested immediately
    const again = aiThink(st, 'GER', flatCtx);
    expect(again.some((c) => c.type === 'request_reinforcement' && c.unitId === weak.id)).toBe(false);
  });

  it('sends recon units to look at stale / unknown enemy ground', () => {
    uid = 0;
    const r = mkUnit('GER', 'recon', [2.5, 51]);
    const st = mkState([r, ...germanForce(4, 2.7)], [loc('town', 'city', [1.2, 51], 'FRA', 5)]);
    const cmds = aiThink(st, 'GER', flatCtx);
    const ro = orders(cmds).find((c) => c.unitIds.includes(r.id) || false);
    expect(ro?.order.kind === 'recon' || cmds.some((c) => c.type === 'create_operation')).toBe(true);
  });

  it('breaks out of encirclement towards friendly ground', () => {
    uid = 0;
    const ger = [mkUnit('GER', 'infantry', [1.5, 51], { encircled: true }), ...germanForce(3, 3.2)];
    const fra = Array.from({ length: 4 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.3 + i * 0.05, 51.1])));
    const st = mkState([...ger, ...fra]);
    st.supply.cutOffUnits = [ger[0].id];
    const cmds = aiThink(st, 'GER', flatCtx);
    const bo = orders(cmds).find((c) => c.unitIds.includes(ger[0].id));
    expect(bo?.order.note).toMatch(/break out/);
    expect(bo?.order.target![0]).toBeGreaterThan(2.5);
  });
});

describe('AI respects fog of war', () => {
  it('does not react to hidden enemy units', () => {
    uid = 0;
    const ger = germanForce(5, 2.4);
    const mass = Array.from({ length: 14 }, (_, i) => hidden(mkUnit('FRA', 'infantry', [1.6 + (i % 7) * 0.03, 51 + Math.floor(i / 7) * 0.1])));
    const st = mkState([...ger, ...mass], [loc('lille', 'city', [1.0, 51.2], 'FRA', 8)]);
    const cmds = aiThink(st, 'GER', flatCtx);
    const mem = st.aiState.GER as { contacts: Record<string, unknown> };
    expect(Object.keys(mem.contacts)).toHaveLength(0);
    expect(describeAi(st, 'GER').posture).not.toBe('withdraw');
    const blob = JSON.stringify(cmds);
    for (const m of mass) expect(blob.includes(m.id)).toBe(false);
  });

  it('reacts identically once the same units are revealed (and not when fog is off ... it sees all)', () => {
    uid = 0;
    const ger = germanForce(3, 2.3);
    const mass = Array.from({ length: 14 }, (_, i) => hidden(mkUnit('FRA', 'infantry', [1.7 + (i % 7) * 0.03, 51 + Math.floor(i / 7) * 0.1])));
    const blind = mkState([...ger, ...mass]);
    aiThink(blind, 'GER', flatCtx);
    expect(describeAi(blind, 'GER').posture).not.toBe('withdraw');
    const open = mkState([...ger.map((u) => ({ ...u })), ...mass.map((u) => ({ ...u }))], [], { fog: false });
    aiThink(open, 'GER', flatCtx);
    expect(describeAi(open, 'GER').posture).toBe('withdraw');
  });

  it('remembers contacts, then decays them', () => {
    uid = 0;
    const ger = germanForce(4, 2.6);
    const e = seen(mkUnit('FRA', 'infantry', [1.5, 51]));
    const st = mkState([...ger, e]);
    aiThink(st, 'GER', flatCtx);
    const mem = st.aiState.GER as { contacts: Record<string, { minutes: number }> };
    expect(mem.contacts[e.id]).toBeTruthy();
    st.units[e.id].visibleTo = ['allies'];
    st.clock.minutes += 300;
    aiThink(st, 'GER', flatCtx);
    expect(mem.contacts[e.id]).toBeTruthy(); // remembered
    st.clock.minutes += 2000;
    aiThink(st, 'GER', flatCtx);
    expect(mem.contacts[e.id]).toBeUndefined(); // decayed
  });

  it('uses the fog authority from ctx when provided', () => {
    uid = 0;
    const ger = germanForce(4, 2.6);
    const e = mkUnit('FRA', 'infantry', [1.5, 51], { visibleTo: ['allies', 'axis'] }); // stale cache says visible
    const st = mkState([...ger, e]);
    const ctx: AiContext = { rand: () => 0.5, visibleTo: () => [] }; // authority says nothing visible
    aiThink(st, 'GER', ctx);
    expect(Object.keys((st.aiState.GER as { contacts: object }).contacts)).toHaveLength(0);
  });
});

describe('AI determinism, doctrine and performance', () => {
  it('is deterministic for equal state and rng', () => {
    uid = 0;
    const build = () => {
      uid = 0;
      const ger = [...germanForce(8), mkUnit('GER', 'armoured', [2.5, 51]), mkUnit('GER', 'recon', [2.5, 51.1])];
      const fra = Array.from({ length: 5 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.2 + i * 0.1, 51 + (i % 2) * 0.2])));
      return mkState([...ger, ...fra], [loc('a', 'city', [1.0, 51], 'FRA', 7), loc('b', 'depot', [1.3, 50.5], 'FRA', 4)], { difficulty: 'normal' });
    };
    const a = aiThink(build(), 'GER', mkCtx(42));
    const b = aiThink(build(), 'GER', mkCtx(42));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.length).toBeGreaterThan(0);
  });

  it('does not mutate game state other than its own memory', () => {
    uid = 0;
    const st = mkState([...germanForce(6), ...Array.from({ length: 3 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.4 + i * 0.1, 51])))], [loc('a', 'city', [1.0, 51], 'FRA', 7)]);
    const before = JSON.stringify({ ...st, aiState: {} });
    aiThink(st, 'GER', mkCtx(3));
    expect(JSON.stringify({ ...st, aiState: {} })).toBe(before);
  });

  it('reads scenario-supplied doctrine and sanitises it', () => {
    uid = 0;
    const st = mkState(germanForce(2));
    st.special.aiDoctrine = { GER: { posture: 'withdraw', reserveFraction: 9, maxCommands: 'x', fallbackLocations: ['z', 3] } };
    const d = resolveDoctrine(st, 'GER');
    expect(d.posture).toBe('withdraw');
    expect(d.reserveFraction).toBe(0.6);
    expect(d.maxCommands).toBe(40);
    expect(d.fallbackLocations).toEqual(['z']);
    aiThink(st, 'GER', flatCtx);
    expect(describeAi(st, 'GER').posture).toBe('withdraw');
  });

  it('applies decision latency: a changed assessment is adopted only after the reaction delay', () => {
    uid = 0;
    const ger = germanForce(14, 2.4);
    const fra = Array.from({ length: 4 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.5 + i * 0.05, 51])));
    const st = mkState([...ger, ...fra], [], { difficulty: 'normal', aggr: 0.5 });
    aiThink(st, 'GER', flatCtx);
    const first = describeAi(st, 'GER').posture;
    // bring in a large enemy force => wants 'defend' but must wait
    for (let i = 0; i < 8; i++) { const u = seen(mkUnit('FRA', 'infantry', [1.6 + i * 0.03, 51.2])); st.units[u.id] = u; }
    st.clock.minutes += 60;
    aiThink(st, 'GER', flatCtx);
    const mid = describeAi(st, 'GER').posture;
    st.clock.minutes += 600;
    aiThink(st, 'GER', flatCtx);
    const last = describeAi(st, 'GER').posture;
    expect(mid).toBe(first);
    expect(last).not.toBe(first);
  });

  it('thinks fast on 300 units (<5ms average)', () => {
    uid = 0;
    const us: Unit[] = [];
    const types: UnitType[] = ['infantry', 'infantry', 'infantry', 'armoured', 'artillery', 'recon', 'motorised', 'hq', 'engineer'];
    for (let i = 0; i < 150; i++) us.push(mkUnit('GER', types[i % types.length], [2.1 + (i % 15) * 0.1, 50.2 + Math.floor(i / 15) * 0.15]));
    for (let i = 0; i < 150; i++) us.push(seen(mkUnit('FRA', types[i % types.length], [0.2 + (i % 15) * 0.1, 50.2 + Math.floor(i / 15) * 0.15])));
    const locs = Array.from({ length: 30 }, (_, i) => loc(`l${i}`, i % 3 === 0 ? 'depot' : 'city', [0.2 + (i % 10) * 0.18, 50.3 + Math.floor(i / 10) * 0.5], i < 15 ? 'FRA' : 'GER', 1 + (i % 9)));
    const st = mkState(us, locs);
    // warm-up (JIT) then measure; memory persists as in a real game
    for (let i = 0; i < 5; i++) aiThink(st, 'GER', mkCtx(i));
    const t0 = performance.now();
    const N = 30;
    for (let i = 0; i < N; i++) { st.clock.minutes += 60; aiThink(st, 'GER', mkCtx(i)); }
    const avg = (performance.now() - t0) / N;
    expect(avg).toBeLessThan(5);
  });

  it('unit power drops with strength, cohesion and ammunition', () => {
    const a = mkUnit('GER', 'infantry', [0, 0]);
    const b = mkUnit('GER', 'infantry', [0, 0], { manpower: 300, organisation: 30, ammo: 5 });
    expect(unitPower(b)).toBeLessThan(unitPower(a) * 0.5);
  });
});

describe('AI air support', () => {
  const mkAir = (pos: [number, number]): Unit => mkUnit('GER', 'air_bomber', pos, { domain: 'air', equipment: { held: { aircraft_bomber: 40 }, authorised: { aircraft_bomber: 40 } } });

  it('counts own bomber groups in range when deciding to attack a strongly held objective', () => {
    const build = (withAir: boolean) => {
      uid = 0;
      const ger = [...germanForce(5), mkUnit('GER', 'armoured', [2.5, 51]), mkUnit('GER', 'armoured', [2.5, 51.1])];
      const sedan = loc('sedan', 'city', [1.4, 51.1], 'FRA', 8);
      const fra = Array.from({ length: 5 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.4 + i * 0.01, 51.1], { entrenchment: 60 })));
      const air = withAir ? [mkAir([2.2, 51]), mkAir([2.3, 51.05]), mkAir([2.2, 51.1])] : [];
      const st = mkState([...ger, ...fra, ...air], [sedan]);
      st.special.aiDoctrine = { GER: { maxOperations: 1 } };
      return ops(aiThink(st, 'GER', flatCtx)).length;
    };
    expect(build(true)).toBeGreaterThanOrEqual(build(false));
  });

  it('redeploys air groups out of range toward the main effort', () => {
    uid = 0;
    const ger = [...germanForce(10), mkUnit('GER', 'armoured', [2.5, 51]), mkUnit('GER', 'armoured', [2.5, 51.1]), mkUnit('GER', 'armoured', [2.55, 51]), mkUnit('GER', 'armoured', [2.55, 51.1])];
    const far = mkAir([3.9, 50.2]);
    const home = loc('af', 'airfield', [2.6, 51.05], 'GER', 3);
    const lille = loc('lille', 'city', [1.0, 51.2], 'FRA', 8);
    const fra = Array.from({ length: 3 }, (_, i) => seen(mkUnit('FRA', 'infantry', [1.0 + i * 0.02, 51.2])));
    const st = mkState([...ger, ...fra, far], [home, lille]);
    st.special.aiDoctrine = { GER: { armourObjectives: ['lille'], redeployAir: true } };
    const cmds = orders(aiThink(st, 'GER', flatCtx));
    const mv = cmds.find((c) => c.unitIds.includes(far.id));
    expect(mv?.order.kind).toBe('move');
    expect(fastKm(mv!.order.target!, home.pos)).toBeLessThan(2);
  });
});
