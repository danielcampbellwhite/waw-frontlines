import type { Feature, FeatureCollection, LineString, MultiPolygon, Point } from 'geojson';
import type { BBox, GameState, InfraLine, LonLat, NationId, SideId, Terrain as TerrainCode, TerrainGrid, Unit } from '../core/types';
import { Terrain } from '../core/types';
import { illustrationIconName, unitIconName } from './icons';

export const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

export const NATION_COLOURS: Record<NationId, string> = {
  GER: '#7b7f86', ITA: '#6f9a52', JPN: '#d8c9d6', FRA: '#4a78c2', GBR: '#3aa6a0', USA: '#4f8f4f', SOV: '#b34a4a',
  CAN: '#b3566b', POL: '#a8508a', BEL: '#d9b13a', NED: '#e58f3a', AUS: '#7aa0d0', NZL: '#5aa0a0', IND: '#c78f4a', RSA: '#6f9a5a', ROU: '#c9b23a', HUN: '#7a9a4a', CHN: '#c9a04a', NEUTRAL: '#999999',
};

export const TERRAIN_COLOURS: Record<number, string> = {
  [Terrain.Sea]: 'rgba(0,0,0,0)', [Terrain.Plains]: '#d6dc94', [Terrain.Forest]: '#4b8a46', [Terrain.Hills]: '#c0a868',
  [Terrain.Mountains]: '#8d7b6c', [Terrain.Marsh]: '#79b0a6', [Terrain.Urban]: '#7d7d85', [Terrain.Desert]: '#e6d28a',
  [Terrain.Jungle]: '#2f7a3a', [Terrain.Lake]: '#4f94cf', [Terrain.Bocage]: '#8a9a5b',
};

const pt = (c: LonLat): Point => ({ type: 'Point', coordinates: c });
const feat = <G extends Point | LineString | MultiPolygon>(geometry: G, properties: Record<string, unknown>): Feature<G> => ({ type: 'Feature', geometry, properties });

export function fmtEta(minutes: number): string {
  if (!(minutes > 0)) return '';
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = Math.round(minutes % 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return m && h < 6 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Which units the player may see on the map. */
export function visibleUnits(state: Readonly<GameState>, engineVisible: (s: SideId) => Unit[], fog: boolean): Unit[] {
  const base = fog ? engineVisible(state.playerSide) : Object.values(state.units);
  const out: Unit[] = [];
  const seen = new Set<string>();
  for (const u of base) if (!u.destroyed && !u.surrendered && !seen.has(u.id)) { seen.add(u.id); out.push(u); }
  if (fog) for (const u of Object.values(state.units)) if (u.side === state.playerSide && !u.destroyed && !u.surrendered && !seen.has(u.id)) { seen.add(u.id); out.push(u); }
  return out;
}

export const strengthQ = (u: Unit): number => Math.max(0, Math.min(4, Math.round((u.manpower / Math.max(1, u.manpowerMax)) * 4)));

export function unitsGeoJSON(units: Unit[], selected: ReadonlySet<string>, cut: ReadonlySet<string>): FeatureCollection<Point> {
  const features = units.map((u) => feat(pt(u.pos), {
    id: u.id, name: u.name, label: u.shortName, side: u.side, type: u.type, domain: u.domain,
    icon: unitIconName(u.type, u.side, strengthQ(u)), art: illustrationIconName(u.type, u.nation, u.side, strengthQ(u)), sel: selected.has(u.id) ? 1 : 0,
    enc: u.encircled || u.combatStatus === 'encircled' ? 1 : 0, cut: cut.has(u.id) ? 1 : 0,
    moving: u.moveStatus === 'moving' || u.moveStatus === 'retreating' ? 1 : 0, battle: u.inBattle ? 1 : 0,
    org: Math.round(u.organisation), supply: Math.round(u.supply),
  }));
  return { type: 'FeatureCollection', features };
}

/** Route lines + ETA labels for selected units. */
export function routesGeoJSON(units: Unit[], selected: ReadonlySet<string>): FeatureCollection {
  const features: Feature[] = [];
  for (const u of units) {
    if (!selected.has(u.id)) continue;
    const order = u.orders?.find((o) => o.status === 'active') ?? u.orders?.[0];
    const route = u.route && u.route.length ? u.route : null;
    const target: LonLat | undefined = route ? route[route.length - 1] : order?.target;
    if (!target) continue;
    const coords: LonLat[] = [u.pos, ...(route ?? [target])];
    features.push(feat({ type: 'LineString', coordinates: coords } as LineString, { id: u.id, side: u.side, planned: route ? 0 : 1, kind: order?.kind ?? 'move' }));
    features.push(feat(pt(target), { id: u.id, kind: order?.kind ?? 'move', eta: route ? fmtEta(u.routeEtaMinutes ?? 0) : '' }));
  }
  return { type: 'FeatureCollection', features };
}

export function battlesGeoJSON(state: Readonly<GameState>): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: Object.values(state.battles).map((b) => feat(pt(b.pos), { id: b.id, rounds: b.rounds, n: b.attackers.length + b.defenders.length })),
  };
}

