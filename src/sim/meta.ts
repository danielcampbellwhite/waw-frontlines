import type { BattleId, GameState, LocationId, NationId, UnitId } from '../core/types';

export interface BattleMeta {
  attackerSide: 'allies' | 'axis';
  defenderSide: 'allies' | 'axis';
  start: Record<UnitId, { man: number; org: number; morale: number; side: string }>;
  killed: Record<UnitId, number>;
  wounded: Record<UnitId, number>;
  captured: Record<UnitId, number>;
  eqLoss: Record<string, number>;
  retreated: UnitId[];
  destroyed: UnitId[];
  surrendered: UnitId[];
  /** per-battle log-luck for the attackers (fixed at battle start: who got the better of the opening) */
  luck: number;
  /** battle age in rounds (never reset by report roll-overs) */
  age: number;
  /** opening surprise bonus for the attackers (fraction, 0 = none), fixed at battle start; applies for the first 3 rounds */
  surprise: number;
  surpriseNote: string;
  weakAtt: number;   // consecutive rounds attackers were badly outgunned
  weakDef: number;
  /** Per-round factor sums (divide by n to average) — source for BattleReport.reasons. */
  n: number;
  sum: Record<string, number>;
  terrainCode: number;
  startedPos: [number, number];
}

export interface SimMeta {
  battles: Record<BattleId, BattleMeta>;
  occupy: Record<LocationId, { nation: NationId; ticks: number }>;
  isolated: UnitId[];
  /** unit -> enemy side -> [first sighted minute, last sighted minute] of the current continuous sighting spell */
  firstSeen: Record<UnitId, Record<string, [number, number]>>;
  /** air unit -> [game day, sorties flown that day] */
  sorties: Record<UnitId, [number, number]>;
  /** ice thickness fraction 0..1 on rivers and lakes (absent = never frozen); see ice.ts */
  ice?: number;
  /** units currently executing a combat retreat (survives other modules resetting moveStatus before movement runs) */
  retreating: Record<UnitId, true>;
  /** unit -> game minute since which it has been continuously encircled (for surrender timing) */
  cutSince: Record<UnitId, number>;
  /** landed unit -> game minute until which the beach/drop disorder penalty applies */
  landing: Record<UnitId, number>;
  /** scheduled carpet bombings already resolved (or cancelled) */
  bombed: Record<string, true>;
  /** report id -> cells gained per nation (to fill BattleReport.territoryChangeOwner); pruned with reports */
  gains: Record<string, Record<string, number>>;
  /** test/tooling switch: engine skips ai.aiThink */
  aiOff?: boolean;
  /** supply cut-off ids written by other modules, last time we saw them (so we only manage our own) */
  tick: number;
}

export function getSimMeta(state: GameState): SimMeta {
  let m = state.special['sim'] as SimMeta | undefined;
  if (!m) {
    m = { battles: {}, occupy: {}, isolated: [], gains: {}, firstSeen: {}, sorties: {}, retreating: {}, cutSince: {}, landing: {}, bombed: {}, tick: 0 };
    state.special['sim'] = m;
  }
  if (!m.gains) m.gains = {};
  if (!m.firstSeen) m.firstSeen = {};
  if (!m.sorties) m.sorties = {};
  if (!m.retreating) m.retreating = {};
  if (!m.cutSince) m.cutSince = {};
  if (!m.landing) m.landing = {};
  if (!m.bombed) m.bombed = {};
  return m;
}
