import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '../src/data';
import { createEngine, restoreEngine } from '../src/sim/engine';
import { SETTINGS } from './simfixture';

const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canon(x)])) : v);
const loader = async (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));

describe.each(['fall_of_france.short', 'fall_of_france.standard'])('real scenario %s', (id) => {
  it('runs 300 ticks deterministically, restores, and stays fast', async () => {
    const { def, terrain, infra } = await loadScenario(id, loader);
    const nation = def.playableNations[0].nation;
    const mk = () => createEngine(structuredClone(def), terrain, infra, { playerNation: nation, settings: { ...SETTINGS, fogOfWar: true }, seed: 42 });
    const a = mk(), b = mk();
    const t0 = performance.now();
    a.step(300);
    const ms = (performance.now() - t0) / 300;
    b.step(120);
    const c = restoreEngine(b.serialize(), structuredClone(def), terrain, infra);
    c.step(180);
    const sa = a.getState();
    const x = JSON.stringify(canon(c.getState())), y = JSON.stringify(canon(sa)); // key order may differ after a JSON round trip (dropped undefined keys)
    if (x !== y) { let i = 0; while (x[i] === y[i]) i++; console.log('DIFF at', i, x.slice(i - 200, i + 100), ' ||| ', y.slice(i - 200, i + 100)); }
    expect(x === y).toBe(true);
    const alive = Object.values(sa.units).filter((u) => !u.destroyed).length;
    console.log(`REAL ${id}: units ${Object.keys(sa.units).length} alive ${alive}, reports ${sa.reports.length}, battles ${Object.keys(sa.battles).length}, ${ms.toFixed(2)} ms/tick, result ${sa.result?.ending ?? 'none'}`);
    for (const r of sa.reports.slice(0, 2)) console.log('  ', r.summary, '|', r.reasons.slice(0, 3).join(' '));
    expect(ms).toBeLessThan(60); // whole pipeline incl. military.updateSupply + AI; sim-owned share is ~5 ms
  }, 120000);
});
