import { describe, expect, it } from 'vitest';
import type { GameState, Unit } from '../../src/core/types';
import { Terrain } from '../../src/core/types';
import { createEngine } from '../../src/sim';
import { makeWorld, mkUnit, SETTINGS } from '../simfixture';
import { checkInvariants } from './harness';

interface Setup { aMul?: number; dMul?: number; dEntrench?: number; patch?: number; seed: number; aType?: Unit['type']; dType?: Unit['type']; weather?: 'clear' | 'rain' | 'mud' | 'storm' }
function fight(s: Setup) {
  const w = makeWorld({ flat: Terrain.Plains, bbox: { west: 0, south: 50, east: 4, north: 53 }, weather: { [s.weather ?? 'clear']: 1 } as never, patch: s.patch ? { west: 1.9, east: 2.2, terrain: s.patch } : undefined });
  const a = mkUnit('A', 'GER', s.aType ?? 'infantry', [1.97, 51.5]); const d = mkUnit('D', 'FRA', s.dType ?? 'infantry', [2.0, 51.5]);
  const scale = (u: Unit, m: number) => { u.manpower = u.manpowerMax = Math.round(u.manpowerMax * m); for (const k in u.equipment.held) { u.equipment.held[k] = Math.round(u.equipment.held[k] * m); u.equipment.authorised[k] = u.equipment.held[k]; } };
  scale(a, s.aMul ?? 1); scale(d, s.dMul ?? 1);
  d.entrenchment = s.dEntrench ?? 0; d.posture = 'defend'; a.posture = 'attack';
  w.scenario.units.push(a, d);
  w.scenario.units = w.scenario.units.filter((u) => u.id === 'A' || u.id === 'D' || u.id === 'RF' || u.id === 'RG');
  w.scenario.objectives = [];
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'GER', settings: { ...SETTINGS, randomEvents: false }, seed: s.seed, disableAI: true });
  e.dispatch({ type: 'issue_order', unitIds: ['A'], order: { kind: 'attack', target: [2.0, 51.5], priority: 1 }, mode: 'replace' }, 'axis');
  const first: Record<string, { battle: GameState['battles'][string]; units: Record<string, Unit> }> = {};
  for (let t = 0; t < 80; t++) {
    e.step(1);
    const st = e.getState();
    for (const bid in st.battles) if (!first[bid]) first[bid] = { battle: structuredClone(st.battles[bid]), units: structuredClone(st.units) };
    if (st.reports.length && Object.keys(st.battles).length === 0) break;
  }
  return { e, state: e.getState(), first, a: e.getState().units['A'], d: e.getState().units['D'], reports: e.getState().reports };
}
const winnerOf = (r: ReturnType<typeof fight>): 'att' | 'def' | 'none' => {
  const rep = r.reports; if (!rep.length) return 'none';
  const o = rep[rep.length - 1].outcome; return o === 'attacker_victory' ? 'att' : o === 'defender_victory' || o === 'attacker_withdrew' ? 'def' : 'none';
};

const rate = (xs: ('att' | 'def' | 'none')[]) => xs.filter((x) => x === 'att').length / xs.length;
const N = 50;
const seeds = Array.from({ length: N }, (_, i) => 1000 + i * 7);

