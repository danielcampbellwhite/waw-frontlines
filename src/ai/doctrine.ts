/**
 * AI doctrine: campaign-specific priorities a scenario may supply through
 * `state.special.aiDoctrine[nation]` (plain JSON). Every field is optional; sensible defaults apply.
 */
import type { GameState, LocationId, NationId } from '../core/types';

/** Doctrine registry for scenario families (keys are scenario-id prefixes), used when state.special has none. */
const DOCTRINE_REGISTRY: { prefix: string; nation: NationId | '*'; doctrine: AiDoctrine }[] = [];
export function registerAiDoctrine(scenarioPrefix: string, nation: NationId | '*', doctrine: AiDoctrine): void {
  const i = DOCTRINE_REGISTRY.findIndex((r) => r.prefix === scenarioPrefix && r.nation === nation);
  if (i >= 0) DOCTRINE_REGISTRY[i] = { prefix: scenarioPrefix, nation, doctrine }; else DOCTRINE_REGISTRY.push({ prefix: scenarioPrefix, nation, doctrine });
}

export type AiPosture = 'attack' | 'defend' | 'withdraw' | 'consolidate';

export interface AiDoctrine {
  /** Fixed posture, or 'auto' (default) to choose from force ratio / supply / objectives. */
  posture?: AiPosture | 'auto';
  /** Time-scheduled posture overrides: the latest entry with fromMinutes <= now wins. */
  phases?: { fromMinutes: number; posture: AiPosture | 'auto' }[];
  /** Added to the aggression derived from settings (-0.5..0.5). */
  aggressionBias?: number;
  /** Force ratio (own/enemy) needed to launch offensives. Default derived from aggression (~1.0-1.5). */
  ratioToAttack?: number;
  /** Force ratio under which the AI considers a strategic withdrawal. Default ~0.35. */
  ratioToWithdraw?: number;
  /** Locations this nation must hold at all costs (extra weight, suppresses withdrawal). */
  holdLocations?: LocationId[];
  /** Locations this nation wants to capture (extra weight in target selection). */
  captureLocations?: LocationId[];
  /** Per-location multiplier on target/defence value. */
  locationWeights?: Record<LocationId, number>;
  /** Preferred fallback positions for strategic withdrawal (own-held locations). */
  fallbackLocations?: LocationId[];
  /** Never withdraw (fight to the last), e.g. fortress / "not one step back" scenarios. */
  noWithdraw?: boolean;
  /** Fraction of manoeuvre formations held back as reserve (0..0.6). Default 0.25. */
  reserveFraction?: number;
  /** How armour is employed. Default 'balanced'. */
  armour?: 'breakthrough' | 'reserve' | 'balanced';
  /** Raid enemy depots / supply routes with mobile units. Default true. */
  raidSupply?: boolean;
  /** Attempt envelopments (armour on a wide hook behind the objective). Default true. */
  encirclement?: boolean;
  /** Minimum reaction delay (minutes) before a changed assessment alters posture. Default 120. */
  reactionMinutes?: number;
  /** Max commands returned per think. Default 40. */
  maxCommands?: number;
  /**
   * Campaign pacing: earliest sim minute at which the AI may select a location as an operational objective.
   * Scenario authors derive these from cited historical dates so the AI does not finish the campaign in days.
   */
  objectiveSchedule?: Record<LocationId, number>;
  /** Ordered objectives for the armoured Schwerpunkt: the armour group always drives for the first open one. */
  armourObjectives?: LocationId[];
  /** Order air groups to forward bases (only meaningful once the sim moves air units; default true). */
  redeployAir?: boolean;
  /** Scale offensive tempo and reach by the national fuel pool (fuel-starved armies stall and halt offensives). Default false. */
  fuelAware?: boolean;
  /** Locations of an encircled pocket: own formations within 55 km hold and dig in there (no breakout, no counter-attack pulls). */
  pocketLocations?: LocationId[];
  /** Max simultaneous AI operations. Default 3. */
  maxOperations?: number;
  /** Size of the persistent armoured Schwerpunkt group (default 6). */
  axisSize?: number;
  /**
   * Reserve release rules: units whose id or name contains `match` (case-insensitive) are held back in place (dug in, no tasks)
   * until `fromMinutes` is reached OR the event template `eventId` has fired for the own side/any side (e.g. the German panzer
   * reserve released by Hitler/OKW on 7-8 June). At least one of the two triggers is required.
   */
  reserveReleases?: ReserveRelease[];
  /**
   * Opt-in: several persistent armoured groups, each with its own objective list (Barbarossa: one per army group axis). When present it
   * replaces `armourObjectives`/`axisSize`; each group is refilled from the armour nearest its first open objective and thrusts independently.
   */
  armourGroups?: ArmourGroup[];
  /** No counter-attacks before this sim minute (surprise: the frontier armies are not yet in a position to counter-attack). Default 0. */
  counterattackFromMinutes?: number;
}

