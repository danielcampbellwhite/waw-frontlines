import type { GameState, Objective } from '../../core/types';
import type { SimContext } from '../context';

/**
 * Campaign-specific mechanics plug in here by id (ScenarioDefinition.specialSystems).
 * Modules keep ALL their state in state.special[id] (plain JSON) so saves/determinism hold.
 */
export interface SpecialModule {
  id: string;
  /** Called once when a new game is created (not on restore). */
  init?(state: GameState, ctx: SimContext): void;
  /** Called every tick after unit stats update and before territory. */
  update?(state: GameState, ctx: SimContext): void;
  /** Evaluate an Objective with condition.kind === 'custom'. Return undefined to leave it pending. */
  evaluate?(script: string, objective: Objective, state: GameState, ctx: SimContext): 'achieved' | 'failed' | 'pending' | undefined;
}

const registry = new Map<string, SpecialModule>();

export function registerSpecialModule(m: SpecialModule): void { registry.set(m.id, m); }
export function getSpecialModule(id: string): SpecialModule | undefined { return registry.get(id); }
export function listSpecialModules(): string[] { return Array.from(registry.keys()).sort(); }

/** Modules enabled by the scenario, in declaration order; unknown ids are skipped. */
export function activeModules(ctx: SimContext): SpecialModule[] {
  const out: SpecialModule[] = [];
  for (const id of ctx.scenario.specialSystems) { const m = registry.get(id); if (m) out.push(m); }
  return out;
}
