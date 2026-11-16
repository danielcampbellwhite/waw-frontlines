import { describe, expect, it } from 'vitest';
import type { Command, GameState, Unit } from '../src/core/types';
import { createEngine, restoreEngine } from '../src/sim/engine';
import { REAL_MS_PER_TICK_1X } from '../src/sim/constants';
import { cloneJSON, makeWorld, mkUnit } from './simfixture';

function warUnits(): Unit[] {
  return [
    mkUnit('F1', 'FRA', 'infantry', [1.55, 51.5], { posture: 'attack' }),
    mkUnit('F2', 'FRA', 'infantry', [1.55, 51.2], { posture: 'attack' }),
    mkUnit('F3', 'FRA', 'infantry', [1.5, 51.8], { posture: 'defend', entrenchment: 40 }),
    mkUnit('F4', 'FRA', 'armoured', [1.4, 51.5]),
    mkUnit('F5', 'FRA', 'artillery', [1.2, 51.5]),
    mkUnit('F6', 'FRA', 'hq', [0.8, 51.5]),
    mkUnit('G1', 'GER', 'infantry', [2.35, 51.5], { posture: 'defend', entrenchment: 30 }),
    mkUnit('G2', 'GER', 'infantry', [2.35, 51.2], { posture: 'defend' }),
    mkUnit('G3', 'GER', 'armoured', [2.6, 51.5]),
    mkUnit('G4', 'GER', 'armoured', [2.7, 51.8]),
    mkUnit('G5', 'GER', 'mechanised', [2.8, 51.3]),
    mkUnit('G6', 'GER', 'artillery', [2.9, 51.5]),
  ];
}
function build(seed: number) {
  const w = makeWorld({ units: warUnits() });
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed });
  const order = (id: string, kind: 'attack' | 'move', target: [number, number]) =>
    e.dispatch({ type: 'issue_order', unitIds: [id], order: { kind, priority: 1, target }, mode: 'replace' } as Command, id.startsWith('F') ? 'allies' : 'axis');
  order('F1', 'attack', [2.4, 51.5]); order('F2', 'attack', [2.4, 51.2]); order('F4', 'attack', [2.5, 51.5]);
  order('G3', 'attack', [1.6, 51.5]); order('G4', 'attack', [1.6, 51.8]); order('G5', 'move', [1.7, 51.3]);
  return { e, w };
}
const json = (e: { getState(): Readonly<GameState> }) => JSON.stringify({ ...e.getState(), clock: { ...e.getState().clock, speed: 0 } });

describe('determinism', () => {
  it('same seed => identical state JSON after 500 ticks, and combat really happened', () => {
    const a = build(1234).e, b = build(1234).e;
    a.step(500); b.step(500);
    expect(a.getState().reports.length).toBeGreaterThan(0);
    expect(json(a)).toBe(json(b));
    expect(a.getState().clock.minutes).toBe(500 * 60);
  });
  it('different seed => different history', () => {
    const a = build(1).e, b = build(2).e;
    a.step(200); b.step(200);
    expect(json(a)).not.toBe(json(b));
  });
  it('save -> JSON -> restore -> continue === uninterrupted', () => {
    const a = build(77), b = build(77);
    a.e.step(500);
    b.e.step(237);
    const saved = JSON.parse(JSON.stringify(b.e.serialize())) as GameState;
    const c = restoreEngine(saved, b.w.scenario, b.w.terrain, b.w.infra);
    c.step(500 - 237);
    expect(json(c)).toBe(json(a.e));
    expect(a.e.getState().reports.length).toBeGreaterThan(0);
  });
  it('serialize() is a detached deep copy', () => {
    const { e } = build(5);
    e.step(5);
    const s = e.serialize();
    s.units['F1'].manpower = 1;
    expect(e.getState().units['F1'].manpower).not.toBe(1);
  });
});

