import { describe, expect, it } from 'vitest';
import type { GameState, InfraLine } from '../src/core/types';
import { TONS_PER_POINT, damageInfra, isPortBesieged, setPortRelief, updateSupply, updateUnitStats } from '../src/military';
import { makeCtx, makeControl, makeLocation, makeScenario, makeState, makeUnit } from '../src/military/testing';

const rail = (capacity?: number, id = 'R1'): InfraLine => ({ id, kind: 'rail', historical: true, coords: [[2, 50], [4.5, 50]], capacity });
const scen = makeScenario({ FRA: ['D1'], GER: ['G1'] });

function world(extra: { infra?: InfraLine[]; unitPos?: [number, number]; splitLon?: number } = {}) {
  const infra = extra.infra ?? [rail()];
  const s = makeState({
    splitLon: extra.splitLon,
    units: [makeUnit('armoured', 'a1', 'FRA', extra.unitPos ?? [4.5, 50.05])],
    locations: [makeLocation('D1', 'depot', [2, 50], 'FRA'), makeLocation('G1', 'depot', [9, 50], 'GER')],
  });
  return { s, ctx: makeCtx(scen, infra), infra };
}

const run = (s: GameState, c: ReturnType<typeof makeCtx>, n: number) => { for (let i = 0; i < n; i++) updateSupply(s, c); };

