/**
 * Supply network & logistics.
 *
 * Model (per SIDE network, recomputed every SUPPLY_INTERVAL_TICKS ticks):
 *  - Supply sources = scenario.supplySources locations currently owned by the side, plus owned depots
 *    (forward depots; captured ones run at half capacity). A source captured by the enemy stops supplying.
 *  - Road/rail InfraLines are densified into a graph; lines passing through enemy-controlled cells are cut.
 *    Rail is 4x cheaper than road to traverse; units reach the network by truck (max TRUCK_RANGE_KM, x1.5 cost).
 *  - Effective distance (km, rail-discounted) -> base supply level. Throughput limits come from line capacity
 *    (InfraLine.capacity, reduced by damage) and source capacity/stock; weather, the nation's supply-point pool
 *    and settings.logisticsDifficulty scale the result. Unreachable units are cut off.
 *  - Air/sea units use straight-line range to owned airfields/ports/sources (no network).
 */
import { bearingDeg, cellOf, gridSpec, haversineKm, type GridSpec } from '../core/geo';
import { Terrain, type GameState, type InfraLine, type Location, type LonLat, type SideId, type TerrainGrid, type Unit, type WeatherKind } from '../core/types';
import { terrainAt } from '../map/terrain';
import { templateForType } from './catalog';
import { addLog, clamp, isAlive, milSpecial, type MilitaryContext } from './context';

export const SUPPLY_INTERVAL_TICKS = 3;
export const TRUCK_RANGE_KM = 70;
export const SOURCE_SNAP_KM = 10;
export const JOIN_KM = 3;
export const DENSIFY_KM = 8;
export const RAIL_FACTOR = 0.25;
export const ROAD_FACTOR = 1;
export const TRUCK_FACTOR = 1.5;
export const MAX_EFFECTIVE_KM = 500;
/** Forward trickle: units beyond normal truck range but still connected get a thin long-haul flow (costly, so a low level). */
export const LONG_HAUL_RANGE_KM = 160;
export const LONG_HAUL_FACTOR = 3;
/** Zone of control used for encirclement detection: enemy combat units block cells within ZOC_KM unless a friendly unit holds them (HOLD_KM). */
export const ZOC_KM = 18;
export const HOLD_KM = 12;
/** Consecutive supply updates a unit must be enclosed before it counts as encircled (3 updates = 9 ticks). */
export const ENCLOSE_UPDATES = 3;
export const AIR_RANGE_KM = 400;
export const SEA_RANGE_KM = 800;
export const DEFAULT_RAIL_CAPACITY = 40;
export const DEFAULT_ROAD_CAPACITY = 12;
export const RAID_KM = 5;
/** Ground raids/shelling can degrade a facility only up to this damage level. */
export const RAID_DAMAGE_CAP = 70;
/**
 * Unit supply draw (catalog supplyDraw, "points per tick") is scaled to network throughput units so that a
 * full OOB (~120 units) needs roughly a third of the default source capacities in quiet periods.
 */
export const DEMAND_SCALE = 0.15;
/** Fraction of network demand also charged to the nation's supplyPoints stockpile (income ~5/tick vs ~5 idle for a full German OOB (a pool lasts weeks, not days, once units fight)). */
export const POOL_DRAW_SCALE = 0.08;
/** Air/naval units sitting idle at base draw only this fraction of their catalog supply (fuel/ammo for sorties are drawn separately). */
export const AIR_IDLE_DRAW = 0.25;

/** Game-scale conversion: tonnes of supplies per "supply point" (1 point/tick = 24 points/day). Documented so scenario
 *  tonnage (e.g. 680 t/day Stalingrad requirement, Tobruk 1,500 t/day) maps onto network throughput. */
export const TONS_PER_POINT = 4;
export const AIRLIFT_POCKET_KM = 40;
/** Airlift never restores full supply: a fully served pocket tops out at this supply level. */
export const AIRLIFT_MAX_LEVEL = 45;
export const AIRLIFT_REFILL_SHARE = 0.5;
export const BESIEGE_KM = 30;
export const BESIEGED_RELIEF_SHARE = 0.3;

const ext = (l: Location): Location => l;

const WEATHER_BASE: Record<WeatherKind, number> = {
  clear: 1, cloud: 1, rain: 0.9, storm: 0.7, snow: 0.75, fog: 0.95, mud: 0.65, sandstorm: 0.75,
};

export function weatherSupplyFactor(state: GameState): number {
  const w = state.weather;
  const i = clamp(w.intensity > 1 ? w.intensity / 100 : w.intensity, 0, 1);
  return 1 - (1 - (WEATHER_BASE[w.kind] ?? 1)) * i;
}

// ───────────────────────────── graph ─────────────────────────────

interface Edge { to: number; km: number; line: string; kind: 'road' | 'rail' }
interface Graph {
  pos: LonLat[];
  adj: Edge[][];
  hash: Map<number, number[]>;
  lineKind: Map<string, 'road' | 'rail'>;
  lineCap: Map<string, number>;
  cellCache: Map<string, Int32Array>;
  nets: Map<string, SideNet>;
  /** CSR copy of `adj` (same edge order) for the hot Dijkstra loop. */
  csr?: Csr;
}

interface Csr { start: Int32Array; to: Int32Array; km: Float64Array; rail: Uint8Array; line: Int32Array; lineIds: string[]; lineIndex: Map<string, number> }

function csrOf(g: Graph): Csr {
  if (g.csr) return g.csr;
  const N = g.pos.length;
  const start = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) start[i + 1] = start[i] + g.adj[i].length;
  const M = start[N];
  const to = new Int32Array(M), km = new Float64Array(M), rail = new Uint8Array(M), line = new Int32Array(M);
  const lineIds = [''], lineIndex = new Map<string, number>([['', 0]]);
  let k = 0;
  for (let i = 0; i < N; i++) {
    for (const e of g.adj[i]) {
      let li = lineIndex.get(e.line);
      if (li === undefined) { li = lineIds.length; lineIds.push(e.line); lineIndex.set(e.line, li); }
      to[k] = e.to; km[k] = e.km; rail[k] = e.kind === 'rail' ? 1 : 0; line[k] = li; k++;
    }
  }
  g.csr = { start, to, km, rail, line, lineIds, lineIndex };
  return g.csr;
}

/** Cached land-unit assignment; `trickleEnemy` records inEnemyCell when the long-haul branch ran (undefined if it did not). */
interface UnitAssign { x: number; y: number; eff: number; src: number; node: number; trickleEnemy?: boolean }

interface SideNet {
  sig: string; dist: Float64Array; root: Int32Array; prevNode: Int32Array; prevLine: Int32Array; lineIds: string[];
  /** Pure functions of (net, position): land-unit assignment by unit id, and path line lists by node. */
  unitCache: Map<string, UnitAssign>;
  pathCache: Map<number, string[]>;
}

const BIN = 0.1;
const binKey = (x: number, y: number) => (x + 4096) * 16384 + (y + 4096);
const binOf = (v: number) => Math.floor(v / BIN);

function hashAdd(h: Map<number, number[]>, p: LonLat, i: number): void {
  const k = binKey(binOf(p[0]), binOf(p[1]));
  const a = h.get(k);
  if (a) a.push(i); else h.set(k, [i]);
}

function hashNear(h: Map<number, number[]>, p: LonLat, radiusKm: number, out: number[] = []): number[] {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.max(0.2, Math.cos((p[1] * Math.PI) / 180)));
  for (let x = binOf(p[0] - dLon); x <= binOf(p[0] + dLon); x++) {
    for (let y = binOf(p[1] - dLat); y <= binOf(p[1] + dLat); y++) {
      const a = h.get(binKey(x, y));
      if (a) for (const i of a) out.push(i);
    }
  }
  return out;
}

