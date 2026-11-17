import { describe, expect, it } from 'vitest';
import { nextFloat, nextGauss } from '../../src/core/rng';
import type { GameState, NationId } from '../../src/core/types';
import { aiThink } from '../../src/ai';
import { milSpecial } from '../../src/military/context';
import { portCapacity, setLocationThroughputFactor } from '../../src/military';
import { visibleTo } from '../../src/sim';
import { haversineKm } from '../../src/core/geo';
import { loadWorld, mkEngine } from './harness';

/** Port-capacity-aware reinforcement requests of the AI (planReinforcements in src/ai/index.ts). */
const W = loadWorld('normandy.short');
function requests(s: GameState, nation: NationId, seed = 1) {
  const rng = { s: seed }; const ctx = { rand: () => nextFloat(rng), gauss: () => nextGauss(rng), visibleTo };
  return aiThink(s, nation, ctx).filter((c) => c.type === 'request_reinforcement') as { type: 'request_reinforcement'; locationId: string; unitId: string }[];
}
function setup() {
  const e = mkEngine(W, 'GER', 1); e.step(120); const s = e.getState() as GameState;   // Allies are the AI side here; the German player is idle
  // a depleted British/US unit near a port
  const ports = Object.values(s.locations).filter((l) => l.kind === 'port' && l.owner !== 'GER');
  let pick: { u: GameState['units'][string]; port: typeof ports[number] } | undefined;
  for (const u of Object.values(s.units)) { if (u.side !== 'allies' || u.domain !== 'land' || u.type === 'hq' || u.destroyed) continue;
    for (const p of ports) if (s.nations[p.owner]?.side === 'allies' && haversineKm(u.pos, p.pos) < 25) { pick = { u, port: p }; break; } if (pick) break; }
  return { e, s, pick, ports };
}
describe('port-capacity-aware reinforcement requests', () => {
  it('a depleted unit near an operational port requests it; a wrecked/zero-throughput port is never requested; the data has ports to test', () => {
    const { s, pick } = setup();
    expect(pick, 'no allied unit within 25 km of an allied port at h120').toBeDefined();
    const { u, port } = pick!;
    u.manpower = Math.floor(u.manpowerMax * 0.3); (s.nations[u.nation].resources as { manpower: number }).manpower = 5000;
    const st = portCapacity(s, port.id); console.log('[portreinf] unit', u.id, 'port', port.id, 'status', JSON.stringify(st));
    const base = requests(s, u.nation).filter((r) => r.unitId === u.id);
    console.log('[portreinf] baseline requests', JSON.stringify(base));
    expect(base.length).toBeGreaterThan(0);
    // wreck the port: it must not be requested any more
    setLocationThroughputFactor(s, port.id, 0);
    const wrecked = requests(s, u.nation).filter((r) => r.unitId === u.id);
    console.log('[portreinf] with port at throughput 0', JSON.stringify(wrecked), 'operational', portCapacity(s, port.id)?.operational);
    expect(wrecked.every((r) => r.locationId !== port.id)).toBe(true);
  }, 240_000);
  it('an operational port is requested when nearest; once its unloading capacity for the day is used up it yields to a town within 40 km', () => {
    const { s, ports } = setup();
    const op = ports.map((p) => ({ p, st: portCapacity(s, p.id) })).filter((x) => x.st?.operational && x.st.tonsPerDay > 0 && s.nations[x.p.owner]?.side === 'allies');
    console.log('[portreinf] operational allied ports at h120:', op.map((x) => `${x.p.id}:${Math.round(x.st!.tonsPerDay)}t`).join(' '));
    expect(op.length).toBeGreaterThan(0);
    const { p, st } = op[0];
    const alt = Object.values(s.locations).filter((l) => l.id !== p.id && l.owner === p.owner && ['city', 'town', 'depot'].includes(l.kind) && haversineKm(l.pos, p.pos) > 1 && haversineKm(l.pos, p.pos) < 40);
    const u = Object.values(s.units).find((x) => x.nation === p.owner && x.domain === 'land' && x.type !== 'hq' && !x.destroyed)!;
    u.pos = [p.pos[0], p.pos[1]]; u.manpower = Math.floor(u.manpowerMax * 0.3); u.inBattle = undefined; (s.nations[u.nation].resources as { manpower: number }).manpower = 5000;
    const first = requests(s, u.nation).filter((r) => r.unitId === u.id);
    console.log('[portreinf] unit', u.id, 'at port', p.id, 'requests', JSON.stringify(first.map((r) => r.locationId)), 'alt towns <40 km', alt.map((l) => l.id).join(','));
    expect(first.map((r) => r.locationId)).toEqual([p.id]);
    milSpecial(s).portUse[p.id] = { day: Math.floor(s.clock.minutes / 1440), tons: st!.tonsPerDay + 1 };
    expect(portCapacity(s, p.id)!.remainingTonsToday).toBe(0);
    // a fresh AI memory entry is needed: the first request was rate-limited per unit (720 min)
    const mem = (s.aiState as unknown as Record<string, { reinforceReq?: Record<string, number> }>)[u.nation]; if (mem) mem.reinforceReq = {};
    const second = requests(s, u.nation, 2).filter((r) => r.unitId === u.id);
    console.log('[portreinf] saturated port ->', JSON.stringify(second.map((r) => r.locationId)));
    if (alt.length) expect(second.map((r) => r.locationId)).not.toEqual([p.id]);
  }, 240_000);
});
