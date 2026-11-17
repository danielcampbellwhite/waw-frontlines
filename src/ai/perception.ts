/**
 * AI perception layer. The AI only knows what its side could know:
 *  - enemy units currently visible (fog-of-war authority, or per-unit visibleTo cache, or a local detection radius),
 *  - remembered contacts (its own `aiState` memory plus engine `lastSeenBy` intel), decaying with age.
 * The sole exception is the veteran difficulty `intelBonusKm`.
 */
import type { GameState, LonLat, NationId, SideId, Unit, UnitId } from '../core/types';
import type { AiContext, DifficultyProfile } from './model';
import { fastKm, isAlive, unitPower } from './model';
import type { UnitType } from '../core/types';

export const CONTACT_DECAY_MIN = 24 * 60;

export interface Contact {
  id: UnitId;
  pos: LonLat;
  minutes: number;       // when last observed
  type: UnitType;
  nation: NationId;
  power: number;         // power estimated when last seen
  conf: number;          // 1 = visible now, decays to 0.15 over CONTACT_DECAY_MIN
  visible: boolean;
}

export interface StoredContact { pos: LonLat; minutes: number; type: UnitType; nation: NationId; power: number }

export interface AiMemory {
  contacts: Record<UnitId, StoredContact>;
  posture?: string;
  postureSince: number;
  postureReason: string;
  candidate?: { posture: string; since: number };
  epoch: number;
  assigned: Record<UnitId, { sig: string; t: number; epoch: number }>;
  ops: { name: string; unitIds: UnitId[]; createdAt: number }[];
  opCounter: number;
  peakPower: number;
  lastThinkAt: number;
  reinforceReq: Record<UnitId, number>;
  lastPower: number;
  thinkCount: number;
  lastCounter?: number;
  lastThrust?: number;
  staged?: Record<string, number>;
  opTargets?: Record<string, number>;
  axisGroup?: string[];
  /** armour groups (doctrine.armourGroups): group name -> unit ids; per-group thrust clock */
  armourGroups?: Record<string, string[]>;
  groupThrust?: Record<string, number>;
  /** unit id -> hold location id it was assigned to (sticky garrison) */
  garrison?: Record<string, string>;
  /** national fuel pool at the first think (reference for fuel stress) */
  fuel0?: number;
  /** minute at which a fixing attack was first ordered for a thrust destination (key: rounded lon,lat) */
  fixAt?: Record<string, number>;
}

export function getMemory(state: Readonly<GameState>, nation: NationId): AiMemory {
  const store = state.aiState as Record<string, unknown>;
  let m = store[nation] as AiMemory | undefined;
  if (!m || typeof m !== 'object' || !m.contacts) {
    m = {
      contacts: {}, postureSince: 0, postureReason: '', epoch: 0, assigned: {}, ops: [], opCounter: 0,
      peakPower: 0, lastThinkAt: -1, reinforceReq: {}, lastPower: 0, thinkCount: 0,
    };
    store[nation] = m; // the only mutation aiThink performs: its own memory slot
  }
  return m;
}

/** Base detection radius (km) of a friendly unit when no fog cache is available. */
function visionKm(u: Unit): number {
  switch (u.type) {
    case 'recon': return 28;
    case 'armoured': case 'mechanised': case 'motorised': return 16;
    case 'hq': case 'logistics': return 8;
    default: return 12;
  }
}

/**
 * Update memory from current observations and return decayed contacts for this think.
 */
export function perceive(
  state: Readonly<GameState>, nation: NationId, side: SideId, mine: Unit[], ctx: AiContext, diff: DifficultyProfile,
): { contacts: Contact[]; visibleNow: Set<UnitId> } {
  const mem = getMemory(state, nation);
  const now = state.clock.minutes;
  const fogOn = state.settings.fogOfWar;

  const enemies: Unit[] = [];
  for (const id in state.units) {
    const u = state.units[id];
    if (!isAlive(u) || u.side === side || u.side === 'neutral') continue;
    enemies.push(u);
  }

  const visibleNow = new Set<UnitId>();
  let authority: Set<UnitId> | null = null;
  if (fogOn && ctx.visibleTo) {
    authority = new Set<UnitId>();
    for (const u of ctx.visibleTo(state, side)) authority.add(u.id);
  }
  for (const e of enemies) {
    let vis: boolean;
    let noInfo = false;
    if (!fogOn) vis = true;
    else if (authority) vis = authority.has(e.id);
    else if (e.visibleTo !== undefined) vis = e.visibleTo.includes(side);
    else { vis = false; noInfo = true; }
    if (!vis && (noInfo || diff.intelBonusKm > 0)) {
      // local detection by own units: fallback when no fog cache exists, plus the veteran-only intel bonus
      for (const m of mine) {
        const r = (noInfo ? visionKm(m) : 0) + diff.intelBonusKm;
        if (fastKm(m.pos, e.pos) <= r) { vis = true; break; }
      }
    }
    if (vis) {
      visibleNow.add(e.id);
      mem.contacts[e.id] = { pos: [e.pos[0], e.pos[1]], minutes: now, type: e.type, nation: e.nation, power: unitPower(e) };
    }
  }

  // engine intel memory (lastSeenBy) for enemies we do not currently see and have no record of
  for (const e of enemies) {
    if (visibleNow.has(e.id)) continue;
    const seen = e.lastSeenBy?.[side];
    if (!seen) continue;
    const have = mem.contacts[e.id];
    if (!have || seen.minutes > have.minutes) {
      mem.contacts[e.id] = {
        pos: [seen.pos[0], seen.pos[1]], minutes: seen.minutes, type: e.type, nation: e.nation, power: have ? have.power : unitPower(e) * 0.8,
      };
    }
  }

  // decay / clear: drop old contacts; drop contacts whose last-known position our units can now see is empty
  const out: Contact[] = [];
  for (const id in mem.contacts) {
    const c = mem.contacts[id];
    const live = state.units[id];
    if (live && !isAlive(live) && !visibleNow.has(id)) {
      // casualties are reported on both sides' battle reports; forget destroyed/surrendered units
      delete mem.contacts[id];
      continue;
    }
    const age = now - c.minutes;
    if (age > CONTACT_DECAY_MIN) { delete mem.contacts[id]; continue; }
    const visible = visibleNow.has(id);
    if (!visible && age > 0) {
      let empty = false;
      for (const m of mine) if (fastKm(m.pos, c.pos) <= 6) { empty = true; break; }
      if (empty) { delete mem.contacts[id]; continue; }
    }
    const conf = visible ? 1 : Math.max(0.15, 1 - age / CONTACT_DECAY_MIN);
    out.push({ id, pos: c.pos, minutes: c.minutes, type: c.type, nation: c.nation, power: c.power, conf, visible });
  }
  return { contacts: out, visibleNow };
}