const graphCache = new WeakMap<InfraLine[], Graph>();

function buildGraph(infra: InfraLine[]): Graph {
  const cached = graphCache.get(infra);
  if (cached) return cached;
  const g: Graph = { pos: [], adj: [], hash: new Map(), lineKind: new Map(), lineCap: new Map(), cellCache: new Map(), nets: new Map() };
  const lineOfNode: string[] = [];
  const addNode = (p: LonLat, line: string): number => {
    const i = g.pos.length;
    g.pos.push(p); g.adj.push([]); lineOfNode.push(line);
    hashAdd(g.hash, p, i);
    return i;
  };
  for (const ln of infra) {
    if (ln.kind !== 'road' && ln.kind !== 'rail') continue;
    if (ln.coords.length < 2) continue;
    g.lineKind.set(ln.id, ln.kind);
    g.lineCap.set(ln.id, ln.capacity ?? (ln.kind === 'rail' ? DEFAULT_RAIL_CAPACITY : DEFAULT_ROAD_CAPACITY));
    let prev = addNode(ln.coords[0], ln.id);
    for (let i = 1; i < ln.coords.length; i++) {
      const a = ln.coords[i - 1], b = ln.coords[i];
      const d = haversineKm(a, b);
      const segs = Math.max(1, Math.ceil(d / DENSIFY_KM));
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const p: LonLat = s === segs ? [b[0], b[1]] : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const n = addNode(p, ln.id);
        const km = d / segs;
        g.adj[prev].push({ to: n, km, line: ln.id, kind: ln.kind });
        g.adj[n].push({ to: prev, km, line: ln.id, kind: ln.kind });
        prev = n;
      }
    }
  }
  // Junctions between different lines.
  const near: number[] = [];
  for (let i = 0; i < g.pos.length; i++) {
    near.length = 0;
    hashNear(g.hash, g.pos[i], JOIN_KM, near);
    for (const j of near) {
      if (j <= i || lineOfNode[j] === lineOfNode[i]) continue;
      const km = haversineKm(g.pos[i], g.pos[j]);
      if (km > JOIN_KM) continue;
      g.adj[i].push({ to: j, km, line: '', kind: 'road' });
      g.adj[j].push({ to: i, km, line: '', kind: 'road' });
    }
  }
  graphCache.set(infra, g);
  return g;
}

/** Reusable binary min-heap on typed arrays (same sift rules as before, so equal keys pop in the same order). */
class MinHeap {
  private k = new Float64Array(1024);
  private v = new Int32Array(1024);
  n = 0;
  get size() { return this.n; }
  reset(): void { this.n = 0; }
  push(key: number, val: number): void {
    if (this.n === this.k.length) {
      const k2 = new Float64Array(this.n * 2); k2.set(this.k); this.k = k2;
      const v2 = new Int32Array(this.n * 2); v2.set(this.v); this.v = v2;
    }
    const k = this.k, v = this.v;
    let i = this.n++;
    k[i] = key; v[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      const tk = k[p], tv = v[p]; k[p] = k[i]; v[p] = v[i]; k[i] = tk; v[i] = tv;
      i = p;
    }
  }
  popKey = 0;
  popVal = 0;
  pop(): void {
    const k = this.k, v = this.v;
    this.popKey = k[0]; this.popVal = v[0];
    const last = --this.n;
    if (last > 0) {
      k[0] = k[last]; v[0] = v[last];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < last && k[l] < k[m]) m = l;
        if (r < last && k[r] < k[m]) m = r;
        if (m === i) break;
        const tk = k[m], tv = v[m]; k[m] = k[i]; v[m] = v[i]; k[i] = tk; v[i] = tv;
        i = m;
      }
    }
  }
}
const sharedHeap = new MinHeap();

// ───────────────────────────── sources ─────────────────────────────

/** `sea`: supplied across water (an overseas port or beach depot of a theatre with embarkation ports), so units on the shore are not cut off by a land ring. */
export interface SupplySource { loc: Location; capacity: number; listed: boolean; sea?: boolean }

const DEFAULT_SRC_CAP: Partial<Record<Location['kind'], number>> = { depot: 40, port: 60, city: 30, town: 15, airfield: 20, fortress: 15 };

function sideOfNation(state: GameState, n: string): SideId | undefined {
  return state.nations[n]?.side;
}

/** Is this owned port encircled: enemy land units in at least three of the four quadrants within BESIEGE_KM. */
export function isPortBesieged(state: GameState, loc: Location): boolean {
  const side = sideOfNation(state, loc.owner);
  const q = [false, false, false, false];
  for (const u of Object.values(state.units)) {
    if (!isAlive(u) || u.domain !== 'land' || u.side === side || u.side === 'neutral' || u.combatStatus === 'routed') continue;
    if (Math.abs(u.pos[1] - loc.pos[1]) > 0.5 || Math.abs(u.pos[0] - loc.pos[0]) > 0.8) continue;
    if (haversineKm(u.pos, loc.pos) > BESIEGE_KM) continue;
    const b = bearingDeg(loc.pos, u.pos);
    q[Math.floor(((b + 45) % 360) / 90)] = true;
  }
  return q.filter(Boolean).length >= 3;
}

/** Port tonnage cap in supply points per tick (or `base` when the port has no cap data). */
function portPoints(state: GameState, loc: Location, base: number, seaRelieved = false): number {
  if (loc.kind !== 'port') return base;
  const e = ext(loc);
  const tpd = e.throughputTonsPerDay ?? (e.throughputTonsPerMonth !== undefined ? e.throughputTonsPerMonth / 30 : undefined);
  if (tpd === undefined) return base;
  let pts = tpd / (TONS_PER_POINT * 24);
  if (isPortBesieged(state, loc)) pts *= milSpecial(state).portRelief[loc.id] || seaRelieved ? (e.besiegedShare ?? BESIEGED_RELIEF_SHARE) : 0;
  return pts;
}

/** Events / sim: mark a besieged port as relieved by sea (keeps a share of its throughput). */
export function setPortRelief(state: GameState, locationId: string, relieved: boolean): void {
  const r = milSpecial(state).portRelief;
  if (relieved) r[locationId] = true; else delete r[locationId];
}

const AIRLIFT_WEATHER: Record<WeatherKind, number> = { clear: 1, cloud: 1, rain: 0.8, storm: 0.3, snow: 0.6, fog: 0.5, mud: 0.9, sandstorm: 0.3 };

/** Fraction (0..1) of its demand a cut-off unit received by airlift at the last supply update. */
export function airliftFraction(state: GameState, unitId: string): number {
  return milSpecial(state).airlift[unitId] ?? 0;
}

const RAMP_FLOOR = 0.1;

/**
 * 0..1 usability of a location right now: 0 before its availableFromHour (temporary ports, beach depots), a linear
 * ramp-up over rampHours (from availability, or from capture for a port taken from the enemy), times any temporary
 * throughput factor set by events (storm damage, repair). Expired modifiers are dropped.
 */
