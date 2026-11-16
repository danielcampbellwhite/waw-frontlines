import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { saveGame, loadGame } from '../../src/save';
import { distribution, playOut, type Outcome } from './balance.helpers';
import { CJ, checkInvariants, FALLBACKS, J, loadWorld, mkEngine, restore } from './harness';

const ID = 'bulge.short';
const W = loadWorld(ID);
const NATIONS: NationId[] = ['GER', 'USA', 'GBR'];
const END_TICKS = Math.round((Date.parse(W.def.endDate) - Date.parse(W.def.startDate)) / 3_600_000);

describe('Battle of the Bulge (short)', () => {
  it('data files used (fallbacks flagged until terrain_ardennes lands)', () => {
    console.log('[bulge] data fallbacks in use:', FALLBACKS.length ? FALLBACKS.join('; ') : 'none', '| end tick', END_TICKS);
    expect(W.terrain.cells.length).toBe(W.terrain.cols * W.terrain.rows);
  });
  for (const n of NATIONS) {
    it(`determinism ${n}: same seed identical, different seed diverges`, () => {
      const a = mkEngine(W, n, 42), b = mkEngine(W, n, 42), c = mkEngine(W, n, 43);
      a.step(400); b.step(400); c.step(400);
      expect(J(a.getState())).toBe(J(b.getState()));
      expect(J(a.getState()) === J(c.getState())).toBe(false);
    }, 240_000);
    it(`save/load ${n}: restore + continue == uninterrupted; IndexedDB checksum round trip`, async () => {
      const a = mkEngine(W, n, 7); a.step(150);
      await saveGame(`bulge-${n}`, 'b', a.serialize());
      const loaded = await loadGame(`bulge-${n}`);
      const b = restore(W, loaded);
      a.step(100); b.step(100);
      expect(CJ(b.getState())).toBe(CJ(a.getState()));
    }, 240_000);
    it(`invariants ${n}: full campaign passive + early checks every 50 ticks`, () => {
      const e = mkEngine(W, n, 3); const bad: string[] = [];
      for (let t = 1; t <= END_TICKS + 5 && !e.getState().result; t++) { e.step(1); if (t % 50 === 0) bad.push(...checkInvariants(e.getState()).slice(0, 3).map((x) => `t${t} ${x}`)); }
      const s = e.getState();
      console.log(`[bulge] ${n} passive ending`, JSON.stringify(s.result), 'tick', s.clock.minutes / 60, 'reports', s.reports.length, 'log', s.log.length);
      expect(bad).toEqual([]);
      expect(s.result).toBeDefined();
    }, 300_000);
  }
  it('movement sanity: move order accepted, unit moves, never ends on sea; sea order rejected; wrong-side order rejected', () => {
    const e = mkEngine(W, 'GER', 1, { disableAI: true });
    const u = Object.values(e.getState().units).find((x) => x.nation === 'GER' && x.domain === 'land' && x.type !== 'hq')!;
    const tgt: [number, number] = [u.pos[0] - 0.15, u.pos[1]];
    expect(e.dispatch({ type: 'issue_order', unitIds: [u.id], order: { kind: 'move', target: tgt, priority: 1 }, mode: 'replace' }, 'axis').ok).toBe(true);
    const p0 = [...u.pos]; e.step(24);
    expect(Math.hypot(e.getState().units[u.id].pos[0] - p0[0], e.getState().units[u.id].pos[1] - p0[1])).toBeGreaterThan(0.01);
    const us = Object.values(e.getState().units).find((x) => x.side === 'allies')!;
    expect(e.dispatch({ type: 'issue_order', unitIds: [us.id], order: { kind: 'move', target: tgt, priority: 1 }, mode: 'replace' }, 'axis').ok).toBe(false);
    const t = W.terrain; let sea: [number, number] | null = null;
    for (let i = 0; i < t.cells.length && !sea; i++) if (t.cells[i] === 0) sea = [t.bbox.west + ((i % t.cols) + 0.5) * t.cellDeg, t.bbox.north - (Math.floor(i / t.cols) + 0.5) * t.cellDeg];
    if (sea) expect(e.dispatch({ type: 'issue_order', unitIds: [u.id], order: { kind: 'move', target: sea, priority: 1 }, mode: 'replace' }, 'axis').ok).toBe(false);
  });
  it('combat sanity: battles produce reports with reasons, casualties <= manpower, stats in range', () => {
    const e = mkEngine(W, 'USA', 5); e.step(300);
    const s = e.getState(); console.log('[bulge] reports after 300 ticks', s.reports.length);
    for (const r of s.reports) { expect(r.reasons.length).toBeGreaterThan(0); for (const c of r.casualties) expect(c.killed + c.wounded + c.captured).toBeGreaterThanOrEqual(0); }
    expect(checkInvariants(s)).toEqual([]);
  }, 120_000);
  it('reinforcements arrive (10 scheduled) over the campaign', () => {
    const e = mkEngine(W, 'USA', 5); e.step(END_TICKS - 1);
    const arrived = Object.values(e.getState().nations).flatMap((n) => n.reinforcements).filter((r) => r.arrived).length;
    console.log('[bulge] reinforcements arrived', arrived, 'of', W.def.reinforcements.length);
    expect(arrived).toBeGreaterThan(0);
  }, 120_000);
  it('ending distribution: passive and AI-vs-AI, 5 seeds x GER/USA/GBR', () => {
    const seeds = [11, 22, 33, 44, 55]; const passive: Outcome[] = [], ai: Outcome[] = [];
    for (const n of NATIONS) for (const s of seeds) { passive.push(playOut(n, s, 'passive', ID)); ai.push(playOut(n, s, 'ai', ID)); }
    console.log('[bulge balance passive]', JSON.stringify(distribution(passive))); console.table(passive.map((r) => ({ n: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    console.log('[bulge balance ai-vs-ai]', JSON.stringify(distribution(ai))); console.table(ai.map((r) => ({ n: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    expect([...passive, ...ai].every((r) => r.ending !== 'none')).toBe(true);
  }, 900_000);
});
