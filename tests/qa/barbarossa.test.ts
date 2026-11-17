import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { distribution, playOut, type Outcome } from './balance.helpers';
import { CJ, checkInvariants, loadWorld, mkEngine, restore } from './harness';

const ID = 'barbarossa.short';
const W = loadWorld(ID);
const NATIONS: NationId[] = ['GER', 'SOV'];

describe('Barbarossa (short)', () => {
  for (const n of NATIONS) it(`${n}: invariants over 600 ticks, determinism, save/load round trip`, () => {
    const a = mkEngine(W, n, 3), b = mkEngine(W, n, 3);
    a.step(600); b.step(600);
    expect(CJ(a.getState())).toBe(CJ(b.getState()));
    expect(checkInvariants(a.getState())).toEqual([]);
    const r = restore(W, a.serialize()); a.step(100); r.step(100);
    expect(CJ(r.getState())).toBe(CJ(a.getState()));
  }, 300_000);
  it('ending distribution: passive and AI-vs-AI, 5 seeds x GER/SOV', () => {
    const seeds = [11, 22, 33, 44, 55]; const passive: Outcome[] = [], ai: Outcome[] = [];
    for (const n of NATIONS) for (const s of seeds) { passive.push(playOut(n, s, 'passive', ID)); ai.push(playOut(n, s, 'ai', ID)); }
    console.log('[barbarossa balance passive]', JSON.stringify(distribution(passive))); console.table(passive.map((r) => ({ n: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    console.log('[barbarossa balance ai-vs-ai]', JSON.stringify(distribution(ai))); console.table(ai.map((r) => ({ n: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    expect([...passive, ...ai].every((r) => r.ending !== 'none')).toBe(true);
  }, 1_800_000);
});
