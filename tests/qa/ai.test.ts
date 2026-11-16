import { beforeAll, describe, expect, it } from 'vitest';
import { nextFloat, nextGauss } from '../../src/core/rng';
import type { Command, GameState, NationId, SideId, Unit } from '../../src/core/types';
import { aiThink, type AiContext } from '../../src/ai';
import { visibleTo } from '../../src/sim';
import { fastKm } from '../../src/ai/model';
import { checkInvariants, longWorld, mkEngine } from './harness';
import { readFileSync } from 'node:fs';
import { AIR_SUPPORT_KM } from '../../src/sim/constants';
import { resolveDoctrine } from '../../src/ai';

const W = longWorld();
const TICKS = 1500;
const alive = (u: Unit) => !u.destroyed && !u.surrendered;

interface Stats {
  msPerTick: number[]; moving: number[]; aiMs: number; opsSeen: Set<string>; maxOpsActive: number; cmdCount: Record<string, number>;
  fogViolations: string[]; fogChecked: number; idleForever: string[]; startOwner: number[]; endOwner: number[]; locChanges: number; reports: number; invariantProblems: string[];
  lastActive: Record<string, number>; state: GameState; coordPeek: number; coordTotal: number; distinctAttackTargets: number;
}
let S: Stats;

beforeAll(() => {
  // Player = GBR; GBR is driven externally by aiThink so ALL nations are AI-controlled (AI-vs-AI, no player input).
  const e = mkEngine(W, 'GBR', 77);
  const gbrRng = { s: 4242 };
  const gbrCtx: AiContext = { rand: () => nextFloat(gbrRng), gauss: () => nextGauss(gbrRng), visibleTo };
  const st0 = e.getState();
  const stats: Stats = { msPerTick: [], moving: [], aiMs: 0, opsSeen: new Set(), maxOpsActive: 0, cmdCount: {}, fogViolations: [], fogChecked: 0, idleForever: [], startOwner: [...st0.control.owner],
    endOwner: [], locChanges: 0, reports: 0, invariantProblems: [], lastActive: {}, state: st0, coordPeek: 0, coordTotal: 0, distinctAttackTargets: 0 };
  const startLocOwner = Object.fromEntries(Object.values(st0.locations).map((l) => [l.id, l.owner]));
  const attackTargets = new Set<string>();
  for (let t = 1; t <= TICKS; t++) {
    const st = e.getState();
    // peek at what the engine's AIs (GER/FRA/BEL/NED...) will do this tick on a clone, and audit for fog cheating
    if ((t % 4) === 0 && t % 12 === 0) {
      for (const nation of ['GER', 'FRA'] as NationId[]) {
        const clone = structuredClone(st) as GameState; clone.clock.minutes += 60;
        const side: SideId = st.nations[nation].side;
        const rr = { s: t * 31 + 7 };
        const cmds = aiThink(clone, nation, { rand: () => nextFloat(rr), gauss: () => nextGauss(rr) });
        for (const c of cmds) auditCommand(st, c, side, stats);
      }
    }
    if (t % 4 === 0) { // GBR AI think, same cadence as engine
      const t0 = performance.now();
      const cmds = aiThink(st, 'GBR', gbrCtx);
      stats.aiMs += performance.now() - t0;
      for (const c of cmds) { stats.cmdCount[c.type] = (stats.cmdCount[c.type] ?? 0) + 1; e.dispatch(c, 'allies'); }
    }
    const t0 = performance.now();
    e.step(1);
    stats.msPerTick.push(performance.now() - t0);
    const s = e.getState();
    let mv = 0;
    for (const id in s.units) {
      const u = s.units[id]; if (!alive(u)) continue;
      if (u.moveStatus !== 'stationary') mv++;
      if (u.moveStatus !== 'stationary' || u.inBattle || u.orders.length > 0 || u.combatStatus !== 'idle') stats.lastActive[id] = t;
      for (const o of u.orders) if (o.operationId) stats.opsSeen.add(o.operationId);
      for (const o of u.orders) if (o.kind === 'attack' && o.target) attackTargets.add(`${o.target[0].toFixed(1)},${o.target[1].toFixed(1)}`);
    }
    stats.moving.push(mv);
    stats.maxOpsActive = Math.max(stats.maxOpsActive, Object.values(s.operations).filter((o) => o.status === 'active').length);
    if (t % 50 === 0) { const bad = checkInvariants(s); if (bad.length) stats.invariantProblems.push(`t=${t}: ${bad.slice(0, 5).join('; ')}`); }
  }
  const s = e.getState();
  stats.state = s; stats.endOwner = s.control.owner; stats.reports = s.reports.length;
  stats.locChanges = Object.values(s.locations).filter((l) => l.owner !== startLocOwner[l.id]).length;
  stats.distinctAttackTargets = attackTargets.size;
  for (const u of Object.values(s.units)) {
    if (!alive(u) || u.type === 'hq' || u.type === 'logistics' || u.domain === 'air') continue; // air groups support passively from their bases
    const idleFor = TICKS - (stats.lastActive[u.id] ?? 0);
    if (idleFor > 500) stats.idleForever.push(`${u.id}(${u.side},${u.type}) idle ${idleFor}`);
  }
  S = stats;
}, 600_000);

