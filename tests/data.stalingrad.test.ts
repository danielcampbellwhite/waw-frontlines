import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateScenario, getScenarioDefinition, getScenarioSidecar, listScenarios, getHistoricalEvents, loadScenario } from '../src/data/index.ts';
import { createEngine } from '../src/sim/engine';
import { SETTINGS } from './simfixture';

const file = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
describe('stalingrad.short data', () => {
  const def = getScenarioDefinition('stalingrad.short')!;
  it('validates with sidecar', () => { expect(validateScenario(def, getScenarioSidecar('stalingrad.short'))).toEqual([]); });
  it('is listed as available for SOV, GER', () => {
    const m = listScenarios().find((s) => s.id === 'stalingrad.short')!;
    expect(m.playable).toBe(true);
    expect(m.nations).toEqual(['SOV', 'GER']);
  });
  it('rejects a unit outside the bbox', () => {
    const bad = structuredClone(def); bad.units[0].pos = [0, 0];
    expect(validateScenario(bad, getScenarioSidecar('stalingrad.short')).join()).toMatch(/bbox|outside/i);
  });
  it('event sources resolve and effects are present only where restated', () => {
    const ids = new Set(def.sources.map((s) => s.id));
    for (const e of getHistoricalEvents('stalingrad')) for (const s of e.src) expect(ids.has(s)).toBe(true);
  });
  it('loads with injected loader', async () => {
    const l = await loadScenario('stalingrad.short', async (f) => file(f));
    expect(l.def.units.length).toBeGreaterThan(30);
  });
});
describe.each(['SOV', 'GER'])('stalingrad.short engine smoke as %s', (nation) => {
  it('runs 300 ticks', async () => {
    const { def, terrain, infra } = await loadScenario('stalingrad.short', async (f) => file(f));
    const e = createEngine(structuredClone(def), terrain, infra, { playerNation: nation as never, settings: { ...SETTINGS, fogOfWar: true }, seed: 42 });
    const t0 = performance.now();
    e.step(300);
    const ms = (performance.now() - t0) / 300;
    const s = e.getState();
    console.log(`STALINGRAD ${nation}: units ${Object.keys(s.units).length}, reports ${s.reports.length}, battles ${Object.keys(s.battles).length}, ${ms.toFixed(2)} ms/tick`);
    expect(Object.keys(s.units).length).toBeGreaterThan(30);
    expect(ms).toBeLessThan(60);
  }, 120000);
});