export function locationAvailability(state: GameState, loc: Location): number {
  const sp = milSpecial(state), now = state.clock.minutes, e = ext(loc);
  const ov = sp.availability[loc.id];
  const fromH = ov ? ov.fromMinutes / 60 : e.availableFromHour;
  const ramp = ov ? ov.rampHours : e.rampHours ?? 0;
  let start = fromH === undefined ? -Infinity : fromH * 60;
  if (ramp > 0 && sideOfNation(state, loc.owner) !== sideOfNation(state, loc.originalOwner)) {
    const cap = sp.capturedAt[loc.id];
    if (cap !== undefined) start = Math.max(start, cap);
  }
  let f = 1;
  if (now < start) f = 0;
  else if (ramp > 0 && start > -Infinity) f = Math.min(1, RAMP_FLOOR + (1 - RAMP_FLOOR) * ((now - start) / (ramp * 60)));
  const m = sp.portMods[loc.id];
  if (m) {
    if (m.untilMinutes === undefined || now < m.untilMinutes) f *= clamp(m.factor, 0, 1);
  }
  return f;
}

/** Events: scale a location's throughput by `factor` (0 wrecks it) for `hours` game hours, or until reset when hours is omitted. factor >= 1 clears it. */
export function setLocationThroughputFactor(state: GameState, locationId: string, factor: number, hours?: number): void {
  const mods = milSpecial(state).portMods;
  if (factor >= 1) { delete mods[locationId]; return; }
  mods[locationId] = { factor: Math.max(0, factor), untilMinutes: hours === undefined ? undefined : state.clock.minutes + hours * 60 };
}

/** Events/scenario: the location is unusable until `fromHour`, then ramps to full over `rampHours` (default none). */
export function setLocationAvailableFrom(state: GameState, locationId: string, fromHour: number, rampHours = 0): void {
  milSpecial(state).availability[locationId] = { fromMinutes: fromHour * 60, rampHours };
}

export interface PortStatus {
  locationId: string;
  /** Current daily unloading capacity in tonnes (0 when not operational). */
  tonsPerDay: number;
  /** Tonnes served from this port so far on the current game day. */
  usedTodayTons: number;
  remainingTonsToday: number;
  /** Owned by a side, not wrecked (damage < 95), available (temporary port online, throughput factor > 0) and not besieged without sea relief. */
  operational: boolean;
  /** 0..1 availability factor (temporary port ramp-up, storm damage / repair). */
  availability: number;
  besieged: boolean;
}

/**
 * Read-only port state for the AI. Pure and deterministic: never mutates state. tonsPerDay comes from the last supply
 * update's source throughput when the port is a source; before the first update (or if it is not a source) it is
 * estimated from the location's own data (throughput cap, damage, availability).
 */
export function portCapacity(state: GameState, locationId: string): PortStatus | null {
  const loc = state.locations[locationId];
  if (!loc || loc.kind !== 'port') return null;
  const side = sideOfNation(state, loc.owner);
  const availability = locationAvailability(state, loc);
  const besieged = isPortBesieged(state, loc);
  const e = ext(loc);
  const hasCap = e.throughputTonsPerDay !== undefined || e.throughputTonsPerMonth !== undefined;
  const ownable = side === 'allies' || side === 'axis';
  const wrecked = (loc.damaged ?? 0) >= 95;
  const cutOffBySiege = besieged && hasCap && !milSpecial(state).portRelief[loc.id];
  const operational = ownable && !wrecked && availability > 0 && !cutOffBySiege;
  let tonsPerDay = 0;
  if (operational) {
    const node = state.supply.nodes.find(n => n.locationId === locationId);
    if (node) tonsPerDay = node.throughput * TONS_PER_POINT * 24;
    else {
      const base = (loc.supplyCapacity ?? DEFAULT_SRC_CAP.port ?? 60) * TONS_PER_POINT * 24;
      const tpd = e.throughputTonsPerDay ?? (e.throughputTonsPerMonth !== undefined ? e.throughputTonsPerMonth / 30 : base);
      tonsPerDay = tpd * availability * (1 - (loc.damaged ?? 0) / 100) * (besieged ? e.besiegedShare ?? BESIEGED_RELIEF_SHARE : 1);
    }
  }
  const pu = milSpecial(state).portUse[locationId];
  const used = pu && pu.day === Math.floor(state.clock.minutes / 1440) ? pu.tons : 0;
  return { locationId, tonsPerDay, usedTodayTons: used, remainingTonsToday: Math.max(0, tonsPerDay - used), operational, availability, besieged };
}

/** Operational ports owned by `side`, sorted by location id (deterministic). */
export function operationalPorts(state: GameState, side: SideId): PortStatus[] {
  const out: PortStatus[] = [];
  for (const id of Object.keys(state.locations).sort()) {
    const loc = state.locations[id];
    if (loc.kind !== 'port' || sideOfNation(state, loc.owner) !== side) continue;
    const st = portCapacity(state, id);
    if (st?.operational) out.push(st);
  }
  return out;
}


/** A location captured from another side runs at half capacity for this long (minutes). */
export const CAPTURE_PENALTY_MINUTES = 14 * 24 * 60;

function capturePenalty(state: GameState, loc: Location, side: SideId): number {
  if (sideOfNation(state, loc.originalOwner) === side) return 1;
  if ((milSpecial(state).availability[loc.id]?.rampHours ?? ext(loc).rampHours ?? 0) > 0) return 1; // ramp-up replaces the flat penalty
  const at = milSpecial(state).capturedAt[loc.id];
  return at === undefined || state.clock.minutes - at < CAPTURE_PENALTY_MINUTES ? 0.5 : 1;
}

/**
 * Supply sources currently usable by `side`:
 *  - scenario.supplySources locations owned by ANY nation of the side (allies share ports, e.g. BEF via French ports);
 *  - owned depots (forward depots);
 *  - every owned port, once the side holds at least one listed port source (port-to-port sea supply at port throughput).
 * Recently captured locations run at half capacity.
 */
export function sourcesForSide(state: GameState, ctx: Pick<MilitaryContext, 'scenario'>, side: SideId): SupplySource[] {
  const diff = Math.max(0.25, state.settings.logisticsDifficulty);
  const out = new Map<string, SupplySource>();
  // Overseas ports of a theatre with embarkation ports (listed ports 100+ km away, tonnage data present) always have the sea behind them.
  const embark: Location[] = [];
  for (const [nation, ids] of Object.entries(ctx.scenario.supplySources ?? {})) {
    if (sideOfNation(state, nation) !== side) continue;
    for (const id of ids) { const l = state.locations[id]; if (l && l.kind === 'port' && sideOfNation(state, l.owner) === side) embark.push(l); }
  }
  const seaRelieved = (loc: Location): boolean => {
    const e = ext(loc);
    return embark.length > 0 && loc.kind === 'port' && (e.throughputTonsPerDay !== undefined || e.throughputTonsPerMonth !== undefined) && embark.every(l => l.id !== loc.id && haversineKm(l.pos, loc.pos) >= SEA_LINK_MIN_KM);
  };
  const make = (loc: Location, listed: boolean, base0: number) => {
    const base = portPoints(state, loc, base0, seaRelieved(loc));
    out.set(loc.id, { loc, capacity: (base * capturePenalty(state, loc, side) * (1 - (loc.damaged ?? 0) / 100) * locationAvailability(state, loc)) / diff, listed });
  };
  const usable = (loc: Location | undefined): loc is Location =>
    !!loc && sideOfNation(state, loc.owner) === side && (loc.damaged ?? 0) < 95 && locationAvailability(state, loc) > 0;
  const ss = ctx.scenario.supplySources ?? {};
  for (const [nation, ids] of Object.entries(ss)) {
    if (sideOfNation(state, nation) !== side) continue;
    for (const id of ids) {
      const loc = state.locations[id];
      if (usable(loc)) make(loc, true, loc.supplyCapacity ?? DEFAULT_SRC_CAP[loc.kind] ?? 20);
    }
  }
  for (const loc of Object.values(state.locations)) {
    if (loc.kind === 'depot' && !out.has(loc.id) && usable(loc)) make(loc, false, loc.supplyCapacity ?? DEFAULT_SRC_CAP.depot ?? 40);
  }
  const hasListedPort = [...out.values()].some(s => s.listed && s.loc.kind === 'port');
  if (hasListedPort) {
    for (const loc of Object.values(state.locations)) {
      if (loc.kind === 'port' && !out.has(loc.id) && usable(loc)) make(loc, false, loc.supplyCapacity ?? DEFAULT_SRC_CAP.port ?? 60);
    }
  }
  seaLinkCap(state, [...out.values()]);
  return [...out.values()];
}

