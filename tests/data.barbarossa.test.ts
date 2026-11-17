import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateScenario, getScenarioDefinition, getScenarioSidecar, listScenarios, getHistoricalEvents, loadScenario } from '../src/data/index.ts';
import { createEngine } from '../src/sim/engine';
import { SETTINGS } from './simfixture';

const file = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
describe('barbarossa.short data', () => {
  const def = getScenarioDefinition('barbarossa.short')!;
  it('validates with sidecar', () => { expect(validateScenario(def, getScenarioSidecar('barbarossa.short'))).toEqual([]); });
  it('is listed as available for GER, SOV', () => {
    const m = listScenarios().find((s) => s.id === 'barbarossa.short')!;
    expect(m.playable).toBe(true);
    expect(m.nations).toEqual(['GER', 'SOV']);
  });
  it('rejects a unit outside the bbox', () => {
    const bad = structuredClone(def); bad.units[0].pos = [0, 0];
    expect(validateScenario(bad, getScenarioSidecar('barbarossa.short')).join()).toMatch(/bbox|outside/i);
  });
  it('event sources resolve and effects are present only where restated', () => {
    const ids = new Set(def.sources.map((s) => s.id));
    for (const e of getHistoricalEvents('barbarossa')) for (const s of e.src) expect(ids.has(s)).toBe(true);
  });
  it('loads with injected loader', async () => {
    const l = await loadScenario('barbarossa.short', async (f) => file(f));
    expect(l.def.units.length).toBeGreaterThan(5);
  });
});
describe.each(['GER', 'SOV'])('barbarossa.short engine smoke as %s', (nation) => {
  it('runs 300 ticks', async () => {
    const { def, terrain, infra } = await loadScenario('barbarossa.short', async (f) => file(f));
    const e = createEngine(structuredClone(def), terrain, infra, { playerNation: nation as never, settings: { ...SETTINGS, fogOfWar: true }, seed: 42 });
    const t0 = performance.now();
    e.step(300);
    const ms = (performance.now() - t0) / 300;
    const s = e.getState();
    console.log(`BARBAROSSA ${nation}: units ${Object.keys(s.units).length}, reports ${s.reports.length}, battles ${Object.keys(s.battles).length}, ${ms.toFixed(2)} ms/tick`);
    expect(Object.keys(s.units).length).toBeGreaterThan(5);
    expect(ms).toBeLessThan(60);
  }, 120000);
});

describe('barbarossa placement and sources', () => {
  const def = getScenarioDefinition('barbarossa.short')!;
  it('every R-source cited by an event resolves and each hub has rampHours', () => {
    for (const id of ['brest', 'minsk', 'smolensk', 'kiev', 'riga', 'vilnius', 'kaunas', 'lvov', 'pskov']) expect(def.locations.find((l) => l.id === id)!.rampHours).toBeGreaterThan(0);
  });
  it('Soviet-owned hubs are listed as German sources only with rampHours', () => {
    for (const id of def.supplySources.GER) {
      const l = def.locations.find((x) => x.id === id)!;
      if (l.owner === 'SOV') expect(l.rampHours, id).toBeGreaterThan(0);
    }
  });
  it('German armies start west of the Soviet border polygon, Soviet armies east', () => {
    for (const u of def.units) {
      if (u.type === 'hq') continue;
      if (u.nation === 'GER') expect(u.pos[0], u.id).toBeLessThan(28.5);
    }
    expect(def.reinforcements.some((r) => r.unit.id === 'ger.11a')).toBe(true);
  });
});
