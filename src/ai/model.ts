/**
 * Shared AI model: context types, difficulty profile, unit power estimates, cheap geometry.
 * Headless & deterministic: no DOM, no Math.random, no Date.now.
 */
import type {
  GameSettings, GameState, InfraLine, LogEntry, LonLat, NationId, ScenarioDefinition, SideId, TerrainGrid, Unit, UnitType,
} from '../core/types';

/**
 * Structural subset of the engine's SimContext (src/sim/context.ts). Everything except `rand` is optional so
 * the AI can be unit-tested with hand-built fixtures.
 */
export interface AiContext {
  rand(): number;
  gauss?(): number;
  terrain?: TerrainGrid;
  infra?: InfraLine[];
  scenario?: ScenarioDefinition;
  log?(e: Omit<LogEntry, 't'>): void;
  /** Fog-of-war authority (src/sim/fog.ts visibleTo). When absent the per-unit `visibleTo` cache is used. */
  visibleTo?(state: Readonly<GameState>, side: SideId): Unit[];
}

export const NATION_SIDE: Record<NationId, SideId> = {
  GER: 'axis', ITA: 'axis', JPN: 'axis',
  FRA: 'allies', GBR: 'allies', USA: 'allies', SOV: 'allies', CAN: 'allies', POL: 'allies', BEL: 'allies', NED: 'allies',
  AUS: 'allies', NZL: 'allies', IND: 'allies', RSA: 'allies', ROU: 'axis', HUN: 'axis', CHN: 'allies', NEUTRAL: 'neutral',
};

export function sideOfNation(state: Readonly<GameState>, n: NationId): SideId {
  return state.nations[n]?.side ?? NATION_SIDE[n] ?? 'neutral';
}
export const opposite = (s: SideId): SideId => (s === 'allies' ? 'axis' : s === 'axis' ? 'allies' : 'neutral');

/** Fast local equirectangular distance (km). Accurate to well under 1% at theatre scale; much cheaper than haversine. */
export function fastKm(a: LonLat, b: LonLat): number {
  const dx = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) * 0.5 * Math.PI) / 180) * 111.195;
  const dy = (b[1] - a[1]) * 111.195;
  return Math.sqrt(dx * dx + dy * dy);
}

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

export type Role = 'recon' | 'armour' | 'infantry' | 'artillery' | 'engineer' | 'support' | 'other';

export function roleOf(u: Unit): Role {
  if (u.domain !== 'land') return 'other';
  switch (u.type) {
    case 'recon': return 'recon';
    case 'armoured': case 'mechanised': return 'armour';
    case 'infantry': case 'motorised': case 'paratroop': case 'antitank': return 'infantry';
    case 'artillery': return 'artillery';
    case 'engineer': return 'engineer';
    case 'hq': case 'logistics': return 'support';
    default: return 'other';
  }
}

/** Relative combat value per full-strength formation of each type. */
export const UNIT_VALUE: Record<UnitType, number> = {
  infantry: 1, armoured: 1.7, mechanised: 1.4, motorised: 0.9, paratroop: 1.1, artillery: 0.9, antitank: 0.6,
  recon: 0.3, engineer: 0.35, logistics: 0, hq: 0.05, air_fighter: 0, air_bomber: 0, naval: 0, carrier: 0,
};

/** Combat power estimate of a unit (0..~2). Uses only fields a commander could assess. */
export function unitPower(u: Unit): number {
  const base = UNIT_VALUE[u.type] ?? 0;
  if (base === 0 || u.destroyed || u.surrendered) return 0;
  const strength = u.manpowerMax > 0 ? clamp(u.manpower / u.manpowerMax, 0, 1.2) : 0;
  const cohesion = 0.4 + 0.6 * clamp(u.organisation / 100, 0, 1);
  const spirit = 0.6 + 0.4 * clamp(u.morale / 100, 0, 1);
  const ammo = 0.6 + 0.4 * clamp(u.ammo / 100, 0, 1);
  const exp = 0.85 + 0.3 * clamp(u.experience / 100, 0, 1);
  return base * strength * cohesion * spirit * ammo * exp;
}

export const isMobileType = (t: UnitType) => t === 'armoured' || t === 'mechanised' || t === 'motorised' || t === 'recon';
export const isAlive = (u: Unit) => !u.destroyed && !u.surrendered;

export interface DifficultyProfile {
  /** std-dev of misjudgement noise applied to force-ratio/target scoring */
  noise: number;
  /** multiplier on reaction delay */
  latency: number;
  /** multiplier on settings.aiAggression */
  aggression: number;
  /** extra km at which enemy units are detected regardless of fog (the only "cheat", veteran only) */
  intelBonusKm: number;
}

export function difficultyProfile(s: GameSettings): DifficultyProfile {
  switch (s.difficulty) {
    case 'easy': return { noise: 0.35, latency: 1.8, aggression: 0.8, intelBonusKm: 0 };
    case 'hard': return { noise: 0.12, latency: 0.7, aggression: 1.1, intelBonusKm: 0 };
    case 'veteran': return { noise: 0.06, latency: 0.5, aggression: 1.2, intelBonusKm: 20 };
    default: return { noise: 0.2, latency: 1, aggression: 1, intelBonusKm: 0 };
  }
}

export function sigOf(kind: string, target?: LonLat | string): string {
  if (!target) return kind;
  if (typeof target === 'string') return `${kind}:${target}`;
  return `${kind}:${target[0].toFixed(2)},${target[1].toFixed(2)}`;
}
