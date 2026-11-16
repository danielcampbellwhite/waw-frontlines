/** Tiny in-memory Engine for developing the UI before src/sim exists. NOT the real simulation. */
import type {
  BattleReport, Command, CommandResult, Engine, GameEvent, GameSettings, GameState, LogEntry, NationState, Objective, Order, ScenarioDefinition, Unit, UnitType,
} from '../../core/types';
import { TICK_MINUTES } from '../../core/types';
import { moveToward, haversineKm } from '../../core/geo';

const mkUnit = (id: string, name: string, short: string, nation: Unit['nation'], side: Unit['side'], type: UnitType, pos: [number, number], parentId?: string, over: Partial<Unit> = {}): Unit => ({
  id, name, shortName: short, nation, side, type, domain: type.startsWith('air') ? 'air' : type === 'naval' || type === 'carrier' ? 'sea' : 'land', parentId, pos,
  manpower: type === 'hq' ? 400 : 12000, manpowerMax: type === 'hq' ? 400 : 14000,
  equipment: { held: { rifle: 9200, tank_medium: 120, gun_arty: 70 }, authorised: { rifle: 11000, tank_medium: 160, gun_arty: 72 } },
  organisation: 82, morale: 74, experience: 55, fuel: 80, ammo: 66, supply: 72, fatigue: 18, readiness: 78, entrenchment: 10,
  moveStatus: 'stationary', combatStatus: 'idle', posture: 'hold', orders: [], kills: 0, ...over,
});

