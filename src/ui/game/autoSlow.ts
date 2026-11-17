import type { GameState, LonLat } from '../../core/types';
import { haversineKm } from '../../core/geo';

export type ActionKind = 'contact' | 'capture' | 'unit' | 'event';
export interface ActionTrigger { kind: ActionKind; text: string; pos?: LonLat }

type Snap = Pick<GameState, 'units' | 'battles' | 'locations' | 'events' | 'objectives' | 'playerSide' | 'nations'>;

/** Compact memory of what already happened, so each moment of action is reported once. */
export interface ActMemory {
  contact: boolean;
  owners: Map<string, string>;
  down: Set<string>;     // destroyed, surrendered or routed unit ids already announced
  events: Set<string>;
}

const CONTACT_KM = 15;
const BIG_LOCATION_VALUE = 5;

/** Where first contact is happening now, if it is: a battle involving the player's units, or an enemy seen close to them. */
export function contactPos(s: Snap): LonLat | undefined {
  const mine = (id: string) => s.units[id]?.side === s.playerSide;
  for (const b of Object.values(s.battles)) if (b.attackers.some(mine) || b.defenders.some(mine)) return b.pos;
  const own = Object.values(s.units).filter(u => u.side === s.playerSide && !u.destroyed);
  for (const u of Object.values(s.units)) {
    if (u.side === s.playerSide || u.destroyed || !u.visibleTo?.includes(s.playerSide)) continue;
    if (own.some(o => haversineKm(o.pos, u.pos) <= CONTACT_KM)) return u.pos;
  }
  return undefined;
}

const isDown = (u: { destroyed?: boolean; surrendered?: boolean; combatStatus?: string }) => !!u.destroyed || !!u.surrendered || u.combatStatus === 'routed';

export function observeAct(s: Snap): ActMemory {
  const owners = new Map<string, string>();
  for (const l of Object.values(s.locations)) owners.set(l.id, l.owner);
  const down = new Set<string>();
  for (const u of Object.values(s.units)) if (isDown(u)) down.add(u.id);
  return { contact: contactPos(s) !== undefined, owners, down, events: new Set(s.events.map(e => e.id)) };
}

/** Moments worth slowing the game for, since `prev`. Updates `prev` in place so nothing is reported twice. */
export function diffAct(prev: ActMemory, s: Snap): ActionTrigger[] {
  const out: ActionTrigger[] = [];
  if (!prev.contact) {
    const p = contactPos(s);
    if (p) { prev.contact = true; out.push({ kind: 'contact', text: 'First contact with the enemy.', pos: p }); }
  }
  const objectiveLocs = new Set<string>();
  for (const o of s.objectives) { const c = o.condition as { locationId?: string }; if (c.locationId) objectiveLocs.add(c.locationId); }
  for (const l of Object.values(s.locations)) {
    const before = prev.owners.get(l.id);
    prev.owners.set(l.id, l.owner);
    if (before === undefined || before === l.owner) continue;
    if (!(l.kind === 'city' || l.value >= BIG_LOCATION_VALUE || objectiveLocs.has(l.id))) continue;
    out.push({ kind: 'capture', text: `${l.name} has changed hands and is now held by ${s.nations[l.owner]?.name ?? l.owner}.`, pos: l.pos });
  }
  for (const u of Object.values(s.units)) {
    if (!isDown(u) || prev.down.has(u.id)) continue;
    prev.down.add(u.id);
    const mine = u.side === s.playerSide;
    const verb = u.destroyed ? 'destroyed' : u.surrendered ? 'has surrendered' : 'has routed';
    out.push({ kind: 'unit', text: `${mine ? 'Our' : 'Enemy'} ${u.shortName ?? u.name} ${verb === 'destroyed' ? 'was destroyed' : verb}.`, pos: u.pos });
  }
  for (const e of s.events) {
    if (prev.events.has(e.id)) continue;
    prev.events.add(e.id);
    if (e.kind !== 'historical' || (e.side !== undefined && e.side !== s.playerSide)) continue;
    out.push({ kind: 'event', text: e.title, pos: e.pos });
  }
  return out;
}

/** One line for the toast: the first moment plus a count of the rest. */
export function summariseTriggers(t: ActionTrigger[]): { text: string; pos?: LonLat } | null {
  if (!t.length) return null;
  const rank: Record<ActionKind, number> = { capture: 0, contact: 1, event: 2, unit: 3 };
  const sorted = [...t].sort((a, b) => rank[a.kind] - rank[b.kind]);
  const first = sorted[0];
  return { text: sorted.length > 1 ? `${first.text} (and ${sorted.length - 1} more)` : first.text, pos: first.pos };
}
