import type {
  ClockState, Command, CommandResult, ControlGrid, Engine, GameSettings, GameState, InfraLine, NationId, NationState, ScenarioDefinition,
  SideId, TerrainGrid, Unit,
} from '../core/types';
import { SAVE_SCHEMA_VERSION, TICK_MINUTES, Terrain } from '../core/types';
import { cellCenter, gridSpec, inBBox, pointInPolygon } from '../core/geo';
import { nextFloat, nextGauss } from '../core/rng';
import type { SimContext } from './context';
import {
  AI_THINK_INTERVAL, MAX_LOG, MAX_REAL_DT_MS, MAX_TICKS_PER_ADVANCE, REAL_MS_PER_TICK_1X, SUPPLY_EVERY_TICKS, WEATHER_EVERY_TICKS,
} from './constants';
import { updateCombat } from './combat';
import { getGridInfo, terrainAt } from './gridutil';
import { ai, events, military } from './deps';
import { updateFog, visibleTo } from './fog';
import { updateMovement } from './movement';
import { getSimMeta } from './meta';
import { iceOf, updateIce } from './ice';
import { moveClassOf, passableIce } from './pathfinding';
import { activeModules } from './special';
import { nationIndex, updateTerritory } from './territory';
import { checkVictory } from './victory';
import { rollWeather, updateWeather } from './weather';

const MAX_HISTORY = 500;
const MAX_EVENTS = 500;
const OPTIONAL_UNIT_KEYS = ['route', 'routeEtaMinutes', 'inBattle', 'encircled', 'destroyed', 'surrendered', 'visibleTo', 'lastSeenBy', 'parentId', 'homeLocation'];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export interface EngineOptions {
  playerNation: NationId; settings: GameSettings; seed: number;
  /** headless/test switch: no AI nation issues orders (stored in the save so restores behave the same) */
  disableAI?: boolean;
}

function buildControl(scenario: ScenarioDefinition, terrain: TerrainGrid): ControlGrid {
  const spec = gridSpec(terrain.bbox, terrain.cellDeg);
  const palette: NationId[] = ['NEUTRAL'];
  for (const n of scenario.nations) if (!palette.includes(n.id)) palette.push(n.id);
  const owner = new Array<number>(terrain.cols * terrain.rows).fill(0);
  for (const ic of scenario.initialControl) {
    let idx = palette.indexOf(ic.nation);
    if (idx < 0) { palette.push(ic.nation); idx = palette.length - 1; }
    let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
    for (const p of ic.polygon) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
    for (let r = 0; r < terrain.rows; r++) {
      for (let c = 0; c < terrain.cols; c++) {
        const ctr = cellCenter(spec, c, r);
        if (ctr[0] < w || ctr[0] > e || ctr[1] < s || ctr[1] > n) continue;
        const i = r * terrain.cols + c;
        const t = terrain.cells[i];
        if (t === Terrain.Sea || t === Terrain.Lake) continue;
        if (pointInPolygon(ctr, ic.polygon)) owner[i] = idx;
      }
    }
  }
  return {
    bbox: { ...terrain.bbox }, cellDeg: terrain.cellDeg, cols: terrain.cols, rows: terrain.rows,
    nations: palette, owner, contested: new Array<number>(terrain.cols * terrain.rows).fill(0),
  };
}

function makeContext(state: GameState, terrain: TerrainGrid, infra: InfraLine[], scenario: ScenarioDefinition): SimContext {
  return {
    terrain, infra, scenario,
    rand: () => nextFloat(state.rng),
    gauss: () => nextGauss(state.rng),
    log(e) {
      state.log.push({ t: state.clock.minutes, ...e });
      if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
    },
  };
}

