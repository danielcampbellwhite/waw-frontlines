import type { GameState, InfraLine, LonLat, TerrainGrid, Unit, UnitType, WeatherKind } from '../core/types';
import { Terrain } from '../core/types';
import { cellCenter, haversineKm } from '../core/geo';
import { cellIdxOf, getGridInfo, roadAt, terrainAt, type GridInfo } from './gridutil';
import { iceOf } from './ice';

export type MoveClass = 'foot' | 'wheeled' | 'tracked' | 'naval' | 'air';

const UNIT_CLASS: Record<UnitType, MoveClass> = {
  infantry: 'foot', paratroop: 'foot', engineer: 'foot', artillery: 'foot', antitank: 'foot',
  motorised: 'wheeled', recon: 'wheeled', logistics: 'wheeled', hq: 'wheeled',
  armoured: 'tracked', mechanised: 'tracked',
  naval: 'naval', carrier: 'naval', air_fighter: 'air', air_bomber: 'air',
};
/**
 * Sustained off-road speed on plains in clear weather, km per hour of game time, averaged over a 24 h day
 * (halts, night, traffic, breakdowns included): 1.1 km/h = 26 km/day on foot. On roads: foot ~33 km/day,
 * armour/mech ~90 km/day, motorised ~95 km/day, recon ~137 km/day. Calibrated so that on the real map in clear weather a
 * panzer division needs ~70 h and an infantry division ~5.5 days from the German border to Sedan (~125 km straight, 150-160 km by road).
 */
export const BASE_SPEED_KMH: Record<UnitType, number> = {
  infantry: 1.1, paratroop: 1.1, engineer: 1.0, artillery: 0.9, antitank: 1.15,
  motorised: 1.8, recon: 2.6, logistics: 1.8, hq: 1.5,
  armoured: 1.8, mechanised: 1.8,
  naval: 26, carrier: 26, air_fighter: 330, air_bomber: 260,
};
const ROAD_MULT: Record<MoveClass, number> = { foot: 1.3, wheeled: 2.2, tracked: 2.1, naval: 1, air: 1 };
// index by Terrain code: Sea, Plains, Forest, Hills, Mountains, Marsh, Urban, Desert, Jungle, Lake, Bocage
const TERR_MULT: Record<'foot' | 'wheeled' | 'tracked', number[]> = {
  foot:    [0, 1, 0.75, 0.65, 0.4, 0.45, 0.8, 0.75, 0.4, 0, 0.6],
  wheeled: [0, 1, 0.35, 0.5, 0.2, 0.25, 0.7, 0.6, 0.2, 0, 0.4],
  tracked: [0, 1, 0.5, 0.6, 0.25, 0.35, 0.6, 0.7, 0.3, 0, 0.4],
};
const RIVER_PENALTY_EQ_KM: Record<MoveClass, number> = { foot: 6, wheeled: 14, tracked: 18, naval: 0, air: 0 };
const WEATHER_MULT: Record<WeatherKind, Record<'foot' | 'wheeled' | 'tracked' | 'naval' | 'air', number>> = {
  clear:     { foot: 1, wheeled: 1, tracked: 1, naval: 1, air: 1 },
  cloud:     { foot: 1, wheeled: 1, tracked: 1, naval: 1, air: 1 },
  rain:      { foot: 0.85, wheeled: 0.75, tracked: 0.85, naval: 0.9, air: 0.9 },
  storm:     { foot: 0.6, wheeled: 0.5, tracked: 0.6, naval: 0.6, air: 0.7 },
  snow:      { foot: 0.65, wheeled: 0.5, tracked: 0.6, naval: 0.9, air: 0.85 },
  fog:       { foot: 0.9, wheeled: 0.85, tracked: 0.9, naval: 0.8, air: 0.9 },
  mud:       { foot: 0.6, wheeled: 0.35, tracked: 0.5, naval: 1, air: 1 },
  sandstorm: { foot: 0.6, wheeled: 0.5, tracked: 0.55, naval: 1, air: 0.7 },
};

export const moveClassOf = (t: UnitType): MoveClass => UNIT_CLASS[t];

