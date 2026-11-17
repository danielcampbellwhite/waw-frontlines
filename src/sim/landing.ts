import type { GameState, LonLat, Unit } from '../core/types';
import { Terrain } from '../core/types';
import { destination } from '../core/geo';
import type { SimContext } from './context';
import { getGridInfo, terrainAt } from './gridutil';
import { getSimMeta } from './meta';

/** Amphibious / airborne arrivals: scatter, losses, reduced organisation and a first-hours combat penalty. */
export const LANDING_PENALTY = 0.8;

/** Run around military.processReinforcements: `before` is the unit-id set taken just before it. */
export function applyLandings(state: GameState, ctx: SimContext, before: Set<string>): void {
  const fresh: Unit[] = [];
  for (const id in state.units) if (!before.has(id)) fresh.push(state.units[id]);
  if (!fresh.length) return;
  const meta = getSimMeta(state);
  const info = getGridInfo(ctx.terrain, ctx.infra);
  const now = state.clock.minutes;
  for (const nation of Object.values(state.nations)) {
    for (const arr of nation.reinforcements) {
      const L = arr.landing;
      if (!L || !arr.arrived) continue;
      const u = fresh.find((f) => f.nation === nation.id && (f.id === arr.unit.id || f.id.startsWith(arr.unit.id + '_r')));
      if (!u) continue;
      // scatter (deterministic: ctx.rand only); a drop never lands in water
      const disp = L.dispersionKm ?? 0;
      if (disp > 0) {
        for (let k = 0; k < 6; k++) {
          const p: LonLat = destination(u.pos, ctx.rand() * 360, Math.sqrt(ctx.rand()) * disp);
          const t = terrainAt(info, p, Terrain.Sea);
          if (t !== Terrain.Sea && t !== Terrain.Lake) { u.pos = p; break; }
        }
      }
      const cas = Math.max(0, Math.min(0.6, L.casualties ?? 0));
      if (cas > 0) u.manpower = Math.max(1, Math.round(u.manpower * (1 - cas * (0.7 + 0.6 * ctx.rand()))));
      u.organisation = Math.min(u.organisation, L.organisation ?? (L.kind === 'amphibious' ? 60 : 70));
      meta.landing[u.id] = now + (L.penaltyHours ?? 6) * 60;
      ctx.log({ category: 'battle', severity: 'warn', unitId: u.id, pos: u.pos, text: `${u.name} ${L.kind === 'amphibious' ? 'came ashore' : 'dropped'}, disorganised.` });
      arr.landing = undefined; // consumed
    }
  }
}

export const landingPenaltyActive = (state: GameState, u: Unit): boolean => (getSimMeta(state).landing[u.id] ?? 0) > state.clock.minutes;