export function mockScenario(): ScenarioDefinition {
  const bbox = { west: 2, south: 48, east: 8, north: 51.5 };
  const units: Unit[] = [
    mkUnit('g-a', 'Heeresgruppe A', 'HGr A', 'GER', 'axis', 'hq', [6.1, 50.3]),
    mkUnit('g-1', '1. Panzer-Division', '1.PzD', 'GER', 'axis', 'armoured', [5.9, 50.1], 'g-a', { posture: 'attack' }),
    mkUnit('g-2', '2. Panzer-Division', '2.PzD', 'GER', 'axis', 'armoured', [5.7, 50.0], 'g-a'),
    mkUnit('g-3', '3. Infanterie-Division', '3.ID', 'GER', 'axis', 'infantry', [6.4, 50.4], 'g-a'),
    mkUnit('g-4', 'Schwere Artillerie-Abt. 4', 'sArt 4', 'GER', 'axis', 'artillery', [6.3, 50.2], 'g-a'),
    mkUnit('g-5', 'Jagdgeschwader 26', 'JG 26', 'GER', 'axis', 'air_fighter', [6.8, 50.7], undefined, { manpower: 900, manpowerMax: 1200 }),
    mkUnit('f-hq', '9e Armee', '9e Armée', 'FRA', 'allies', 'hq', [4.6, 49.8]),
    mkUnit('f-1', '102e Division', '102e DI', 'FRA', 'allies', 'infantry', [4.9, 49.9], 'f-hq', { posture: 'defend', entrenchment: 60 }),
    mkUnit('f-2', '5e DLC', '5e DLC', 'FRA', 'allies', 'mechanised', [4.7, 49.6], 'f-hq'),
    mkUnit('f-3', '1re DCR', '1re DCr', 'FRA', 'allies', 'armoured', [4.4, 49.5], 'f-hq', { manpower: 5200 }),
    mkUnit('b-1', 'BEF 2nd Division', '2nd Div', 'GBR', 'allies', 'infantry', [3.2, 50.5]),
    mkUnit('b-2', 'Royal Navy Channel Squadron', 'Chan Sqn', 'GBR', 'allies', 'naval', [2.6, 50.9]),
  ];
  const nations: NationState[] = [
    { id: 'GER', side: 'axis', name: 'Germany', playable: true, resources: { manpower: 120000, fuel: 8400, ammo: 9100, equipment: 2300, supplyPoints: 5200 }, income: { manpower: 40, fuel: 22, ammo: 18, equipment: -3, supplyPoints: 30 }, reinforcements: [] },
    { id: 'FRA', side: 'allies', name: 'France', playable: true, resources: { manpower: 90000, fuel: 5000, ammo: 6000, equipment: 1200, supplyPoints: 3000 }, income: { manpower: 25, fuel: 10, ammo: 12, equipment: 2, supplyPoints: 18 }, reinforcements: [] },
    { id: 'GBR', side: 'allies', name: 'United Kingdom', playable: false, resources: { manpower: 50000, fuel: 3000, ammo: 3000, equipment: 800, supplyPoints: 2000 }, income: { manpower: 10, fuel: 5, ammo: 5, equipment: 1, supplyPoints: 9 }, reinforcements: [] },
  ];
  const obj = (id: string, side: 'axis' | 'allies', tier: Objective['tier'], title: string, loc: string, pts: number): Objective => ({ id, tier, side, title, description: `Secure ${title.toLowerCase()} before the enemy can reinforce.`, condition: { kind: 'capture_location', locationId: loc }, points: pts, status: 'pending' });
  return {
    schema: 1, id: 'mock.standard', campaignId: 'mock', title: 'Fall of France (mock)', scale: 'standard', startDate: '1940-05-10T04:00:00Z', endDate: '1940-06-25T00:00:00Z', bbox,
    estimatedPlayMinutes: [180, 300], mapSize: 'medium', complexity: 3,
    briefing: { historical: 'In the spring of 1940 the German army struck west. The Allied plan assumed a repeat of 1914: a thrust through Belgium that the French and British could meet along the Dyle. The decisive blow, however, was prepared elsewhere.', situation: 'Army Group A masses seven panzer divisions opposite the Ardennes, a sector the French high command considers unsuitable for armour. The French 9th Army holds the Meuse with second-line divisions.' },
    playableNations: [
      { nation: 'GER', difficultyRating: 2, summary: 'Break through the Ardennes and drive for the Channel coast.', objectiveIds: ['o1', 'o2'] },
      { nation: 'FRA', difficultyRating: 4, summary: 'Hold the Meuse crossings with under-strength reserve divisions.', objectiveIds: ['o3'] },
    ],
    nations, locations: [
      { id: 'sedan', name: 'Sedan', kind: 'city', pos: [4.94, 49.7], owner: 'FRA', originalOwner: 'FRA', value: 8 },
      { id: 'dinant', name: 'Dinant', kind: 'bridge', pos: [4.91, 50.26], owner: 'FRA', originalOwner: 'FRA', value: 5 },
      { id: 'abbeville', name: 'Abbeville', kind: 'town', pos: [1.9, 50.1], owner: 'FRA', originalOwner: 'FRA', value: 7 },
    ], units, reinforcements: [], objectives: [obj('o1', 'axis', 'primary', 'Cross the Meuse at Sedan', 'sedan', 40), obj('o2', 'axis', 'secondary', 'Take Abbeville', 'abbeville', 30), obj('o3', 'allies', 'primary', 'Hold Sedan', 'sedan', 40)],
    terrainFile: '', infraFile: '', supplySources: {}, initialControl: [], weatherProfile: [], eventTemplateIds: [], specialSystems: [], sources: [],
  };
}