describe('supply network', () => {
  it('connects a unit to its depot by rail with a modest rail-discounted distance', () => {
    const { s, ctx } = world();
    updateSupply(s, ctx);
    const d = s.supply.unitSupplyDistKm.a1;
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(120); // ~250km of rail at 0.25 + truck haul
    expect(s.supply.cutOffUnits).toEqual([]);
    expect(s.units.a1.supply).toBeGreaterThan(80);
    expect(s.supply.nodes.map(n => n.locationId).sort()).toEqual(['D1', 'G1']);
  });

  it('cuts the unit off when the depot is captured, and logs it', () => {
    const { s, ctx } = world();
    updateSupply(s, ctx);
    s.locations.D1.owner = 'GER';
    run(s, ctx, 1);
    expect(s.locations.D1.damaged ?? 0).toBeGreaterThanOrEqual(30); // damaged on capture
    expect(s.supply.unitSupplyDistKm.a1).toBe(-1);
    expect(s.supply.cutOffUnits).toContain('a1');
    expect(ctx.logs.some(l => /cut off/.test(l.text))).toBe(true);
    const before = s.units.a1.supply;
    run(s, ctx, 10);
    expect(s.units.a1.supply).toBeLessThan(before);
    expect(s.units.a1.supply).toBe(0);
  });

  it('restores supply when the depot is retaken', () => {
    const { s, ctx } = world();
    s.locations.D1.owner = 'GER';
    run(s, ctx, 2);
    expect(s.supply.cutOffUnits).toContain('a1');
    s.locations.D1.owner = 'FRA';
    s.locations.D1.damaged = 0;
    run(s, ctx, 3);
    expect(s.supply.cutOffUnits).toEqual([]);
    expect(s.units.a1.supply).toBeGreaterThan(30);
    expect(ctx.logs.some(l => /re-established/.test(l.text))).toBe(true);
  });

  it('cuts the line where enemy-controlled territory severs it', () => {
    const { s, ctx } = world({ splitLon: 3.5 }); // east of 3.5E is German-held; unit at 4.5E
    updateSupply(s, ctx);
    expect(s.supply.unitSupplyDistKm.a1).toBe(-1);
  });

  it('truck range limits off-network supply', () => {
    const near = world({ unitPos: [4.0, 50.1] });
    updateSupply(near.s, near.ctx);
    expect(near.s.supply.unitSupplyDistKm.a1).toBeGreaterThan(0);
    const far = world({ unitPos: [4.0, 51.5] }); // ~165 km from the rail
    updateSupply(far.s, far.ctx);
    expect(far.s.supply.unitSupplyDistKm.a1).toBe(-1);
  });

  it('prefers rail over road for the same distance', () => {
    const roadLine: InfraLine = { id: 'RD', kind: 'road', historical: true, coords: [[2, 50], [4.5, 50]] };
    const a = world({ infra: [rail()] }), b = world({ infra: [roadLine] });
    updateSupply(a.s, a.ctx); updateSupply(b.s, b.ctx);
    expect(a.s.supply.unitSupplyDistKm.a1).toBeLessThan(b.s.supply.unitSupplyDistKm.a1);
  });

  it('line capacity throttles supply when overloaded', () => {
    const mk = (cap: number) => {
      const w = world({ infra: [rail(cap)] });
      for (let i = 0; i < 6; i++) w.s.units[`x${i}`] = makeUnit('armoured', `x${i}`, 'FRA', [4.5, 50.05 + i * 0.01]);
      return w;
    };
    const lo = mk(3), hi = mk(500);
    run(lo.s, lo.ctx, 8); run(hi.s, hi.ctx, 8);
    expect(lo.s.units.x0.supply).toBeLessThan(hi.s.units.x0.supply - 20);
  });

  it('damaged rail is slower and a destroyed line cuts supply', () => {
    const { s, ctx } = world();
    updateSupply(s, ctx);
    const d0 = s.supply.unitSupplyDistKm.a1;
    damageInfra(s, 'R1', 50);
    updateSupply(s, ctx);
    expect(s.supply.unitSupplyDistKm.a1).toBeGreaterThan(d0);
    damageInfra(s, 'R1', 50);
    updateSupply(s, ctx);
    expect(s.supply.unitSupplyDistKm.a1).toBe(-1);
  });

  it('weather and logistics difficulty reduce supply level', () => {
    const clear = world(), mud = world(), hard = world();
    mud.s.weather = { kind: 'mud', intensity: 1, temperatureC: 5, nextChangeMinutes: 999 };
    hard.s.settings.logisticsDifficulty = 2;
    for (const w of [clear, mud, hard]) w.s.units.a1.supply = 50;
    for (const w of [clear, mud, hard]) run(w.s, w.ctx, 10);
    expect(mud.s.units.a1.supply).toBeLessThan(clear.s.units.a1.supply);
    expect(hard.s.units.a1.supply).toBeLessThan(clear.s.units.a1.supply);
  });

  it('enemy raiders damage a depot, which then repairs when they leave', () => {
    const { s, ctx } = world();
    s.units.g = makeUnit('infantry', 'g', 'GER', [2.02, 50]);
    run(s, ctx, 2);
    expect(s.locations.D1.damaged ?? 0).toBeGreaterThanOrEqual(16);
    const dmg = s.locations.D1.damaged ?? 0;
    s.units.g.pos = [8, 50];
    run(s, ctx, 2);
    expect(s.locations.D1.damaged ?? 0).toBeLessThan(dmg);
  });

  it('a captured forward depot supplies the captor at reduced capacity', () => {
    const { s, ctx } = world();
    s.locations.G1.owner = 'FRA';
    s.locations.G1.originalOwner = 'GER';
    updateSupply(s, ctx);
    const node = s.supply.nodes.find(n => n.locationId === 'G1')!;
    expect(node).toBeDefined();
    expect(node.throughput).toBe(20); // 40 * 0.5
  });

  it('pays nation income scaled by sources still held', () => {
    const { s, ctx } = world();
    s.nations.FRA.income.fuel = 10;
    const f0 = s.nations.FRA.resources.fuel;
    updateSupply(s, ctx);
    expect(s.nations.FRA.resources.fuel).toBeCloseTo(f0 + 30);
    s.locations.D1.owner = 'GER';
    const f1 = s.nations.FRA.resources.fuel;
    updateSupply(s, ctx);
    expect(s.nations.FRA.resources.fuel).toBeCloseTo(f1); // no sources held -> no income
  });

  it('air units are supplied from airfields in range; sea units need ports', () => {
    const { s, ctx } = world();
    s.locations.AF = makeLocation('AF', 'airfield', [3, 50.3], 'FRA');
    s.units.air = makeUnit('air_fighter', 'air', 'FRA', [3, 50.31]);
    s.units.far = makeUnit('air_fighter', 'far', 'FRA', [9.5, 51.9]);
    updateSupply(s, ctx);
    expect(s.supply.unitSupplyDistKm.air).toBeGreaterThanOrEqual(0);
    expect(s.supply.unitSupplyDistKm.far).toBe(-1);
  });

  it('is deterministic and keeps state JSON-clean', () => {
    const a = world(), b = world();
    run(a.s, a.ctx, 4); run(b.s, b.ctx, 4);
    expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s));
    expect(JSON.stringify(a.s)).not.toMatch(/NaN|Infinity|null,null/);
  });
});

