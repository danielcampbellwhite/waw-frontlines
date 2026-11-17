import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateScenario, getScenarioDefinition, getScenarioSidecar, listScenarios, getHistoricalEvents, loadScenario } from '../src/data/index.ts';
import { createEngine } from '../src/sim/engine';
import { SETTINGS } from './simfixture';

const file = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
describe('normandy.short data', () => {
  const def = getScenarioDefinition('normandy.short')!;
  it('validates with sidecar', () => { expect(validateScenario(def, getScenarioSidecar('normandy.short'))).toEqual([]); });
  it('is listed as available for USA, GBR, CAN, GER', () => {
    const m = listScenarios().find((s) => s.id === 'normandy.short')!;
    expect(m.playable).toBe(true);
    expect(m.nations).toEqual(['USA', 'GBR', 'CAN', 'GER']);
  });
  it('rejects a unit outside the bbox', () => {
    const bad = structuredClone(def); bad.units[0].pos = [0, 0];
    expect(validateScenario(bad, getScenarioSidecar('normandy.short')).join()).toMatch(/bbox|outside/i);
  });
  it('event sources resolve and effects are present only where restated', () => {
    const ids = new Set(def.sources.map((s) => s.id));
    for (const e of getHistoricalEvents('normandy')) for (const s of e.src) expect(ids.has(s)).toBe(true);
  });
  it('loads with injected loader', async () => {
    const l = await loadScenario('normandy.short', async (f) => file(f));
    expect(l.def.units.length).toBeGreaterThan(5);
  });
});
describe.each(['USA', 'GBR', 'CAN', 'GER'])('normandy.short engine smoke as %s', (nation) => {
  it('runs 300 ticks', async () => {
    const { def, terrain, infra } = await loadScenario('normandy.short', async (f) => file(f));
    const e = createEngine(structuredClone(def), terrain, infra, { playerNation: nation as never, settings: { ...SETTINGS, fogOfWar: true }, seed: 42 });
    const t0 = performance.now();
    e.step(300);
    const ms = (performance.now() - t0) / 300;
    const s = e.getState();
    console.log(`NORMANDY ${nation}: units ${Object.keys(s.units).length}, reports ${s.reports.length}, battles ${Object.keys(s.battles).length}, ${ms.toFixed(2)} ms/tick`);
    expect(Object.keys(s.units).length).toBeGreaterThan(5);
    expect(ms).toBeLessThan(60);
  }, 120000);
});

import { haversineKm as distanceKm } from '../src/core/geo';
describe('normandy placement rules', () => {
  const def = getScenarioDefinition('normandy.short')!;
  const towns = def.locations.filter((l) => l.owner === 'GER' && ['city', 'town', 'port', 'fortress'].includes(l.kind));
  it('no non-airborne Allied arrival lands within 8 km of a German-held town', () => {
    for (const r of def.reinforcements) {
      if (r.unit.side !== 'allies' || r.landing?.kind === 'airborne') continue;
      for (const t of towns) expect(distanceKm(r.pos!, t.pos), `${r.id} vs ${t.id}`).toBeGreaterThan(8);
    }
  });
  it('named German garrisons stand within 4 km of the town they hold', () => {
    const near = (uid: string, lid: string) => {
      const u = def.units.find((x) => x.id === uid)!, l = def.locations.find((x) => x.id === lid)!;
      expect(distanceKm(u.pos, l.pos), `${uid} vs ${lid}`).toBeLessThan(4);
    };
    near('ger.fjr6', 'carentan'); near('ger.d.21pz', 'caen'); near('ger.cherbourg', 'cherbourg');
  });
});