export function createMockEngine(playerNation: 'GER' | 'FRA' = 'GER', settings?: Partial<GameSettings>): { engine: Engine; scenario: ScenarioDefinition } {
  const scenario = mockScenario();
  const units: Record<string, Unit> = {}; scenario.units.forEach(u => { units[u.id] = structuredClone(u); });
  const side = playerNation === 'GER' ? 'axis' : 'allies';
  const st: GameState = {
    schema: 1, scenarioId: scenario.id, playerNation, playerSide: side,
    settings: { difficulty: 'normal', aiAggression: 0.5, fogOfWar: true, historicalDeployment: true, randomEvents: true, logisticsDifficulty: 1, reinforcementAvailability: 1, historicalEventFrequency: 1, ...settings },
    clock: { minutes: 0, speed: 0, startMinutes: 0, accumulatorMs: 0 }, rng: { s: 1 }, seed: 1, idCounter: 1, units,
    nations: Object.fromEntries(scenario.nations.map(n => [n.id, structuredClone(n)])), locations: Object.fromEntries(scenario.locations.map(l => [l.id, structuredClone(l)])),
    control: { bbox: scenario.bbox, cellDeg: 1, cols: 1, rows: 1, nations: ['NEUTRAL'], owner: [0], contested: [0] },
    weather: { kind: 'cloud', intensity: 0.3, temperatureC: 11, nextChangeMinutes: 600 }, supply: { nodes: [], unitSupplyDistKm: {}, cutOffUnits: [] },
    battles: {}, reports: [], operations: {}, events: [], eventState: {}, log: [], objectives: structuredClone(scenario.objectives), aiState: {}, special: {}, history: [{ t: 0, text: 'Campaign begins.' }],
  };
  // a battle already underway to exercise battle UI
  st.units['g-1'].inBattle = 'b1'; st.units['f-1'].inBattle = 'b1'; st.units['g-1'].combatStatus = 'attacking'; st.units['f-1'].combatStatus = 'defending';
  st.battles['b1'] = { id: 'b1', pos: [5.3, 49.95], attackers: ['g-1'], defenders: ['f-1'], startedAt: 0, rounds: 3, terrain: 3, weather: 'cloud', log: ['Round 3: attackers gain ground on the left flank.'] };
  const report: BattleReport = {
    id: 'r1', battleId: 'b0', startedAt: -300, endedAt: -60, pos: [4.94, 49.7], placeName: 'Sedan', attackerSide: 'axis', outcome: 'attacker_victory',
    summary: 'The 1st Panzer Division forced the Meuse after a day of dive-bomber and artillery preparation; the defending 55th Division collapsed.',
    reasons: ['Concentrated air support suppressed the defending artillery.', 'Defenders were second-line troops with low experience.', 'River assault boats allowed an unopposed first wave.'],
    casualties: [{ unitId: 'g-1', name: '1. Panzer-Division', killed: 210, wounded: 640, captured: 0 }, { unitId: 'f-1', name: '55e Division', killed: 820, wounded: 1900, captured: 2400 }],
    equipmentLosses: { rifle: 900, gun_arty: 14 }, orgChanges: [{ unitId: 'g-1', before: 88, after: 61 }, { unitId: 'f-1', before: 70, after: 12 }], retreats: ['f-1'], territoryChangeCells: 38, consequences: ['The Sedan bridgehead is established.', 'French reserves are drawn south.'],
  };
  st.reports.push(report);
  const pushLog = (e: Omit<LogEntry, 't'>) => st.log.push({ t: st.clock.minutes, ...e });
  pushLog({ category: 'system', text: 'Campaign begins.', severity: 'info' });
  pushLog({ category: 'battle', text: 'Contact at the Meuse: 1.PzD engaged by 102e DI.', severity: 'warn', pos: [5.3, 49.95] });

  const subs = new Set<(s: Readonly<GameState>) => void>();
  const notify = () => subs.forEach(f => f(st));
  let oid = 1;
  const ok = (ids?: string[]): CommandResult => ({ ok: true, ids });
  const engine: Engine = {
    terrain: { bbox: scenario.bbox, cellDeg: 1, cols: 1, rows: 1, cells: [1] }, infra: [],
    getState: () => st,
    dispatch(cmd: Command, as) {
      if (as && as !== st.playerSide) return { ok: false, error: 'wrong side' };
      switch (cmd.type) {
        case 'issue_order': {
          const ids: string[] = [];
          for (const id of cmd.unitIds) {
            const u = st.units[id]; if (!u) return { ok: false, error: `unknown unit ${id}` };
            const o: Order = { ...cmd.order, id: `o${oid++}`, issuedAt: st.clock.minutes, status: 'queued' };
            if (cmd.mode === 'replace') u.orders = [];
            u.orders.push(o); ids.push(o.id);
            if (!u.orders.some(x => x.status === 'active')) { u.orders[0].status = 'active'; }
            if (o.target) { u.route = [o.target]; u.routeEtaMinutes = haversineKm(u.pos, o.target) * 5; u.moveStatus = 'moving'; }
          }
          pushLog({ category: 'order', text: `${cmd.order.kind} order issued to ${cmd.unitIds.length} unit(s).`, severity: 'info' });
          notify(); return ok(ids);
        }
        case 'cancel_orders': for (const id of cmd.unitIds) { const u = st.units[id]; if (!u) continue; u.orders = cmd.orderId ? u.orders.filter(o => o.id !== cmd.orderId) : []; if (!u.orders.length) { u.moveStatus = 'stationary'; u.route = undefined; } } notify(); return ok();
        case 'set_posture': cmd.unitIds.forEach(id => { st.units[id].posture = cmd.posture; }); notify(); return ok();
        case 'rename': st.units[cmd.unitId].name = cmd.name; notify(); return ok();
        case 'create_operation': { const id = `op${oid++}`; st.operations[id] = { ...cmd.operation, id, status: 'planned' }; notify(); return ok([id]); }
        case 'cancel_operation': if (st.operations[cmd.operationId]) st.operations[cmd.operationId].status = 'cancelled'; notify(); return ok();
        case 'resolve_event': { const e = st.events.find(x => x.id === cmd.eventId); if (!e) return { ok: false, error: 'no such event' }; e.resolved = true; e.chosen = cmd.choiceId; st.history.push({ t: st.clock.minutes, text: `${e.title}: ${e.choices?.find(c => c.id === cmd.choiceId)?.label}` }); notify(); return ok(); }
        case 'request_reinforcement': return { ok: false, error: 'not available in mock' };
      }
    },
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        st.clock.minutes += TICK_MINUTES;
        for (const u of Object.values(st.units)) {
          const o = u.orders.find(x => x.status === 'active');
          if (o?.target) {
            u.pos = moveToward(u.pos, o.target, 12);
            if (haversineKm(u.pos, o.target) < 0.5) { o.status = 'complete'; u.orders = u.orders.filter(x => x !== o); const nx = u.orders[0]; if (nx) nx.status = 'active'; else { u.moveStatus = 'stationary'; u.route = undefined; } }
            else u.routeEtaMinutes = haversineKm(u.pos, o.target) * 5;
          }
        }
        if (st.clock.minutes === 3 * 60) {
          const ev: GameEvent = { id: 'ev1', templateId: 't', firedAt: st.clock.minutes, title: 'Request for air support', body: 'Luftflotte 3 offers a concentrated strike on the Meuse defences, but fuel at forward airfields is short.', kind: 'historical', side: 'axis',
            choices: [{ id: 'accept', label: 'Commit the Stukas', effectSummary: 'Defender organisation -20 in the sector; air fuel reserves drop.' }, { id: 'decline', label: 'Hold them for the second day', effectSummary: 'No immediate effect; air units stay available.' }] };
          st.events.push(ev); pushLog({ category: 'event', text: ev.title, severity: 'warn' });
        }
        if (st.battles['b1']) st.battles['b1'].rounds++;
      }
      notify();
    },
    advance(dt) { const sp = st.clock.speed; if (!sp) return 0; st.clock.accumulatorMs += dt * sp; let n = 0; while (st.clock.accumulatorMs >= 1500) { st.clock.accumulatorMs -= 1500; engine.step(1); n++; } return n; },
    setSpeed(s) { st.clock.speed = s; notify(); },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    serialize: () => structuredClone(st),
    visibleUnits: s => Object.values(st.units).filter(u => u.side === s || !st.settings.fogOfWar || haversineKm(u.pos, [5, 50]) < 100),
  };
  return { engine, scenario };
}
