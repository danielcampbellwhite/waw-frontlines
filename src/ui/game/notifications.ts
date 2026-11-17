import type { GameState, LonLat, UnitId } from '../../core/types';
import { reportHeadline } from './reportText';

export type NotifKind = 'report' | 'event' | 'objective' | 'log';
export interface Notification {
  id: string;
  t: number;
  kind: NotifKind;
  label: string;
  severity: 'info' | 'warn' | 'critical';
  text: string;
  pos?: LonLat;
  unitId?: UnitId;
}

type Src = Pick<GameState, 'log' | 'reports' | 'events' | 'objectives' | 'playerSide'> & Partial<Pick<GameState, 'units' | 'nations'>>;

/** Log categories that are replaced by the richer derived sources (events list, objective status). */
const DERIVED_CATEGORIES = new Set(['event', 'objective']);

export function isLogNotif(l: { severity: string; category: string }): boolean {
  return !DERIVED_CATEGORIES.has(l.category) && (l.severity !== 'info' || l.category === 'battle');
}

/**
 * Single source of truth for notifications: the bell badge, the Notifications tab and the toasts all derive from this list.
 * Includes the log (battles, supply, AI, system warnings), every battle report, player-facing events and objective changes.
 */
export function buildNotifications(s: Src): Notification[] {
  const out: Notification[] = [];
  for (const l of s.log) {
    if (!isLogNotif(l)) continue;
    out.push({ id: `log:${l.t}|${l.category}|${l.text}`, t: l.t, kind: 'log', label: l.category, severity: l.severity, text: l.text, pos: l.pos, unitId: l.unitId });
  }
  for (const r of s.reports) {
    out.push({ id: `rep:${r.id}`, t: r.endedAt, kind: 'report', label: 'report', severity: 'info', text: reportHeadline(r, s.units ?? {}, id => s.nations?.[id]?.name ?? id), pos: r.pos });
  }
  for (const e of s.events) {
    if (e.side !== undefined && e.side !== s.playerSide) continue;
    out.push({ id: `ev:${e.id}`, t: e.firedAt, kind: 'event', label: 'event', severity: !e.resolved && e.choices?.length ? 'warn' : 'info', text: e.title, pos: e.pos });
  }
  for (const o of s.objectives) {
    if (o.side !== s.playerSide || o.status === 'pending') continue;
    out.push({ id: `obj:${o.id}:${o.status}`, t: o.achievedAt ?? 0, kind: 'objective', label: 'objective', severity: o.status === 'failed' ? 'critical' : 'info', text: o.status === 'achieved' ? `Objective achieved: ${o.title}` : `Objective failed: ${o.title}` });
  }
  return out.sort((a, b) => b.t - a.t);
}

/** Cheap change signature so subscribers only rebuild the list when something that feeds it changed. */
export function notifSignature(s: Src): string {
  let o = 0;
  for (const x of s.objectives) if (x.status !== 'pending') o++;
  return `${s.log.length}:${s.reports.length}:${s.events.length}:${o}`;
}

export const notifCount = (s: Src): number => buildNotifications(s).length;