/**
 * Frozen water (ice = thickness fraction 0..1, see ice.ts). Lake speed factor relative to plains for land classes, 0 = still impassable:
 * thin ice carries nobody; partial ice carries infantry slowly; heavy vehicles need nearly full ice and stay slow on it.
 */
export function iceLake(cls: MoveClass, ice: number): number {
  if (ice <= 0) return 0;
  if (cls === 'foot') return ice < 0.35 ? 0 : ice < 0.7 ? 0.35 : 0.6;
  if (cls === 'wheeled') return ice < 0.55 ? 0 : ice < 0.85 ? 0.25 : 0.5;
  if (cls === 'tracked') return ice < 0.7 ? 0 : ice < 0.9 ? 0.25 : 0.45;
  return 0;
}
/** Multiplier on the river-crossing penalty (1 = unfrozen, small = frozen solid). */
export function iceRiver(cls: MoveClass, ice: number): number {
  if (ice <= 0) return 1;
  if (cls === 'foot') return ice < 0.35 ? 1 : ice < 0.7 ? 0.5 : 0.2;
  if (cls === 'wheeled') return ice < 0.55 ? 1 : ice < 0.85 ? 0.6 : 0.25;
  if (cls === 'tracked') return ice < 0.7 ? 1 : ice < 0.9 ? 0.7 : 0.3;
  return 1;
}
/** Passability including frozen lakes. */
export function passableIce(cls: MoveClass, t: number, ice: number): boolean {
  if (t === Terrain.Lake && ice > 0 && (cls === 'foot' || cls === 'wheeled' || cls === 'tracked')) return iceLake(cls, ice) > 0;
  return passable(cls, t);
}

/** Passability of a terrain code for a movement class. */
export function passable(cls: MoveClass, t: number): boolean {
  if (cls === 'air') return true;
  if (cls === 'naval') return t === Terrain.Sea || t === Terrain.Lake;
  return t !== Terrain.Sea && t !== Terrain.Lake;
}

/** Relative speed factor (1 = plains off-road) for one cell. */
function cellFactor(cls: MoveClass, t: number, road: number, ice = 0): number {
  if (cls === 'air') return 1;
  if (t === Terrain.Lake && ice > 0 && cls !== 'naval') return iceLake(cls, ice);
  if (cls === 'naval') return t === Terrain.Sea || t === Terrain.Lake ? 1 : 0;
  const tm = TERR_MULT[cls][t] ?? 0;
  if (tm === 0) return 0;
  return road > 0 ? ROAD_MULT[cls] * (0.7 + 0.3 * tm) : tm;
}

/**
 * Speed in km/h for a unit on a given terrain / weather / road. 0 = impassable for this unit.
 * Includes organisation, fatigue and fuel effects. One tick = 1 hour so km/h == km/tick.
 */
export function unitSpeedKmh(unit: Unit, terrain: Terrain, weather: WeatherKind, onRoad: boolean, ice = 0): number {
  const cls = UNIT_CLASS[unit.type];
  const f = cellFactor(cls, terrain, onRoad ? 1 : 0, ice);
  if (f <= 0) return 0;
  let wm = WEATHER_MULT[weather]?.[cls] ?? 1;
  if (onRoad && (cls === 'wheeled' || cls === 'tracked' || cls === 'foot')) wm = 1 - (1 - wm) * 0.4; // roads shrug off mud/snow better
  let v = BASE_SPEED_KMH[unit.type] * f * wm;
  v *= 0.55 + 0.45 * (Math.max(0, Math.min(100, unit.organisation)) / 100);
  v *= 1 - 0.3 * (Math.max(0, Math.min(100, unit.fatigue)) / 100);
  if (cls === 'wheeled' || cls === 'tracked' || cls === 'naval' || cls === 'air') {
    if (unit.fuel <= 0) return 0; // empty tank: the unit halts completely (order stays active, resumes on resupply)
    if (unit.fuel < 10) v *= 0.6;
  }
  return Math.max(0.3, v);
}

// ───────────────────────── A* ─────────────────────────

const NB: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const MAX_EXPANSIONS = 250_000;
const CACHE_MAX = 700;

