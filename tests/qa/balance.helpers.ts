import { nextFloat, nextGauss } from '../../src/core/rng';
import type { Ending, NationId } from '../../src/core/types';
import { aiThink, type AiContext } from '../../src/ai';
import { visibleTo } from '../../src/sim';
import { CJ, loadWorld, mkEngine } from './harness';

const worlds = new Map<string, ReturnType<typeof loadWorld>>();
const worldOf = (id: string) => { if (!worlds.has(id)) worlds.set(id, loadWorld(id)); return worlds.get(id)!; };
export interface Outcome { nation: NationId; seed: number; ending: Ending | 'none'; score: number; tick: number; mode: 'passive' | 'ai'; hash?: string }

/** mode 'ai' drives the player's nation with aiThink as well (AI-vs-AI). Runs up to 1500 ticks (campaign ends at 1104 or earlier). */
export function playOut(nation: NationId, seed: number, mode: 'passive' | 'ai', scenarioId = 'fall_of_france.standard', withHash = false): Outcome {
  const e = mkEngine(worldOf(scenarioId), nation, seed);
  const rng = { s: seed * 7919 + 13 };
  const ctx: AiContext = { rand: () => nextFloat(rng), gauss: () => nextGauss(rng), visibleTo };
  for (let t = 1; t <= 1500 && !e.getState().result; t++) {
    if (mode === 'ai' && t % 4 === 0) for (const c of aiThink(e.getState(), nation, ctx)) e.dispatch(c, e.getState().playerSide);
    e.step(1);
  }
  const s = e.getState();
  let hash: string | undefined;
  if (withHash) { let h = 2166136261; const txt = CJ(s); for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } hash = h.toString(16) + ':' + txt.length; }
  return { nation, seed, ending: s.result?.ending ?? 'none', score: s.result?.score ?? 0, tick: s.clock.minutes / 60, mode, hash };
}
export function distribution(rs: Outcome[]): Record<string, number> {
  const d: Record<string, number> = {}; for (const r of rs) d[`${r.nation}:${r.ending}`] = (d[`${r.nation}:${r.ending}`] ?? 0) + 1; return d;
}
