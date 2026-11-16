import type { StyleSpecification } from 'maplibre-gl';
import type { RegionFiles } from './region';
import { REGIONS } from './region';

export type BasemapKind = 'osm' | 'offline';

/** Resolve a path under public/ to an absolute URL (MapLibre fetches in a worker, so relative URLs break). */
export function dataUrl(p: string): string {
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return new URL(base.replace(/\/?$/, '/') + p.replace(/^\//, ''), globalThis.location?.href ?? 'http://localhost/').href;
}

export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const NE_ATTRIBUTION = 'Map data: <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain); elevation: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>; land cover: CORINE 2018 (EEA, Copernicus) and ESA WorldCover 2021 (CC BY 4.0); rivers/roads: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (ODbL)';

const glyphs = () => dataUrl('data/fonts/') + '{fontstack}/{range}.pbf';
export const FONT = ['Open Sans Regular,Arial Unicode MS Regular'];

/** Real relief (AWS Terrain Tiles, terrarium, up to z15): keeps escarpments/wadis/ridges visible when the basemap has no features (open desert at deep zoom). Tiles are optional: if they fail the map still renders. */
const DEM_SOURCE = { type: 'raster-dem' as const, tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 15, encoding: 'terrarium' as const, attribution: NE_ATTRIBUTION };
const RELIEF_LAYER = { id: 'relief', type: 'hillshade' as const, source: 'dem', paint: { 'hillshade-exaggeration': 0.8, 'hillshade-shadow-color': '#4a3f33', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#6b5d4d' } };

/** Raster OpenStreetMap basemap (needs network; mutes colours so game layers stay legible). */
export function osmStyle(tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'): StyleSpecification {
  return {
    version: 8,
    glyphs: glyphs(),
    sources: { osm: { type: 'raster', tiles: [tileUrl], tileSize: 256, maxzoom: 19, attribution: OSM_ATTRIBUTION }, dem: DEM_SOURCE },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#aab7c4' } },
      { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.55, 'raster-brightness-max': 0.88, 'raster-contrast': 0.05 } },
      RELIEF_LAYER,
    ],
  };
}

/** Fully offline vector basemap from Natural Earth data shipped in public/data. */
export function offlineStyle(files: Pick<RegionFiles, 'land' | 'lakes' | 'boundaries'> = REGIONS[0].files): StyleSpecification {
  return {
    version: 8,
    glyphs: glyphs(),
    sources: {
      land: { type: 'geojson', data: dataUrl('data/' + files.land), attribution: NE_ATTRIBUTION },
      lakes: { type: 'geojson', data: dataUrl('data/' + files.lakes) },
      borders: { type: 'geojson', data: dataUrl('data/' + files.boundaries) },
      dem: DEM_SOURCE,
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#a9c4d8' } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#e4e1d3' } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': '#a9c4d8' } },
      RELIEF_LAYER,
      { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#7a95a8', 'line-width': 0.8 } },
      { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': '#8b7f7f', 'line-width': 1, 'line-dasharray': [4, 2] } },
    ],
  };
}

export const styleFor = (k: BasemapKind, files?: Pick<RegionFiles, 'land' | 'lakes' | 'boundaries'>): StyleSpecification => (k === 'osm' ? osmStyle() : offlineStyle(files));
