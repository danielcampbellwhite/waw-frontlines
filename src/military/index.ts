/** Military module public API (Agent 3). Signatures per docs/TECHNICAL_ARCHITECTURE.md. */
import type { GameState } from '../core/types';
import { processOrders as processOrdersImpl } from './orders';
import { updateSupply as updateSupplyImpl } from './logistics';
import { updateUnitStats as updateUnitStatsImpl } from './stats';
import type { MilitaryContext } from './context';

export { applyCommand, isImmobilised, estimateEtaMinutes, issueOrders, validateOrderSpec, orderUnitError, unitsInOperation } from './orders';
export { processReinforcements } from './reinforcements';
export { createUnitFromTemplate } from './units';
export {
  SUPPLY_INTERVAL_TICKS, TONS_PER_POINT, sourcesForSide, isPortBesieged, setPortRelief, airliftFraction, damageInfra, damageLocation, isCutOff, supplyLevelFromDistance, weatherSupplyFactor,
} from './logistics';
export { combatEffectiveness, computeReadiness, strengthFraction, equipmentFraction } from './stats';
export { UNIT_TEMPLATES, EQUIPMENT, getTemplate, templateForType, equipmentDef } from './catalog';
export type { UnitTemplate, EquipmentDef, CombatRatings } from './catalog';
export type { MilitaryContext } from './context';

export function processOrders(state: GameState, ctx: MilitaryContext): void { processOrdersImpl(state, ctx); }
export function updateSupply(state: GameState, ctx: MilitaryContext): void { updateSupplyImpl(state, ctx); }
export function updateUnitStats(state: GameState, ctx: MilitaryContext): void { updateUnitStatsImpl(state, ctx); }
