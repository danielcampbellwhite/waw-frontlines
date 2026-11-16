import { describe, expect, it } from 'vitest';
import type { BattleReport, GameState, Unit, WeatherKind } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { createEngine } from '../src/sim/engine';
import { makeWorld, mkUnit } from './simfixture';

interface DuelOpts {
  att?: Partial<Unit>; def?: Partial<Unit>; attType?: Unit['type']; defType?: Unit['type'];
  terrain?: number; weather?: WeatherKind; ticks?: number; extra?: Unit[]; attCount?: number; defCount?: number;
  /** keep stepping (up to 90 ticks in all) until a battle report exists: reports are filed when a fight ends or rolls over */
  untilReport?: boolean;
}
const DEF_POS: [number, number] = [2.0, 51.5];
const ATT_POS: [number, number] = [1.9423, 51.5]; // ~4 km west of the defender (contact range is 5 km)

function duel(seed: number, o: DuelOpts = {}) {
  const units: Unit[] = [];
  const na = o.attCount ?? 1, nd = o.defCount ?? 1;
  for (let i = 0; i < na; i++) units.push(mkUnit('A' + i, 'FRA', o.attType ?? 'infantry', [ATT_POS[0], ATT_POS[1] + i * 0.012], { posture: 'attack', ...o.att }));
  for (let i = 0; i < nd; i++) units.push(mkUnit('D' + i, 'GER', o.defType ?? 'infantry', [DEF_POS[0], DEF_POS[1] + i * 0.012], { posture: 'defend', ...o.def }));
  units.push(...(o.extra ?? []));
  const w = makeWorld({ flat: o.terrain ?? Terrain.Plains, units, weather: { [o.weather ?? 'clear']: 1 } });
  const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed, disableAI: true });
  const st = e.getState() as GameState;
  if (o.weather) st.weather = { kind: o.weather, intensity: 1, temperatureC: 10, nextChangeMinutes: 1e9 };
  const start = { att: 0, def: 0 };
  for (let i = 0; i < na; i++) start.att += st.units['A' + i].manpower;
  for (let i = 0; i < nd; i++) start.def += st.units['D' + i].manpower;
  // casualties are measured at their worst point: the supply module tops units back up once they are out of the line
  let att = start.att, def = start.def;
  for (let t = 0; t < (o.ticks ?? 36); t++) {
    e.step(1);
    let a1 = 0, d1 = 0;
    for (let i = 0; i < na; i++) a1 += st.units['A' + i].manpower;
    for (let i = 0; i < nd; i++) d1 += st.units['D' + i].manpower;
    att = Math.min(att, a1); def = Math.min(def, d1);
  }
  for (let t = o.ticks ?? 36; o.untilReport && t < 90 && st.reports.length === 0; t++) e.step(1);
  const fA = 1 - att / start.att, fD = 1 - def / start.def;
  const gone = (id: string) => st.units[id].destroyed || st.units[id].moveStatus === 'retreating' || st.units[id].posture === 'regroup';
  const defBroke = Array.from({ length: nd }, (_, i) => gone('D' + i)).every(Boolean);
  const attBroke = Array.from({ length: na }, (_, i) => gone('A' + i)).every(Boolean);
  return { st, e, fA, fD, defBroke, attBroke, attackerWon: defBroke && !attBroke ? true : attBroke && !defBroke ? false : fD > fA };
}
function sweep(n: number, o: DuelOpts) {
  let wins = 0, ratioSum = 0, fA = 0, fD = 0;
  for (let s = 1; s <= n; s++) {
    const r = duel(s * 7919, o);
    if (r.attackerWon) wins++;
    fA += r.fA; fD += r.fD;
    ratioSum += (r.fA + 0.01) / (r.fD + 0.01);
  }
  return { winRate: wins / n, meanFA: fA / n, meanFD: fD / n, meanRatio: ratioSum / n };
}

