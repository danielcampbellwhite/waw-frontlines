import { appendFileSync } from 'node:fs';
const out = (...a: unknown[]) => appendFileSync(process.env.AI_LOG ?? 'ai_probe.log', a.join(' ') + String.fromCharCode(10));
import { describe, expect, it } from 'vitest';
import { loadWorld, mkEngine } from './qa/harness';
import { aiThink, describeAi } from '../src/ai';
import type { NationId } from '../src/core/types';

function run(player: NationId, seed: number, ticks: number, verbose: boolean, aiPlayerToo = false) {
  const w = loadWorld();
  const e = mkEngine(w, player, seed);
  const t0 = performance.now();
  for (let t = 0; t < ticks; t += 50) {
    if (aiPlayerToo) {
      for (let k = 0; k < 50 && !e.getState().result; k += 4) {
        e.step(4);
        const st = e.getState() as import('../src/core/types').GameState;
        const ctxp = { rand: () => Math.abs(Math.sin(st.clock.minutes * 12.9898)) % 1, gauss: () => 0, visibleTo: (_s2: Readonly<import('../src/core/types').GameState>, side: import('../src/core/types').SideId) => e.visibleUnits(side) };
        for (const c of aiThink(st, player, ctxp)) e.dispatch(c, st.playerSide);
      }
    } else e.step(50);
    const s = e.getState();
    if (verbose) {
      const own = (n: NationId) => describeAi(s, n).posture;
      const gerObj = s.objectives.filter((o) => o.side === 'axis' && o.status === 'achieved').map((o) => o.id.split('.').pop()).join(',');
      const ops = Object.values(s.operations).filter((o) => o.nation === 'GER' && (o.status === 'active' || o.status === 'planned')).length;
      const g = Object.values(s.units).filter((u) => u.nation === 'GER' && !u.destroyed);
      out(`t${t + 50} GER:${own('GER')} FRA:${own('FRA')} ops${ops} gerU${g.length} ammo${Math.round(g.reduce((a, u) => a + u.ammo, 0) / g.length)} fuel${Math.round(g.reduce((a, u) => a + u.fuel, 0) / g.length)} obj[${gerObj}] ms/tick ${((performance.now() - t0) / (t + 50)).toFixed(1)}`);
    }
  }
  const s = e.getState();
  return s;
}

describe('German AI vs a passive France (regression for QA M2)', () => {
  it('takes the primary objectives at a historically plausible pace', () => {
    const w = loadWorld();
    const e = mkEngine(w, 'FRA', 2024);
    const achievedAt: Record<string, number> = {};
    for (let t = 0; t < 1100 && !e.getState().result; t += 20) {
      e.step(20);
      for (const o of e.getState().objectives) if (o.side === 'axis' && o.status === 'achieved' && achievedAt[o.id] === undefined) achievedAt[o.id] = e.getState().clock.minutes / 60;
    }
    const s = e.getState();
    const pts = s.objectives.filter((o) => o.side === 'axis' && o.status === 'achieved').reduce((a, o) => a + o.points, 0);
    out('M2 regression achievedAt', JSON.stringify(achievedAt), 'pts', pts);
    // target band for an undefended France: a clear but not instant German win (about 600-750 points)
    expect(pts).toBeGreaterThanOrEqual(600);
    expect(Object.keys(achievedAt).length).toBeGreaterThanOrEqual(3);
    if (achievedAt['o.ger.abbeville'] !== undefined) expect(achievedAt['o.ger.abbeville']).toBeGreaterThan(168 - 1); // pacing gate
    if (achievedAt['o.ger.paris'] !== undefined) expect(achievedAt['o.ger.paris']).toBeGreaterThan(500);        // not a one-week romp to Paris
  }, 300000);
});

describe.skipIf(!process.env.AI_CAMPAIGN)('campaign probe', () => {
  it('passive GER (allied AIs attack)', () => {
    const s = run('GER', 2024, 1100, false);
    const pts = (side: string) => s.objectives.filter((o) => o.side === side && o.status === 'achieved').reduce((a, o) => a + o.points, 0);
    out('RESULT-GERPASSIVE', JSON.stringify(s.result), 'axis pts', pts('axis'), 'allies pts', pts('allies'));
    out(s.objectives.map((o) => `${o.id}:${o.status}`).join(' '));
  }, 900000);
  it('passive FRA', () => {
    const s = run('FRA', 2024, 1100, true);
    const pts = (side: string) => s.objectives.filter((o) => o.side === side && o.status === 'achieved').reduce((a, o) => a + o.points, 0);
    out('RESULT', JSON.stringify(s.result), 'axis pts', pts('axis'), 'allies pts', pts('allies'));
    out(s.objectives.map((o) => `${o.id}:${o.status}`).join(' '));
  }, 600000);
  it('AI plays FRA (proxy for an attentive player)', () => {
    const s = run('FRA', 2024, 1100, true, true);
    const pts = (side: string) => s.objectives.filter((o) => o.side === side && o.status === 'achieved').reduce((a, o) => a + o.points, 0);
    out('RESULT-AIFRA', JSON.stringify(s.result), 'axis pts', pts('axis'), 'allies pts', pts('allies'));
    out(s.objectives.map((o) => `${o.id}:${o.status}`).join(' '));
  }, 900000);
});
