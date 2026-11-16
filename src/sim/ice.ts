import type { GameState, ScenarioDefinition } from '../core/types';
import { getSimMeta } from './meta';

/**
 * Frozen rivers and lakes (opt-in per scenario). Optional ScenarioDefinition fields, hours since the scenario start:
 *   iceFromHour  - ice begins to form (thin)         iceFullHour  - ice is fully load-bearing
 *   iceThawHour  - ice begins to rot (gone 14 days later)
 * Without iceFromHour/iceFullHour there is never ice, so existing campaigns are unaffected.
 */
export interface IceFields { iceFromHour?: number; iceFullHour?: number; iceThawHour?: number }

/** Ice thickness fraction 0..1, quantised to 1/20 so route caches stay valid between small changes. */
export function iceLevel(scenario: ScenarioDefinition, minutes: number): number {
  const f = scenario as ScenarioDefinition & IceFields;
  if (f.iceFromHour === undefined || f.iceFullHour === undefined) return 0;
  const h = minutes / 60;
  let v = f.iceFullHour > f.iceFromHour ? (h - f.iceFromHour) / (f.iceFullHour - f.iceFromHour) : h >= f.iceFullHour ? 1 : 0;
  if (f.iceThawHour !== undefined && h > f.iceThawHour) v = Math.min(v, 1 - (h - f.iceThawHour) / (14 * 24));
  v = Math.max(0, Math.min(1, v));
  return Math.round(v * 20) / 20;
}

/**
 * Dates set the ceiling; the weather gates it. While the air temperature is above 0 C ice cannot thicken (it keeps its
 * current thickness), and above 3 C it loses 0.05 per game day. Only applies to scenarios that opt in to ice.
 */
export function updateIce(state: GameState, scenario: ScenarioDefinition): void {
  const m = getSimMeta(state);
  const cap = iceLevel(scenario, state.clock.minutes);
  if (cap === 0 && m.ice === undefined) return;
  const prev = m.ice ?? cap;
  const temp = state.weather.temperatureC;
  let v = cap;
  if (temp > 0 && cap > prev) v = prev;
  if (temp > 3 && Math.floor(state.clock.minutes / 60) % 24 === 0) v = Math.max(0, Math.min(v, prev) - 0.05);
  m.ice = Math.round(Math.min(v, cap) * 20) / 20;
}

export const iceOf = (state: GameState): number => getSimMeta(state).ice ?? 0;