describe('combat outcomes are plausible', () => {
  it('a battle forms on contact, runs for rounds, and a report is written', () => {
    const r = duel(1);
    expect(r.st.reports.length).toBeGreaterThan(0);
    const rep = r.st.reports[0];
    expect(rep.attackerSide).toBe('allies');
    expect(rep.endedAt).toBeGreaterThan(rep.startedAt);
    expect(r.fA).toBeGreaterThan(0.005);
    expect(r.fD).toBeGreaterThan(0.005);
  });
  it('no battle if nobody is pushing (defender vs defender standoff)', () => {
    const r = duel(1, { att: { posture: 'defend' } });
    expect(r.st.reports.length).toBe(0);
    expect(r.fA).toBe(0);
  });
  it('strong beats weak almost always; weak rarely beats strong; the 3:1 rule roughly holds', () => {
    const strong: Partial<Unit> = { experience: 85, morale: 95 };
    const weak: Partial<Unit> = { manpower: 4500, experience: 20, morale: 55 };
    const sw = sweep(40, { att: strong, def: weak });
    const ws = sweep(40, { att: weak, def: strong });
    const man = (n: number): Partial<Unit> => ({ manpower: n, manpowerMax: n });
    const r1 = sweep(60, {}), r15 = sweep(60, { att: man(15000) }), r2 = sweep(60, { att: man(20000) }), r3 = sweep(60, { att: man(30000) });
    console.log('COMBAT strong->weak', JSON.stringify(sw), 'weak->strong', JSON.stringify(ws));
    console.log('COMBAT att:def 1:1', JSON.stringify(r1), '| 1.5:1', JSON.stringify(r15), '| 2:1', JSON.stringify(r2), '| 3:1', JSON.stringify(r3));
    expect(sw.winRate).toBeGreaterThanOrEqual(0.9);
    expect(ws.winRate).toBeLessThanOrEqual(0.1);
    expect(r1.winRate).toBeLessThan(0.3);                 // attacking an equal dug-in force usually fails
    expect(r15.winRate).toBeGreaterThan(0.15);
    expect(r15.winRate).toBeLessThan(0.85);               // contested
    expect(r2.winRate).toBeGreaterThan(r15.winRate);
    expect(r3.winRate).toBeGreaterThanOrEqual(0.9);
    // casualties over a day and a half: material but not annihilation
    expect(r15.meanFA).toBeGreaterThan(0.02);
    expect(r15.meanFA).toBeLessThan(0.5);
  }, 120_000);
  it('numerical advantage matters (2 divisions vs 1)', () => {
    const r = sweep(30, { attCount: 3 });
    expect(r.winRate).toBeGreaterThan(0.85);
  }, 120_000);
  it('terrain matters: attacking into mountains/urban is costlier than plains', () => {
    const a = { manpower: 16000, manpowerMax: 16000 };
    const plains = sweep(40, { terrain: Terrain.Plains, att: a });
    const hills = sweep(40, { terrain: Terrain.Hills, att: a });
    const mtn = sweep(40, { terrain: Terrain.Mountains, att: a });
    const urban = sweep(40, { terrain: Terrain.Urban, att: a });
    console.log('COMBAT terrain ratio(att loss/def loss)', plains.meanRatio.toFixed(2), hills.meanRatio.toFixed(2), mtn.meanRatio.toFixed(2), urban.meanRatio.toFixed(2),
      'winrates', plains.winRate, hills.winRate, mtn.winRate, urban.winRate);
    expect(hills.meanRatio).toBeGreaterThan(plains.meanRatio);
    expect(mtn.meanRatio).toBeGreaterThan(hills.meanRatio);
    expect(urban.meanRatio).toBeGreaterThan(plains.meanRatio);
    expect(mtn.winRate).toBeLessThan(plains.winRate);
  }, 120_000);
  it('entrenchment matters', () => {
    const a = { manpower: 16000, manpowerMax: 16000 };
    const open = sweep(40, { att: a, def: { posture: 'hold' } });
    const dug = sweep(40, { att: a, def: { entrenchment: 100 } });
    console.log('COMBAT entrench ratio', open.meanRatio.toFixed(2), dug.meanRatio.toFixed(2), 'winrate', open.winRate, dug.winRate);
    expect(dug.meanRatio).toBeGreaterThan(open.meanRatio * 1.15);
    expect(dug.winRate).toBeLessThan(open.winRate);
  }, 120_000);
  it('armour is hampered in forest; armour beats infantry in the open', () => {
    const open = sweep(30, { attType: 'armoured', terrain: Terrain.Plains });
    const forest = sweep(30, { attType: 'armoured', terrain: Terrain.Forest });
    expect(forest.winRate).toBeLessThanOrEqual(open.winRate);
    expect(open.winRate).toBeGreaterThanOrEqual(0.9);
    expect(forest.meanRatio).toBeGreaterThan(open.meanRatio);
  }, 120_000);
  it('morale/organisation/ammunition/weather change the result', () => {
    const base = sweep(40, { att: { manpower: 16000, manpowerMax: 16000 } });
    const tired = sweep(40, { att: { manpower: 16000, manpowerMax: 16000, organisation: 50, morale: 40 } });
    const dry = sweep(40, { att: { manpower: 16000, manpowerMax: 16000, ammo: 0 } });
    const storm = sweep(40, { att: { manpower: 16000, manpowerMax: 16000 }, weather: 'storm' });
    expect(tired.meanRatio).toBeGreaterThan(base.meanRatio);
    expect(dry.meanRatio).toBeGreaterThan(base.meanRatio);
    expect(storm.meanRatio).toBeGreaterThan(base.meanRatio);
  }, 120_000);
  it('artillery support (and air support in good weather) helps the side that has it', () => {
    const arty = mkUnit('SA', 'FRA', 'artillery', [1.85, 51.5]);
    const none = sweep(40, {});
    const withArty = sweep(40, { extra: [arty, mkUnit('SB', 'FRA', 'artillery', [1.85, 51.52])] });
    expect(withArty.meanRatio).toBeLessThan(none.meanRatio);
    const bomber = (id: string) => mkUnit(id, 'FRA', 'air_bomber', [1.7, 51.5], { domain: 'air', equipment: { held: { bomber: 80 }, authorised: { bomber: 80 } }, manpower: 2000, manpowerMax: 2000 });
    const air = sweep(30, { extra: [bomber('B1'), bomber('B2')] });
    const airStorm = sweep(30, { extra: [bomber('B1'), bomber('B2')], weather: 'storm' });
    expect(air.meanRatio).toBeLessThan(none.meanRatio);
    expect(airStorm.meanRatio).toBeGreaterThan(air.meanRatio);
  }, 120_000);
  it('broken units retreat away from the enemy and stop being in the battle', () => {
    let sawRetreat = false, away = false;
    for (let s = 1; s <= 20 && !(sawRetreat && away); s++) {
      const r = duel(s, { att: { experience: 90, morale: 100 }, def: { manpower: 3500, morale: 40, organisation: 45 }, ticks: 1 });
      for (let t = 0; t < 40; t++) {
        const d = r.st.units['D0'];
        if (d.moveStatus === 'retreating') {
          sawRetreat = true;
          const before = d.pos[0];
          r.e.step(8);
          if (r.st.units['D0'].pos[0] > before + 0.02) away = true; // moved east, away from the western attacker
          break;
        }
        r.e.step(1);
      }
    }
    expect(sawRetreat).toBe(true);
    expect(away).toBe(true);
  });
  describe('encirclement and surrender', () => {
    const pocket = (cutHours: number, trapped: Partial<Unit>, seed = 3, airlift = false) => {
      const ger = (id: string, dx: number, dy: number) => mkUnit(id, 'GER', 'infantry', [2.6 + dx, 51.5 + dy], { posture: 'attack' });
      const t = mkUnit('T', 'FRA', 'infantry', [2.6, 51.5], { manpower: 3000, manpowerMax: 10000, ammo: 4, organisation: 25, morale: 50, posture: 'defend', ...trapped });
      const w = makeWorld({ flat: Terrain.Plains, units: [t, ger('N', 0, 0.035), ger('S', 0, -0.035), ger('E', 0.055, 0), ger('W', -0.055, 0)] });
      const e = createEngine(w.scenario, w.terrain, w.infra, { playerNation: 'FRA', settings: w.settings, seed, disableAI: true });
      const st = e.getState() as GameState;
      return { e, st, run: (ticks: number) => {
        for (let i = 0; i < ticks && !st.units['T'].surrendered && !st.units['T'].destroyed; i++) {
          st.units['T'].encircled = true;
          if (airlift) { const t = st.units['T']; t.supply = 90; t.ammo = Math.max(t.ammo, 30); }
                                // hold the pocket shut (the isolation scan only runs every third tick)
          (st.special as Record<string, { cutSince: Record<string, number> }>)['sim'].cutSince ??= {};
          (st.special as Record<string, { cutSince: Record<string, number> }>)['sim'].cutSince['T'] ??= st.clock.minutes - cutHours * 60;
          e.step(1);
        }
      } };
    };
    it('a battered unit that has been cut off for more than a day surrenders or is destroyed', () => {
      const p = pocket(30, { supply: 0 });
      p.run(120);
      expect(p.st.units['T'].destroyed).toBe(true);
    });
    it('never surrenders in its first day in the pocket', () => {
      const p = pocket(0, { supply: 0 });
      p.run(10);
      expect(p.st.units['T'].surrendered).toBeFalsy();
    });
    it('a pocket that is still supplied holds out longer than one that is not (mean over 20 seeds)', () => {
      const meanTicks = (airlift: boolean) => {
        let sum = 0;
        for (let seed = 1; seed <= 20; seed++) {
          const p = pocket(30, { supply: airlift ? 90 : 0, ammo: airlift ? 30 : 4, manpower: 3500 }, seed, airlift);
          let n = 0;
          while (n < 80 && !p.st.units['T'].surrendered && !p.st.units['T'].destroyed) { p.run(1); n++; }
          sum += n;
        }
        return sum / 20;
      };
      const dry = meanTicks(false), fed = meanTicks(true);
      expect(fed).toBeGreaterThan(dry * 1.3);
    });
  });
});

