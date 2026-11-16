import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InfraLine, TerrainGrid } from '../src/core/types';
import { Terrain } from '../src/core/types';
import { sampleTerrain, terrainAt, validateTerrainGrid } from '../src/map/terrain';

const dir = path.resolve(__dirname, '../public/data');
const grid = validateTerrainGrid(JSON.parse(fs.readFileSync(path.join(dir, 'terrain_westeurope.json'), 'utf8')) as TerrainGrid);

describe('terrain_westeurope.json', () => {
  it('has consistent dimensions', () => {
    expect(grid.cellDeg).toBe(0.05);
    expect(grid.cells.length).toBe(grid.cols * grid.rows);
    expect(grid.elevationM?.length).toBe(grid.cells.length);
    expect(grid.flags?.length).toBe(grid.cells.length);
  });
  it('real geography sanity checks', () => {
    expect(terrainAt(grid, [2.35, 48.85])).toBe(Terrain.Urban);        // Paris
    expect(terrainAt(grid, [-1.0, 50.2])).toBe(Terrain.Sea);           // English Channel
    expect(terrainAt(grid, [6.86, 45.83])).toBe(Terrain.Mountains);    // Mont Blanc massif
    expect(terrainAt(grid, [6.55, 46.45])).toBe(Terrain.Lake);         // Lake Geneva
    expect(sampleTerrain(grid, [4.95, 49.7]).majorRiver).toBe(true);   // Meuse at Sedan
    expect(sampleTerrain(grid, [2.37, 51.03]).coast).toBe(true);       // Dunkirk
    expect(sampleTerrain(grid, [4.1, 50.0]).elevationM).toBeGreaterThan(50);
  });
  it('out of bounds is Sea', () => {
    expect(sampleTerrain(grid, [20, 50]).inBounds).toBe(false);
    expect(terrainAt(grid, [20, 50])).toBe(Terrain.Sea);
  });
});

describe('infra_westeurope.json', () => {
  const infra = JSON.parse(fs.readFileSync(path.join(dir, 'infra_westeurope.json'), 'utf8')) as InfraLine[];
  it('has rivers incl. Seine/Meuse and flags non-historical roads/rail', () => {
    const names = new Set(infra.filter((l) => l.kind === 'river').map((l) => l.name));
    expect(names.has('Seine')).toBe(true);
    expect([...names].some((n) => n === 'Maas' || n === 'Meuse')).toBe(true);
    expect(infra.filter((l) => l.kind !== 'river').every((l) => l.historical === false)).toBe(true);
    expect(infra.every((l) => l.coords.length >= 2)).toBe(true);
  });
});

const load = (f: string) => validateTerrainGrid(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as TerrainGrid);

describe('terrain_ardennes.json', () => {
  const g = load('terrain_ardennes.json');
  it('real Ardennes geography', () => {
    expect(g.cellDeg).toBe(0.02);
    expect(terrainAt(g, [5.72, 50.0])).toBe(Terrain.Urban);             // Bastogne
    expect(terrainAt(g, [6.03, 50.05])).toBe(Terrain.Forest);           // Clervaux woods
    expect(sampleTerrain(g, [4.91, 50.26]).majorRiver).toBe(true);      // Dinant on the Meuse
    expect(sampleTerrain(g, [6.27, 50.45]).elevationM).toBeGreaterThan(500); // Elsenborn ridge
    const forest = g.cells.filter((c) => c === Terrain.Forest).length / g.cells.length;
    expect(forest).toBeGreaterThan(0.2);
  });
});

describe('terrain_northafrica.json', () => {
  const g = load('terrain_northafrica.json');
  it('Cyrenaica and Western Desert geography', () => {
    expect(terrainAt(g, [23.96, 32.08])).toBe(Terrain.Urban);           // Tobruk
    expect(terrainAt(g, [20.07, 32.12])).toBe(Terrain.Urban);           // Benghazi
    expect(terrainAt(g, [24.5, 31.55])).toBe(Terrain.Plains);           // Sidi Rezegh plateau
    expect(terrainAt(g, [22.0, 29.8])).toBe(Terrain.Desert);            // sand sea interior
    expect(terrainAt(g, [24.0, 33.5])).toBe(Terrain.Sea);               // Mediterranean
    expect(sampleTerrain(g, [21.5, 32.6]).elevationM).toBeGreaterThan(300); // Jebel Akhdar
  });
});
