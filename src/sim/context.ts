import type { InfraLine, LogEntry, ScenarioDefinition, TerrainGrid } from '../core/types';

/** Handed to every pipeline stage and to src/military, src/ai, src/events. Randomness ONLY via rand()/gauss(). */
export interface SimContext {
  terrain: TerrainGrid;
  infra: InfraLine[];
  scenario: ScenarioDefinition;
  /** uniform [0,1) drawn from state.rng */
  rand(): number;
  /** ~N(0,1) drawn from state.rng */
  gauss(): number;
  log(e: Omit<LogEntry, 't'>): void;
}