class Heap {
  idx: number[] = [];
  pri: number[] = [];
  get size() { return this.idx.length; }
  push(i: number, p: number) {
    const a = this.idx, b = this.pri;
    let k = a.length;
    a.push(i); b.push(p);
    while (k > 0) {
      const par = (k - 1) >> 1;
      if (b[par] < p || (b[par] === p && a[par] < i)) break;
      a[k] = a[par]; b[k] = b[par]; k = par;
    }
    a[k] = i; b[k] = p;
  }
  pop(): number {
    const a = this.idx, b = this.pri;
    const top = a[0];
    const li = a.pop()!, lp = b.pop()!;
    const n = a.length;
    if (n > 0) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && (b[c + 1] < b[c] || (b[c + 1] === b[c] && a[c + 1] < a[c]))) c++;
        if (lp < b[c] || (lp === b[c] && li < a[c])) break;
        a[k] = a[c]; b[k] = b[c]; k = c;
      }
      a[k] = li; b[k] = lp;
    }
    return top;
  }
}

/** Per-cell traversal tables for one (grid, class, ice level): 1/speed-factor (-1 = impassable) and the river-crossing penalty. */
interface CostTab { inv: Float64Array; pen: Float64Array; blk: Uint8Array }
const tabCache = new WeakMap<GridInfo, Map<string, CostTab>>();
let memoInfo: GridInfo | null = null, memoCls: MoveClass | null = null, memoIce = -1, memoTab: CostTab | null = null;
function tabFor(info: GridInfo, cls: MoveClass, ice: number): CostTab {
  if (memoInfo === info && memoCls === cls && memoIce === ice && memoTab) return memoTab;
  let m = tabCache.get(info);
  if (!m) { m = new Map(); tabCache.set(info, m); }
  const key = cls + '|' + ice;
  let t = m.get(key);
  if (!t) {
    const n = info.terrain.length;
    const inv = new Float64Array(n), pen = new Float64Array(n), blk = new Uint8Array(n);
    const rp = RIVER_PENALTY_EQ_KM[cls] * iceRiver(cls, ice);
    for (let i = 0; i < n; i++) {
      const f = cellFactor(cls, info.terrain[i], info.road[i], ice);
      inv[i] = f > 0 ? 1 / f : -1;
      blk[i] = passableIce(cls, info.terrain[i], ice) ? 0 : 1;
      pen[i] = info.river[i] && !info.road[i] ? rp : 0;
    }
    t = { inv, pen, blk };
    m.set(key, t);
  }
  memoInfo = info; memoCls = cls; memoIce = ice; memoTab = t;
  return t;
}

function stepCost(info: GridInfo, cls: MoveClass, a: number, b: number, dkm: number, ice = 0): number {
  const t = tabFor(info, cls, ice);
  const ib = t.inv[b];
  if (ib < 0) return Infinity;
  const ia = t.inv[a];
  let c = dkm * 0.5 * ((ia >= 0 ? ia : ib) + ib);
  if (t.pen[b] !== 0) c += t.pen[b];
  return c;
}

function nearestPassable(info: GridInfo, cls: MoveClass, idx: number, maxR: number): number {
  if (passable(cls, info.terrain[idx])) return idx;
  const c0 = idx % info.cols, r0 = (idx / info.cols) | 0;
  for (let r = 1; r <= maxR; r++) {
    for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue;
      const c = c0 + dc, rr = r0 + dr;
      if (c < 0 || rr < 0 || c >= info.cols || rr >= info.rows) continue;
      const i = rr * info.cols + c;
      if (passable(cls, info.terrain[i])) return i;
    }
  }
  return -1;
}

