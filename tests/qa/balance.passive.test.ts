import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { distribution, playOut, type Outcome } from './balance.helpers';

const SEEDS = [11, 22, 33, 44, 55];
describe('outcome balance: player passive (AI controls all other nations), 5 seeds x 3 nations, Standard', () => {
  it('ending distribution', () => {
    const rs: Outcome[] = [];
    for (const n of ['GER', 'FRA', 'GBR'] as NationId[]) for (const s of SEEDS) rs.push(playOut(n, s, 'passive'));
    console.log('[balance passive] distribution', distribution(rs));
    console.table(rs.map((r) => ({ nation: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    expect(rs.every((r) => r.ending !== 'none')).toBe(true);
  }, 1_200_000);
});
