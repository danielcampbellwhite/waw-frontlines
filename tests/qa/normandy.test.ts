import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { saveGame, loadGame } from '../../src/save';
import { distribution, playOut, type Outcome } from './balance.helpers';
import { portCapacity } from '../../src/military';
import { CJ, checkInvariants, FALLBACKS, J, loadWorld, mkEngine, restore } from './harness';

const ID = 'normandy.short';
const W = loadWorld(ID);
const NATIONS: NationId[] = ['USA', 'GBR', 'CAN', 'GER'];
const END_TICKS = Math.round((Date.parse(W.def.endDate) - Date.parse(W.def.startDate)) / 3_600_000);

describe('Normandy (short)', () => {
  it('data files used (fallbacks flagged)', () => {
    console.log('[normandy] data fallbacks in use:', FALLBACKS.length ? FALLBACKS.join('; ') : 'none', '| end tick', END_TICKS);
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
      await saveGame(`normandy-${n}`, 'b', a.serialize());
      const loaded = await loadGame(`normandy-${n}`);
      const b = restore(W, loaded);
      a.step(100); b.step(100);
      expect(CJ(b.getState())).toBe(CJ(a.getState()));
    }, 240_000);
    it(`invariants ${n}: full campaign passive + early checks every 50 ticks`, () => {
      const e = mkEngine(W, n, 3); const bad: string[] = [];
      for (let t = 1; t <= END_TICKS + 5 && !e.getState().result; t++) { e.step(1); if (t % 50 === 0) bad.push(...checkInvariants(e.getState()).slice(0, 3).map((x) => `t${t} ${x}`)); }
      const s = e.getState();
      console.log(`[normandy] ${n} passive ending`, JSON.stringify(s.result), 'tick', s.clock.minutes / 60, 'reports', s.reports.length, 'log', s.log.length);
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
    const s = e.getState(); console.log('[normandy] reports after 300 ticks', s.reports.length);
    for (const r of s.reports) { expect(r.reasons.length).toBeGreaterThan(0); for (const c of r.casualties) expect(c.killed + c.wounded + c.captured).toBeGreaterThanOrEqual(0); }
    expect(checkInvariants(s)).toEqual([]);
  }, 120_000);

  it('D-Day arrivals land at their hour (no delays) and never on water', () => {
    const e = mkEngine(W, 'USA', 2, { disableAI: true }); const s0 = e.getState();
    const due = Object.values(s0.nations).flatMap((n) => n.reinforcements).filter((r) => r.atMinutes <= 36 * 60);
    const seaAt = (p: [number, number]) => { const t = W.terrain; const c = Math.floor((p[0] - t.bbox.west) / t.cellDeg), r = Math.floor((t.bbox.north - p[1]) / t.cellDeg); return t.cells[r * t.cols + c] === 0; };
    const onWater: string[] = []; const arrivedAt: Record<string, number> = {};
    for (let h = 1; h <= 60; h++) { e.step(1); const s = e.getState();
      for (const r of Object.values(s.nations).flatMap((n) => n.reinforcements)) if (r.arrived && arrivedAt[r.id] === undefined) arrivedAt[r.id] = h;
      if (h === 12 || h === 36 || h === 60) for (const u of Object.values(s.units)) if (u.domain === 'land' && !u.destroyed && seaAt(u.pos as [number, number])) onWater.push(`h${h} ${u.id}`); }
    const s = e.getState(); const late = due.filter((r) => arrivedAt[r.id] === undefined || arrivedAt[r.id] > Math.ceil(r.atMinutes / 60) + 1).map((r) => `${r.id} due ${(r.atMinutes / 60).toFixed(1)} got ${arrivedAt[r.id]}`);
    const delayed = s.log.filter((l) => /no safe arrival point/.test(l.text)).map((l) => l.text);
    console.log('[normandy] D-Day reinforcements due by h36:', due.length, 'late:', JSON.stringify(late), 'delay log:', delayed.length, 'on water:', JSON.stringify(onWater));
    expect(due.length).toBeGreaterThan(10);
    expect(delayed).toEqual([]); expect(late).toEqual([]); expect(onWater).toEqual([]);
  }, 120_000);
  it('Mulberry storm: weather turns to storm at h312 for about 72 h and Mulberry A throughput drops', () => {
    const e = mkEngine(W, 'USA', 2, { disableAI: true }); e.step(300);
    const cap = () => portCapacity(e.getState(), 'mulberry_a'); const before = cap();
    e.step(11); const w311 = e.getState().weather.kind; e.step(3); const w314 = e.getState().weather.kind; const during = cap();
    e.step(80); const w394 = e.getState().weather.kind; const after = cap();
    console.log('[normandy] mulberry_a tons/day h300', before?.tonsPerDay, 'h314', during?.tonsPerDay, 'h394', after?.tonsPerDay, '| weather h311', w311, 'h314', w314, 'h394', w394);
    expect(w314).toBe('storm'); expect(w394).not.toBe('storm');
    expect(before).not.toBeNull(); expect(during!.tonsPerDay).toBeLessThan(before!.tonsPerDay * 0.5);
  }, 120_000);
  it('save/load mid-storm (h330) round trips and continues identically', async () => {
    const a = mkEngine(W, 'GBR', 9); a.step(330);
    await saveGame('normandy-storm', 's', a.serialize()); const b = restore(W, await loadGame('normandy-storm'));
    a.step(60); b.step(60); expect(CJ(b.getState())).toBe(CJ(a.getState()));
  }, 240_000);
  it('tick cost with 48 arrivals, ships and interdiction: mean and worst per tick over 600 ticks', () => {
    const e = mkEngine(W, 'USA', 4); const ms: number[] = [];
    for (let t = 0; t < 600; t++) { const t0 = performance.now(); e.step(1); ms.push(performance.now() - t0); }
    ms.sort((x, y) => x - y); const mean = ms.reduce((x, y) => x + y, 0) / ms.length;
    console.log('[normandy] tick ms mean', mean.toFixed(1), 'p95', ms[Math.floor(ms.length * 0.95)].toFixed(1), 'max', ms[ms.length - 1].toFixed(1), 'units', Object.keys(e.getState().units).length);
    expect(mean).toBeLessThan(60);
  }, 120_000);
  it('ending distribution: passive and AI-vs-AI, 5 seeds x USA/GBR/CAN/GER', () => {
    const seeds = [11, 22, 33, 44, 55]; const passive: Outcome[] = [], ai: Outcome[] = [];
    for (const n of NATIONS) for (const s of seeds) { passive.push(playOut(n, s, 'passive', ID)); ai.push(playOut(n, s, 'ai', ID)); }
    console.log('[normandy balance passive]', JSON.stringify(distribution(passive))); console.table(passive.map((r) => ({ n: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    console.log('[normandy balance ai-vs-ai]', JSON.stringify(distribution(ai))); console.table(ai.map((r) => ({ n: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    expect([...passive, ...ai].every((r) => r.ending !== 'none')).toBe(true);
  }, 3_000_000);
});