export interface ArmourGroup { name: string; objectives: LocationId[]; size?: number }

export interface ReserveRelease { match: string; fromMinutes?: number; eventId?: string }

export interface ResolvedDoctrine {
  posture: AiPosture | 'auto';
  phases: { fromMinutes: number; posture: AiPosture | 'auto' }[];
  aggressionBias: number;
  ratioToAttack: number | null;
  ratioToWithdraw: number | null;
  holdLocations: LocationId[];
  captureLocations: LocationId[];
  locationWeights: Record<LocationId, number>;
  fallbackLocations: LocationId[];
  noWithdraw: boolean;
  reserveFraction: number;
  armour: 'breakthrough' | 'reserve' | 'balanced';
  raidSupply: boolean;
  encirclement: boolean;
  reactionMinutes: number;
  maxCommands: number;
  maxOperations: number;
  axisSize: number;
  objectiveSchedule: Record<LocationId, number>;
  armourObjectives: LocationId[];
  redeployAir: boolean;
  fuelAware: boolean;
  pocketLocations: LocationId[];
  reserveReleases: ReserveRelease[];
  armourGroups: ArmourGroup[];
  counterattackFromMinutes: number;
}

export const DEFAULT_DOCTRINE: ResolvedDoctrine = {
  posture: 'auto',
  phases: [],
  aggressionBias: 0,
  ratioToAttack: null,
  ratioToWithdraw: null,
  holdLocations: [],
  captureLocations: [],
  locationWeights: {},
  fallbackLocations: [],
  noWithdraw: false,
  reserveFraction: 0.25,
  armour: 'balanced',
  raidSupply: true,
  encirclement: true,
  reactionMinutes: 120,
  maxCommands: 40,
  maxOperations: 3,
  axisSize: 6,
  objectiveSchedule: {},
  armourObjectives: [],
  redeployAir: true,
  fuelAware: false,
  pocketLocations: [],
  reserveReleases: [],
  armourGroups: [],
  counterattackFromMinutes: 0,
};

const POSTURES = ['attack', 'defend', 'withdraw', 'consolidate'];
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const strArr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);