const coastCache = new WeakMap<object, Map<string, boolean>>();
/** A location within ~3 km of open water (terrain sea/lake cell at the point or a ring around it). */
function isCoastal(terrain: TerrainGrid, loc: Location): boolean {
  let m = coastCache.get(terrain);
  if (!m) { m = new Map(); coastCache.set(terrain, m); }
  const hit = m.get(loc.id);
  if (hit !== undefined) return hit;
  const water = (p: LonLat) => { const t = terrainAt(terrain, p); return t === Terrain.Sea || t === Terrain.Lake; };
  const dLat = 3 / 111, dLon = 3 / (111 * Math.max(0.2, Math.cos((loc.pos[1] * Math.PI) / 180)));
  let r = water(loc.pos);
  for (let i = 0; i < 8 && !r; i++) { const a = (i * Math.PI) / 4; r = water([loc.pos[0] + Math.cos(a) * dLon, loc.pos[1] + Math.sin(a) * dLat]); }
  m.set(loc.id, r);
  return r;
}
const SEA_SHORE_KM = 20;

/** Shore position: the unit stands within SEA_SHORE_KM of an own coastal sea-fed source. */
function onSeaSuppliedShore(u: Unit, sources: SupplySource[], terrain: TerrainGrid): boolean {
  for (const s of sources) {
    if (!s.sea || s.capacity <= 0) continue;
    if (haversineKm(u.pos, s.loc.pos) <= SEA_SHORE_KM && isCoastal(terrain, s.loc)) return true;
  }
  return false;
}

/** Pure read for the sim's isolation test: the unit stands on a shore supplied by sea (within 20 km of an own coastal sea-fed source). */
export function isSeaSupplied(state: GameState, ctx: Pick<MilitaryContext, 'scenario' | 'terrain'>, u: Unit): boolean {
  if (u.side !== 'allies' && u.side !== 'axis') return false;
  const sources = sourcesForSide(state, ctx, u.side);
  return sources.some(x => x.sea) && onSeaSuppliedShore(u, sources, ctx.terrain);
}

const SEA_LINK_MIN_KM = 100;
const SEA_WEATHER: Record<WeatherKind, number> = { clear: 1, cloud: 1, rain: 0.85, storm: 0.15, snow: 0.8, fog: 0.9, mud: 1, sandstorm: 0.8 };

/** Sea-fed ports (unlisted ports 100+ km from every listed port) share the embarkation ports' throughput, and storms slow unloading. Only when those ports carry tonnage data. */
function seaLinkCap(state: GameState, srcs: SupplySource[]): void {
  const listed = srcs.filter(s => s.listed && s.loc.kind === 'port');
  if (!listed.length) return;
  const far = srcs.filter(s => !s.listed && listed.every(l => haversineKm(l.loc.pos, s.loc.pos) >= SEA_LINK_MIN_KM));
  const sea = far.filter(s => s.loc.kind === 'port');
  // Active only for a theatre that models an overseas landing: a not-listed, overseas port/depot of this side carries tonnage or availability data (even if it is not open yet).
  const listedIds = new Set(listed.map(s => s.loc.id));
  const side = sideOfNation(state, listed[0].loc.owner);
  const overseas = Object.values(state.locations).some(l => (l.kind === 'port' || l.kind === 'depot') && !listedIds.has(l.id) && sideOfNation(state, l.owner) === side
    && (ext(l).throughputTonsPerDay !== undefined || ext(l).throughputTonsPerMonth !== undefined || ext(l).availableFromHour !== undefined)
    && listed.every(x => haversineKm(x.loc.pos, l.pos) >= SEA_LINK_MIN_KM));
  if (!overseas) return;
  for (const s of far) s.sea = true;
  const w = state.weather, i = clamp(w.intensity > 1 ? w.intensity / 100 : w.intensity, 0, 1);
  const wf = 1 - (1 - (SEA_WEATHER[w.kind] ?? 1)) * i;
  const pool = listed.reduce((a, s) => a + s.capacity, 0);
  const total = sea.reduce((a, s) => a + s.capacity * wf, 0);
  const scale = total > pool ? pool / total : 1;
  for (const s of sea) s.capacity *= wf * scale;
}

// ───────────────────────────── supply update ─────────────────────────────

interface Assign {
  u: Unit; eff: number; src: number; node: number; demand: number; lines: string[]; air: boolean;
}

function unitDemand(u: Unit): number {
  const tpl = templateForType(u.type);
  const fighting = u.inBattle || u.combatStatus === 'attacking' || u.combatStatus === 'defending';
  const idleBase = u.domain === 'land' ? 1 : AIR_IDLE_DRAW; // aircraft/ships at base are cheap; sorties/steaming cost full
  const mult = fighting ? 1.5 : u.moveStatus !== 'stationary' ? 1.3 : idleBase;
  const strength = u.manpowerMax > 0 ? clamp(u.manpower / u.manpowerMax, 0.3, 1) : 1;
  return tpl.supplyDraw * mult * strength * DEMAND_SCALE;
}

export function supplyLevelFromDistance(effKm: number): number {
  return 100 - clamp((effKm - 40) / (MAX_EFFECTIVE_KM - 40), 0, 1) * 75;
}

function lineDamageOf(state: GameState, line: string): number {
  return milSpecial(state).lineDamage[line] ?? 0;
}

const regionCache = new Map<string, { sig: string; mask: Uint8Array }>();

/**
 * Cells reachable from the side's sources without crossing enemy-controlled cells (4-connected flood fill, so a ring of
 * enemy cells that touches only diagonally still closes). Units outside this region are enclosed and cut off even if a
 * supply node lies within truck range.
 */