export function createEngine(scenario: ScenarioDefinition, terrain: TerrainGrid, infra: InfraLine[], opts: EngineOptions): Engine {
  const nations: Record<string, NationState> = {};
  for (const n of scenario.nations) nations[n.id] = clone(n);
  if (!nations[opts.playerNation]) throw new Error(`playerNation ${opts.playerNation} is not part of scenario ${scenario.id}`);
  // scenario-level reinforcements are routed to their nation's queue
  for (const r of scenario.reinforcements) {
    const nat = nations[r.unit.nation];
    if (nat && !nat.reinforcements.some((x) => x.id === r.id)) nat.reinforcements.push(clone(r));
  }
  const units: Record<string, Unit> = {};
  for (const u of scenario.units) {
    const c = clone(u);
    c.kills = c.kills ?? 0;
    c.orders = c.orders ?? [];
    units[c.id] = c;
  }
  const locations: GameState['locations'] = {};
  for (const l of scenario.locations) locations[l.id] = clone(l);
  const supplyNodes: GameState['supply']['nodes'] = [];
  for (const nat of Object.keys(scenario.supplySources)) {
    for (const lid of scenario.supplySources[nat]) {
      const l = locations[lid];
      if (l) supplyNodes.push({ locationId: lid, stock: 100, throughput: l.supplyCapacity ?? 10 });
    }
  }
  const state: GameState = {
    schema: SAVE_SCHEMA_VERSION,
    scenarioId: scenario.id,
    playerNation: opts.playerNation,
    playerSide: nations[opts.playerNation].side,
    settings: clone(opts.settings),
    clock: { minutes: 0, speed: 0, startMinutes: 0, accumulatorMs: 0 },
    rng: { s: opts.seed | 0 },
    seed: opts.seed,
    idCounter: 1,
    units, nations, locations,
    control: buildControl(scenario, terrain),
    weather: { kind: 'clear', intensity: 0.5, temperatureC: 12, nextChangeMinutes: 0 },
    supply: { nodes: supplyNodes, unitSupplyDistKm: {}, cutOffUnits: [] },
    battles: {}, reports: [], operations: {}, events: [], eventState: {},
    log: [], objectives: clone(scenario.objectives), aiState: {}, special: {},
    history: [{ t: 0, text: `Campaign begins: ${scenario.title}.` }],
  };
  const ctx = makeContext(state, terrain, infra, scenario);
  // locations anchor their cells
  for (const lid in state.locations) {
    const l = state.locations[lid];
    const c = Math.floor((l.pos[0] - terrain.bbox.west) / terrain.cellDeg), r = Math.floor((terrain.bbox.north - l.pos[1]) / terrain.cellDeg);
    if (inBBox(l.pos, terrain.bbox) && c >= 0 && r >= 0 && c < terrain.cols && r < terrain.rows) {
      const i = r * terrain.cols + c;
      const t = terrain.cells[i];
      if (t !== Terrain.Sea && t !== Terrain.Lake) state.control.owner[i] = nationIndex(state, l.owner);
    }
  }
  state.weather = rollWeather(scenario, 0, undefined, ctx);
  if (opts.disableAI) getSimMeta(state).aiOff = true;
  for (const m of activeModules(ctx)) m.init?.(state, ctx);
  updateFog(state, ctx);
  ctx.log({ category: 'system', severity: 'info', text: `${scenario.title} initialised (seed ${opts.seed}).` });
  return makeEngine(state, terrain, infra, scenario, ctx);
}

export function restoreEngine(saved: GameState, scenario: ScenarioDefinition, terrain: TerrainGrid, infra: InfraLine[]): Engine {
  const state = clone(saved);
  const ctx = makeContext(state, terrain, infra, scenario);
  return makeEngine(state, terrain, infra, scenario, ctx);
}

