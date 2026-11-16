import type {
  GameSettings, InfraLine, Location, NationState, Objective, ScenarioDefinition, TerrainGrid, Unit, UnitType, WeatherKind,
} from '../src/core/types';
import { Terrain } from '../src/core/types';

export const SETTINGS: GameSettings = {
  difficulty: 'normal', aiAggression: 0.5, fogOfWar: false, historicalDeployment: true, randomEvents: false,
  logisticsDifficulty: 1, reinforcementAvailability: 1, historicalEventFrequency: 1,
};

const MAN: Record<string, number> = { infantry: 10000, armoured: 12000, mechanised: 11000, motorised: 9000, artillery: 4000, hq: 500, recon: 1200, antitank: 3000, engineer: 2500, logistics: 2000, paratroop: 8000 };
const EQUIP: Record<string, Record<string, number>> = {
  infantry: { rifle: 9000, gun_arty: 48 }, armoured: { tank_medium: 200, rifle: 3000, gun_arty: 24 }, mechanised: { tank_medium: 90, apc: 150, rifle: 5000 },
  artillery: { gun_arty: 96, rifle: 2000 }, antitank: { gun_at: 72, rifle: 1500 }, motorised: { truck: 800, rifle: 6000 }, recon: { armoured_car: 60, rifle: 400 },
  hq: { rifle: 300 }, engineer: { rifle: 2000 }, logistics: { truck: 400 }, paratroop: { rifle: 7000 },
};

let seq = 0;
export function mkUnit(id: string, nation: 'GER' | 'FRA', type: UnitType, pos: [number, number], extra: Partial<Unit> = {}): Unit {
  const man = MAN[type] ?? 5000;
  const eq = EQUIP[type] ?? { rifle: man };
  seq++;
  return {
    id, name: `${id} (${type})`, shortName: id, nation, side: nation === 'GER' ? 'axis' : 'allies', type, domain: 'land', pos,
    manpower: man, manpowerMax: man, equipment: { held: { ...eq }, authorised: { ...eq } },
    organisation: 100, morale: 80, experience: 50, fuel: 100, ammo: 100, supply: 100, fatigue: 0, readiness: 100, entrenchment: 0,
    moveStatus: 'stationary', combatStatus: 'idle', posture: 'hold', orders: [], kills: 0, ...extra,
  };
}

export interface WorldOpts {
  /** override terrain code for the whole map (default plains with features) */
  flat?: number;
  units?: Unit[];
  infra?: InfraLine[];
  weather?: Partial<Record<WeatherKind, number>>;
  fog?: boolean;
  objectives?: Objective[];
  extraLocations?: Location[];
  bbox?: { west: number; south: number; east: number; north: number };
  cellDeg?: number;
  /** if given every cell inside this lon range is this terrain (battle ground) */
  patch?: { west: number; east: number; terrain: number };
}

export function makeWorld(o: WorldOpts = {}) {
  const bbox = o.bbox ?? { west: 0, south: 50, east: 4, north: 53 };
  const cellDeg = o.cellDeg ?? 0.05;
  const cols = Math.ceil((bbox.east - bbox.west) / cellDeg), rows = Math.ceil((bbox.north - bbox.south) / cellDeg);
  const cells: number[] = new Array(cols * rows).fill(o.flat ?? Terrain.Plains);
  const flags: number[] = new Array(cols * rows).fill(0);
  if (o.flat === undefined && !o.bbox) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (r < 3) cells[i] = Terrain.Sea;                          // northern sea
      if (c >= 30 && c < 36 && r >= 20 && r < 40) cells[i] = Terrain.Forest;
      if (c >= 50 && c < 54 && r >= 10 && r < 50) cells[i] = Terrain.Hills;
      if (c >= 10 && c < 14 && r >= 40 && r < 46) cells[i] = Terrain.Lake;
    }
  }
  if (o.patch) {
    for (let r = 3; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lon = bbox.west + (c + 0.5) * cellDeg;
      if (lon >= o.patch.west && lon <= o.patch.east) cells[r * cols + c] = o.patch.terrain;
    }
  }
  const terrain: TerrainGrid = { bbox, cellDeg, cols, rows, cells, flags };
  const mid = (bbox.west + bbox.east) / 2;
  const nation = (id: 'GER' | 'FRA', side: 'axis' | 'allies', name: string): NationState => ({
    id, side, name, playable: true,
    resources: { manpower: 1e5, fuel: 1e4, ammo: 1e4, equipment: 1e4, supplyPoints: 1e3 }, income: { manpower: 0, fuel: 0, ammo: 0, equipment: 0, supplyPoints: 0 }, reinforcements: [],
  });
  const loc = (id: string, name: string, lon: number, lat: number, owner: 'GER' | 'FRA', value = 5): Location =>
    ({ id, name, kind: 'town', pos: [lon, lat], owner, originalOwner: owner, value });
  const locations: Location[] = [
    loc('paris', 'Paris', bbox.west + 0.3, 51.5, 'FRA', 10), loc('lille', 'Lille', mid - 0.8, 51.5, 'FRA', 4),
    loc('berlin', 'Berlin', bbox.east - 0.3, 51.5, 'GER', 10), loc('aachen', 'Aachen', mid + 0.8, 51.5, 'GER', 4),
    ...(o.extraLocations ?? []),
  ];
  const w = o.weather ?? { clear: 1 };
  // keep both sides alive in the far corners so the campaign never ends by elimination
  const units: Unit[] = [...(o.units ?? [])];
  if (!units.some((u) => u.nation === 'FRA')) units.push(mkUnit('RF', 'FRA', 'infantry', [bbox.west + 0.1, bbox.south + 0.1]));
  if (!units.some((u) => u.nation === 'GER')) units.push(mkUnit('RG', 'GER', 'infantry', [bbox.east - 0.1, bbox.south + 0.1]));
  const scenario: ScenarioDefinition = {
    schema: 1, id: 'test.fixture', campaignId: 'test', title: 'Fixture War', scale: 'short',
    startDate: '1940-05-10T00:00:00Z', endDate: '1940-07-10T00:00:00Z', bbox, estimatedPlayMinutes: [1, 2], mapSize: 'small', complexity: 1,
    briefing: { historical: 'x', situation: 'x' },
    playableNations: [{ nation: 'FRA', difficultyRating: 1, summary: 'x', objectiveIds: ['o1'] }],
    nations: [nation('FRA', 'allies', 'France'), nation('GER', 'axis', 'Germany')],
    locations, units, reinforcements: [],
    objectives: o.objectives ?? [],
    terrainFile: 'x', infraFile: 'x', supplySources: { FRA: ['paris'], GER: ['berlin'] },
    initialControl: [
      { nation: 'FRA', polygon: [[bbox.west, bbox.south], [mid, bbox.south], [mid, bbox.north], [bbox.west, bbox.north]] },
      { nation: 'GER', polygon: [[mid, bbox.south], [bbox.east, bbox.south], [bbox.east, bbox.north], [mid, bbox.north]] },
    ],
    weatherProfile: [{ month: 5, probs: w, tempC: 12 }, { month: 6, probs: w, tempC: 15 }, { month: 7, probs: w, tempC: 18 }],
    eventTemplateIds: [], specialSystems: [], sources: [{ id: 's', citation: 'test fixture' }],
  };
  const infra: InfraLine[] = o.infra ?? [];
  return { scenario, terrain, infra, settings: { ...SETTINGS, fogOfWar: o.fog ?? false } };
}

export function cloneJSON<T>(x: T): T { return JSON.parse(JSON.stringify(x)) as T; }