describe('allied shared ports and sea supply', () => {
  const bef = (sources: Record<string, string[]>) => {
    const s = makeState({
      units: [makeUnit('infantry', 'bef', 'GBR', [3, 50.05])],
      locations: [
        makeLocation('LH', 'port', [3, 50], 'FRA'),
        makeLocation('SOU', 'port', [0.5, 51.5], 'GBR'),
        makeLocation('G1', 'depot', [9, 50], 'GER'),
      ],
    });
    s.nations.GBR = { ...s.nations.FRA, id: 'GBR', name: 'GBR' };
    return { s, ctx: makeCtx(makeScenario(sources), []) };
  };

  it('a British unit draws supply from a French-owned port listed under the British', () => {
    const { s, ctx } = bef({ GBR: ['LH'], GER: ['G1'] });
    updateSupply(s, ctx);
    expect(s.supply.unitSupplyDistKm.bef).toBeGreaterThanOrEqual(0);
    expect(s.supply.nodes.some(n => n.locationId === 'LH')).toBe(true);
    expect(s.units.bef.supply).toBeGreaterThan(80);
  });

  it('a French-owned port listed under France supplies a British unit (same side)', () => {
    const { s, ctx } = bef({ FRA: ['LH'], GER: ['G1'] });
    updateSupply(s, ctx);
    expect(s.supply.cutOffUnits).toEqual([]);
  });

  it('sea link: an unlisted same-side port is connected at port throughput while a listed port is held', () => {
    const { s, ctx } = bef({ GBR: ['SOU'], GER: ['G1'] });
    updateSupply(s, ctx);
    const lh = s.supply.nodes.find(n => n.locationId === 'LH')!;
    expect(lh.throughput).toBe(60);
    expect(s.supply.cutOffUnits).toEqual([]);
    // losing the only listed port severs the sea link
    s.locations.SOU.owner = 'GER';
    updateSupply(s, ctx);
    expect(s.supply.nodes.some(n => n.locationId === 'LH')).toBe(false);
    expect(s.supply.cutOffUnits).toContain('bef');
  });

  it('capture penalty applies to recently captured ports only', () => {
    const { s, ctx } = bef({ GBR: ['SOU'], GER: ['G1'] });
    updateSupply(s, ctx);
    s.locations.LH.owner = 'GER'; updateSupply(s, ctx);       // enemy takes it
    s.locations.LH.owner = 'FRA'; updateSupply(s, ctx);        // retaken (suffers capture damage)
    s.locations.LH.damaged = 0;                               // repaired; originally French so no capture penalty
    updateSupply(s, ctx);
    expect(s.supply.nodes.find(n => n.locationId === 'LH')!.throughput).toBe(60);
    s.locations.G1.owner = 'FRA';
    s.clock.minutes = 100; updateSupply(s, ctx);
    s.locations.G1.damaged = 0;                               // ignore capture damage here
    updateSupply(s, ctx);
    expect(s.supply.nodes.find(n => n.locationId === 'G1')!.throughput).toBe(20);
    s.clock.minutes = 100 + 15 * 24 * 60; s.locations.G1.damaged = 0; updateSupply(s, ctx);
    expect(s.supply.nodes.find(n => n.locationId === 'G1')!.throughput).toBe(40);
  });
});

