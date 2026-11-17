import type { CarpetBombing, GameState, SideId, Unit } from '../core/types';
import type { SimContext } from './context';
import { fastKm } from './gridutil';
import { getSimMeta } from './meta';

const FLYABLE = new Set(['clear', 'cloud']);
const MAX_POSTPONE_MIN = 12 * 60;

/**
 * Air interdiction (game-scale): while a scenario `airSupremacy` window is open, the OTHER side's road movement within
 * radiusKm of the beneficiary's land units is slowed (default x0.6). Nothing happens in weather the aircraft cannot fly in.
 * Returns undefined when nothing applies, so movement pays no cost.
 */
export function interdictionFor(state: GameState, ctx: SimContext): ((u: Unit) => number) | undefined {
  const list = ctx.scenario.airSupremacy;
  if (!list || !list.length) return undefined;
  if (!FLYABLE.has(state.weather.kind)) return undefined;
  const now = state.clock.minutes;
  const active = list.filter((a) => now >= (a.fromMinutes ?? 0) && now < (a.toMinutes ?? Infinity));
  if (!active.length) return undefined;
  const front: Record<string, Unit[]> = {};
  for (const a of active) {
    front[a.side] ??= [];
    for (const id in state.units) { const u = state.units[id]; if (u.side === a.side && u.domain === 'land' && !u.destroyed && !u.surrendered) front[a.side].push(u); }
  }
  const cache = new Map<string, number>();
  return (u: Unit) => {
    if (u.domain !== 'land') return 1;
    let mul = 1;
    for (const a of active) {
      if (u.side === a.side || u.side === 'neutral') continue;
      const key = a.side + ':' + u.id;
      let m = cache.get(key);
      if (m === undefined) {
        m = 1;
        const r = a.radiusKm ?? 80;
        for (const f of front[a.side]) if (fastKm(f.pos, u.pos) < r) { m = a.speedMul ?? 0.6; break; }
        cache.set(key, m);
      }
      mul = Math.min(mul, m);
    }
    return mul;
  };
}

/** Apply one carpet bombing right now. Deterministic: losses scale with distance from the aim point. */
export function carpetBomb(state: GameState, ctx: SimContext, b: Omit<CarpetBombing, 'id' | 'atMinutes'> & { id?: string }): number {
  let hit = 0;
  const side: SideId = b.side;
  for (const id in state.units) {
    const u = state.units[id];
    if (u.side === side || u.side === 'neutral' || u.domain !== 'land' || u.destroyed || u.surrendered) continue;
    const d = fastKm(u.pos, b.pos);
    if (d > b.radiusKm) continue;
    const f = 1 - 0.7 * (d / b.radiusKm);
    const cas = Math.min(0.5, (b.casualtyPct ?? 0.06) * f * (u.entrenchment >= 60 ? 0.8 : 1));
    const lost = Math.round(u.manpower * cas);
    u.manpower = Math.max(1, u.manpower - lost);
    for (const k in u.equipment.held) u.equipment.held[k] = Math.max(0, Math.round(u.equipment.held[k] * (1 - cas)));
    u.organisation = Math.max(0, u.organisation - (b.orgLoss ?? 35) * f);
    u.morale = Math.max(0, u.morale - 15 * f);
    u.entrenchment = u.entrenchment * 0.5;
    hit++;
  }
  ctx.log({ category: 'battle', severity: 'critical', pos: b.pos, text: `Heavy bombers carpet-bombed an area near here: ${hit} enemy units were hit.` });
  return hit;
}

/** Fire the scenario's scheduled carpet bombings; they are postponed (up to 12 h) while the weather forbids flying. */
export function processBombings(state: GameState, ctx: SimContext): void {
  const list = ctx.scenario.carpetBombings;
  if (!list || !list.length) return;
  const meta = getSimMeta(state);
  const now = state.clock.minutes;
  for (const b of list) {
    if (meta.bombed[b.id] || now < b.atMinutes) continue;
    if (!FLYABLE.has(state.weather.kind)) {
      if (now - b.atMinutes >= MAX_POSTPONE_MIN) { meta.bombed[b.id] = true; ctx.log({ category: 'battle', severity: 'warn', pos: b.pos, text: 'The planned heavy bombing was cancelled because of the weather.' }); }
      continue;
    }
    meta.bombed[b.id] = true;
    carpetBomb(state, ctx, b);
  }
}
