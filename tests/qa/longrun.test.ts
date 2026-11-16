import { describe, expect, it } from 'vitest';
import { checkInvariants, CJ, J, longWorld, mkEngine, restore } from './harness';

const W = longWorld();
const TICKS = 5000;

describe(`long run ${TICKS} ticks, standard scale`, () => {
  it('time/tick, memory, bounded log/history/reports/events, save size, invariants', () => {
    const e = mkEngine(W, 'GER', 99);
    const samples: Record<string, number>[] = [];
    const t0 = performance.now();
    const tickMs: number[] = [];
    const inv: string[] = [];
    for (let t = 1; t <= TICKS; t++) {
      const a = performance.now(); e.step(1); tickMs.push(performance.now() - a);
      if (t % 500 === 0 || t === 1) {
        const s = e.getState();
        if (t % 500 === 0) { const bad = checkInvariants(s); if (bad.length) inv.push(`t=${t}: ${bad.slice(0, 4).join('; ')}`); }
        const sz = (x: unknown) => JSON.stringify(x).length;
        samples.push({ t, heapMB: Math.round(process.memoryUsage().heapUsed / 1e6), log: s.log.length, history: s.history.length, reports: s.reports.length, events: s.events.length,
          battles: Object.keys(s.battles).length, ops: Object.keys(s.operations).length, units: Object.keys(s.units).length, aiStateKB: Math.round(sz(s.aiState) / 1024), specialKB: Math.round(sz(s.special) / 1024),
          eventStateKB: Math.round(sz(s.eventState) / 1024), supplyKB: Math.round(sz(s.supply) / 1024), saveKB: Math.round(sz(s) / 1024), meanMs: Math.round(tickMs.slice(-500).reduce((a, b) => a + b, 0) / Math.min(500, tickMs.length)) });
      }
    }
    console.table(samples);
    console.log('[long] total s', ((performance.now() - t0) / 1000).toFixed(0), 'result', JSON.stringify(e.getState().result));
    const last = samples[samples.length - 1], mid = samples[Math.floor(samples.length / 2)];
    expect(inv).toEqual([]);
    expect(last.log).toBeLessThanOrEqual(1500);
    expect(last.reports).toBeLessThanOrEqual(400);
    // growth: these structures have NO cap in the engine; assert only that growth is slow/linear (extrapolated to 50k ticks stays < 20k entries / 20 MB)
    const perTick = (k: 'history' | 'events') => (last[k] - samples[1][k]) / (last.t - samples[1].t);
    console.log('[long] growth/1000 ticks: history', (perTick('history') * 1000).toFixed(1), 'events', (perTick('events') * 1000).toFixed(1), 'saveKB', ((last.saveKB - samples[1].saveKB) / (last.t - samples[1].t) * 1000).toFixed(1));
    expect(perTick('history') * 50000).toBeLessThan(20000);
    expect(perTick('events') * 50000).toBeLessThan(20000);
    expect(last.aiStateKB).toBeLessThanOrEqual(mid.aiStateKB * 2 + 20);
    expect(last.heapMB).toBeLessThan(600);
    expect(last.saveKB).toBeLessThan(8000);
    // round trip big late state
    const json = J(e.serialize());
    const r = restore(W, JSON.parse(json));
    r.step(20); e.step(20);
    expect(CJ(r.getState())).toBe(CJ(e.getState()));
  }, 1_800_000);
});