function makeEngine(state: GameState, terrain: TerrainGrid, infra: InfraLine[], scenario: ScenarioDefinition, ctx: SimContext): Engine {
  const subs = new Set<(s: Readonly<GameState>) => void>();
  const notify = () => { for (const fn of Array.from(subs)) fn(state); };
  updateIce(state, scenario);

  function dispatchInternal(cmd: Command, as: SideId | 'any'): CommandResult {
    if (state.result) return { ok: false, error: 'The campaign has ended.' };
    if (as === 'neutral') return { ok: false, error: 'Neutral side cannot issue commands.' };
    if (cmd.type === 'resolve_event') {
      const ev = state.events.find((e) => e.id === cmd.eventId);
      if (!ev) return { ok: false, error: `Unknown event ${cmd.eventId}.` };
      if (as !== 'any' && ev.side && ev.side !== as) return { ok: false, error: 'This event is not yours to decide.' };
      return events.applyEventChoice(state, cmd.eventId, cmd.choiceId);
    }
    if (cmd.type === 'issue_order' && cmd.order.target) {
      const info = getGridInfo(terrain, infra);
      for (const id of cmd.unitIds) {
        const u = state.units[id];
        if (!u || u.domain === 'air') continue;
        const t = terrainAt(info, cmd.order.target, Terrain.Plains);
        const water = t === Terrain.Sea || (t === Terrain.Lake && !passableIce(moveClassOf(u.type), t, iceOf(state)));
        if (u.domain === 'land' && water) return { ok: false, error: 'Target is open water: land units cannot go there.' };
      }
    }
    return military.applyCommand(state, cmd, as);
  }

  function aiNations(): NationId[] {
    const out: NationId[] = [];
    for (const id in state.nations) {
      const n = state.nations[id];
      if (id === state.playerNation || id === 'NEUTRAL' || n.side === 'neutral') continue;
      out.push(id as NationId);
    }
    return out;
  }

  function tick(): void {
    state.clock.minutes += TICK_MINUTES;
    updateIce(state, ctx.scenario);
    const t = Math.floor(state.clock.minutes / TICK_MINUTES);
    military.processReinforcements(state);                                    // 1
    events.updateEvents(state, ctx);                                          // 2
    if (t % WEATHER_EVERY_TICKS === 0) updateWeather(state, ctx);             // 3
    const ais = getSimMeta(state).aiOff ? [] : aiNations();                   // 4
    for (let i = 0; i < ais.length; i++) {
      if ((t + i) % AI_THINK_INTERVAL !== 0) continue;
      const nat = ais[i];
      const cmds = ai.aiThink(state, nat, ctx);
      const side = state.nations[nat].side;
      for (const c of cmds) dispatchInternal(c, side);
    }
    military.processOrders(state, ctx);                                       // 5
    updateMovement(state, ctx);                                               // 6
    updateCombat(state, ctx);                                                 // 7
    if (t % SUPPLY_EVERY_TICKS === 0) military.updateSupply(state, ctx);      // 8
    military.updateUnitStats(state, ctx);                                     // 9
    for (const m of activeModules(ctx)) m.update?.(state, ctx);               // 9b campaign modules
    updateTerritory(state, ctx);                                              // 10
    updateFog(state, ctx);                                                    // 11
    checkVictory(state, ctx);                                                 // 12
    housekeeping();
  }

  /** Caps growth and normalises optional keys so a JSON round trip yields the same key order as a live run. */
  function housekeeping(): void {
    if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
    if (state.history.length > MAX_HISTORY) state.history.splice(0, state.history.length - MAX_HISTORY);
    if (state.events.length > MAX_EVENTS) {
      let drop = state.events.length - MAX_EVENTS;
      state.events = state.events.filter((e) => (drop > 0 && e.resolved ? (drop--, false) : true));
      if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
    }
    for (const id in state.units) {
      const u = state.units[id] as unknown as Record<string, unknown>;
      for (const k of OPTIONAL_UNIT_KEYS) if (k in u && u[k] === undefined) delete u[k];
    }
  }

  const engine: Engine = {
    terrain, infra,
    getState: () => state,
    dispatch(cmd, as) {
      const r = dispatchInternal(cmd, as ?? state.playerSide);
      if (r.ok) notify();
      return r;
    },
    step(ticks = 1) {
      let n = 0;
      for (let i = 0; i < ticks && !state.result; i++) { tick(); n++; }
      if (n > 0) notify();
    },
    advance(realDtMs) {
      const clock: ClockState = state.clock;
      if (clock.speed === 0 || state.result) return 0;
      const dt = Math.max(0, Math.min(MAX_REAL_DT_MS, realDtMs));
      let acc = clock.accumulatorMs + dt * clock.speed;
      let n = 0;
      while (acc >= REAL_MS_PER_TICK_1X && n < MAX_TICKS_PER_ADVANCE && !state.result) {
        tick(); acc -= REAL_MS_PER_TICK_1X; n++;
      }
      clock.accumulatorMs = acc;
      if (n > 0) notify();
      return n;
    },
    setSpeed(s) { state.clock.speed = s; },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    serialize: () => clone(state),
    visibleUnits: (side) => visibleTo(state, side),
  };
  void scenario;
  return engine;
}