describe('airlift to cut-off pockets', () => {
  const pocket = (airfield: boolean, tons = 1000, extra = 0) => {
    const s = makeState({
      units: [makeUnit('infantry', 'p1', 'FRA', [7, 50.5], { supply: 60, fuel: 100, ammo: 20 }), ...Array.from({ length: extra }, (_, i) => makeUnit('infantry', `q${i}`, 'FRA', [7, 50.52 + i * 0.01]))],
      locations: [
        makeLocation('D1', 'depot', [2, 50], 'FRA'),
        ...(airfield ? [makeLocation('AF', 'airfield', [7.05, 50.5], 'FRA', { airliftTonsPerDay: tons } as never)] : []),
      ],
    });
    return { s, ctx: makeCtx(makeScenario({ FRA: ['D1'] }), []) };
  };
  const settle = (s: GameState, ctx: ReturnType<typeof makeCtx>, n = 8) => run(s, ctx, n);

  it('without an airfield the pocket starves; with one it gets a capped flow but stays cut off', () => {
    const none = pocket(false), lift = pocket(true);
    settle(none.s, none.ctx); settle(lift.s, lift.ctx);
    expect(none.s.supply.cutOffUnits).toContain('p1');
    expect(none.s.units.p1.supply).toBe(0);
    expect(lift.s.supply.cutOffUnits).toContain('p1');          // still cut off from ground supply
    expect(lift.s.units.p1.supply).toBeGreaterThan(10);
    expect(lift.s.units.p1.supply).toBeLessThanOrEqual(45);     // airlift never gives full supply
  });

  it('the flow is limited by the tonnage cap, weather and enemy fighters', () => {
    const big = pocket(true, 400, 9), small = pocket(true, 40, 9), storm = pocket(true, 400, 9), raid = pocket(true, 400, 9);
    storm.s.weather = { kind: 'storm', intensity: 1, temperatureC: 0, nextChangeMinutes: 9999 };
    for (let i = 0; i < 6; i++) raid.s.units[`f${i}`] = makeUnit('air_fighter', `f${i}`, 'GER', [7.5, 50.5]);
    for (const w of [big, small, storm, raid]) settle(w.s, w.ctx);
    const lv = (w: typeof big) => w.s.units.p1.supply;
    expect(lv(small)).toBeLessThan(lv(big));
    expect(lv(storm)).toBeLessThan(lv(big));
    expect(lv(raid)).toBeLessThan(lv(big));
    const frac = (w: typeof big) => w.s.special.military ? (w.s.special.military as { airlift: Record<string, number> }).airlift.p1 : 0;
    expect(frac(big)).toBe(1);
    expect(frac(small)).toBeLessThan(0.5);
  });

  it('delivers a little ammunition to the pocket, none without airlift', () => {
    const none = pocket(false), lift = pocket(true);
    for (const w of [none, lift]) for (let i = 0; i < 4; i++) { updateSupply(w.s, w.ctx); w.s.clock.minutes += 60; updateUnitStats(w.s, w.ctx); }
    expect(none.s.units.p1.ammo).toBe(20);
    expect(lift.s.units.p1.ammo).toBeGreaterThan(20);
    expect(lift.s.units.p1.ammo).toBeLessThan(60);
  });

  it('enemy-owned airfields do not serve the pocket; a wrecked field serves nothing', () => {
    const e = pocket(true); e.s.locations.AF.owner = 'GER';
    const w = pocket(true); w.s.locations.AF.damaged = 90; w.s.units.p1.supply = 0;
    const ok = pocket(true); ok.s.units.p1.supply = 0;
    settle(e.s, e.ctx); updateSupply(w.s, w.ctx); updateSupply(ok.s, ok.ctx);
    expect(e.s.units.p1.supply).toBe(0);
    expect(w.s.units.p1.supply).toBe(0);
    expect(ok.s.units.p1.supply).toBeGreaterThan(0);
  });
});

describe('port tonnage caps and besieged ports', () => {
  const portWorld = (fields: Record<string, number>, enemies: [number, number][]) => {
    const s = makeState({
      units: [makeUnit('infantry', 'in', 'FRA', [3, 50.02]), ...enemies.map((p, i) => makeUnit('infantry', `e${i}`, 'GER', p))],
      locations: [makeLocation('T', 'port', [3, 50], 'FRA', fields as never)],
    });
    return { s, ctx: makeCtx(makeScenario({ FRA: ['T'] }), []) };
  };
  const tp = (w: ReturnType<typeof portWorld>) => { updateSupply(w.s, w.ctx); return w.s.supply.nodes.find(n => n.locationId === 'T')!.throughput; };
  const ring: [number, number][] = [[2.8, 50], [3.2, 50], [3, 49.8]]; // west, east, south of the port (~20 km)

  it('daily and monthly tonnage caps convert to the same network throughput', () => {
    expect(tp(portWorld({ throughputTonsPerDay: 1500 }, []))).toBeCloseTo(1500 / (TONS_PER_POINT * 24));
    expect(tp(portWorld({ throughputTonsPerMonth: 45000 }, []))).toBeCloseTo(1500 / (TONS_PER_POINT * 24));
    expect(tp(portWorld({ throughputTonsPerMonth: 15000 }, []))).toBeCloseTo(500 / (TONS_PER_POINT * 24));
    expect(tp(portWorld({}, []))).toBe(60); // no cap data: default port capacity, backwards compatible
  });

  it('an encircled port loses all throughput unless relieved by sea', () => {
    const w = portWorld({ throughputTonsPerDay: 1500 }, ring);
    expect(isPortBesieged(w.s, w.s.locations.T)).toBe(true);
    expect(tp(w)).toBe(0);
    setPortRelief(w.s, 'T', true);
    expect(tp(w)).toBeCloseTo((1500 / (TONS_PER_POINT * 24)) * 0.3);
    setPortRelief(w.s, 'T', false);
    expect(tp(w)).toBe(0);
  });

  it('enemies on only one or two sides do not besiege; lifting the siege restores throughput', () => {
    const w = portWorld({ throughputTonsPerDay: 1500 }, ring.slice(0, 2));
    expect(isPortBesieged(w.s, w.s.locations.T)).toBe(false);
    expect(tp(w)).toBeCloseTo(1500 / (TONS_PER_POINT * 24));
    const b = portWorld({ throughputTonsPerDay: 1500 }, ring);
    expect(tp(b)).toBe(0);
    for (const id of ['e0', 'e1', 'e2']) b.s.units[id].pos = [8, 51];
    expect(tp(b)).toBeCloseTo(1500 / (TONS_PER_POINT * 24));
  });

  it('a besieged port starves the garrison once stocks are used up', () => {
    const w = portWorld({ throughputTonsPerDay: 1500 }, ring);
    for (let i = 0; i < 40; i++) updateSupply(w.s, w.ctx);
    expect(w.s.units.in.supply).toBeLessThan(40);
  });
});