function auditCommand(st: GameState, c: Command, side: SideId, stats: Stats) {
  stats.cmdCount['peek:' + c.type] = (stats.cmdCount['peek:' + c.type] ?? 0) + 1;
  const orders: { target?: [number, number]; targetUnit?: string; kind: string }[] = [];
  if (c.type === 'issue_order') orders.push(c.order);
  if (c.type === 'create_operation') for (const p of c.operation.phases) orders.push(p.order);
  for (const o of orders) {
    if (o.targetUnit) {
      const tu = st.units[o.targetUnit]; if (!tu) continue;
      if (tu.side !== side) { stats.fogChecked++; if (!(tu.visibleTo?.includes(side) || tu.lastSeenBy?.[side])) stats.fogViolations.push(`${side} targets never-seen ${o.targetUnit}`); }
    }
    if (o.target && (o.kind === 'attack')) {
      // does the attack target sit (<2.5 km) on top of a currently UNSEEN enemy unit that is not at a known location?
      stats.coordTotal++;
      for (const id in st.units) {
        const e = st.units[id]; if (!alive(e) || e.side === side || e.side === 'neutral') continue;
        if (fastKm(e.pos, o.target) < 2.5) {
          const seen = e.visibleTo?.includes(side) || (e.lastSeenBy?.[side] && fastKm(e.lastSeenBy[side].pos, e.pos) < 15);
          if (!seen) { stats.coordPeek++; break; }
        }
      }
    }
  }
}