function sideRegion(state: GameState, side: SideId, sources: SupplySource[], cg: GridSpec): Uint8Array | null {
  const ctl = state.control;
  const total = ctl.cols * ctl.rows;
  if (!sources.length || ctl.owner.length !== total) return null;
  // Zone of control from units (so a thin ring of units closes before territory ownership flips).
  const zoc = new Uint8Array(total), hold = new Uint8Array(total);
  const stamp = (arr: Uint8Array, pos: LonLat, km: number) => {
    const c = cellOf(cg, pos);
    if (!c) return;
    const kmLat = 111.2 * cg.cellDeg, kmLon = Math.max(1, 111.2 * Math.cos((pos[1] * Math.PI) / 180)) * cg.cellDeg;
    const dr = Math.ceil(km / kmLat), dc = Math.ceil(km / kmLon);
    for (let r = Math.max(0, c[1] - dr); r <= Math.min(cg.rows - 1, c[1] + dr); r++) {
      for (let q = Math.max(0, c[0] - dc); q <= Math.min(cg.cols - 1, c[0] + dc); q++) {
        const ex = (q - c[0]) * kmLon, ey = (r - c[1]) * kmLat;
        if (ex * ex + ey * ey <= km * km || (q === c[0] && r === c[1])) arr[r * cg.cols + q] = 1;
      }
    }
  };
  for (const u of Object.values(state.units)) {
    if (!isAlive(u) || u.domain !== 'land' || u.side === 'neutral' || u.combatStatus === 'routed') continue;
    if (u.side === side) stamp(hold, u.pos, HOLD_KM);
    else if (u.type !== 'logistics' && u.type !== 'hq') stamp(zoc, u.pos, ZOC_KM);
  }
  // Cells a hostile zone of control closes (and no friendly unit holds).
  const blk = zoc;
  let zh = 2166136261;
  for (let i = 0; i < total; i++) { const v = zoc[i] & ~hold[i]; blk[i] = v; zh = Math.imul(zh ^ v, 16777619); }
  const sig = `${sources.map(x => x.loc.id).join(',')}|${zh}`;
  const key = `${side}:${ctl.cols}x${ctl.rows}`;
  const hit = regionCache.get(key);
  if (hit && hit.sig === sig) return hit.mask;
  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qt = 0;
  for (const s of sources) {
    const c = cellOf(cg, s.loc.pos);
    if (!c) continue;
    const i = c[1] * ctl.cols + c[0];
    if (!mask[i]) { mask[i] = 1; queue[qt++] = i; }
  }
  const cols = ctl.cols;
  for (let qh = 0; qh < qt; qh++) {
    const i = queue[qh];
    const x = i % cols;
    // unit zones of control only: initial/painted ownership can be unreliable
    if (x > 0 && !mask[i - 1] && !blk[i - 1]) { mask[i - 1] = 1; queue[qt++] = i - 1; }
    if (x < cols - 1 && !mask[i + 1] && !blk[i + 1]) { mask[i + 1] = 1; queue[qt++] = i + 1; }
    if (i >= cols && !mask[i - cols] && !blk[i - cols]) { mask[i - cols] = 1; queue[qt++] = i - cols; }
    if (i < total - cols && !mask[i + cols] && !blk[i + cols]) { mask[i + cols] = 1; queue[qt++] = i + cols; }
  }
  regionCache.set(key, { sig, mask });
  return mask;
}

/** True when the unit stands in a cell owned by a hostile side (no truck columns through enemy territory). */
function inEnemyCell(state: GameState, u: Unit, cg: GridSpec): boolean {
  const c = cellOf(cg, u.pos);
  if (!c) return false;
  const nat = state.control.nations[state.control.owner[c[1] * state.control.cols + c[0]]];
  const sd = nat ? sideOfNation(state, nat) : undefined;
  return !!sd && sd !== 'neutral' && sd !== u.side;
}

function inRegion(mask: Uint8Array | null, pos: LonLat, cg: GridSpec): boolean {
  if (!mask) return true;
  const c = cellOf(cg, pos);
  return !c || mask[c[1] * cg.cols + c[0]] === 1;
}

function nodeCells(graph: Graph, control: GameState['control'], cg: GridSpec): Int32Array {
  const key = `${control.bbox.west},${control.bbox.north},${control.cellDeg},${control.cols},${control.rows}`;
  let arr = graph.cellCache.get(key);
  if (!arr) {
    arr = new Int32Array(graph.pos.length);
    for (let i = 0; i < arr.length; i++) {
      const c = cellOf(cg, graph.pos[i]);
      arr[i] = c ? c[1] * control.cols + c[0] : -1;
    }
    graph.cellCache.set(key, arr);
  }
  return arr;
}

const MIN_HAUL_FACTOR = Math.min(TRUCK_FACTOR, LONG_HAUL_FACTOR);
const MAX_CARRY_CHANGED = 1500;

/**
 * Keep the previous net's land-unit assignments that the rebuild provably cannot change: a unit's assignment is a
 * minimum over nearby nodes of dist + haul*factor, so it only changes if a node whose dist/root changed could have
 * beaten (or tied) its current best. The source list must be unchanged (root indices refer to it). Anything else (including long-haul trickle where the enemy-cell test flipped) is dropped.
 */
function carryUnitCache(state: GameState, graph: Graph, old: SideNet | undefined, dist: Float64Array, root: Int32Array, cg: GridSpec): Map<string, UnitAssign> {
  const out = new Map<string, UnitAssign>();
  if (!old || old.dist.length !== dist.length || !old.unitCache.size) return out;
  const changed: number[] = [];
  for (let n = 0; n < dist.length; n++) {
    if (dist[n] !== old.dist[n] || root[n] !== old.root[n]) { changed.push(n); if (changed.length > MAX_CARRY_CHANGED) return out; }
  }
  for (const [id, e] of old.unitCache) {
    const u = state.units[id];
    if (!u || u.pos[0] !== e.x || u.pos[1] !== e.y) continue;
    if (e.trickleEnemy !== undefined && e.trickleEnemy !== inEnemyCell(state, u, cg)) continue;
    const cosLat = Math.cos((e.y * Math.PI) / 180);
    let ok = true;
    for (let i = 0; i < changed.length; i++) {
      const n = changed[i];
      const d = Math.min(dist[n], old.dist[n]);
      const q = graph.pos[n];
      const ay = (q[1] - e.y) * 111.2, ax = (q[0] - e.x) * 111.2 * cosLat;
      const km = Math.sqrt(ax * ax + ay * ay) * 0.99;
      if (km > LONG_HAUL_RANGE_KM) continue;
      if (d + km * MIN_HAUL_FACTOR <= e.eff || e.eff === Infinity) { ok = false; break; }
    }
    if (ok) out.set(id, e);
  }
  return out;
}

