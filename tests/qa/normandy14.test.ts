import { describe, expect, it } from 'vitest';
import { nextFloat, nextGauss } from '../../src/core/rng';
import { aiThink } from '../../src/ai';
import { visibleTo } from '../../src/sim';
import { loadWorld, mkEngine } from './harness';

/** Normandy AI-vs-AI for the full 1320 ticks (probes stopping early score Axis 0 because hold objectives score at the end). */
const W = loadWorld('normandy.short');
describe('Normandy AI vs AI, full campaign: fall hours and Axis score', () => {
  for (const seed of [1, 2, 3]) it(`USA AI seed ${seed}: locations fall in a historical order, Axis scores when the game runs to the end`, () => {
    const e = mkEngine(W, 'USA', seed); const rng = { s: seed * 7919 + 13 };
    const ctx = { rand: () => nextFloat(rng), gauss: () => nextGauss(rng), visibleTo };
    const fell: Record<string, number> = {}; const watch = ['carentan', 'caen', 'cherbourg', 'saint_lo', 'st_lo', 'avranches', 'bayeux'];
    for (let t = 1; t <= 1400 && !e.getState().result; t++) {
      if (t % 4 === 0) for (const c of aiThink(e.getState(), 'USA', ctx)) e.dispatch(c, 'allies');
      e.step(1);
      for (const id of watch) { const l = e.getState().locations[id]; if (l && fell[id] === undefined && e.getState().nations[l.owner]?.side === 'allies' && e.getState().nations[l.originalOwner]?.side === 'axis') fell[id] = t; }
    }
    const s = e.getState();
    const axisPts = s.objectives.filter((o) => o.side === 'axis' && o.status === 'achieved').reduce((a, o) => a + o.points, 0);
    console.log(`[normandy14] seed ${seed} fell hours`, JSON.stringify(fell), 'ended', s.result?.ending, 'tick', s.clock.minutes / 60, 'axis points', axisPts, 'allied points', s.result?.score);
    expect(s.result, 'campaign did not reach its end').toBeDefined();
    // Axis hold objectives score only at the end date: a game ended early by an Allied win legitimately gives the Axis 0; one that runs to the end must not
    if ((s.clock.minutes / 60) >= 1319) expect(axisPts).toBeGreaterThan(0);
    expect(['decisive_victory', 'strategic_victory', 'limited_victory', 'stalemate', 'defeat']).toContain(s.result!.ending);
  }, 900_000);
});
