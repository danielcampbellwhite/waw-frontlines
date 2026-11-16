import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { REAL_MS_PER_TICK_1X } from '../../src/sim';
import { J, loadWorld, longWorld, mkEngine } from './harness';

const W = loadWorld();
const L = longWorld();
const N = 1000;

describe('determinism (real Fall of France standard, AI on, fog on)', () => {
  for (const nation of ['GER', 'FRA', 'GBR'] as NationId[]) {
    it(`same seed => identical JSON after ${N} ticks, player=${nation}`, () => {
      const a = mkEngine(W, nation, 42), b = mkEngine(W, nation, 42);
      a.step(N); b.step(N);
      const A = J(a.getState()), B = J(b.getState());
      expect(A.length).toBeGreaterThan(1000);
      expect(A === B).toBe(true);
      // the campaign may end before N ticks (victory / end date): the sim freezes at the end tick, so equality above
      // already covers the final state; additionally assert result equality and that the clock stopped at the end tick or ran all N
      const sa = a.getState(), sb = b.getState();
      expect(J(sa.result)).toBe(J(sb.result));
      if (sa.result) expect(sa.clock.minutes).toBe(sa.result.endedAt); else expect(sa.clock.minutes).toBe(N * 60);
      console.log(`[det] ${nation}: ended=${!!sa.result} at tick ${sa.clock.minutes / 60}`, J(sa.result));
    }, 240_000);
  }
  it('different seeds diverge', () => {
    const a = mkEngine(W, 'GER', 1), b = mkEngine(W, 'GER', 2);
    a.step(300); b.step(300);
    expect(J(a.getState()) === J(b.getState())).toBe(false);
  }, 120_000);
  it('step(N) == N x step(1) == chunked advance(realDt) at 1x/8x', () => {
    const T = 150;
    const a = mkEngine(L, 'GER', 7); a.step(T);
    const b = mkEngine(L, 'GER', 7); for (let i = 0; i < T; i++) b.step(1);
    const c = mkEngine(L, 'GER', 7); c.setSpeed(1);
    let done = 0; while (done < T) done += c.advance(REAL_MS_PER_TICK_1X);       // exactly one tick per call
    const d = mkEngine(L, 'GER', 7); d.setSpeed(8);
    done = 0; while (done < T) done += d.advance(250);                            // jittery small frames at 8x
    // advance() overshoots to a multiple of the chunk, so compare after trimming to exactly T ticks
    const strip = (e: ReturnType<typeof mkEngine>) => { const s = e.serialize(); s.clock.speed = 0; s.clock.accumulatorMs = 0; return s; };
    expect(J(strip(a))).toBe(J(strip(b)));
    expect(c.getState().clock.minutes).toBe(T * 60);
    expect(J(strip(a))).toBe(J(strip(c)));
    // d may have run slightly more than T ticks; replay to its tick count and compare
    const td = d.getState().clock.minutes / 60;
    const e = mkEngine(L, 'GER', 7); e.step(td);
    expect(J(strip(e))).toBe(J(strip(d)));
  }, 240_000);
  it('mid-run subscriber / getState / serialize calls do not perturb outcome', () => {
    const a = mkEngine(L, 'FRA', 9); a.step(120);
    const b = mkEngine(L, 'FRA', 9); let n = 0; b.subscribe((s) => { n++; JSON.stringify(s); });
    for (let i = 0; i < 120; i++) { b.step(1); if (i % 7 === 0) b.serialize(); b.visibleUnits('allies'); }
    expect(n).toBe(120);
    expect(J(a.getState())).toBe(J(b.getState()));
  }, 120_000);
});
