/**
 * WORLD AT WAR: FRONTLINES — SHARED CONTRACTS (owner: Team Lead)
 *
 * Every module depends on this file. Do NOT change it without messaging the lead.
 * All state is plain JSON-serialisable data (no classes, Maps, Sets, functions, undefined holes)
 * so that save/load is a JSON round-trip and the simulation is fully deterministic.
 *
 * COORDINATE SYSTEM: WGS84 [longitude, latitude] in decimal degrees EVERYWHERE
 * (same order as GeoJSON / MapLibre). Distances are kilometres, computed with haversine
 * (src/core/geo.ts). Never use screen pixels in simulation code.
 *
 * TIME: simulation time is integer MINUTES since the scenario epoch (`GameState.clock.minutes`).
 * The sim advances in fixed ticks of `TICK_MINUTES`. Wall-clock never influences outcomes.
 */

export type LonLat = [lon: number, lat: number];
export interface BBox { west: number; south: number; east: number; north: number }

export const SAVE_SCHEMA_VERSION = 1;
export const SCENARIO_SCHEMA_VERSION = 1;
/** One simulation tick = 60 game minutes. */
export const TICK_MINUTES = 60;

export type NationId =
  | 'GER' | 'FRA' | 'GBR' | 'USA' | 'SOV' | 'ITA' | 'JPN' | 'CAN' | 'POL' | 'BEL' | 'NED' | 'AUS' | 'NZL' | 'IND' | 'RSA' | 'ROU' | 'HUN' | 'CHN' | 'NEUTRAL';
export type SideId = 'allies' | 'axis' | 'neutral';

export type UnitId = string;
export type LocationId = string;
export type ObjectiveId = string;
export type BattleId = string;
export type EventId = string;

// ───────────────────────────── Terrain ─────────────────────────────

