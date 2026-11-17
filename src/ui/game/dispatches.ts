import type { GameState, LonLat } from '../../core/types';

export interface Dispatch { id: string; t: number; headline: string; body?: string; pos?: LonLat }

type Src = Pick<GameState, 'events' | 'objectives' | 'playerSide'>;

/** First sentence of a text, as written. Falls back to the whole text when there is no full stop. */
export function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(\s|$)/s.exec(text.trim());
  return (m ? m[1] : text).trim();
}

/**
 * The dispatch feed. Entries are the campaign's own historical event titles and text (first sentence only) and objective
 * results; the UI adds no history of its own. Newest first.
 */
export function buildDispatches(s: Src): Dispatch[] {
  const out: Dispatch[] = [];
  for (const e of s.events) {
    if (e.kind !== 'historical' || (e.side !== undefined && e.side !== s.playerSide)) continue;
    out.push({ id: `ev:${e.id}`, t: e.firedAt, headline: e.title, body: e.body ? firstSentence(e.body) : undefined, pos: e.pos });
  }
  for (const o of s.objectives) {
    if (o.side !== s.playerSide || o.status === 'pending') continue;
    out.push({ id: `obj:${o.id}:${o.status}`, t: o.achievedAt ?? 0, headline: `${o.status === 'achieved' ? 'Objective achieved' : 'Objective failed'}: ${o.title}` });
  }
  return out.sort((a, b) => b.t - a.t);
}
