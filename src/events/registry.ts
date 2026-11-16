/**
 * Template registry. Built-in dynamic templates register themselves via templates/index.ts; the campaign
 * data layer registers scenario-specific HISTORICAL events here (see historical.ts). The registry is
 * static code/config, not game state (saves only store ids), so it is safe as module-level data.
 */
import type { EventTemplate } from './types';

const templates = new Map<string, EventTemplate>();

export function registerEventTemplate(t: EventTemplate): void {
  if (t.kind === 'historical') {
    if (!t.sources || t.sources.length === 0) throw new Error(`historical event "${t.id}" must cite sources[]`);
    if (!t.schedule || (t.schedule.atDate === undefined && t.schedule.atMinutes === undefined)) throw new Error(`historical event "${t.id}" needs schedule.atDate/atMinutes`);
    if (t.schedule.atDate !== undefined && Number.isNaN(Date.parse(t.schedule.atDate))) throw new Error(`historical event "${t.id}": invalid date "${t.schedule.atDate}"`);
  }
  templates.set(t.id, t);
}
export const getEventTemplate = (id: string): EventTemplate | undefined => templates.get(id);
export const listEventTemplates = (kind?: EventTemplate['kind']): EventTemplate[] =>
  [...templates.values()].filter((t) => !kind || t.kind === kind);
export const unregisterEventTemplate = (id: string): boolean => templates.delete(id);
/** Remove all historical templates (tests / scenario switch). */
export function clearHistoricalTemplates(): void {
  for (const [id, t] of [...templates]) if (t.kind === 'historical') templates.delete(id);
}
