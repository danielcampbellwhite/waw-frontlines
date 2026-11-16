import { describe, expect, it } from 'vitest';
import { loadWorld, mkEngine } from './harness';
describe('per-tick time over the full 1104-tick campaign (player GBR so GER+FRA AI run; no external load assumed)', () => {
  it('buckets of 100 ticks', () => {
    const e = mkEngine(loadWorld(), 'GBR', 5);
    const buckets: number[] = []; let acc = 0, worst = 0;
    for (let t = 1; t <= 1100; t++) { const a = performance.now(); e.step(1); const d = performance.now() - a; acc += d; worst = Math.max(worst, d); if (t % 100 === 0) { buckets.push(Math.round(acc / 100)); acc = 0; } }
    console.log('[tickperf] mean ms per 100-tick bucket', buckets.join(' '), 'worst single tick', worst.toFixed(0));
    expect(Math.max(...buckets)).toBeLessThan(100);
  }, 300_000);
});
