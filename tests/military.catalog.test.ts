import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ScenarioDefinition, Unit } from '../src/core/types';
import { EQUIPMENT, UNIT_TEMPLATES } from '../src/military';

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/campaigns/${f}`, import.meta.url), 'utf8')) as ScenarioDefinition;

describe('catalog covers scenario data', () => {
  for (const file of ['fall_of_france.standard.json', 'fall_of_france.short.json']) {
    it(`${file}: every equipment key and unit type is known`, () => {
      const def = load(file);
      const units: Unit[] = [...def.units, ...def.reinforcements.map(r => r.unit)];
      const unknownEq = new Set<string>(), unknownType = new Set<string>();
      for (const u of units) {
        for (const m of ['held', 'authorised'] as const) for (const k of Object.keys(u.equipment[m])) if (!EQUIPMENT[k]) unknownEq.add(k);
        if (!UNIT_TEMPLATES[u.type]) unknownType.add(u.type);
      }
      expect([...unknownEq]).toEqual([]);
      expect([...unknownType]).toEqual([]);
    });
  }
  it('lead-listed keys all exist with consumption/cost/weight', () => {
    for (const k of ['rifle', 'gun_arty', 'gun_at', 'tank_light', 'tank_medium', 'truck', 'armored_car', 'armoured_car']) {
      expect(EQUIPMENT[k], k).toBeDefined();
      expect(EQUIPMENT[k].poolCost).toBeGreaterThan(0);
      expect(EQUIPMENT[k].weight).toBeGreaterThan(0);
    }
  });
});