describe('clock / speed independence', () => {
  it('1 tick = 60 game minutes = 2 real seconds at 1x', () => {
    expect(REAL_MS_PER_TICK_1X).toBe(2000);
    const { e } = build(3);
    e.setSpeed(1);
    expect(e.advance(1999)).toBe(0);
    expect(e.advance(1)).toBe(1);
    expect(e.getState().clock.minutes).toBe(60);
  });
  it('speed 1/2/4/8, chunking and pausing never change outcomes', () => {
    const TICKS = 60, realMs = TICKS * REAL_MS_PER_TICK_1X; // total real time at 1x
    const ref = build(9).e; ref.step(TICKS);
    const run = (speed: 1 | 2 | 4 | 8, chunk: number, pauseEvery = 0) => {
      const { e } = build(9);
      e.setSpeed(speed);
      let spent = 0, n = 0;
      const target = realMs / speed;
      while (spent < target) {
        if (pauseEvery && n % pauseEvery === 0) { e.setSpeed(0); expect(e.advance(5000)).toBe(0); e.setSpeed(speed); }
        e.advance(chunk); spent += chunk; n++;
      }
      return e;
    };
    for (const [sp, ch, pe] of [[1, 250, 0], [2, 125, 7], [4, 100, 0], [8, 125, 3], [8, 1000, 0]] as const) {
      const e = run(sp, ch, pe);
      expect(e.getState().clock.minutes).toBe(TICKS * 60);
      expect(json(e)).toBe(json(ref));
    }
  });
  it('subscribers are notified and can unsubscribe', () => {
    const { e } = build(3);
    let n = 0;
    const off = e.subscribe(() => n++);
    e.step(3); expect(n).toBe(1);
    off(); e.step(3); expect(n).toBe(1);
  });
});

describe('dispatch routing', () => {
  it('rejects commands for the other side', () => {
    const { e } = build(1);
    const r = e.dispatch({ type: 'issue_order', unitIds: ['G1'], order: { kind: 'move', priority: 1, target: [2, 51] }, mode: 'replace' }, 'allies');
    expect(r.ok).toBe(false);
    const ok = e.dispatch({ type: 'set_posture', unitIds: ['F1'], posture: 'defend' });
    expect(ok.ok).toBe(true);
    expect(e.getState().units['F1'].posture).toBe('defend');
  });
});

describe('performance', () => {
  it('600 units tick in < 20 ms average (with fog of war on, mixed movement + combat)', () => {
    const units: Unit[] = [];
    let s = 12345;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
    const types = ['infantry', 'infantry', 'infantry', 'armoured', 'artillery', 'motorised', 'recon', 'mechanised', 'hq', 'engineer'] as const;
    for (let i = 0; i < 600; i++) {
      const fra = i % 2 === 0;
      const lon = fra ? 0.3 + rnd() * 3.4 : 4.3 + rnd() * 3.4;
      const lat = 49.2 + rnd() * 4.6;
      units.push(mkUnit('U' + i, fra ? 'FRA' : 'GER', types[i % types.length], [lon, lat], { posture: i % 3 === 0 ? 'attack' : 'defend' }));
    }
    const w = makeWorld({ units, bbox: { west: 0, south: 48, east: 8, north: 54 }, fog: true, flat: 1 });
    // flat:1 with explicit bbox is all plains
    const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed: 5 });
    for (let i = 0; i < 600; i += 2) {
      e.dispatch({ type: 'issue_order', unitIds: ['U' + i], order: { kind: 'attack', priority: 1, target: [4.0 + rnd() * 0.5, 49.2 + rnd() * 4.6] }, mode: 'replace' }, 'allies');
      e.dispatch({ type: 'issue_order', unitIds: ['U' + (i + 1)], order: { kind: 'attack', priority: 1, target: [3.8 - rnd() * 0.5, 49.2 + rnd() * 4.6] }, mode: 'replace' }, 'axis');
    }
    e.step(10); // warm caches
    const N = 40;
    let avg = Infinity;
    for (let rep = 0; rep < 3; rep++) { // best of three windows: robust against other processes hogging the CPU
      const t0 = performance.now();
      e.step(N);
      avg = Math.min(avg, (performance.now() - t0) / N);
    }
    // eslint-disable-next-line no-console
    console.log(`PERF 600 units: ${avg.toFixed(2)} ms/tick, battles active: ${Object.keys(e.getState().battles).length}, reports: ${e.getState().reports.length}`);
    expect(avg).toBeLessThan(20);
    void cloneJSON;
  }, 60000);
});
