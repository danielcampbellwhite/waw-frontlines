/**
 * Event engine types. Templates are plain TS objects (code) or declarative historical specs (JSON-able,
 * see historical.ts). All state they touch is plain JSON on GameState.
 */
import type { GameState, LogEntry, LonLat, NationId, ScenarioDefinition, SideId } from '../core/types';

/** Structural subset of the engine's SimContext used by the event engine. */
export interface EventContext {
  rand(): number;
  gauss?(): number;
  scenario?: Pick<ScenarioDefinition, 'startDate' | 'eventTemplateIds'> & Partial<ScenarioDefinition>;
  log?(e: Omit<LogEntry, 't'>): void;
}

/** JSON-serialisable payload computed when an event fires and handed to its choices. */
export type EventData = Record<string, unknown> & { pos?: LonLat };

export interface EventEnv {
  state: GameState;
  /** side the event happens to */
  side: SideId;
  enemySide: SideId;
  /** principal nation of `side` (playerNation if it is the player's side) and all nations on it */
  nation: NationId;
  nations: NationId[];
  isPlayer: boolean;
  now: number;
  rand(): number;
  gauss(): number;
  scenario?: EventContext['scenario'];
  log(text: string, severity?: LogEntry['severity'], pos?: LonLat): void;
}

export interface EventChoiceDef {
  id: string;
  label: string;
  /** shown to the player BEFORE choosing; must truthfully describe apply() */
  effectSummary: string;
  available?(env: EventEnv, data: EventData): boolean;
  /** Mutates state. May return a one-line outcome that is logged. */
  apply(env: EventEnv, data: EventData): string | void;
}

export type EventTone = 'adverse' | 'favourable' | 'neutral';

export interface EventTemplate {
  id: string;
  kind: 'historical' | 'dynamic' | 'random';
  /** UI hint (icon family) */
  category?: 'weather' | 'logistics' | 'intelligence' | 'combat' | 'command' | 'politics' | 'history';
  title: string | ((env: EventEnv, data: EventData) => string);
  body: string | ((env: EventEnv, data: EventData) => string);

  /** whose side the event happens to: default 'player'. 'any' = either, picked by weight. */
  target?: 'player' | 'enemy' | 'any';
  /** Sides this template may happen to (omit = any). Applied after `target`; use for faction-specific flavour. */
  sides?: SideId[];
  /** Nations this template may happen to: eligible only if the side's nation list intersects (omit = any). */
  nations?: NationId[];
  /** From the point of view of the side it happens to. Scales weight by difficulty. */
  tone?: EventTone;
  /** Relative weight (0 = ineligible). May inspect state; MUST NOT consume randomness. */
  weight?: number | ((env: EventEnv) => number);
  /** Minimum minutes between two firings (same side). */
  cooldownMinutes?: number;
  maxOccurrences?: number;
  condition?(env: EventEnv): boolean;
  /** Pick concrete targets. Return null to abort (nothing suitable). */
  prepare?(env: EventEnv): EventData | null;
  /** Immediate, unavoidable effect applied when the event fires (before any choice). */
  impact?(env: EventEnv, data: EventData): void;
  choices?: EventChoiceDef[];
  /** Applied when a pending choice event expires unanswered. */
  defaultChoiceId?: string;
  /** Choice taken automatically when the event happens to an AI side. */
  aiChoiceId?: string;
  /** Minutes before an unanswered choice event auto-resolves (default 720). */
  expiresMinutes?: number;
  /** For events that happen to an AI side: text shown to the player (omit = silent). */
  opponentReport?: string;

  // historical only
  /** Side the (historical) event concerns; default the player's side. */
  side?: SideId;
  schedule?: { atDate?: string; atMinutes?: number };
  sources?: string[];
  /** Historical events marked essential still fire when historicalEventFrequency is 0. */
  essential?: boolean;
}

export interface TemplateStat { count: number; last: number }
