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
  it('scripted items: arrivals (11th Army h240, Soviet reserves h156/324/396), 2 Jul rain for 144 h, Axis air window ends h168', () => {
    const e = mkEngine(W, 'SOV', 4);
    const has = (id: string) => !!e.getState().units[id];
    const seen: Record<string, number> = {}; const rain: number[] = []; const watch = ['ger.11a', 'sov.22a', 'sov.20a', 'sov.5mc', 'sov.7mc', 'sov.21a', 'sov.19a', 'sov.16a'];
    for (let t = 1; t <= 420; t++) {
      e.step(1);
      for (const id of watch) if (seen[id] === undefined && has(id)) seen[id] = t;
      if (e.getState().weather.kind === 'rain') rain.push(t);
    }
    console.log('[barbarossa] arrivals (tick)', JSON.stringify(seen), 'rain ticks', rain.length ? `${rain[0]}..${rain[rain.length - 1]} (${rain.length})` : 'none');
    expect(seen['ger.11a']).toBeGreaterThanOrEqual(240); expect(seen['ger.11a']).toBeLessThanOrEqual(244);
    for (const id of ['sov.22a', 'sov.20a', 'sov.5mc', 'sov.7mc', 'sov.21a']) { expect(seen[id], id).toBeGreaterThanOrEqual(156); expect(seen[id], id).toBeLessThanOrEqual(160); }
    expect(seen['sov.19a']).toBeGreaterThanOrEqual(324); expect(seen['sov.16a']).toBeGreaterThanOrEqual(396);
    for (let t = 241; t <= 383; t++) expect(rain.includes(t), `rain at tick ${t}`).toBe(true);
    expect(rain.includes(390)).toBe(false); // the event's 144 h run ends near tick 384 and the weather then clears
    expect(W.def.airSupremacy?.[0]?.toMinutes).toBe(10080);
    for (const id of watch) { const u = e.getState().units[id]; if (u) expect(u.pos.every(Number.isFinite)).toBe(true); }
    expect(checkInvariants(e.getState())).toEqual([]);
  }, 300_000);
  it('ending distribution: passive and AI-vs-AI, 5 seeds x GER/SOV', () => {
    const seeds = [11, 22, 33, 44, 55]; const passive: Outcome[] = [], ai: Outcome[] = [];
    for (const n of NATIONS) for (const s of seeds) { passive.push(playOut(n, s, 'passive', ID)); ai.push(playOut(n, s, 'ai', ID)); }
    console.log('[barbarossa balance passive]', JSON.stringify(distribution(passive))); console.table(passive.map((r) => ({ n: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    console.log('[barbarossa balance ai-vs-ai]', JSON.stringify(distribution(ai))); console.table(ai.map((r) => ({ n: r.nation, seed: r.seed, ending: r.ending, score: r.score, tick: r.tick })));
    expect([...passive, ...ai].every((r) => r.ending !== 'none')).toBe(true);
  }, 1_800_000);
});
