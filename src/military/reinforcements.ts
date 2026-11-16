import { haversineKm } from '../core/geo';
import type { GameState, Location, LonLat, ReinforcementArrival } from '../core/types';
import { TICK_MINUTES } from '../core/types';
import { addLog, milSpecial } from './context';

export const ARRIVAL_RETRY_MINUTES = 12 * TICK_MINUTES;

function sideOf(state: GameState, nation: string) { return state.nations[nation]?.side; }

function nearestFriendly(state: GameState, nationId: string, from: LonLat): Location | undefined {
  const side = sideOf(state, nationId);
  let best: Location | undefined, bd = Infinity;
  for (const l of Object.values(state.locations)) {
    if (sideOf(state, l.owner) !== side) continue;
    if (!['city', 'town', 'port', 'depot', 'airfield'].includes(l.kind)) continue;
    if ((l.damaged ?? 0) >= 95) continue;
    const d = haversineKm(from, l.pos);
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

/** Make due ReinforcementArrivals appear. Arrivals whose location was lost are diverted or postponed. */
export function processReinforcements(state: GameState): void {
  const now = state.clock.minutes;
  const sp = milSpecial(state);
  for (const nation of Object.values(state.nations)) {
    for (const arr of nation.reinforcements) {
      if (arr.arrived || arr.atMinutes > now) continue;
      const placed = resolveArrivalPos(state, nation.id, arr);
      if (!placed) {
        if (!sp.warned[arr.id]) {
          sp.warned[arr.id] = true;
          addLog(state, { category: 'supply', severity: 'warn', text: `Reinforcements for ${arr.unit.name} are delayed: no safe arrival point` });
        }
        arr.atMinutes = now + ARRIVAL_RETRY_MINUTES;
        continue;
      }
      const u = JSON.parse(JSON.stringify(arr.unit)) as GameState['units'][string];
      if (state.units[u.id]) u.id = `${u.id}_r${state.idCounter++}`;
      u.pos = [placed.pos[0], placed.pos[1]];
      u.nation = nation.id as typeof u.nation;
      u.side = nation.side;
      u.orders = u.orders ?? [];
      u.moveStatus = 'stationary';
      u.combatStatus = 'idle';
      u.destroyed = false;
      u.inBattle = undefined;
      u.route = undefined;
      state.units[u.id] = u;
      arr.arrived = true;
      addLog(state, {
        category: 'supply', severity: 'info', pos: u.pos, unitId: u.id,
        text: `Reinforcements arrive: ${u.name} at ${placed.name}`,
      });
    }
  }
}

function resolveArrivalPos(state: GameState, nationId: string, arr: ReinforcementArrival): { pos: LonLat; name: string } | null {
  const side = sideOf(state, nationId);
  if (arr.locationId) {
    const loc = state.locations[arr.locationId];
    if (loc && sideOf(state, loc.owner) === side && (loc.damaged ?? 0) < 95) return { pos: loc.pos, name: loc.name };
    const alt = nearestFriendly(state, nationId, loc?.pos ?? arr.pos ?? arr.unit.pos);
    return alt ? { pos: alt.pos, name: `${alt.name} (diverted from ${loc?.name ?? arr.locationId})` } : null;
  }
  if (arr.pos) return { pos: arr.pos, name: `${arr.pos[1].toFixed(2)}N ${arr.pos[0].toFixed(2)}E` };
  return { pos: arr.unit.pos, name: 'the front' };
}
