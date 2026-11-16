import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateScenario, getScenarioDefinition, getScenarioSidecar, listScenarios, getHistoricalEvents, loadScenario } from '../src/data/index.ts';

const file = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
describe('bulge.short data', () => {
  const def = getScenarioDefinition('bulge.short')!;
  it('validates with sidecar', () => {
    const r = validateScenario(def, getScenarioSidecar('bulge.short'));
    expect(r).toEqual([]);
  });
  it('is listed as available', () => {
    const m = listScenarios().find((s) => s.id === 'bulge.short')!;
    expect(m.playable).toBe(true);
    expect(m.nations).toEqual(['GER', 'USA', 'GBR']);
  });
  it('rejects a unit outside the bbox', () => {
    const bad = structuredClone(def); bad.units[0].pos = [0, 0];
    expect(validateScenario(bad, getScenarioSidecar('bulge.short')).join()).toMatch(/bbox|outside/i);
  });
  it('has events with sources that resolve', () => {
    const ids = new Set(def.sources.map((s) => s.id));
    for (const e of getHistoricalEvents('bulge')) for (const s of e.src) expect(ids.has(s)).toBe(true);
  });
  it('loads with injected loader', async () => {
    const l = await loadScenario('bulge.short', async (f) => file(f));
    expect(l.def.units.length).toBeGreaterThan(40);
  });
});

import { createEngine } from '../src/sim/engine';
import { SETTINGS } from './simfixture';
describe.each(['GER', 'USA', 'GBR'])('bulge.short engine smoke as %s', (nation) => {
  it('runs 300 ticks', async () => {
    const { def, terrain, infra } = await loadScenario('bulge.short', async (f) => file(f));
    const e = createEngine(structuredClone(def), terrain, infra, { playerNation: nation as never, settings: { ...SETTINGS, fogOfWar: true }, seed: 42 });
    const t0 = performance.now();
    e.step(300);
    const ms = (performance.now() - t0) / 300;
    const s = e.getState();
    console.log(`BULGE ${nation}: units ${Object.keys(s.units).length}, reports ${s.reports.length}, battles ${Object.keys(s.battles).length}, ${ms.toFixed(2)} ms/tick`);
    expect(Object.keys(s.units).length).toBeGreaterThan(40);
    expect(ms).toBeLessThan(60);
  }, 120000);
});
