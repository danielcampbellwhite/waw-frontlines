import type { InfraLine, LonLat, TerrainGrid } from '../core/types';
import { Terrain } from '../core/types';
import { cellOf, gridSpec, type GridSpec } from '../core/geo';

export interface GridInfo {
  spec: GridSpec;
  cols: number;
  rows: number;
  terrain: Uint8Array;
  /** 0 none, 1 road, 2 rail */
  road: Uint8Array;
  /** 1 = river cell or terrain river-flag */
  river: Uint8Array;
  hasRoad: boolean;
  /** km per degree of longitude at each row centre */
  kmPerLon: Float64Array;
  kmPerLat: number;
  // scratch for A*
  g: Float64Array;
  parent: Int32Array;
  stamp: Int32Array;
  closed: Int32Array;
  gen: number;
  cache: Map<string, number[]>; // cell index paths
  infra: InfraLine[];
}

const infoCache = new WeakMap<TerrainGrid, GridInfo>();

export function getGridInfo(terrain: TerrainGrid, infra: InfraLine[]): GridInfo {
  const hit = infoCache.get(terrain);
  if (hit && hit.infra === infra) return hit;
  const spec = gridSpec(terrain.bbox, terrain.cellDeg);
  const n = terrain.cols * terrain.rows;
  const t = new Uint8Array(n);
  for (let i = 0; i < n; i++) t[i] = terrain.cells[i] ?? Terrain.Sea;
  const road = new Uint8Array(n);
  const river = new Uint8Array(n);
  if (terrain.flags) for (let i = 0; i < n; i++) if ((terrain.flags[i] ?? 0) & 1) river[i] = 1;
  let hasRoad = false;
  const mark = (arr: Uint8Array, p: LonLat, v: number) => {
    const c = cellOf(spec, p);
    if (!c) return;
    const i = c[1] * spec.cols + c[0];
    if (arr[i] < v) arr[i] = v;
  };
  for (const line of infra) {
    const arr = line.kind === 'river' ? river : road;
    const v = line.kind === 'rail' ? 2 : 1;
    if (line.kind !== 'river') hasRoad = true;
    for (let k = 1; k < line.coords.length; k++) {
      const a = line.coords[k - 1], b = line.coords[k];
      const len = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      const steps = Math.max(1, Math.ceil(len / (terrain.cellDeg * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        mark(arr, [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], v);
      }
    }
  }
  const kmPerLon = new Float64Array(terrain.rows);
  for (let r = 0; r < terrain.rows; r++) {
    const lat = terrain.bbox.north - (r + 0.5) * terrain.cellDeg;
    kmPerLon[r] = 111.32 * Math.cos((lat * Math.PI) / 180);
  }
  const info: GridInfo = {
    spec, cols: terrain.cols, rows: terrain.rows, terrain: t, road, river, hasRoad, kmPerLon, kmPerLat: 110.57,
    g: new Float64Array(n), parent: new Int32Array(n), stamp: new Int32Array(n), closed: new Int32Array(n), gen: 0,
    cache: new Map(), infra,
  };
  infoCache.set(terrain, info);
  return info;
}

export function cellIdxOf(info: GridInfo, p: LonLat): number {
  const c = cellOf(info.spec, p);
  return c ? c[1] * info.cols + c[0] : -1;
}
export function terrainAt(info: GridInfo, p: LonLat, fallback: Terrain = Terrain.Plains): Terrain {
  const i = cellIdxOf(info, p);
  return i < 0 ? fallback : (info.terrain[i] as Terrain);
}
export function roadAt(info: GridInfo, p: LonLat): number {
  const i = cellIdxOf(info, p);
  return i < 0 ? 0 : info.road[i];
}
/** Fast planar km distance (accurate enough for < 200 km). */
export function fastKm(a: LonLat, b: LonLat): number {
  const dx = (a[0] - b[0]) * 111.32 * Math.cos(((a[1] + b[1]) * Math.PI) / 360);
  const dy = (a[1] - b[1]) * 110.57;
  return Math.sqrt(dx * dx + dy * dy);
}