function astar(info: GridInfo, cls: MoveClass, start: number, goal: number, ice = 0): number[] | null {
  const { cols, rows } = info;
  const gen = ++info.gen;
  const goalC = goal % cols, goalR = (goal / cols) | 0;
  const maxF = info.hasRoad && cls !== 'naval' ? ROAD_MULT[cls] : 1;
  const heur = (c: number, r: number) => {
    const dx = Math.abs(c - goalC) * info.spec.cellDeg * info.kmPerLon[r], dy = Math.abs(r - goalR) * info.spec.cellDeg * info.kmPerLat;
    return Math.sqrt(dx * dx + dy * dy) / maxF;
  };
  const heap = new Heap();
  info.g[start] = 0; info.stamp[start] = gen; info.parent[start] = -1;
  heap.push(start, heur(start % cols, (start / cols) | 0));
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (info.closed[cur] === gen) continue;
    info.closed[cur] = gen;
    if (cur === goal) {
      const out: number[] = [];
      for (let i = cur; i !== -1; i = info.parent[i]) out.push(i);
      return out.reverse();
    }
    if (++expanded > MAX_EXPANSIONS) return null;
    const c = cur % cols, r = (cur / cols) | 0;
    const gc = info.g[cur];
    for (const [dc, dr] of NB) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (info.closed[ni] === gen) continue;
      if (!passableIce(cls, info.terrain[ni], ice)) continue;
      const dxkm = dc * info.spec.cellDeg * info.kmPerLon[r];
      const dykm = dr * info.spec.cellDeg * info.kmPerLat;
      const dkm = Math.sqrt(dxkm * dxkm + dykm * dykm);
      const sc = stepCost(info, cls, cur, ni, dkm, ice);
      if (!isFinite(sc)) continue;
      const ng = gc + sc;
      if (info.stamp[ni] !== gen || ng < info.g[ni]) {
        info.stamp[ni] = gen; info.g[ni] = ng; info.parent[ni] = cur;
        heap.push(ni, ng + heur(nc, nr));
      }
    }
  }
  return null;
}

/** Cost of a straight segment between two cells (sampled); Infinity if it crosses impassable ground. */
function segmentCost(info: GridInfo, cls: MoveClass, a: number, b: number, ice = 0, limit = Infinity): number {
  const cols = info.cols, rows = info.rows;
  const ac = a % cols, ar = (a / cols) | 0, bc = b % cols, br = (b / cols) | 0;
  const steps = Math.max(Math.abs(bc - ac), Math.abs(br - ar)) * 4;
  if (steps === 0) return 0;
  const blk = tabFor(info, cls, ice).blk;
  let cost = 0, prev = a;
  for (let s = 1; s <= steps; s++) {
    const f = s / steps;
    const fx = ac + (bc - ac) * f, fy = ar + (br - ar) * f;
    // keep a 0.3-cell safety margin so straight shortcuts never clip a coastal corner
    const c0 = Math.round(fx - 0.3), c1 = Math.round(fx + 0.3), r0 = Math.round(fy - 0.3), r1 = Math.round(fy + 0.3);
    if (c0 < 0 || r0 < 0 || c0 >= cols || r0 >= rows || c1 < 0 || r1 < 0 || c1 >= cols || r1 >= rows) return Infinity;
    if (blk[r0 * cols + c0] | blk[r1 * cols + c0] | blk[r0 * cols + c1] | blk[r1 * cols + c1]) return Infinity;
    const c = Math.round(fx), r = Math.round(fy);
    const i = r * cols + c;
    if (i === prev) continue;
    if (blk[i]) return Infinity;
    const lonKm = Math.abs(c - (prev % cols)) * info.spec.cellDeg * info.kmPerLon[r];
    const latKm = Math.abs(r - ((prev / cols) | 0)) * info.spec.cellDeg * info.kmPerLat;
    cost += stepCost(info, cls, prev, i, Math.sqrt(lonKm * lonKm + latKm * latKm), ice);
    if (cost > limit) return cost; // already costlier than the alternative: the caller only needs to know that
    prev = i;
  }
  return cost;
}

