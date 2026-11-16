import { describe, expect, it } from 'vitest';
import { aiThink } from '../src/ai';
import type { GameState, NationId, SideId } from '../src/core/types';
import { J, loadWorld, mkEngine } from './qa/harness';

/** Process-history independence: the same seed must give an identical state however many runs came before it in this process. */
function play(scen: string, player: NationId, seed: number, ticks: number, playerAi: boolean, world = loadWorld(scen)): string[] {
  const e = mkEngine(world, player, seed); const sums: string[] = [];
  for (let t = 0; t < ticks; t += 4) {
    e.step(4);
    const st = e.getState() as GameState;
    if (playerAi) {
      const ctx = { rand: () => Math.abs(Math.sin(st.clock.minutes * 12.9898)) % 1, gauss: () => 0, visibleTo: (_s: Readonly<GameState>, side: SideId) => e.visibleUnits(side) };
      for (const c of aiThink(st, player, ctx)) e.dispatch(c, st.playerSide);
    }
    if (t % 40 === 0) sums.push(J({ u: st.units, l: st.locations, n: st.nations, r: st.rng, o: st.operations }));
  }
  return sums;
}

describe('same-process determinism (history independence)', () => {
  const cases: [string, NationId][] = [['crusader.short', 'GBR'], ['stalingrad.short', 'GER']];
  for (const [scen, player] of cases) for (const playerAi of [false, true]) {
    it(`${scen} player=${player} playerAi=${playerAi}: run, other seed, run again, deep-cloned scenario`, () => {
      const first = play(scen, player, 2, 240, playerAi);
      play(scen, player, 9, 120, playerAi); // an unrelated run in between must leave no trace
      const second = play(scen, player, 2, 240, playerAi);
      const cloned = play(scen, player, 2, 240, playerAi, structuredClone(loadWorld(scen)));
      const bad = first.findIndex((x, i) => x !== second[i] || x !== cloned[i]);
      expect(bad, `first diverging checkpoint (every 10 ticks)`).toBe(-1);
    }, 600_000);
  }
});
