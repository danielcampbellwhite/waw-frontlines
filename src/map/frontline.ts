import { pointInPolygon } from '../core/geo';
import type { ControlGrid, LonLat, NationId, SideId } from '../core/types';

/** Default nation→side mapping used when the caller does not supply one. */
export const DEFAULT_SIDE_OF = (n: NationId): SideId =>
  n === 'GER' || n === 'ITA' || n === 'JPN' ? 'axis' : n === 'NEUTRAL' ? 'neutral' : 'allies';

type V = [number, number]; // grid vertex (col,row) in cell-corner lattice

const key = (c: number, r: number, W: number) => r * (W + 1) + c;

/** Chaikin corner cutting. Open polylines keep their end points. */
export function chaikin(pts: LonLat[], iterations: number, closed: boolean): LonLat[] {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    if (p.length < 3) return p;
    const out: LonLat[] = [];
    const n = p.length;
    if (!closed) out.push(p[0]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = p[i], b = p[(i + 1) % n];
      if (closed || i > 0) out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (closed || i < last - 1) out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

/** Drop vertices that lie in the middle of a straight lattice run. */
function dropCollinear(path: V[], closed: boolean): V[] {
  const n = path.length;
  if (n < 3) return path;
  const out: V[] = [];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) { out.push(path[i]); continue; }
    const a = path[(i - 1 + n) % n], b = path[i], c = path[(i + 1) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
  }
  return out;
}

function toLonLat(g: Pick<ControlGrid, 'bbox' | 'cellDeg'>, v: V): LonLat {
  return [g.bbox.west + v[0] * g.cellDeg, g.bbox.north - v[1] * g.cellDeg];
}

interface Edge { a: number; b: number; used: boolean }

/**
 * Chain undirected unit edges on the cell-corner lattice into polylines.
 * Open chains (starting at degree-1 / odd vertices) first, then closed loops.
 */
function chain(edges: [V, V][], W: number): { path: V[]; closed: boolean }[] {
  const E: Edge[] = [];
  const verts = new Map<number, V>();
  const adj = new Map<number, number[]>();
  const add = (k: number, i: number) => { const l = adj.get(k); if (l) l.push(i); else adj.set(k, [i]); };
  for (const [p, q] of edges) {
    const kp = key(p[0], p[1], W), kq = key(q[0], q[1], W);
    verts.set(kp, p); verts.set(kq, q);
    E.push({ a: kp, b: kq, used: false });
    add(kp, E.length - 1); add(kq, E.length - 1);
  }
  const walk = (start: number): V[] => {
    const path: V[] = [verts.get(start)!];
    let cur = start;
    for (;;) {
      const next = adj.get(cur)!.find((i) => !E[i].used);
      if (next === undefined) break;
      E[next].used = true;
      cur = E[next].a === cur ? E[next].b : E[next].a;
      path.push(verts.get(cur)!);
    }
    return path;
  };
  const res: { path: V[]; closed: boolean }[] = [];
  for (const [k, l] of adj) if (l.length % 2 === 1) { while (l.some((i) => !E[i].used)) res.push({ path: walk(k), closed: false }); }
  for (const [k, l] of adj) while (l.some((i) => !E[i].used)) { const path = walk(k); res.push({ path, closed: path.length > 2 && path[0] === path[path.length - 1] }); }
  return res.map((r) => (r.closed ? { path: r.path.slice(0, -1), closed: true } : r));
}

export interface FrontLineOptions {
  sideOf?: (n: NationId) => SideId;
  /** Chaikin iterations (default 2) */
  smooth?: number;
}

/**
 * Front line = boundary between cells owned by `allies` and cells owned by `axis`.
 * Boundary edges are traced on the cell-corner lattice (the zero contour of a marching-squares pass
 * over the ±1 side field, with cells of other/neutral ownership ignored), chained, de-staircased and
 * smoothed with Chaikin corner cutting. Pure & deterministic.
 */
export function computeFrontLine(grid: ControlGrid, opts: FrontLineOptions = {}): LonLat[][] {
  const sideOf = opts.sideOf ?? DEFAULT_SIDE_OF;
  const { cols: W, rows: H } = grid;
  const val = new Int8Array(W * H);
  const sideVal = grid.nations.map((n) => { const s = sideOf(n); return s === 'allies' ? -1 : s === 'axis' ? 1 : 0; });
  for (let i = 0; i < W * H; i++) val[i] = sideVal[grid.owner[i]] ?? 0;
  const edges: [V, V][] = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const v = val[r * W + c];
    if (!v) continue;
    if (c + 1 < W && val[r * W + c + 1] === -v) edges.push([[c + 1, r], [c + 1, r + 1]]); // vertical edge between horizontal neighbours
    if (r + 1 < H && val[(r + 1) * W + c] === -v) edges.push([[c, r + 1], [c + 1, r + 1]]); // horizontal edge between vertical neighbours
  }
  const out: LonLat[][] = [];
  for (const { path, closed } of chain(edges, W)) {
    const simple = dropCollinear(path, closed);
    const ll = simple.map((v) => toLonLat(grid, v));
    const sm = chaikin(ll, opts.smooth ?? 2, closed);
    out.push(closed ? [...sm, sm[0]] : sm);
  }
  return out;
}