/** Multi-source Dijkstra for one side; cached on the graph until sources, damage or control (at network nodes) change. */
function sideNet(state: GameState, graph: Graph, side: SideId, sources: SupplySource[], nodeCell: Int32Array, cg: GridSpec): SideNet {
  const N = graph.pos.length;
  const owner = state.control.owner;
  const ukey = `u${state.control.bbox.west},${state.control.bbox.north},${state.control.cellDeg},${state.control.cols}`;
  let uniq = graph.cellCache.get(ukey);
  if (!uniq) {
    uniq = Int32Array.from(new Set(nodeCell));
    graph.cellCache.set(ukey, uniq);
  }
  const nat = state.control.nations;
  const blockedIdx = nat.map(n => { const sd = sideOfNation(state, n); return !!sd && sd !== 'neutral' && sd !== side; });
  // Only hostile-vs-not matters to the network, so hash the blocked flag (same-side or neutral flips do not rebuild).
  let h = 2166136261;
  for (let i = 0; i < uniq.length; i++) {
    const c = uniq[i];
    h = Math.imul(h ^ (c < 0 ? 2 : blockedIdx[owner[c]] ? 1 : 0), 16777619);
  }
  const sig = `${sources.map(x => x.loc.id).join(',')}|${JSON.stringify(milSpecial(state).lineDamage)}|${blockedIdx.map(Number).join('')}|${h}`;
  const hit = graph.nets.get(side);
  if (hit && hit.sig === sig) return hit;

  const csr = csrOf(graph);
  const dist = new Float64Array(N).fill(Infinity);
  const root = new Int32Array(N).fill(-1);
  const prevNode = new Int32Array(N).fill(-1);
  const prevLine = new Int32Array(N);
  const blockedNode = new Uint8Array(N);
  for (let n = 0; n < N; n++) { const c = nodeCell[n]; blockedNode[n] = c >= 0 && blockedIdx[owner[c]] ? 1 : 0; }
  void cg;
  const heap = sharedHeap;
  heap.reset();
  sources.forEach((s, si) => {
    for (const n of hashNear(graph.hash, s.loc.pos, SOURCE_SNAP_KM)) {
      const d = haversineKm(s.loc.pos, graph.pos[n]);
      if (d > SOURCE_SNAP_KM || blockedNode[n]) continue;
      const c = d * ROAD_FACTOR;
      if (c < dist[n]) { dist[n] = c; root[n] = si; heap.push(c, n); }
    }
  });
  const dmgOf = milSpecial(state).lineDamage;
  const lineDmg = new Float64Array(csr.lineIds.length);
  for (const id of Object.keys(dmgOf)) { const li = csr.lineIndex.get(id); if (li !== undefined) lineDmg[li] = dmgOf[id] ?? 0; }
  const { start, to, km, rail, line } = csr;
  while (heap.size) {
    heap.pop();
    const d = heap.popKey, n = heap.popVal;
    if (d > dist[n]) continue;
    for (let ei = start[n], ee = start[n + 1]; ei < ee; ei++) {
      const li = line[ei];
      let dmg = 0;
      if (li) { dmg = lineDmg[li]; if (dmg >= 80) continue; }
      const t = to[ei];
      if (blockedNode[t]) continue;
      const c = d + km[ei] * (rail[ei] ? RAIL_FACTOR : ROAD_FACTOR) * (1 + dmg / 50);
      if (c < dist[t]) { dist[t] = c; root[t] = root[n]; prevNode[t] = n; prevLine[t] = li; heap.push(c, t); }
    }
  }
  const net: SideNet = { sig, dist, root, prevNode, prevLine, lineIds: csr.lineIds, unitCache: carryUnitCache(state, graph, hit && hit.sig.slice(0, hit.sig.indexOf('|')) === sig.slice(0, sig.indexOf('|')) ? hit : undefined, dist, root, cg), pathCache: new Map() };
  graph.nets.set(side, net);
  return net;
}