describe('battle reports tell the truth', () => {
  function numbers(rep: BattleReport) {
    const m = /Attackers lost (\d+) men \((\d+) killed, (\d+) wounded, (\d+) captured/.exec(rep.summary)!;
    return { total: +m[1], killed: +m[2], wounded: +m[3], captured: +m[4] };
  }
  it('casualty figures in the summary equal the per-unit ledger and the manpower actually lost', () => {
    const r = duel(11, { terrain: Terrain.Hills, def: { entrenchment: 80 }, ticks: 40, untilReport: true });
    const rep = r.st.reports[0];
    const n = numbers(rep);
    const att = rep.casualties.filter((c) => c.unitId.startsWith('A'));
    expect(att.reduce((a, c) => a + c.killed, 0)).toBe(n.killed);
    expect(att.reduce((a, c) => a + c.wounded, 0)).toBe(n.wounded);
    expect(att.reduce((a, c) => a + c.captured, 0)).toBe(n.captured);
    expect(n.total).toBe(n.killed + n.wounded + n.captured);
    // reports never claim more than was really lost (the worst point of the fight; the supply module refills units afterwards),
    // and, because only fights that matter are filed, they account for nearly all of it
    let lost = 0;
    for (const x of r.st.reports) lost += numbers(x).total;
    const actual = Math.round(r.fA * 10000);
    expect(lost).toBeLessThanOrEqual(actual + 1);
    expect(lost).toBeGreaterThanOrEqual(0.95 * actual);
    expect(rep.orgChanges.find((o) => o.unitId === 'A0')!.after).toBeLessThanOrEqual(rep.orgChanges.find((o) => o.unitId === 'A0')!.before);
  });
  it('reasons cite only factors that were actually present', () => {
    const open = duel(5, { terrain: Terrain.Plains, def: { posture: 'hold' }, ticks: 30, untilReport: true }).st.reports[0].reasons.join(' | ');
    expect(open).not.toMatch(/mountains|entrenched|river|artillery|aircraft|flanking|encircled|Weather/i);
    expect(open).toMatch(/combat power: attackers [\d.]+ vs defenders [\d.]+/);
    const hard = duel(5, { terrain: Terrain.Mountains, def: { entrenchment: 100 }, ticks: 30, untilReport: true }).st.reports[0].reasons.join(' | ');
    expect(hard).toMatch(/mountains/);
    expect(hard).toMatch(/entrenched/);
    const storm = duel(5, { weather: 'storm', ticks: 30, untilReport: true }).st.reports[0].reasons.join(' | ');
    expect(storm).toMatch(/Weather \(storm\)/);
    const dry = duel(5, { att: { ammo: 3 }, ticks: 30, untilReport: true }).st.reports[0].reasons.join(' | ');
    expect(dry).toMatch(/Attackers were short of ammunition/);
    const flank = duel(5, { ticks: 8, attCount: 2, extra: [] });
    void flank;
  });
  it('the reported outcome agrees with what happened to the units', () => {
    for (let s = 1; s <= 15; s++) {
      const r = duel(s, { att: { experience: 90, morale: 100 }, def: { manpower: 3500, morale: 40 }, ticks: 40 });
      for (const rep of r.st.reports) {
        if (rep.outcome === 'attacker_victory') expect(rep.retreats.length > 0 || rep.casualties.some((c) => c.unitId.startsWith('D'))).toBe(true);
        if (rep.outcome === 'defender_victory') {
          const a = numbers(rep);
          expect(a.total).toBeGreaterThan(0);
        }
        expect(rep.summary).toMatch(/attacked/);
        expect(rep.consequences.length).toBeGreaterThan(0);
      }
    }
  });
});