describe('encirclement and forward trickle', () => {
  // Unit at (4.25, 50.25) is ~245 km along the rail from the depot. Enemy infantry ~20 km out on each side form a
  // zone-of-control ring (ZOC 18 km, friendly hold 12 km) well before any territory ownership flips.
  const base = () => { const w = world({ unitPos: [4.25, 50.25] }); w.s.control = makeControl(100, 0.05); return w; }; // fine grid so zones of control are resolved
  const around: Record<string, [number, number]> = { N: [4.25, 50.43], S: [4.25, 50.07], E: [4.53, 50.25], W: [3.97, 50.25] };
  const place = (s: GameState, dirs: string[]) => { for (const d of dirs) s.units[`en${d}`] = makeUnit('infantry', `en${d}`, 'GER', around[d]); };

  it('a continuous ring of enemy units cuts the pocket promptly even with supply nodes within truck range', () => {
    const open = base(), closed = base();
    place(closed.s, ['N', 'S', 'E', 'W']);
    run(open.s, open.ctx, 3); updateSupply(closed.s, closed.ctx);
    expect(closed.s.supply.unitSupplyDistKm.a1).toBeGreaterThan(0);   // a passing ring does not count at once (spearheads)
    run(closed.s, closed.ctx, 2);
    expect(open.s.supply.unitSupplyDistKm.a1).toBeGreaterThan(0);
    expect(closed.s.supply.unitSupplyDistKm.a1).toBe(-1);                // held for 3 updates (9 ticks): encircled
    expect(closed.s.supply.cutOffUnits).toContain('a1');
  });

  it('a ring with a gap does not cut; closing the gap cuts; opening it restores supply', () => {
    const w = base();
    place(w.s, ['N', 'S', 'E']);                       // open to the west
    updateSupply(w.s, w.ctx);
    expect(w.s.supply.unitSupplyDistKm.a1).toBeGreaterThan(0);
    place(w.s, ['W']);
    run(w.s, w.ctx, 3);
    expect(w.s.supply.unitSupplyDistKm.a1).toBe(-1);
    delete w.s.units.enW;
    updateSupply(w.s, w.ctx);
    expect(w.s.supply.unitSupplyDistKm.a1).toBeGreaterThan(0);
  });

  it('a friendly line of units holds the corridor open against enemy zones of control', () => {
    const w = base();
    place(w.s, ['N', 'S', 'E', 'W']);
    for (let i = 0; i < 5; i++) w.s.units[`fr${i}`] = makeUnit('infantry', `fr${i}`, 'FRA', [3.9 + i * 0.0, 50.25 - 0 + i * 0.0]);
    // friendly screen west of the unit, spaced under the hold radius, links it to the rail
    w.s.units.fr0.pos = [4.05, 50.25]; w.s.units.fr1.pos = [3.85, 50.25]; w.s.units.fr2.pos = [3.65, 50.25]; w.s.units.fr3.pos = [3.45, 50.25]; w.s.units.fr4.pos = [3.25, 50.25];
    updateSupply(w.s, w.ctx);
    expect(w.s.supply.unitSupplyDistKm.a1).toBeGreaterThan(0);
  });

  it('units that outrun truck range but stay connected get a thin trickle, not a hard cut', () => {
    const near = world({ unitPos: [4.0, 50.1] });
    const far = world({ unitPos: [4.0, 51.0] });   // ~100 km from the railhead, beyond the 70 km truck range
    const gone = world({ unitPos: [4.0, 51.9] });  // ~200 km, beyond even the long haul
    for (const w of [near, far, gone]) { w.s.units.a1.supply = 0; run(w.s, w.ctx, 4); }
    expect(far.s.supply.unitSupplyDistKm.a1).toBeGreaterThan(0);
    expect(far.s.units.a1.supply).toBeGreaterThan(0);
    expect(far.s.units.a1.supply).toBeLessThan(near.s.units.a1.supply);
    expect(gone.s.supply.unitSupplyDistKm.a1).toBe(-1);
    expect(far.s.units.a1.supply).toBeGreaterThanOrEqual(0);
  });
});
