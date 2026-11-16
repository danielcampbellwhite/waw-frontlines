import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { distribution, playOut, type Outcome } from './balance.helpers';

const SEEDS = [11, 22, 33, 44, 55];
describe('outcome balance: AI-vs-AI (player nation also driven by aiThink), 5 seeds, Standard', () => {
  it('ending distribution for the GER and FRA viewpoint', () => {
    const rs: Outcome[] = [];
    for (const n of ['GER', 'FRA'] as NationId[]) for (const s of SEEDS) rs.push(playOut(n, s, 'ai'));
    console.log('[balance ai-vs-ai] distribution', distribution(rs));
    console.table(rs.map((r) => ({ nation: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    expect(rs.every((r) => r.ending !== 'none')).toBe(true);
  }, 1_200_000);
});
