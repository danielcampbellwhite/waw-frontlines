import { registerEventTemplate } from '../registry';
import type { EventTemplate } from '../types';
import * as env from './environment';
import * as log from './logistics';
import * as mil from './military';

export const BUILTIN_TEMPLATES: EventTemplate[] = [
  env.weatherDeterioration, env.rasputitsa, env.frostbite, env.diseaseOutbreak,
  log.fuelShortage, log.convoyLoss, log.depotAirRaid, log.bridgeDestroyed, log.foreignAid, log.equipmentBreakdown,
  mil.unexpectedCounterattack, mil.commandDisruption, mil.moraleCrisis, mil.intelligenceBreakthrough,
  mil.enemyReinforcements, mil.strategicReserve, mil.resistanceActivity, mil.strategicOpportunity,
];

let done = false;
export function registerBuiltinTemplates(): void {
  if (done) return;
  done = true;
  for (const t of BUILTIN_TEMPLATES) registerEventTemplate(t);
}
