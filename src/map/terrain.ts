import type { InfraLine, LonLat, TerrainGrid } from '../core/types';
import { Terrain } from '../core/types';

/** Bit flags stored in TerrainGrid.flags */
export const TerrainFlag = { MajorRiver: 1, Coast: 2 } as const;

export interface TerrainSample {
  inBounds: boolean;
  terrain: Terrain;
  elevationM: number;
  /** cell is crossed by a major river (crossing penalty applies on entry) */
  majorRiver: boolean;
  /** land cell adjacent to the sea */
  coast: boolean;
  col: number;
  row: number;
}

const OUT: TerrainSample = { inBounds: false, terrain: Terrain.Sea, elevationM: 0, majorRiver: false, coast: false, col: -1, row: -1 };

/** Fetch and validate a terrain grid JSON (public/data/terrain_*.json). */
export async function loadTerrainGrid(url: string): Promise<TerrainGrid> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`terrain grid ${url}: HTTP ${res.status}`);
  return validateTerrainGrid(await res.json());
}

export async function loadInfra(url: string): Promise<InfraLine[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`infra ${url}: HTTP ${res.status}`);
  return (await res.json()) as InfraLine[];
}

export function validateTerrainGrid(g: TerrainGrid): TerrainGrid {
  if (!g || !g.bbox || !(g.cellDeg > 0) || g.cells?.length !== g.cols * g.rows) throw new Error('invalid TerrainGrid: cells.length !== cols*rows');
  return g;
}

/** Terrain at a lon/lat. Outside the grid → inBounds:false and Terrain.Sea. Allocation-free for out-of-bounds. */
export function sampleTerrain(grid: TerrainGrid, p: LonLat): TerrainSample {
  const col = Math.floor((p[0] - grid.bbox.west) / grid.cellDeg);
  const row = Math.floor((grid.bbox.north - p[1]) / grid.cellDeg);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return OUT;
  const i = row * grid.cols + col;
  const f = grid.flags?.[i] ?? 0;
  return {
    inBounds: true,
    terrain: grid.cells[i] as Terrain,
    elevationM: grid.elevationM?.[i] ?? 0,
    majorRiver: (f & TerrainFlag.MajorRiver) !== 0,
    coast: (f & TerrainFlag.Coast) !== 0,
    col,
    row,
  };
}

/** Terrain code only (Sea outside the grid). */
export function terrainAt(grid: TerrainGrid, p: LonLat): Terrain {
  const col = Math.floor((p[0] - grid.bbox.west) / grid.cellDeg);
  const row = Math.floor((grid.bbox.north - p[1]) / grid.cellDeg);
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return Terrain.Sea;
  return grid.cells[row * grid.cols + col] as Terrain;
}

export const isLand = (t: Terrain): boolean => t !== Terrain.Sea && t !== Terrain.Lake;