describe('combat Monte-Carlo (>= 200 seeded battles)', () => {
  const results: Record<string, ReturnType<typeof fight>[]> = {};
  const run = (name: string, s: Omit<Setup, 'seed'>) => (results[name] = seeds.map((seed) => fight({ ...s, seed })));
  run('parity', {}); run('att2x', { aMul: 2 }); run('def2x', { dMul: 2 });
  run('entrenched', { dEntrench: 90 }); run('mountainDef', { patch: Terrain.Mountains }); run('plainsDef', { patch: Terrain.Plains });
  run('tanksVsInf', { aType: 'armoured', dType: 'infantry' }); run('mudTanks', { aType: 'armoured', dType: 'infantry', weather: 'mud' });
  const wr = (k: string) => rate(results[k].map(winnerOf));
  it('prints win rates', () => { console.log('[combat MC] attacker win rates', Object.fromEntries(Object.keys(results).map((k) => [k, wr(k).toFixed(2)])), 'total battles', Object.values(results).flat().length); });
  it('stronger attacker wins most; stronger defender beats attacker', () => {
    expect(wr('att2x')).toBeGreaterThan(0.7);
    expect(wr('def2x')).toBeLessThan(0.15);
    expect(wr('att2x')).toBeGreaterThan(wr('parity'));
    expect(wr('parity')).toBeGreaterThan(wr('def2x'));
  });
  it('entrenchment and terrain favour the defender', () => {
    expect(wr('entrenched')).toBeLessThan(wr('parity'));
    expect(wr('mountainDef')).toBeLessThan(wr('plainsDef'));
  });
  it('weather (mud) hurts mobile attackers vs clear', () => { expect(wr('mudTanks')).toBeLessThanOrEqual(wr('tanksVsInf')); });
  it('every battle produced a report, with reasons, in-range stats, casualties <= starting manpower, no NaN', () => {
    let n = 0;
    for (const [k, rs] of Object.entries(results)) for (const r of rs) {
      n++;
      expect(r.reports.length, `${k}: no report`).toBeGreaterThan(0);
      expect(checkInvariants(r.state), k).toEqual([]);
      for (const rep of r.reports) {
        expect(rep.reasons.length).toBeGreaterThan(0);
        expect(rep.summary.length).toBeGreaterThan(10);
        expect(rep.endedAt).toBeGreaterThanOrEqual(rep.startedAt);
        const snap = r.first[rep.battleId];
        for (const c of rep.casualties) {
          const start = snap?.units[c.unitId]?.manpower;
          if (start !== undefined) expect(c.killed + c.wounded + c.captured, `${k} ${c.unitId} casualties > manpower ${start}`).toBeLessThanOrEqual(start + 1);
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(200);
  });
  it('report reasons agree with the real factors (terrain, entrenchment, weather, numbers)', () => {
    let checked = 0; const problems: string[] = [];
    for (const [k, rs] of Object.entries(results)) for (const r of rs) for (const rep of r.reports) {
      const snap = r.first[rep.battleId]; if (!snap) continue;
      const att = snap.battle.attackers.map((id) => snap.units[id]), def = snap.battle.defenders.map((id) => snap.units[id]);
      const mean = (xs: Unit[], f: (u: Unit) => number) => xs.reduce((a, u) => a + f(u), 0) / Math.max(1, xs.length);
      const txt = rep.reasons.join(' | ');
      const names = ['sea', 'open plains', 'forest', 'hills', 'mountains', 'marsh', 'urban terrain', 'desert', 'jungle', 'lake'];
      const m = /Defenders fought in ([a-z ]+?) and prepared|Defenders gained no cover \(([a-z ]+)\)|hampered by ([a-z ]+?)( \(|:)/.exec(txt);
      if (m) { checked++; const t = (m[1] ?? m[2] ?? m[3]); if (t !== names[snap.battle.terrain]) problems.push(`${k}: reason terrain '${t}' vs battle ${names[snap.battle.terrain]}`); }
      const e = /entrenched \(average (\d+)%/.exec(txt);
      const ent0 = mean(def, (u) => u.entrenchment);
      if (e) { checked++; if (Math.abs(+e[1] - ent0) > 30) problems.push(`${k}: says entrenched ${e[1]}% but defenders were ${ent0.toFixed(0)}% at start`); }
      else if (ent0 >= 60) problems.push(`${k}: defenders entrenched ${ent0.toFixed(0)}% at start but no entrenchment reason`);
      const wth = /Weather \((\w+)\)/.exec(txt); if (wth) { checked++; if (wth[1] !== snap.battle.weather) problems.push(`${k}: weather reason ${wth[1]} vs ${snap.battle.weather}`); }
      const nm = /attackers fielded (\d+) men against (\d+)/.exec(txt);
      if (nm) { checked++; const sa = att.reduce((a, u) => a + u.manpower, 0), sd = def.reduce((a, u) => a + u.manpower, 0);
        if (+nm[1] > sa * 1.05 || +nm[2] > sd * 1.05 || +nm[1] < sa * 0.5 || +nm[2] < sd * 0.5) problems.push(`${k}: numbers ${nm[1]}/${nm[2]} vs start ${sa}/${sd}`); }
      const pr = /attackers ([\d.]+) vs defenders ([\d.]+) \(ratio ([\d.]+):1\)/.exec(txt);
      if (pr) { checked++; if (Math.abs(+pr[1] / +pr[2] - +pr[3]) > 0.02) problems.push(`${k}: ratio arithmetic ${pr[1]}/${pr[2]} != ${pr[3]}`); }
    }
    console.log('[combat reasons] claims cross-checked:', checked, 'problems:', problems.length, problems.slice(0, 8));
    expect(checked).toBeGreaterThan(100);
    expect(problems).toEqual([]);
  });
  it('reports for an overwhelming attack state a mean power ratio > 1', () => {
    const rs: number[] = [];
    for (const r of results['att2x']) { const last = r.reports[r.reports.length - 1]; const m = /ratio ([\d.]+):1/.exec(last.reasons.join(' ')); if (m) rs.push(+m[1]); }
    expect(rs.length).toBeGreaterThan(20);
    expect(rs.reduce((a, b) => a + b, 0) / rs.length).toBeGreaterThan(1.3);
  });
});