export function locationsGeoJSON(state: Readonly<GameState>): FeatureCollection<Point> {
  const objLoc = new Set<string>();
  for (const o of state.objectives) {
    if (o.status !== 'pending' || o.side !== state.playerSide) continue;
    const c = o.condition;
    if (c.kind === 'hold_location' || c.kind === 'capture_location') objLoc.add(c.locationId);
  }
  return {
    type: 'FeatureCollection',
    features: Object.values(state.locations).map((l) => feat(pt(l.pos), {
      id: l.id, name: l.name, kind: l.kind, value: l.value, owner: l.owner,
      side: state.nations[l.owner]?.side ?? 'neutral', obj: objLoc.has(l.id) ? 1 : 0, damaged: l.damaged ?? 0,
      // tier controls the zoom at which the label appears (0 always-ish … 2 close-up)
      tier: l.value >= 8 ? 0 : l.value >= 5 ? 1 : 2,
    })),
  };
}

export function supplyGeoJSON(state: Readonly<GameState>): { nodes: FeatureCollection<Point> } {
  const nodes: Feature<Point>[] = [];
  for (const n of state.supply.nodes) {
    const loc = state.locations[n.locationId];
    if (loc) nodes.push(feat(pt(loc.pos), { id: n.locationId, name: loc.name, stock: Math.round(n.stock), throughput: n.throughput }));
  }
  return { nodes: { type: 'FeatureCollection', features: nodes } };
}

export function infraGeoJSON(infra: InfraLine[], kinds: ReadonlySet<string>): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: infra.filter((l) => kinds.has(l.kind)).map((l) => feat({ type: 'LineString', coordinates: l.coords } as LineString, { kind: l.kind, name: l.name ?? '', historical: l.historical ? 1 : 0, approx: (l as { approximate?: boolean }).approximate ? 1 : 0 })),
  };
}

/** [west, south, east, north] */
export function boundsOfUnits(units: Unit[]): BBox | null {
  if (!units.length) return null;
  let w = 180, e = -180, s = 90, n = -90;
  for (const u of units) { w = Math.min(w, u.pos[0]); e = Math.max(e, u.pos[0]); s = Math.min(s, u.pos[1]); n = Math.max(n, u.pos[1]); }
  return { west: w, east: e, south: s, north: n };
}

/** Fast change signature of an owner array (FNV-1a over cells + nation palette). */
export function controlHash(owner: ArrayLike<number>, nations: readonly string[]): number {
  let h = 2166136261;
  for (let i = 0; i < owner.length; i++) { h ^= owner[i] + 1; h = Math.imul(h, 16777619); }
  for (const n of nations) for (let i = 0; i < n.length; i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Render the terrain grid to an RGBA image resampled into Web-Mercator rows so it aligns with MapLibre. */
export function terrainImageData(g: TerrainGrid, width = g.cols * 2): { width: number; height: number; data: Uint8ClampedArray } {
  const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const yN = merc(g.bbox.north), yS = merc(g.bbox.south);
  const lonSpan = ((g.bbox.east - g.bbox.west) * Math.PI) / 180;
  const height = Math.round((width * (yN - yS)) / lonSpan);
  const data = new Uint8ClampedArray(width * height * 4);
  const rgb = new Map<number, [number, number, number, number]>();
  for (const [k, v] of Object.entries(TERRAIN_COLOURS)) {
    if (v.startsWith('rgba')) { rgb.set(+k, [0, 0, 0, 0]); continue; }
    rgb.set(+k, [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 255]);
  }
  for (let y = 0; y < height; y++) {
    const my = yN - ((y + 0.5) / height) * (yN - yS);
    const lat = (Math.atan(Math.sinh(my)) * 180) / Math.PI;
    const row = Math.min(g.rows - 1, Math.max(0, Math.floor((g.bbox.north - lat) / g.cellDeg)));
    for (let x = 0; x < width; x++) {
      const col = Math.min(g.cols - 1, Math.floor((x / width) * g.cols));
      const ci = row * g.cols + col;
      let c = rgb.get(g.cells[ci] as TerrainCode) ?? [0, 0, 0, 0];
      if (g.flags && (g.flags[ci] & 8) && c[3]) c = [232, 205, 120, 255]; // flag bit 8 = landing-beach candidate: sand colour (cells are only 2 px wide in this image, so no hatching)
      const o = (y * width + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3];
    }
  }
  return { width, height, data };
}

const TYPE_WEIGHT: Partial<Record<string, number>> = { hq: 60, carrier: 58, armoured: 50, naval: 48, mechanised: 44, air_bomber: 42, air_fighter: 40, artillery: 36, motorised: 30, paratroop: 30, infantry: 26, antitank: 22, recon: 20, engineer: 16, logistics: 10 };
/** Stack priority: which unit's picture represents a pile. */
export const unitImportance = (u: Unit): number => (TYPE_WEIGHT[u.type] ?? 10) * 1000 + u.manpower / 10 + (u.inBattle ? 500 : 0);