export function updateSupply(state: GameState, ctx: MilitaryContext): void {
  const sp = milSpecial(state);
  const graph = buildGraph(ctx.infra);
  const diffRaw = state.settings.logisticsDifficulty;
  const diffDist = Math.max(0.1, diffRaw);
  const weather = weatherSupplyFactor(state);
  const interval = SUPPLY_INTERVAL_TICKS;
  const cg: GridSpec = gridSpec(state.control.bbox, state.control.cellDeg);
  const units = Object.values(state.units).filter(isAlive);

  // Location damage: capture, raids, repair.
  for (const id of Object.keys(sp.portMods)) { const m = sp.portMods[id]; if (m.untilMinutes !== undefined && state.clock.minutes >= m.untilMinutes) delete sp.portMods[id]; }
  updateLocationDamage(state, units, sp.lastOwner, sp.capturedAt);
  updateLineRepair(state);

  const assigns: Assign[] = [];
  const nodesOut: GameState['supply']['nodes'] = [];
  const srcFactor = new Map<string, number>();       // `${side}:${locId}` -> served fraction
  const perSide: Record<string, { sources: SupplySource[]; region: Uint8Array | null } & SideNet> = {};

  const nodeCell = nodeCells(graph, state.control, cg);
  for (const side of ['allies', 'axis'] as SideId[]) {
    const sources = sourcesForSide(state, ctx, side);
    perSide[side] = { sources, region: sideRegion(state, side, sources, cg), ...sideNet(state, graph, side, sources, nodeCell, cg) };
  }

  // Airfield / port bases per side, with the nearest source precomputed once (not per unit).
  interface Base { loc: Location; nearest: number; nd: number }
  const bases: { air: Record<string, Base[]>; sea: Record<string, Base[]> } = { air: { allies: [], axis: [] }, sea: { allies: [], axis: [] } };
  for (const loc of Object.values(state.locations)) {
    const sd = sideOfNation(state, loc.owner);
    if (sd !== 'allies' && sd !== 'axis') continue;
    if ((loc.kind !== 'airfield' && loc.kind !== 'port') || (loc.damaged ?? 0) >= 95 || locationAvailability(state, loc) <= 0) continue;
    let nearest = 0, nd = Infinity;
    perSide[sd].sources.forEach((src, si) => { const d = haversineKm(loc.pos, src.loc.pos); if (d < nd) { nd = d; nearest = si; } });
    (loc.kind === 'airfield' ? bases.air : bases.sea)[sd].push({ loc, nearest, nd });
  }
  // Assign each unit to its best source.
  const near: number[] = [];
  const streak = sp.enclosed;
  for (const id of Object.keys(streak)) if (!isAlive(state.units[id])) delete streak[id];
  for (const u of units) {
    if (u.side !== 'allies' && u.side !== 'axis') continue;
    const ps = perSide[u.side];
    const demand = unitDemand(u);
    let best: Assign = { u, eff: Infinity, src: -1, node: -1, demand, lines: [], air: false };
    if (u.domain === 'land') {
      const hit = ps.unitCache.get(u.id);
      if (hit && hit.x === u.pos[0] && hit.y === u.pos[1]) {
        if (hit.src >= 0) best = { u, eff: hit.eff, src: hit.src, node: hit.node, demand, lines: [], air: false };
      } else {
      ps.sources.forEach((s, si) => {
        const km = haversineKm(u.pos, s.loc.pos);
        if (km <= TRUCK_RANGE_KM && km * TRUCK_FACTOR < best.eff) best = { u, eff: km * TRUCK_FACTOR, src: si, node: -1, demand, lines: [], air: false };
      });
      // Expanding search: any node farther than r km costs at least r*TRUCK_FACTOR, so stop once best <= r*TRUCK_FACTOR.
      const cosLat = Math.cos((u.pos[1] * Math.PI) / 180);
      let r = Math.min(TRUCK_RANGE_KM, 15);
      for (let stage = 0; stage < 3; stage++) {
        near.length = 0;
        hashNear(graph.hash, u.pos, r, near);
        for (const n of near) {
          const d = ps.dist[n];
          if (d >= best.eff || d === Infinity) continue;
          const q = graph.pos[n];
          const ay = (q[1] - u.pos[1]) * 111.2, ax = (q[0] - u.pos[0]) * 111.2 * cosLat;
          if (d + Math.sqrt(ax * ax + ay * ay) * 0.99 * TRUCK_FACTOR >= best.eff) continue; // cheap lower bound
          const haul = haversineKm(u.pos, q);
          if (haul > TRUCK_RANGE_KM) continue;
          const eff = d + haul * TRUCK_FACTOR;
          if (eff < best.eff) best = { u, eff, src: ps.root[n], node: n, demand, lines: [], air: false };
        }
        if (best.eff <= r * TRUCK_FACTOR || r >= TRUCK_RANGE_KM) break;
        r = Math.min(TRUCK_RANGE_KM, isFinite(best.eff) ? Math.max(r * 2, Math.min(TRUCK_RANGE_KM, best.eff / TRUCK_FACTOR)) : TRUCK_RANGE_KM);
      }
      let trickleEnemy: boolean | undefined;
      if (best.src < 0 && !(trickleEnemy = inEnemyCell(state, u, cg))) {
        // Forward trickle (truck columns / forward dumps) beyond normal truck range: expensive, so supply stays low.
        ps.sources.forEach((s, si) => {
          const km = haversineKm(u.pos, s.loc.pos);
          if (km <= LONG_HAUL_RANGE_KM && km * LONG_HAUL_FACTOR < best.eff) best = { u, eff: km * LONG_HAUL_FACTOR, src: si, node: -1, demand, lines: [], air: false };
        });
        near.length = 0;
        hashNear(graph.hash, u.pos, Math.min(LONG_HAUL_RANGE_KM, best.eff / LONG_HAUL_FACTOR), near);
        for (const n of near) {
          const d = ps.dist[n];
          if (d >= best.eff || d === Infinity) continue;
          const haul = haversineKm(u.pos, graph.pos[n]);
          if (haul > LONG_HAUL_RANGE_KM) continue;
          const eff = d + haul * LONG_HAUL_FACTOR;
          if (eff < best.eff) best = { u, eff, src: ps.root[n], node: n, demand, lines: [], air: false };
        }
      }
        ps.unitCache.set(u.id, { x: u.pos[0], y: u.pos[1], eff: best.eff, src: best.src, node: best.node, trickleEnemy });
      }
    } else {
      const range = u.domain === 'air' ? AIR_RANGE_KM : SEA_RANGE_KM;
      ps.sources.forEach((s, si) => {
        const km = haversineKm(u.pos, s.loc.pos);
        if (km <= range && km * 0.5 < best.eff) best = { u, eff: km * 0.5, src: si, node: -1, demand, lines: [], air: true };
      });
      // owned airfields (air) / ports (sea) also act as bases
      if (ps.sources.length) {
        const thr = u.domain === 'air' ? 30 : 40;
        const cosLat = Math.cos((u.pos[1] * Math.PI) / 180);
        for (const b of u.domain === 'air' ? bases.air[u.side] : bases.sea[u.side]) {
          const q = b.loc.pos;
          if (Math.abs(q[1] - u.pos[1]) * 111.2 > thr * 1.02 || Math.abs(q[0] - u.pos[0]) * 111.2 * cosLat > thr * 1.02) continue; // cheap reject
          const km = haversineKm(u.pos, q);
          if (km > thr) continue;
          // being at a base: supplied if any source exists on the side (assumed ferried); use nearest source for accounting
          const eff = km * 0.5 + Math.min(b.nd, AIR_RANGE_KM) * 0.1;
          if (eff < best.eff) best = { u, eff, src: b.nearest, node: -1, demand, lines: [], air: true };
        }
      }
    }
    if (u.domain === 'land' && best.src >= 0) {
      // Enclosed by a ring of enemy zones of control: cut only once the ring has held for ENCLOSE_UPDATES updates (spearheads flicker).
      if (ps.sources.some(x => x.sea) && onSeaSuppliedShore(u, ps.sources, ctx.terrain)) delete streak[u.id]; // beachhead: the sea is its supply line
      else if (u.encircled) best = { u, eff: Infinity, src: -1, node: -1, demand, lines: [], air: false }; // sim already flagged it encircled (enemy on 3+ sides)
      else if (inRegion(ps.region, u.pos, cg)) delete streak[u.id];
      else {
        streak[u.id] = (streak[u.id] ?? 0) + 1;
        if (streak[u.id] >= ENCLOSE_UPDATES) best = { u, eff: Infinity, src: -1, node: -1, demand, lines: [], air: false };
      }
    }
    if (best.node >= 0) {
      let lines = ps.pathCache.get(best.node);
      if (!lines) {
        let n = best.node;
        lines = [];
        while (n >= 0 && ps.prevNode[n] >= 0) {
          const l = ps.lineIds[ps.prevLine[n]];
          if (l && lines[lines.length - 1] !== l) lines.push(l);
          n = ps.prevNode[n];
        }
        ps.pathCache.set(best.node, lines);
      }
      best.lines = lines;
    }
    if (!isFinite(best.eff * diffDist) || best.eff * diffDist > MAX_EFFECTIVE_KM) best = { ...best, eff: Infinity, src: -1 };
    assigns.push(best);
  }

  // Line loads -> flow factors.
  const load = new Map<string, number>();
  for (const a of assigns) for (const l of a.lines) load.set(l, (load.get(l) ?? 0) + a.demand);
  const flowOf = (a: Assign): number => {
    let f = 1;
    for (const l of a.lines) {
      const cap = (graph.lineCap.get(l) ?? DEFAULT_ROAD_CAPACITY) * (1 - lineDamageOf(state, l) / 100) / Math.max(0.25, diffRaw);
      const ld = load.get(l) ?? 0;
      if (ld > cap) f = Math.min(f, Math.max(0.05, cap / ld));
    }
    return f;
  };

  // Source stock/throughput.
  const prevNodes = new Map(state.supply.nodes.map(n => [n.locationId, n]));
  for (const side of ['allies', 'axis'] as SideId[]) {
    const ps = perSide[side];
    const dem = new Array(ps.sources.length).fill(0) as number[];
    for (const a of assigns) if (a.u.side === side && a.src >= 0) dem[a.src] += a.demand;
    ps.sources.forEach((s, si) => {
      const prev = prevNodes.get(s.loc.id);
      const available = (prev ? prev.stock : s.capacity * 4) + s.capacity * interval;
      const need = dem[si] * interval;
      const served = Math.min(need, available);
      srcFactor.set(`${side}:${s.loc.id}`, need > 0 ? Math.max(0.05, served / need) : 1);
      { const day = Math.floor(state.clock.minutes / 1440); const pu = sp.portUse[s.loc.id]; if (!pu || pu.day !== day) sp.portUse[s.loc.id] = { day, tons: served * TONS_PER_POINT }; else pu.tons += served * TONS_PER_POINT; }
      nodesOut.push({ locationId: s.loc.id, stock: Math.min(s.capacity * interval * 6, Math.max(0, available - served)), throughput: s.capacity });
    });
  }
  state.supply.nodes = nodesOut;

  // Airlift: cut-off land units inside an airlift-served pocket get a capped, weather/air-threat limited flow.
  const airlift: Record<string, number> = {};
  const cutLand = assigns.filter(a => (a.src < 0 || !isFinite(a.eff)) && a.u.domain === 'land');
  if (cutLand.length) {
    const fields = Object.values(state.locations).filter(l => (ext(l).airliftTonsPerDay ?? 0) > 0 && (l.damaged ?? 0) < 80);
    const perField = new Map<string, Assign[]>();
    for (const a of cutLand) {
      let best: Location | undefined, bd = AIRLIFT_POCKET_KM;
      for (const f of fields) {
        if (sideOfNation(state, f.owner) !== a.u.side) continue;
        const d = haversineKm(a.u.pos, f.pos);
        if (d <= bd) { bd = d; best = f; }
      }
      if (best) { const arr = perField.get(best.id); if (arr) arr.push(a); else perField.set(best.id, [a]); }
    }
    const wf = AIRLIFT_WEATHER[state.weather.kind] ?? 1;
    const wInt = clamp(state.weather.intensity > 1 ? state.weather.intensity / 100 : state.weather.intensity, 0, 1);
    const weatherLift = 1 - (1 - wf) * wInt;
    for (const [fid, list] of perField) {
      const f = state.locations[fid];
      const side = sideOfNation(state, f.owner);
      let hostile = 0;
      for (const e of units) {
        if (e.domain !== 'air' || e.type !== 'air_fighter' || e.side === side || e.side === 'neutral' || e.readiness < 30) continue;
        if (haversineKm(e.pos, f.pos) <= 150) hostile++;
      }
      const cap = ((ext(f).airliftTonsPerDay ?? 0) / (TONS_PER_POINT * 24)) * (1 - (f.damaged ?? 0) / 100) * weatherLift * (1 - Math.min(0.8, 0.15 * hostile)) / Math.max(0.25, diffRaw);
      const need = list.reduce((x, a) => x + a.demand, 0);
      const frac = need > 0 ? clamp(cap / need, 0, 1) : 0;
      for (const a of list) { airlift[a.u.id] = frac; a.demand *= frac; }
    }
  }
  sp.airlift = airlift;

  // Nation pools: income and consumption.
  const demandByNation = new Map<string, number>();
  for (const a of assigns) if (a.src >= 0 || airlift[a.u.id] !== undefined) demandByNation.set(a.u.nation, (demandByNation.get(a.u.nation) ?? 0) + a.demand);
  const poolFactor = new Map<string, number>();
  for (const nation of Object.values(state.nations)) {
    const listed = ctx.scenario.supplySources?.[nation.id] ?? [];
    const valid = listed.filter(id => state.locations[id] && sideOfNation(state, state.locations[id].owner) === nation.side && (state.locations[id].damaged ?? 0) < 95).length;
    const frac = listed.length ? valid / listed.length : 1;
    const r = nation.resources, inc = nation.income;
    r.manpower += inc.manpower * interval * frac;
    r.fuel += inc.fuel * interval * frac;
    r.ammo += inc.ammo * interval * frac;
    r.equipment += inc.equipment * interval * frac;
    const available = r.supplyPoints + inc.supplyPoints * interval * frac;
    const need = (demandByNation.get(nation.id) ?? 0) * interval * POOL_DRAW_SCALE;
    poolFactor.set(nation.id, need <= 0 ? 1 : clamp(0.5 + 0.5 * (available / need), 0.5, 1));
    r.supplyPoints = Math.max(0, available - need);
  }

  // Apply to units.
  const newCut: string[] = [];
  const dists: Record<string, number> = {};
  for (const a of assigns) {
    const u = a.u;
    if (a.src < 0 || !isFinite(a.eff)) {
      dists[u.id] = -1;
      newCut.push(u.id);
      const lift = airlift[u.id];
      if (lift !== undefined) {
        const target = AIRLIFT_MAX_LEVEL * lift * (poolFactor.get(u.nation) ?? 1);
        u.supply = clamp(target > u.supply ? Math.min(target, u.supply + 10) : Math.max(target, u.supply - 10));
      } else u.supply = clamp(u.supply - 10);
      continue;
    }
    const effScaled = a.eff * diffDist;
    dists[u.id] = Math.round(a.eff * 10) / 10;
    const sf = srcFactor.get(`${u.side}:${perSide[u.side].sources[a.src].loc.id}`) ?? 1;
    const target = clamp(supplyLevelFromDistance(effScaled) * flowOf(a) * sf * weather * (poolFactor.get(u.nation) ?? 1));
    u.supply = clamp(target > u.supply ? Math.min(target, u.supply + 25) : Math.max(target, u.supply - 12));
  }
  // Units not in any network side (neutral) are left alone.
  state.supply.unitSupplyDistKm = dists;
  state.supply.cutOffUnits = newCut;

  const prevCut = new Set(sp.prevCutOff);
  const nowCut = new Set(newCut);
  for (const id of newCut) {
    const u = state.units[id];
    if (!prevCut.has(id) && u.side === state.playerSide) {
      ctx.log({ category: 'supply', severity: 'critical', text: `${u.shortName} is cut off from supply`, pos: u.pos, unitId: id });
    }
  }
  for (const id of sp.prevCutOff) {
    const u = state.units[id];
    if (u && isAlive(u) && !nowCut.has(id) && u.side === state.playerSide) {
      ctx.log({ category: 'supply', severity: 'info', text: `${u.shortName} has re-established supply`, pos: u.pos, unitId: id });
    }
  }
  sp.prevCutOff = newCut;
}

