import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { playOut } from './balance.helpers';

/** AI-vs-AI must be bit-identical for the same scenario, seed and code: run twice in one process, with another scenario in between (catches module-level caches/memory leaking across runs). */
const CASES: [string, NationId, number][] = [['bulge.short', 'USA', 1], ['bulge.short', 'GER', 2], ['normandy.short', 'GBR', 1], ['stalingrad.short', 'GER', 3]];
describe('AI-vs-AI determinism (same process, interleaved scenarios)', () => {
  for (const [id, n, seed] of CASES) it(`${id} ${n} seed ${seed}: identical final state hash on repeat runs`, () => {
    const a = playOut(n, seed, 'ai', id, true);
    playOut('FRA', 5, 'ai', 'fall_of_france.short');     // pollute any module-level state
    const b = playOut(n, seed, 'ai', id, true);
    console.log(`[aidet] ${id} ${n} ${seed}`, a.hash, b.hash, a.ending, a.score);
    expect(b.hash).toBe(a.hash);
  }, 900_000);
});