/** Greedy string-pulling: shortcut only when the straight line is no costlier than the grid path. */
function smooth(info: GridInfo, cls: MoveClass, path: number[], ice = 0): number[] {
  if (path.length <= 2) return path;
  // cumulative step cost along the original path
  const cum: number[] = [0];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const ac = a % info.cols, ar = (a / info.cols) | 0, bc = b % info.cols, br = (b / info.cols) | 0;
    const dx = (bc - ac) * info.spec.cellDeg * info.kmPerLon[ar], dy = (br - ar) * info.spec.cellDeg * info.kmPerLat;
    cum.push(cum[k - 1] + stepCost(info, cls, a, b, Math.sqrt(dx * dx + dy * dy), ice));
  }
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let best = i + 1;
    for (let j = Math.min(path.length - 1, i + 40); j > i + 1; j--) {
      const lim = (cum[j] - cum[i]) * 1.0001;
      const sc = segmentCost(info, cls, path[i], path[j], ice, lim);
      if (sc <= lim) { best = j; break; }
    }
    out.push(path[best]);
    i = best;
  }
  return out;
}

export function pathKm(p: LonLat[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += haversineKm(p[i - 1], p[i]);
  return s;
}

/** Max length of a sub-step when sampling terrain/road speed along a segment (km). */
export const SUBSTEP_KM = 4;

/** Hours to travel from a to b (one segment), sampling terrain/road in SUBSTEP_KM pieces. */
export function segmentHours(info: GridInfo, unit: Unit, a: LonLat, b: LonLat, weather: WeatherKind, ice = 0): number {
  const km = haversineKm(a, b);
  if (km === 0) return 0;
  const n = Math.max(1, Math.ceil(km / SUBSTEP_KM));
  let hours = 0;
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n;
    const mid: LonLat = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    hours += km / n / unitSpeedKmh(unit, terrainAt(info, mid), weather, roadAt(info, mid) > 0, ice);
  }
  return hours;
}

/** ETA minutes along a path for this unit under current weather. */
export function etaMinutesAlong(info: GridInfo, unit: Unit, path: LonLat[], weather: WeatherKind, ice = 0): number {
  let h = 0;
  const u = unit.fuel < 10 ? { ...unit, fuel: 10 } : unit; // ETA assumes the unit gets fuel
  for (let i = 1; i < path.length; i++) h += segmentHours(info, u, path[i - 1], path[i], weather, ice);
  return h * 60;
}

/**
 * Route for a unit. Returned path includes the unit's current position as first element and `to` as last.
 * null = unreachable for this unit (e.g. land unit and target at sea).
 */
export function findRoute(terrain: TerrainGrid, infra: InfraLine[], unit: Unit, to: LonLat, state: GameState):
  { path: LonLat[]; km: number; etaMinutes: number } | null {
  const info = getGridInfo(terrain, infra);
  const cls = UNIT_CLASS[unit.type];
  const from = unit.pos;
  const weather = state.weather.kind;
  const ice = cls === 'foot' || cls === 'wheeled' || cls === 'tracked' ? iceOf(state) : 0;
  if (cls === 'air') {
    const km = haversineKm(from, to);
    return { path: [from, to], km, etaMinutes: (km / unitSpeedKmh(unit, Terrain.Plains, weather, false)) * 60 };
  }
  const s0 = cellIdxOf(info, from), g0 = cellIdxOf(info, to);
  if (g0 < 0) return null;
  const goal = cls === 'naval' ? nearestPassable(info, cls, g0, 3) : g0;
  if (goal < 0 || !passableIce(cls, info.terrain[goal], ice)) return null;
  if (s0 < 0) return null;
  let cells: number[] | null;
  if (s0 === goal) cells = [s0];
  else {
    const key = cls + '|' + s0 + '|' + goal + (ice > 0 ? '|i' + ice : '');
    const hit = info.cache.get(key);
    if (hit) cells = hit;
    else {
      const raw = astar(info, cls, s0, goal, ice);
      cells = raw ? smooth(info, cls, raw, ice) : null;
      if (info.cache.size >= CACHE_MAX) info.cache.clear();
      info.cache.set(key, cells ?? []);
    }
    if (cells && cells.length === 0) cells = null;
  }
  if (!cells) return null;
  const path: LonLat[] = [[from[0], from[1]]];
  for (let k = 1; k < cells.length - 1; k++) {
    const i = cells[k];
    path.push(cellCenter(info.spec, i % info.cols, (i / info.cols) | 0));
  }
  path.push([to[0], to[1]]);
  return { path, km: pathKm(path), etaMinutes: etaMinutesAlong(info, unit, path, weather, ice) };
}