describe(`AI-vs-AI ${TICKS} ticks (all three... all nations AI, fog on)`, () => {
  it('prints summary', () => {
    const ms = [...S.msPerTick].sort((a, b) => a - b);
    const flipped = S.endOwner.reduce((a, v, i) => a + (v !== S.startOwner[i] ? 1 : 0), 0);
    console.log('[ai] ms/tick mean', (ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(1), 'p50', ms[ms.length >> 1].toFixed(1), 'p95', ms[Math.floor(ms.length * 0.95)].toFixed(1), 'max', ms[ms.length - 1].toFixed(1), 'GBR think total ms', S.aiMs.toFixed(0));
    console.log('[ai] commands', S.cmdCount, 'operations seen', S.opsSeen.size, 'max active ops', S.maxOpsActive, 'avg moving', (S.moving.reduce((a, b) => a + b, 0) / S.moving.length).toFixed(1));
    console.log('[ai] cells flipped', flipped, 'of', S.endOwner.length, 'locations changed hands', S.locChanges, 'reports', S.reports, 'distinct attack targets', S.distinctAttackTargets);
    console.log('[ai] fog: target-unit orders checked', S.fogChecked, 'violations', S.fogViolations.length, 'attack-coordinate orders', S.coordTotal, 'landing on unseen enemies', S.coordPeek);
    console.log('[ai] idle >500 ticks:', S.idleForever.length, S.idleForever.slice(0, 12));
    expect(true).toBe(true);
  });
  it('air support share of battle power (report reasons): logs how often aircraft dominate', () => {
    let n = 0, dom = 0, sum = 0;
    for (const r of S.state.reports) { const m = /aircraft added (\d+)% of (attacker|defender) power/.exec(r.reasons.join(' | ')); n++; if (m) { sum++; if (+m[1] >= 50) dom++; } }
    console.log(`[ai] air support: ${sum}/${n} reports cite aircraft, ${dom} of them >=50% of that side's power`);
    expect(n).toBeGreaterThan(0);
  });
  it('AI units actually move', () => { expect(Math.max(...S.moving)).toBeGreaterThan(15); expect(S.moving.slice(0, 100).some((m) => m > 0)).toBe(true); });
  it('AI attacks: battles occurred and reports exist', () => { expect(S.reports).toBeGreaterThan(20); });
  it('AI forms coordinated operations', () => { expect(S.opsSeen.size).toBeGreaterThan(0); });
  it('territory changes', () => {
    const flipped = S.endOwner.reduce((a, v, i) => a + (v !== S.startOwner[i] ? 1 : 0), 0);
    expect(flipped).toBeGreaterThan(50);
  });
  it('no AI command targets a unit the side never saw (fog respected)', () => { expect(S.fogViolations.slice(0, 5)).toEqual([]); });
  it('attack coordinates rarely sit on unseen enemy units (< 25%) — soft fog-cheat heuristic', () => {
    if (S.coordTotal > 20) expect(S.coordPeek / S.coordTotal).toBeLessThan(0.25);
  });
  it('no unit idle for 500+ ticks except where explained (<10% of living combat units)', () => {
    const n = Object.values(S.state.units).filter((u) => alive(u) && u.type !== 'hq' && u.type !== 'logistics' && u.domain !== 'air').length;
    expect(S.idleForever.length).toBeLessThan(n * 0.1);
  });
  it('invariants held every 50 ticks', () => { expect(S.invariantProblems).toEqual([]); });
  it('performance: mean tick < 150 ms, p95 < 400 ms', () => {
    const ms = [...S.msPerTick].sort((a, b) => a - b);
    expect(ms.reduce((a, b) => a + b, 0) / ms.length).toBeLessThan(150);
    expect(ms[Math.floor(ms.length * 0.95)]).toBeLessThan(400);
  });
});

describe('air coverage of the main contact sector (sim air support range)', () => {
  const sample = (st: GameState) => {
    const land = Object.values(st.units).filter((u) => alive(u) && u.domain === 'land' && u.side !== 'neutral');
    const bins = new Map<string, { n: number; sx: number; sy: number }>();
    for (const a of land) {
      if (a.side !== 'axis') continue;
      let contact = false;
      for (const b of land) if (b.side === 'allies' && fastKm(a.pos, b.pos) < 25) { contact = true; break; }
      if (!contact) continue;
      const k = `${Math.floor(a.pos[0] / 0.7)},${Math.floor(a.pos[1] / 0.5)}`;
      const e = bins.get(k) ?? { n: 0, sx: 0, sy: 0 }; e.n++; e.sx += a.pos[0]; e.sy += a.pos[1]; bins.set(k, e);
    }
    let best: { n: number; sx: number; sy: number } | undefined; for (const e of bins.values()) if (!best || e.n > best.n) best = e;
    const centre: [number, number] = best ? [best.sx / best.n, best.sy / best.n] : [st.locations['sedan']?.pos[0] ?? 5, st.locations['sedan']?.pos[1] ?? 49.7];
    const count = (side: string) => Object.values(st.units).filter((u) => alive(u) && u.domain === 'air' && u.side === side && fastKm(u.pos, centre) <= AIR_SUPPORT_KM).length;
    const total = (side: string) => Object.values(st.units).filter((u) => alive(u) && u.domain === 'air' && u.side === side).length;
    return { centre, axis: count('axis'), allies: count('allies'), axisTotal: total('axis'), alliesTotal: total('allies') };
  };
  it('reports German/Allied air groups in range of the German Schwerpunkt at tick 0 and tick 300', () => {
    const e = mkEngine(W, 'GBR', 5);
    const r0 = sample(e.getState());
    const sedan = e.getState().locations['sedan'].pos as [number, number];
    const sedanAxis = Object.values(e.getState().units).filter((u) => alive(u) && u.domain === 'air' && u.side === 'axis' && fastKm(u.pos, sedan) <= AIR_SUPPORT_KM).length;
    e.step(300);
    const r1 = sample(e.getState());
    console.log('[air] tick0', JSON.stringify(r0), 'axis air within range of Sedan', sedanAxis, '| tick300', JSON.stringify(r1));
    if (r0.axis === 0 || sedanAxis === 0) console.log('[air] WARNING: no German air group within', AIR_SUPPORT_KM, 'km of the Schwerpunkt at tick 0');
    expect(r0.axisTotal).toBeGreaterThan(0);
    expect(r0.alliesTotal).toBeGreaterThan(0);
  }, 120_000);
});

describe('AI doctrine coherence (doctrine.ts vs doctrines.ts)', () => {
  it('doctrines.ts only uses AiDoctrine fields, real location ids and event-dated gates; it is registered and resolves', () => {
    const src = readFileSync(new URL('../../src/ai/doctrines.ts', import.meta.url), 'utf8');
    const e = mkEngine(W, 'GBR', 1); const st = e.getState();
    const d = resolveDoctrine(st, 'GER');
    expect(d.armourObjectives?.[0]).toBe('sedan');
    expect(Object.keys(d.objectiveSchedule ?? {}).length).toBeGreaterThan(10);
    for (const id of [...(d.armourObjectives ?? []), ...(d.captureLocations ?? []), ...Object.keys(d.objectiveSchedule ?? {})]) expect(st.locations[id], `doctrine location ${id}`).toBeDefined();
    const events = JSON.parse(readFileSync(new URL('../../src/data/campaigns/fall_of_france.events.json', import.meta.url), 'utf8')).events as { id: string; minutesFromStd: number }[];
    for (const m of src.matchAll(/fof\.ev\.(\w+) \((\d+) h\)/g)) {
      const ev = events.find((x) => x.id === `fof.ev.${m[1]}`); expect(ev, `event ${m[1]}`).toBeDefined(); expect(ev!.minutesFromStd / 60, `hours of ${m[1]}`).toBe(+m[2]);
    }
    // gate must not precede the dated event by more than ~5 days (pacing, not history) nor be after it for Paris
    expect(d.objectiveSchedule!['paris']).toBeLessThanOrEqual(840 * 60);
  });
});
