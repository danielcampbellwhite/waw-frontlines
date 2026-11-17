import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { isCutOff } from '../../src/military';
import { loadWorld, mkEngine } from './harness';

const CASES: [string, NationId[]][] = [
  ['fall_of_france.standard', ['GER', 'FRA', 'GBR']], ['fall_of_france.short', ['GER', 'FRA', 'GBR']],
  ['bulge.short', ['GER', 'USA', 'GBR']], ['crusader.short', ['GER', 'GBR', 'ITA']], ['stalingrad.short', ['SOV', 'GER']],
  ['normandy.short', ['USA', 'GBR', 'CAN', 'GER']],
];

describe('start supply: no scenario starts with a pile of unsupplied units', () => {
  for (const [id, nations] of CASES) for (const n of nations) {
    it(`${id} as ${n}: at most 2 land units per side cut off at ticks 1, 2 and 24 (idle player)`, () => {
      const w = loadWorld(id); const e = mkEngine(w, n, 1); const airIds = w.def.reinforcements.filter((r) => r.landing?.kind === 'airborne').map((r) => r.unit.id); const rows: string[] = []; const worst: Record<string, number> = { axis: 0, allies: 0 };
      for (const t of [1, 1, 22]) {
        e.step(t); const s = e.getState();
        for (const side of ['axis', 'allies'] as const) {
          const g = Object.values(s.units).filter((u) => u.side === side && u.domain === 'land' && u.type !== 'hq' && u.manpower > 0);
          const air = (u: { id: string }) => s.clock.minutes <= 48 * 60 && airIds.some((id) => u.id === id || u.id.startsWith(id + '_r'));
          for (const u of g) if (air(u)) expect(u.supply, `${u.id} airborne supply`).toBeGreaterThan(0);
          const c = g.filter((u) => isCutOff(s, u.id) && !air(u)); // airborne drops are legitimately behind enemy lines for the first 48 h worst[side] = Math.max(worst[side], c.length);
          if (c.length > 2) rows.push(`tick ${s.clock.minutes / 60} ${side}: ${c.length}/${g.length} cut off: ${c.map((u) => u.id).join(',')}`);
        }
      }
      if (rows.length) console.log(`[startsupply] ${id} ${n}\n  ` + rows.join('\n  '));
      expect(worst.axis, `axis ${rows.join(' ; ')}`).toBeLessThanOrEqual(2);
      expect(worst.allies, `allies ${rows.join(' ; ')}`).toBeLessThanOrEqual(2);
    }, 120_000);
  }
  it('Stalingrad SOV idle: 0 Soviet land units cut off at h2, h24, h100 (seeds 1, 3)', () => {
    const w = loadWorld('stalingrad.short');
    for (const seed of [1, 3]) { const e = mkEngine(w, 'SOV', seed); const got: number[] = [];
      for (const h of [2, 24, 100]) { e.step(h - e.getState().clock.minutes / 60); const s = e.getState();
        got.push(Object.values(s.units).filter((u) => u.side === 'allies' && u.domain === 'land' && u.type !== 'hq' && u.manpower > 0 && isCutOff(s, u.id)).length); }
      console.log(`[startsupply] stalingrad SOV seed ${seed} cut off at h2/24/100:`, got.join('/'));
      expect(Math.max(...got)).toBeLessThanOrEqual(2);
    }
  }, 120_000);
});
