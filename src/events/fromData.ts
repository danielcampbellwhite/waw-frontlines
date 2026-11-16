/**
 * Adapter from the campaign engineer's historical event data (src/data `HistoricalEventData`,
 * e.g. fall_of_france.events.json) to registered historical templates. Structural input type so src/events
 * does not import src/data. `effectHints` are free-text design notes, not machine effects, so no mechanics
 * are invented from them: these events are narrative/history-record events with citations.
 */
import type { LonLat, SideId } from '../core/types';
import { registerHistoricalEvent, type EffectSpec } from './historical';
import type { EventTemplate } from './types';

export interface HistoricalEventDataLike {
  id: string; date: string; title: string; body: string; pos?: [number, number] | LonLat; side?: string;
  src: string[]; effectHints?: string[];
  /** Sourced, machine-applied effects (see EffectSpec); campaign data states which fact each restates via `effectsNote`. */
  effects?: Record<string, unknown>[];
}

export function registerHistoricalEventsFromData(events: HistoricalEventDataLike[]): EventTemplate[] {
  return events.map((e) => registerHistoricalEvent({
    id: e.id, date: e.date, title: e.title, body: e.body, sources: e.src,
    pos: e.pos ? [e.pos[0], e.pos[1]] : undefined,
    side: e.side === 'allies' || e.side === 'axis' ? (e.side as SideId) : undefined,
    effects: e.effects?.length ? (e.effects.filter((x) => typeof x.op === 'string') as unknown as EffectSpec[]) : undefined,
    essential: true,
  }));
}
