import { describe, expect, it } from 'vitest';
import { airliftFraction, updateSupply, updateUnitStats } from '../src/military';
import { makeCtx } from '../src/military/testing';
import { loadWorld, mkEngine } from './qa/harness';

/** Real Stalingrad data: Gumrak (airliftTonsPerDay 136) must deliver to a ring-encircled German pocket. */
describe('Stalingrad airlift (real scenario data)', () => {
  const build = () => {
    const w = loadWorld('stalingrad.short');
    const s = structuredClone(mkEngine(w, 'GER', 3).serialize());
    const gum = s.locations.gumrak;
    const germans = Object.values(s.units).filter(u => u.side === 'axis' && u.domain === 'land' && u.type === 'infantry').slice(0, 6);
    germans.forEach((u, i) => { u.pos = [gum.pos[0] - 0.05 + (i % 3) * 0.05, gum.pos[1] - 0.03 + Math.floor(i / 3) * 0.04]; u.encircled = false; u.combatStatus = 'idle'; u.moveStatus = 'stationary'; u.orders = []; });
    gum.owner = 'GER'; gum.damaged = 0;
    const sov = Object.values(s.units).filter(u => u.side === 'allies' && u.domain === 'land' && u.type !== 'hq');
    // ring of Soviet units ~22 km out (zone of control 18 km, German hold 12 km)
    const ring: [number, number][] = [[0, 0.2], [0.17, 0.14], [0.3, 0], [0.17, -0.14], [0, -0.2], [-0.17, -0.14], [-0.3, 0], [-0.17, 0.14]];
    ring.forEach(([dx, dy], i) => { sov[i].pos = [gum.pos[0] + dx, gum.pos[1] + dy]; });
    for (const u of sov.slice(ring.length)) u.pos = [41.0, 50.5]; // everyone else far away
    for (const u of Object.values(s.units)) if (u.side === 'axis' && !germans.includes(u)) u.pos = [39.0, 49.0];
    return { s, ctx: makeCtx(w.def, w.infra), germans, gum, w };
  };
  const run = (b: ReturnType<typeof build>, n: number) => { for (let i = 0; i < n; i++) { b.s.clock.minutes += 180; updateSupply(b.s, b.ctx); } };

  it('Gumrak is an owned airfield with a tonnage cap, and serves the cut-off pocket', () => {
    const b = build();
    expect(b.gum.kind).toBe('airfield');
    expect(b.gum.airliftTonsPerDay!).toBeGreaterThan(0);
    run(b, 5);
    for (const u of b.germans) {
      expect(b.s.supply.unitSupplyDistKm[u.id], u.id).toBe(-1);
      expect(airliftFraction(b.s, u.id), u.id).toBeGreaterThan(0);
      expect(u.supply).toBeGreaterThan(0);
    }
    const total = b.germans.reduce((a, u) => a + airliftFraction(b.s, u.id), 0) / b.germans.length;
    expect(total).toBeLessThan(1); // 136 t/day is nowhere near enough for six divisions
  });

  it('the flow collapses if the airfield is lost, and ground raiding cannot wreck it outright', () => {
    const lost = build();
    lost.gum.owner = 'SOV';
    if (lost.s.locations.pitomnik) lost.s.locations.pitomnik.owner = 'SOV';
    run(lost, 5);
    expect(lost.germans.every(u => airliftFraction(lost.s, u.id) === 0)).toBe(true);
    const raided = build();
    // a lone raider parked on the field for many updates degrades it, but never past the raid cap
    const raider = Object.values(raided.s.units).find(u => u.side === 'allies' && u.domain === 'land' && u.type !== 'hq' && !raided.germans.includes(u))!;
    raider.pos = [raided.gum.pos[0] + 0.01, raided.gum.pos[1]];
    run(raided, 30);
    expect(raided.gum.damaged ?? 0).toBeLessThanOrEqual(70);
  });

  it('pocket units get a little ammunition by air', () => {
    const b = build();
    for (const u of b.germans) u.ammo = 20;
    for (let i = 0; i < 6; i++) { run(b, 1); b.s.clock.minutes += 60; updateUnitStats(b.s, b.ctx); }
    expect(b.germans.some(u => u.ammo > 20)).toBe(true);
  });
});
