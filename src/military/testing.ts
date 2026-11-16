/** Test fixtures for the military module (headless, deterministic). Not imported by production code. */
import { nextFloat, nextGauss } from '../core/rng';
import type {
  ControlGrid, GameState, InfraLine, LogEntry, Location, NationId, NationState, ScenarioDefinition, TerrainGrid, Unit,
} from '../core/types';
import type { MilitaryContext } from './context';
import { createUnitFromTemplate } from './units';

export function makeNation(id: NationId, side: 'allies' | 'axis', pool = 1000): NationState {
  return {
    id, side, name: id, playable: true,
    resources: { manpower: pool, fuel: pool, ammo: pool, equipment: pool, supplyPoints: pool },
    income: { manpower: 0, fuel: 0, ammo: 0, equipment: 0, supplyPoints: 0 },
    reinforcements: [],
  };
}

export function makeLocation(id: string, kind: Location['kind'], pos: [number, number], owner: NationId, extra: Partial<Location> = {}): Location {
  return { id, name: id, kind, pos, owner, originalOwner: owner, value: 5, ...extra };
}

/** Control grid over lon 0..10, lat 48..52 at 0.5 deg; west of `splitLon` owned by FRA, east by GER. */
export function makeControl(splitLon = 100, cellDeg = 0.5): ControlGrid {
  const cols = Math.round(10 / cellDeg), rows = Math.round(4 / cellDeg);
  const nations: NationId[] = ['NEUTRAL', 'FRA', 'GER'];
  const owner: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) owner.push((c + 0.5) * cellDeg < splitLon ? 1 : 2);
  return { bbox: { west: 0, south: 48, east: 10, north: 52 }, cellDeg, cols, rows, nations, owner, contested: owner.map(() => 0) };
}

export function makeTerrain(): TerrainGrid {
  const cols = 20, rows = 8;
  return { bbox: { west: 0, south: 48, east: 10, north: 52 }, cellDeg: 0.5, cols, rows, cells: new Array(cols * rows).fill(1) };
}

export function makeScenario(supplySources: Record<string, string[]>): ScenarioDefinition {
  return { id: 'test', supplySources, units: [], reinforcements: [], locations: [], nations: [] } as unknown as ScenarioDefinition;
}

export function makeState(opts: { units?: Unit[]; locations?: Location[]; splitLon?: number; pool?: number } = {}): GameState {
  const nations: Record<string, NationState> = {
    FRA: makeNation('FRA', 'allies', opts.pool ?? 1000),
    GER: makeNation('GER', 'axis', opts.pool ?? 1000),
  };
  const state: GameState = {
    schema: 1, scenarioId: 'test', playerNation: 'FRA', playerSide: 'allies',
    settings: {
      difficulty: 'normal', aiAggression: 0.5, fogOfWar: false, historicalDeployment: true, randomEvents: false,
      logisticsDifficulty: 1, reinforcementAvailability: 1, historicalEventFrequency: 1,
    },
    clock: { minutes: 0, speed: 1, startMinutes: 0, accumulatorMs: 0 },
    rng: { s: 1 }, seed: 1, idCounter: 1,
    units: {}, nations,
    locations: {},
    control: makeControl(opts.splitLon),
    weather: { kind: 'clear', intensity: 0, temperatureC: 15, nextChangeMinutes: 99999 },
    supply: { nodes: [], unitSupplyDistKm: {}, cutOffUnits: [] },
    battles: {}, reports: [], operations: {}, events: [], eventState: {}, log: [], objectives: [],
    aiState: {}, special: {}, history: [],
  };
  for (const u of opts.units ?? []) state.units[u.id] = u;
  for (const l of opts.locations ?? []) state.locations[l.id] = l;
  return state;
}

export function makeCtx(scenario: ScenarioDefinition, infra: InfraLine[] = [], extra: Partial<MilitaryContext> = {}): MilitaryContext & { logs: Omit<LogEntry, 't'>[] } {
  const logs: Omit<LogEntry, 't'>[] = [];
  const rng = { s: 7 };
  return {
    terrain: makeTerrain(), infra, scenario,
    rand: () => nextFloat(rng), gauss: () => nextGauss(rng),
    log: e => { logs.push(e); },
    logs,
    ...extra,
  };
}

export function makeUnit(template: string, id: string, nation: NationId, pos: [number, number], extra: Partial<Unit> = {}): Unit {
  const side = nation === 'GER' || nation === 'ITA' || nation === 'JPN' ? 'axis' : 'allies';
  return createUnitFromTemplate(template, { id, name: id, shortName: id, nation, side, pos, ...extra });
}