/** Compact terrain codes stored in TerrainGrid.cells. */
export const Terrain = {
  Sea: 0, Plains: 1, Forest: 2, Hills: 3, Mountains: 4, Marsh: 5, Urban: 6, Desert: 7, Jungle: 8, Lake: 9,
  /** Hedgerow farmland (Normandy bocage): strong defence, slow movement, short sight. */
  Bocage: 10,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** Raster terrain for a scenario region. cells.length === cols*rows, row-major from NORTH-WEST. */
export interface TerrainGrid {
  bbox: BBox;
  cellDeg: number;          // cell size in degrees (both axes)
  cols: number;
  rows: number;
  cells: number[];          // Terrain codes
  elevationM?: number[];    // optional, same indexing
  /** Bit flags per cell: 1 = river crossing needed on entering (major river), 2 = coast */
  flags?: number[];
}

export type InfraKind = 'road' | 'rail' | 'river';
export interface InfraLine {
  id: string;
  kind: InfraKind;
  /** Historical (1939-45) rather than modern assumption. If false must be documented in HISTORICAL_SOURCES.md */
  historical: boolean;
  coords: LonLat[];
  name?: string;
  capacity?: number;        // supply throughput points/tick for road/rail
}

// ───────────────────────────── Units ─────────────────────────────

export type UnitType =
  | 'infantry' | 'armoured' | 'mechanised' | 'motorised' | 'paratroop' | 'artillery'
  | 'antitank' | 'recon' | 'engineer' | 'logistics' | 'air_fighter' | 'air_bomber' | 'naval' | 'carrier' | 'hq';

export type UnitDomain = 'land' | 'air' | 'sea';

export type MoveStatus = 'stationary' | 'moving' | 'retreating';
export type CombatStatus = 'idle' | 'attacking' | 'defending' | 'routed' | 'encircled';
export type Posture = 'hold' | 'defend' | 'entrench' | 'attack' | 'rest' | 'recon' | 'regroup';

export interface UnitEquipment {
  /** key = equipment type id e.g. 'rifle','tank_medium','gun_arty','aircraft_fighter'. value = count held */
  held: Record<string, number>;
  /** authorised establishment */
  authorised: Record<string, number>;
}

export interface Unit {
  id: UnitId;
  name: string;             // historical designation e.g. "7. Panzer-Division"
  shortName: string;
  nation: NationId;
  side: SideId;
  type: UnitType;
  domain: UnitDomain;
  parentId?: UnitId;        // organisation: corps/army HQ
  pos: LonLat;
  homeLocation?: LocationId;

  // Statistics (0..100 unless stated)
  manpower: number;         // men present
  manpowerMax: number;
  equipment: UnitEquipment;
  organisation: number;     // 0..100 cohesion
  morale: number;           // 0..100
  experience: number;       // 0..100
  fuel: number;             // 0..100 % of tank
  ammo: number;             // 0..100 %
  supply: number;           // 0..100 composite supply state
  fatigue: number;          // 0..100
  readiness: number;        // 0..100 derived from the above
  entrenchment: number;     // 0..100 fortification level

  // Dynamic status
  moveStatus: MoveStatus;
  combatStatus: CombatStatus;
  posture: Posture;
  orders: Order[];          // queue; orders[0] is active
  route?: LonLat[];         // remaining waypoints of active move (computed by movement engine)
  routeEtaMinutes?: number;
  inBattle?: BattleId;
  encircled?: boolean;
  destroyed?: boolean;
  surrendered?: boolean;
  /** Strength fraction helper kept by engine: manpower/manpowerMax */
  kills: number;
  visibleTo?: SideId[];     // fog of war cache; engine-maintained
  lastSeenBy?: Record<string, { pos: LonLat; minutes: number }>; // intel memory per side
}

// ───────────────────────────── Orders / Commands ─────────────────────────────

export type OrderKind =
  | 'move' | 'attack' | 'defend' | 'hold' | 'withdraw' | 'entrench' | 'recon'
  | 'regroup' | 'rest' | 'reinforce' | 'support' | 'follow' | 'capture' | 'defensive_line';

export interface Order {
  id: string;
  kind: OrderKind;
  issuedAt: number;               // sim minutes
  priority: number;               // 0 low..3 critical
  target?: LonLat;                // move/attack/defend point
  targetUnit?: UnitId;            // support/follow/attack
  targetLocation?: LocationId;    // capture
  line?: LonLat[];                // defensive_line
  operationId?: string;           // belongs to coordinated operation
  status: 'queued' | 'active' | 'complete' | 'failed' | 'cancelled';
  startedAt?: number;
  note?: string;
}

/** The ONLY way UI and AI mutate the simulation. Both use the same union. */
export type Command =
  | { type: 'issue_order'; unitIds: UnitId[]; order: Omit<Order, 'id' | 'issuedAt' | 'status'>; mode: 'replace' | 'append' }
  | { type: 'cancel_orders'; unitIds: UnitId[]; orderId?: string }
  | { type: 'create_operation'; operation: Omit<Operation, 'id' | 'status'> }
  | { type: 'cancel_operation'; operationId: string }
  | { type: 'resolve_event'; eventId: EventId; choiceId: string }
  | { type: 'set_posture'; unitIds: UnitId[]; posture: Posture }
  | { type: 'request_reinforcement'; locationId: LocationId; unitId: UnitId }
  | { type: 'rename'; unitId: UnitId; name: string };

export interface CommandResult { ok: boolean; error?: string; ids?: string[] }

export interface Operation {
  id: string;
  name: string;
  side: SideId;
  nation: NationId;
  status: 'planned' | 'active' | 'complete' | 'cancelled';
  phases: { name: string; unitIds: UnitId[]; order: Omit<Order, 'id' | 'issuedAt' | 'status'>; startAfterMinutes: number }[];
  startMinutes: number;
}

// ───────────────────────────── World ─────────────────────────────

export type LocationKind = 'city' | 'town' | 'port' | 'airfield' | 'depot' | 'bridge' | 'fortress' | 'radar';

export interface Location {
  id: LocationId;
  name: string;
  kind: LocationKind;
  pos: LonLat;
  owner: NationId;
  originalOwner: NationId;
  value: number;            // strategic/VP value 0..10
  supplyCapacity?: number;  // for depots/ports per tick
  airliftTonsPerDay?: number;       // airfields: capped air resupply to cut-off units within 40 km
  throughputTonsPerDay?: number;    // ports: daily tonnage cap (sourced where possible)
  throughputTonsPerMonth?: number;  // ports: monthly tonnage cap (divided by 30)
  besiegedShare?: number;           // ports: fraction of throughput kept when besieged but sea-relieved (default 0.3)
  availableFromHour?: number;       // ports/depots: not a supply source before this campaign hour (e.g. Mulberry)
  rampHours?: number;               // ports/depots: throughput ramps 10%..100% over this many hours after availability/capture
  damaged?: number;         // 0..100 infrastructure damage
}

/** Territorial control raster, same bbox as terrain. owner index into ControlGrid.nations. */
export interface ControlGrid {
  bbox: BBox;
  cellDeg: number;
  cols: number;
  rows: number;
  nations: NationId[];      // palette; index 0 = NEUTRAL/unclaimed
  owner: number[];          // per cell
  contested: number[];      // 0..100 per cell
}

export type WeatherKind = 'clear' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog' | 'mud' | 'sandstorm';
export interface WeatherState { kind: WeatherKind; intensity: number; temperatureC: number; nextChangeMinutes: number }

export interface NationState {
  id: NationId;
  side: SideId;
  name: string;
  playable: boolean;
  resources: { manpower: number; fuel: number; ammo: number; equipment: number; supplyPoints: number };
  /** per-tick income */
  income: { manpower: number; fuel: number; ammo: number; equipment: number; supplyPoints: number };
  reinforcements: ReinforcementArrival[];
}

export interface ReinforcementArrival {
  id: string;
  atMinutes: number;
  locationId?: LocationId;
  pos?: LonLat;
  unit: Unit;               // fully formed unit that appears
  arrived?: boolean;
  /** amphibious or airborne arrival: losses, scatter, reduced organisation and a first-hours combat penalty (applied by src/sim/landing.ts) */
  landing?: { kind: 'amphibious' | 'airborne'; casualties?: number; dispersionKm?: number; penaltyHours?: number; organisation?: number };
}

// ───────────────────────────── Battles / Reports ─────────────────────────────

export interface Battle {
  id: BattleId;
  pos: LonLat;
  attackers: UnitId[];
  defenders: UnitId[];
  startedAt: number;
  rounds: number;
  terrain: Terrain;
  weather: WeatherKind;
  /** running log lines written by the combat engine with the *reason* for each outcome */
  log: string[];
}

export interface BattleReport {
  id: string;
  battleId: BattleId;
  startedAt: number;
  endedAt: number;
  pos: LonLat;
  placeName?: string;
  attackerSide: SideId;
  outcome: 'attacker_victory' | 'defender_victory' | 'stalemate' | 'attacker_withdrew';
  summary: string;                 // human-readable "what happened"
  reasons: string[];               // "why it happened" — factor breakdown
  casualties: { unitId: UnitId; name: string; killed: number; wounded: number; captured: number }[];
  equipmentLosses: Record<string, number>;
  orgChanges: { unitId: UnitId; before: number; after: number }[];
  retreats: UnitId[];
  territoryChangeCells: number;
  /** Nation that gained the changed cells (if any). */
  territoryChangeOwner?: NationId;
  consequences: string[];
}

// ───────────────────────────── Events ─────────────────────────────

export interface GameEvent {
  id: EventId;
  templateId: string;
  firedAt: number;
  title: string;
  body: string;
  kind: 'historical' | 'dynamic' | 'random';
  side?: SideId;
  choices?: { id: string; label: string; effectSummary: string }[];
  resolved?: boolean;
  chosen?: string;
  pos?: LonLat;
}

export interface LogEntry { t: number; category: 'order' | 'battle' | 'event' | 'supply' | 'system' | 'ai' | 'objective'; text: string; pos?: LonLat; unitId?: UnitId; severity: 'info' | 'warn' | 'critical' }

// ───────────────────────────── Objectives / victory ─────────────────────────────

export interface Objective {
  id: ObjectiveId;
  tier: 'primary' | 'secondary' | 'strategic';
  side: SideId;
  title: string;
  description: string;
  condition:
    | { kind: 'hold_location'; locationId: LocationId; untilMinutes?: number }
    | { kind: 'capture_location'; locationId: LocationId }
    | { kind: 'control_fraction'; fraction: number; region?: BBox }
    | { kind: 'destroy_units'; side: SideId; fraction: number }
    | { kind: 'survive_until'; minutes: number }
    | { kind: 'custom'; script: string };
  points: number;
  status: 'pending' | 'achieved' | 'failed';
  achievedAt?: number;
}

export type Ending = 'decisive_victory' | 'strategic_victory' | 'limited_victory' | 'stalemate' | 'defeat';

export interface CampaignResult { ending: Ending; score: number; endedAt: number; summary: string }

// ───────────────────────────── Scenario (static definition) ─────────────────────────────

export type CampaignScale = 'short' | 'standard' | 'grand';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'veteran';

export interface GameSettings {
  difficulty: Difficulty;
  aiAggression: number;      // 0..1
  fogOfWar: boolean;
  historicalDeployment: boolean;
  randomEvents: boolean;
  logisticsDifficulty: number; // 0..2 (1 normal)
  reinforcementAvailability: number; // 0..2
  historicalEventFrequency: number;  // 0..2
}

export interface SourceRef { id: string; citation: string; url?: string }

/** Static campaign definition (JSON file under src/data/campaigns). Validated at load. */
/** One scheduled heavy-bomber strike (Goodwood, Cobra): hits the OTHER side's land units around pos; postponed while the weather forbids flying (applied by src/sim/airwar.ts). */
export interface CarpetBombing { id: string; atMinutes: number; pos: LonLat; radiusKm: number; side: SideId; casualtyPct?: number; orgLoss?: number }

/** Air supremacy window: the other side's road movement within radiusKm of `side`'s land units is slowed (game-scale interdiction). */
export interface AirSupremacy { side: SideId; radiusKm?: number; speedMul?: number; fromMinutes?: number; toMinutes?: number }

export interface ScenarioDefinition {
  schema: typeof SCENARIO_SCHEMA_VERSION;
  id: string;                       // e.g. 'fall_of_france.standard'
  campaignId: string;               // groups scales: 'fall_of_france'
  title: string;
  scale: CampaignScale;
  startDate: string;                // ISO date-time UTC
  endDate: string;
  bbox: BBox;
  estimatedPlayMinutes: [number, number];
  mapSize: 'small' | 'medium' | 'large';
  complexity: 1 | 2 | 3 | 4 | 5;
  briefing: { historical: string; situation: string; };
  playableNations: { nation: NationId; difficultyRating: 1 | 2 | 3 | 4 | 5; summary: string; objectiveIds: ObjectiveId[] }[];
  nations: NationState[];
  locations: Location[];
  units: Unit[];                    // starting OOB
  reinforcements: ReinforcementArrival[];
  objectives: Objective[];
  /** which terrain & infra data files to load (relative to /data) */
  terrainFile: string;
  infraFile: string;
  /** supply sources: nation → location ids acting as supply origins */
  supplySources: Record<string, LocationId[]>;
  initialControl: { nation: NationId; polygon: LonLat[] }[]; // painter's algorithm, later entries override
  weatherProfile: { month: number; probs: Partial<Record<WeatherKind, number>>; tempC: number }[];
  eventTemplateIds: string[];
  specialSystems: string[];         // e.g. ['air_war','radar'] — modular campaign mechanics
  /** Score thresholds (fraction of that side's max objective points) for each ending, per side. */
  victoryTiers?: Partial<Record<SideId, { decisive: number; strategic: number; limited: number; stalemate: number }>>;
  /** Random-weather control: scale the weight of storms in the monthly profile (0 = no random storms) and/or replace listed kinds by 'cloud'. Scripted weather events are unaffected. Absent = unchanged. */
  weatherControl?: { stormScale?: number; suppress?: WeatherKind[] };
  /** Sea-fed lodgements (Normandy): coastal ports/depots held by a side count as supply sources, so a ringed beachhead is not 'cut off'. */
  seaSupply?: boolean;
  /** Radius (km) within which an own, non-routed combat unit stops the enemy capturing a location; default 4 (the capture radius). Normandy uses 6.5 so an outlying garrison still counts. */
  captureBlockKm?: number;
  /** Opening surprise (Barbarossa): combat strength of the victim nations' units is multiplied by defenceMultiplier (0.3..1), fading linearly to 1 at untilHour. Absent = no effect. */
  openingSurprise?: { victimNations: NationId[]; untilHour: number; defenceMultiplier: number };
  airSupremacy?: AirSupremacy[];
  carpetBombings?: CarpetBombing[];
  /** Opt-in river/lake ice (hours since scenario start). Ice exists only if iceFromHour and iceFullHour are both set. */
  iceFromHour?: number;             // ice begins to form (thin)
  iceFullHour?: number;             // ice fully load-bearing
  iceThawHour?: number;             // ice starts to rot; gone 14 days later
  sources: SourceRef[];             // MANDATORY: every historical claim traces here
}

// ───────────────────────────── Game state (runtime, saved) ─────────────────────────────

export interface ClockState { minutes: number; speed: 0 | 1 | 2 | 4 | 8; startMinutes: number; accumulatorMs: number }

export interface RngState { s: number }

export interface SupplyNode { locationId: LocationId; stock: number; throughput: number }
export interface SupplyState {
  nodes: SupplyNode[];
  /** per-unit distance (km) to nearest connected supply source; Infinity encoded as -1 */
  unitSupplyDistKm: Record<UnitId, number>;
  cutOffUnits: UnitId[];
}

export interface GameState {
  schema: typeof SAVE_SCHEMA_VERSION;
  scenarioId: string;
  playerNation: NationId;
  playerSide: SideId;
  settings: GameSettings;
  clock: ClockState;
  rng: RngState;
  seed: number;
  idCounter: number;
  units: Record<UnitId, Unit>;
  nations: Record<string, NationState>;
  locations: Record<LocationId, Location>;
  control: ControlGrid;
  weather: WeatherState;
  supply: SupplyState;
  battles: Record<BattleId, Battle>;
  reports: BattleReport[];
  operations: Record<string, Operation>;
  events: GameEvent[];
  eventState: Record<string, unknown>;   // per-template cooldown / flags (event engine)
  log: LogEntry[];
  objectives: Objective[];
  aiState: Record<string, unknown>;      // per-nation AI memory (AI engine owned)
  special: Record<string, unknown>;      // campaign-specific module state
  result?: CampaignResult;
  history: { t: number; text: string }[]; // player-facing campaign record
}

// ───────────────────────────── Engine API (what UI/AI/QA see) ─────────────────────────────

export interface SimEvents {
  onTick?(state: Readonly<GameState>): void;
}

export interface Engine {
  readonly terrain: TerrainGrid;
  readonly infra: InfraLine[];
  getState(): Readonly<GameState>;
  /** Apply a command as the player (side checked) */
  dispatch(cmd: Command, as?: SideId): CommandResult;
  /** Advance exactly n fixed ticks (deterministic; used by tests, AI sims, headless) */
  step(ticks?: number): void;
  /** Advance by real elapsed milliseconds honouring clock.speed; returns ticks executed */
  advance(realDtMs: number): number;
  setSpeed(s: ClockState['speed']): void;
  subscribe(fn: (s: Readonly<GameState>) => void): () => void;
  serialize(): GameState;
  /** Fog-of-war aware view for a side */
  visibleUnits(side: SideId): Unit[];
}