/** Read & sanitise the doctrine for a nation from scenario-supplied special data. */
export function resolveDoctrine(state: Readonly<GameState>, nation: NationId): ResolvedDoctrine {
  const d: ResolvedDoctrine = { ...DEFAULT_DOCTRINE, phases: [], holdLocations: [], captureLocations: [], locationWeights: {}, fallbackLocations: [], objectiveSchedule: {}, armourObjectives: [], pocketLocations: [], reserveReleases: [], armourGroups: [] };
  const all = state.special?.aiDoctrine as Record<string, unknown> | undefined;
  let raw = (all && typeof all === 'object' ? all[nation] ?? all['*'] : undefined) as Record<string, unknown> | undefined;
  if (!raw) {
    const r = DOCTRINE_REGISTRY.find((x) => state.scenarioId.startsWith(x.prefix) && x.nation === nation) ?? DOCTRINE_REGISTRY.find((x) => state.scenarioId.startsWith(x.prefix) && x.nation === '*');
    raw = r?.doctrine as Record<string, unknown> | undefined;
  }
  if (!raw || typeof raw !== 'object') return d;
  if (raw.posture === 'auto' || (typeof raw.posture === 'string' && POSTURES.includes(raw.posture))) d.posture = raw.posture as AiPosture | 'auto';
  if (Array.isArray(raw.phases)) {
    d.phases = (raw.phases as Record<string, unknown>[])
      .filter((p) => p && isNum(p.fromMinutes) && (p.posture === 'auto' || POSTURES.includes(p.posture as string)))
      .map((p) => ({ fromMinutes: p.fromMinutes as number, posture: p.posture as AiPosture | 'auto' }))
      .sort((a, b) => a.fromMinutes - b.fromMinutes);
  }
  if (isNum(raw.aggressionBias)) d.aggressionBias = clamp(raw.aggressionBias, -0.5, 0.5);
  if (isNum(raw.ratioToAttack)) d.ratioToAttack = clamp(raw.ratioToAttack, 0.3, 5);
  if (isNum(raw.ratioToWithdraw)) d.ratioToWithdraw = clamp(raw.ratioToWithdraw, 0.05, 1.5);
  d.holdLocations = strArr(raw.holdLocations);
  d.captureLocations = strArr(raw.captureLocations);
  d.fallbackLocations = strArr(raw.fallbackLocations);
  if (raw.locationWeights && typeof raw.locationWeights === 'object') {
    for (const [k, v] of Object.entries(raw.locationWeights as Record<string, unknown>)) if (isNum(v)) d.locationWeights[k] = clamp(v, 0, 10);
  }
  if (typeof raw.noWithdraw === 'boolean') d.noWithdraw = raw.noWithdraw;
  if (isNum(raw.reserveFraction)) d.reserveFraction = clamp(raw.reserveFraction, 0, 0.6);
  if (raw.armour === 'breakthrough' || raw.armour === 'reserve' || raw.armour === 'balanced') d.armour = raw.armour;
  if (typeof raw.raidSupply === 'boolean') d.raidSupply = raw.raidSupply;
  if (typeof raw.encirclement === 'boolean') d.encirclement = raw.encirclement;
  if (isNum(raw.reactionMinutes)) d.reactionMinutes = clamp(raw.reactionMinutes, 0, 2880);
  if (isNum(raw.maxCommands)) d.maxCommands = clamp(Math.floor(raw.maxCommands), 1, 200);
  if (raw.objectiveSchedule && typeof raw.objectiveSchedule === 'object') {
    for (const [k, v] of Object.entries(raw.objectiveSchedule as Record<string, unknown>)) if (isNum(v)) d.objectiveSchedule[k] = v;
  }
  d.armourObjectives = strArr(raw.armourObjectives);
  if (typeof raw.redeployAir === 'boolean') d.redeployAir = raw.redeployAir;
  if (typeof raw.fuelAware === 'boolean') d.fuelAware = raw.fuelAware;
  d.pocketLocations = strArr(raw.pocketLocations);
  if (isNum(raw.maxOperations)) d.maxOperations = clamp(Math.floor(raw.maxOperations), 0, 8);
  if (Array.isArray(raw.reserveReleases)) {
    d.reserveReleases = (raw.reserveReleases as Record<string, unknown>[])
      .filter((r) => r && typeof r.match === 'string' && r.match.length > 0 && (isNum(r.fromMinutes) || typeof r.eventId === 'string'))
      .map((r) => ({ match: (r.match as string).toLowerCase(), fromMinutes: isNum(r.fromMinutes) ? r.fromMinutes : undefined, eventId: typeof r.eventId === 'string' ? r.eventId : undefined }));
  }
  if (Array.isArray(raw.armourGroups)) {
    const seen = new Set<string>();
    for (const g of raw.armourGroups as Record<string, unknown>[]) {
      if (!g || typeof g.name !== 'string' || !g.name || seen.has(g.name)) continue;
      const objectives = strArr(g.objectives);
      if (!objectives.length) continue;
      seen.add(g.name);
      d.armourGroups.push({ name: g.name, objectives, size: isNum(g.size) ? clamp(Math.floor(g.size), 2, 16) : undefined });
    }
  }
  if (isNum(raw.counterattackFromMinutes)) d.counterattackFromMinutes = Math.max(0, raw.counterattackFromMinutes);
  if (isNum(raw.axisSize)) d.axisSize = clamp(Math.floor(raw.axisSize), 2, 16);
  return d;
}

/** Effective fixed posture at a given time (phase schedule beats the base posture). */
export function scheduledPosture(d: ResolvedDoctrine, minutes: number): AiPosture | 'auto' {
  let p = d.posture;
  for (const ph of d.phases) if (ph.fromMinutes <= minutes) p = ph.posture;
  return p;
}
