import type { NationId, ScenarioDefinition } from '../core/types';

/**
 * Opening-surprise factor for a unit of `nation` at `minutes` into the scenario: 1 when inactive; otherwise
 * `defenceMultiplier` fading linearly back to 1 at `untilHour`. Applies to the victim's units in every battle role
 * (a surprised army fights badly whether it defends or counter-attacks).
 */
export function surpriseFactor(scenario: ScenarioDefinition, nation: NationId, minutes: number): number {
  const s = scenario.openingSurprise;
  if (!s || !s.victimNations.includes(nation)) return 1;
  const hours = minutes / 60;
  if (hours >= s.untilHour) return 1;
  const fade = 1 - hours / s.untilHour;
  return 1 - (1 - s.defenceMultiplier) * fade;
}
