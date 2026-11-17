import type { GameState, LonLat, Order, OrderKind, ScenarioDefinition, TerrainGrid, Unit, UnitId } from '../../core/types';
import { Terrain } from '../../core/types';
import { haversineKm } from '../../core/geo';
import { estimateEtaMinutes, sourcesForSide, supplyLevelFromDistance } from '../../military';
import { templateForType } from '../../military/catalog';
import { fmtDuration } from '../format';

/** Orders that carry a destination and are worth previewing. */
export const PREVIEW_KINDS: ReadonlySet<OrderKind> = new Set<OrderKind>(['move', 'attack', 'capture', 'recon', 'withdraw']);

export interface OrderPreview {
  /** Slowest unit's straight-line ETA estimate (the sim routes along roads, so the real figure can differ). */
  etaMinutes: number;
  /** Largest estimated fuel burn among fuel-using units, as % of a full tank. null when none use fuel. */
  fuelPct: number | null;
  /** Best-case supply level (0..100) at the destination from the nearest source; the real network route is longer. */
  supplyLevel: number | null;
  supplyKm: number | null;
  /** Things worth confirming before the order is sent. Empty means the order is issued straight away. */
  warnings: string[];
  summary: string;
}

/** Terrain code at a point, or undefined when off the map. */
export function terrainAt(t: TerrainGrid, p: LonLat): number | undefined {
  const col = Math.floor((p[0] - t.bbox.west) / t.cellDeg);
  const row = Math.floor((t.bbox.north - p[1]) / t.cellDeg);
  if (col < 0 || row < 0 || col >= t.cols || row >= t.rows) return undefined;
  return t.cells[row * t.cols + col];
}

const SUPPLY_THIN = 50;   // best-case level below which supply is thin (100 up to 40 km from a source)
const SUPPLY_OUT = 26;    // at or below this the destination is at the edge of any network reach

/**
 * Read-only preview of a destination order. Uses only existing queries: military.estimateEtaMinutes (straight-line ETA),
 * the unit catalog (fuel burn per hour), military.sourcesForSide + supplyLevelFromDistance (supply reach), and the terrain grid.
 */
export function previewOrder(
  state: Readonly<GameState>, terrain: TerrainGrid, scenario: ScenarioDefinition, unitIds: UnitId[],
  order: Pick<Order, 'kind' | 'target'>,
): OrderPreview | null {
  if (!PREVIEW_KINDS.has(order.kind) || !order.target) return null;
  const to = order.target;
  const units = unitIds.map(id => state.units[id]).filter((u): u is Unit => !!u && !u.destroyed);
  if (!units.length) return null;
  const warnings: string[] = [];

  let eta = 0, fuel: number | null = null, fuelWho: Unit | undefined, fuelNeed = 0;
  for (const u of units) {
    const e = estimateEtaMinutes(u, to);
    eta = Math.max(eta, e);
    const tpl = templateForType(u.type);
    if (tpl.usesFuel) {
      const need = (e / 60) * tpl.fuelUseMoving;
      fuel = Math.max(fuel ?? 0, need);
      if (need > u.fuel && need > fuelNeed) { fuelNeed = need; fuelWho = u; }
    }
  }
  if (fuelWho) warnings.push(`${fuelWho.shortName ?? fuelWho.name} needs about ${Math.round(fuelNeed)}% fuel for this trip and has ${Math.round(fuelWho.fuel)}%. It will stop short unless it is resupplied.`);

  const landUnits = units.filter(u => u.domain === 'land');
  if (landUnits.length) {
    const c = terrainAt(terrain, to);
    if (c === undefined) warnings.push('That point is off the map. Units cannot reach it.');
    else if (c === Terrain.Sea || c === Terrain.Lake) warnings.push('That point is open water. Land units cannot reach it.');
  }

  let supplyLevel: number | null = null, supplyKm: number | null = null;
  const side = units[0].side;
  if (landUnits.length) {
    const srcs = sourcesForSide(state as GameState, { scenario }, side);
    if (srcs.length) {
      supplyKm = Math.min(...srcs.map(s => haversineKm(s.loc.pos, to)));
      supplyLevel = supplyLevelFromDistance(supplyKm);
      if (supplyLevel <= SUPPLY_OUT) warnings.push(`The destination is about ${Math.round(supplyKm)} km from the nearest depot or port, at the edge of supply reach. Units there will likely be out of supply.`);
      else if (supplyLevel < SUPPLY_THIN) warnings.push(`The destination is about ${Math.round(supplyKm)} km from the nearest depot or port. Supply there will be thin.`);
    }
  }

  const parts = [`ETA about ${fmtDuration(eta)}`];
  if (fuel !== null && fuel >= 1) parts.push(`fuel about ${Math.round(fuel)}% of a tank`);
  return { etaMinutes: eta, fuelPct: fuel, supplyLevel, supplyKm, warnings, summary: parts.join(', ') };
}
