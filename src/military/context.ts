import type { GameState, InfraLine, LogEntry, LonLat, ScenarioDefinition, TerrainGrid, Unit } from '../core/types';

/**
 * Structural subset of sim's SimContext that Military needs. The real SimContext is assignable to this
 * (extra members are fine). `findRoute` is optional: if the sim passes it (a thin wrapper around
 * sim/pathfinding.findRoute) ETAs use real routes; otherwise a straight-line estimate is used.
 */
export interface MilitaryContext {
  terrain: TerrainGrid;
  infra: InfraLine[];
  scenario: ScenarioDefinition;
  rand(): number;
  gauss(): number;
  log(e: Omit<LogEntry, 't'>): void;
  findRoute?(unit: Unit, to: LonLat, state: GameState): { path: LonLat[]; km: number; etaMinutes: number } | null;
}

/** Per-save military bookkeeping stored in state.special['military'] (plain JSON). */
export interface MilitarySpecial {
  /** Damage 0..100 per infrastructure line id (sabotage/air raids); reduces capacity, 80+ cuts the line. */
  lineDamage: Record<string, number>;
  /** Last seen owner per location, to detect capture and apply capture damage. */
  lastOwner: Record<string, string>;
  /** Sim minute each location last changed owner (for the capture capacity penalty). */
  capturedAt: Record<string, number>;
  /** Which phases of each operation have been issued. */
  opIssued: Record<string, boolean[]>;
  /** Unit ids cut off at the previous supply update (for transition messages). */
  prevCutOff: string[];
  /** Airlift fraction served per cut-off unit at the last supply update. */
  airlift: Record<string, number>;
  /** Consecutive updates each land unit has been enclosed by an enemy zone-of-control ring. */
  enclosed: Record<string, number>;
  /** Besieged ports currently relieved by sea (set by events via setPortRelief). */
  portRelief: Record<string, boolean>;
  /** Temporary throughput multipliers per location (storm damage, repair), optionally until a game minute. */
  portMods: Record<string, { factor: number; untilMinutes?: number }>;
  /** Runtime availability overrides per location: usable from `fromMinutes`, ramping up over `rampHours`. */
  availability: Record<string, { fromMinutes: number; rampHours: number }>;
  /** Tonnage each source served on the current game day (resets at midnight); read by portStatus. */
  portUse: Record<string, { day: number; tons: number }>;
  /** Arrivals postponed because their location was lost (log once). */
  warned: Record<string, boolean>;
  /** Position each unit had at the previous stats update (displacement drives entrenchment loss). */
  statPos: Record<string, [number, number]>;
}

export function milSpecial(state: GameState): MilitarySpecial {
  let m = state.special['military'] as MilitarySpecial | undefined;
  if (!m) {
    m = { lineDamage: {}, lastOwner: {}, capturedAt: {}, opIssued: {}, prevCutOff: [], airlift: {}, enclosed: {}, portRelief: {}, warned: {}, statPos: {}, portMods: {}, availability: {}, portUse: {} };
    state.special['military'] = m;
  }
  m.lineDamage ??= {};
  m.lastOwner ??= {};
  m.capturedAt ??= {};
  m.opIssued ??= {};
  m.prevCutOff ??= [];
  m.airlift ??= {};
  m.enclosed ??= {};
  m.portRelief ??= {};
  m.warned ??= {};
  m.statPos ??= {};
  m.portMods ??= {};
  m.availability ??= {};
  m.portUse ??= {};
  return m;
}

export function addLog(state: GameState, e: Omit<LogEntry, 't'>): void {
  state.log.push({ t: state.clock.minutes, ...e });
}

export const clamp = (v: number, lo = 0, hi = 100) => (v < lo ? lo : v > hi ? hi : v);

export function isAlive(u: Unit | undefined): u is Unit {
  return !!u && !u.destroyed && !u.surrendered;
}