function updateLocationDamage(state: GameState, units: Unit[], lastOwner: Record<string, string>, capturedAt: Record<string, number>): void {
  const enemies = units.filter(u => u.domain === 'land' && u.combatStatus !== 'routed');
  const engineers = units.filter(u => u.type === 'engineer');
  const friends = units.filter(u => u.domain === 'land' && u.combatStatus !== 'routed');
  for (const loc of Object.values(state.locations)) {
    const prev = lastOwner[loc.id];
    if (prev === undefined) lastOwner[loc.id] = loc.owner;
    else if (prev !== loc.owner) {
      lastOwner[loc.id] = loc.owner;
      capturedAt[loc.id] = state.clock.minutes;
      loc.damaged = Math.max(loc.damaged ?? 0, 30);   // damage on capture
      continue;
    }
    const locSide = sideOfNation(state, loc.owner);
    let raiders = 0, enemyNear15 = false;
    for (const e of enemies) {
      if (e.side === locSide || e.side === 'neutral') continue;
      if (Math.abs(e.pos[1] - loc.pos[1]) > 0.15) continue; // cheap reject (>~16 km)
      const d = haversineKm(e.pos, loc.pos);
      if (d <= RAID_KM) raiders++;
      if (d <= 15) enemyNear15 = true;
    }
    const dmg = loc.damaged ?? 0;
    let garrison = false;
    if (raiders > 0) {
      for (const f of friends) {
        if (f.side !== locSide || Math.abs(f.pos[1] - loc.pos[1]) > 0.1) continue;
        if (haversineKm(f.pos, loc.pos) <= RAID_KM) { garrison = true; break; }
      }
    }
    if (raiders > 0 && ['depot', 'port', 'airfield', 'bridge', 'radar'].includes(loc.kind)) {
      // Ground raiding/shelling degrades a facility but never wrecks it outright (cap RAID_DAMAGE_CAP; bombing and capture can); a garrison halves it and patches things up.
      const inc = Math.min(25, 8 * raiders) * (garrison ? 0.5 : 1);
      loc.damaged = dmg >= RAID_DAMAGE_CAP ? dmg : Math.min(RAID_DAMAGE_CAP, dmg + inc);
      if (garrison && loc.damaged > 0) loc.damaged = Math.max(0, loc.damaged - 2);
    } else if (dmg > 0 && !enemyNear15) {
      const eng = engineers.some(e => e.side === locSide && haversineKm(e.pos, loc.pos) <= 10);
      loc.damaged = Math.max(0, dmg - (eng ? 8 : 4));
    }
  }
}

function updateLineRepair(state: GameState): void {
  const ld = milSpecial(state).lineDamage;
  for (const k of Object.keys(ld)) {
    ld[k] = Math.max(0, ld[k] - 1);
    if (ld[k] <= 0) delete ld[k];
  }
}

/** Damage a road/rail line (air raid, sabotage, event). 0..100; >=80 cuts the line. */
export function damageInfra(state: GameState, lineId: string, amount: number): void {
  const ld = milSpecial(state).lineDamage;
  ld[lineId] = clamp((ld[lineId] ?? 0) + amount);
}

/** Damage a location's infrastructure (bombing, raid). */
export function damageLocation(state: GameState, locationId: string, amount: number): void {
  const loc = state.locations[locationId];
  if (!loc) return;
  loc.damaged = clamp((loc.damaged ?? 0) + amount);
  addLog(state, { category: 'supply', severity: 'warn', text: `${loc.name} infrastructure damaged (${Math.round(loc.damaged)}%)`, pos: loc.pos });
}

export function isCutOff(state: GameState, unitId: string): boolean {
  return state.supply.cutOffUnits.includes(unitId) || state.supply.unitSupplyDistKm[unitId] === -1;
}