import { describe, expect, it } from 'vitest';
import { updateSupply } from '../src/military';
import { makeCtx } from '../src/military/testing';
import { loadWorld, mkEngine } from './qa/harness';

/** Regression for KNOWN_ISSUES L8: the supply-point pool used to hit 0 within ~2 game days on the Standard scenario. */
describe('supply economy on the real Standard scenario', () => {
  const w = loadWorld();
  const setup = () => {
    const s = structuredClone(mkEngine(w, 'GER', 5).serialize());
    return { s, ctx: makeCtx(w.def, w.infra) };
  };
  const days = (s: ReturnType<typeof setup>['s'], ctx: ReturnType<typeof setup>['ctx'], n: number) => {
    for (let t = 0; t < n * 24; t += 3) { s.clock.minutes += 180; updateSupply(s, ctx); }
  };

  it('a connected force keeps supply points for weeks and stays well supplied', () => {
    const { s, ctx } = setup();
    days(s, ctx, 28);
    expect(s.nations.GER.resources.supplyPoints).toBeGreaterThan(100);
    expect(s.nations.FRA.resources.supplyPoints).toBeGreaterThan(100);
    const axis = Object.values(s.units).filter(u => u.side === 'axis' && !s.supply.cutOffUnits.includes(u.id));
    const avg = axis.reduce((a, u) => a + u.supply, 0) / axis.length;
    expect(avg).toBeGreaterThan(60);
  });

  it('even a full-strength offensive (everyone moving/fighting) lasts more than two weeks', () => {
    const { s, ctx } = setup();
    for (const u of Object.values(s.units)) if (u.side === 'axis') { u.moveStatus = 'moving'; u.combatStatus = 'attacking'; }
    days(s, ctx, 14);
    expect(s.nations.GER.resources.supplyPoints).toBeGreaterThan(0);
  });

  it('a deep advance outruns supply: units far from any source are cut off and starve', () => {
    const { s, ctx } = setup();
    const deep = Object.values(s.units).find(u => u.side === 'axis' && u.type === 'armoured')!;
    deep.pos = [-3.5, 47.6]; // ~800 km beyond the German sources, no network
    days(s, ctx, 3);
    expect(s.supply.unitSupplyDistKm[deep.id]).toBe(-1);
    expect(deep.supply).toBeLessThan(10);
  });
});