export interface ControlPolygon {
  nation: NationId;
  /** all closed loops (unclassified) */
  rings: LonLat[][];
  /** GeoJSON MultiPolygon coordinates: outer ring first, then holes */
  polygons: LonLat[][][];
}

const ringArea = (r: LonLat[]): number => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };

/** Classify loops into outer rings and holes (by nesting depth) → GeoJSON MultiPolygon coordinates. */
export function ringsToPolygons(rings: LonLat[][]): LonLat[][][] {
  const info = rings.map((ring) => ({ ring, area: ringArea(ring) })).sort((a, b) => b.area - a.area);
  const depth: number[] = [], parent: number[] = [];
  for (let i = 0; i < info.length; i++) {
    let d = 0, par = -1;
    for (let j = i - 1; j >= 0; j--) if (pointInPolygon(info[i].ring[0], info[j].ring)) { d++; if (par < 0) par = j; }
    depth.push(d); parent.push(par);
  }
  const polys = new Map<number, LonLat[][]>();
  for (let i = 0; i < info.length; i++) if (depth[i] % 2 === 0) polys.set(i, [info[i].ring]);
  for (let i = 0; i < info.length; i++) if (depth[i] % 2 === 1) polys.get(parent[i])?.push(info[i].ring);
  return [...polys.values()];
}

/**
 * Smooth territorial-control outlines per owning nation (index 0 / NEUTRAL skipped).
 * Each ring is a closed loop (first === last). Orientation: even-odd filling handles holes.
 */
export function computeControlPolygons(grid: ControlGrid, opts: { smooth?: number; include?: (nation: NationId) => boolean } = {}): ControlPolygon[] {
  const { cols: W, rows: H } = grid;
  const res: ControlPolygon[] = [];
  for (let ni = 1; ni < grid.nations.length; ni++) {
    const nation = grid.nations[ni];
    if (nation === 'NEUTRAL' || (opts.include && !opts.include(nation))) continue;
    const edges: [V, V][] = [];
    let any = false;
    const own = (c: number, r: number) => c >= 0 && r >= 0 && c < W && r < H && grid.owner[r * W + c] === ni;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (!own(c, r)) continue;
      any = true;
      if (!own(c, r - 1)) edges.push([[c, r], [c + 1, r]]);
      if (!own(c, r + 1)) edges.push([[c, r + 1], [c + 1, r + 1]]);
      if (!own(c - 1, r)) edges.push([[c, r], [c, r + 1]]);
      if (!own(c + 1, r)) edges.push([[c + 1, r], [c + 1, r + 1]]);
    }
    if (!any) continue;
    const rings: LonLat[][] = [];
    for (const { path } of chain(edges, W)) {
      const ll = dropCollinear(path, true).map((v) => toLonLat(grid, v));
      if (ll.length < 3) continue;
      const sm = chaikin(ll, opts.smooth ?? 2, true);
      rings.push([...sm, sm[0]]);
    }
    res.push({ nation, rings, polygons: ringsToPolygons(rings) });
  }
  return res;
}

/** Rings for an arbitrary per-cell predicate (e.g. contested cells). */
export function computeMaskPolygons(grid: Pick<ControlGrid, 'bbox' | 'cellDeg' | 'cols' | 'rows'>, mask: (i: number) => boolean, smooth = 1): LonLat[][] {
  const { cols: W, rows: H } = grid;
  const own = (c: number, r: number) => c >= 0 && r >= 0 && c < W && r < H && mask(r * W + c);
  const edges: [V, V][] = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!own(c, r)) continue;
    if (!own(c, r - 1)) edges.push([[c, r], [c + 1, r]]);
    if (!own(c, r + 1)) edges.push([[c, r + 1], [c + 1, r + 1]]);
    if (!own(c - 1, r)) edges.push([[c, r], [c, r + 1]]);
    if (!own(c + 1, r)) edges.push([[c + 1, r], [c + 1, r + 1]]);
  }
  const rings: LonLat[][] = [];
  for (const { path } of chain(edges, W)) {
    const ll = dropCollinear(path, true).map((v) => toLonLat(grid, v));
    if (ll.length < 3) continue;
    const sm = chaikin(ll, smooth, true);
    rings.push([...sm, sm[0]]);
  }
  return rings;
}
