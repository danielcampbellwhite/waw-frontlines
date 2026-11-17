import { useEffect, useImperativeHandle, useRef } from 'react';
import type { Ref } from 'react';
import { Map as MLMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Terrain } from '../core/types';
import type { BBox, Engine, GameState, LonLat, SideId, TerrainGrid, Unit, UnitId } from '../core/types';
import { computeControlPolygons, computeFrontLine, computeMaskPolygons, ringsToPolygons } from './frontline';
import { createBattleIcon, createIllustratedIcon, createPhotoIcon, createUnitIcon, parseIllustrationIconName, parseUnitIconName } from './icons';
import { clusterBySide, overlapBox, separateSides } from './cluster';
import { hashStr, loadThumb, photoFor } from './photos';
import {
  EMPTY, NATION_COLOURS, battlesGeoJSON, boundsOfUnits, controlHash, infraGeoJSON, locationsGeoJSON, routesGeoJSON,
  reliefImageData, supplyGeoJSON, terrainImageData, unitImportance, visibleUnits,
} from './layers';
import { FONT, NE_ATTRIBUTION, dataUrl, styleFor } from './style';
import { regionForTerrain } from './region';
import type { BasemapKind } from './style';

setWorkerUrl(workerUrl);

export interface MapOverlays {
  supply: boolean;
  fog: boolean;
  /** territorial control polygons + front line (default true) */
  control?: boolean;
  /** terrain colour layer (default false) */
  terrain?: boolean;
  /** route lines/ETA of selected units (default true) */
  routes?: boolean;
  /** battle markers (default true) */
  battles?: boolean;
  /** points/line being picked, drawn as a dashed pencil line */
  targetPreview?: LonLat[];
  /** planned waypoints markers */
  planMarkers?: LonLat[];
}

export interface ViewState { zoom: number; center: LonLat; bounds: [number, number, number, number] }

export interface TacticalMapHandle {
  getMap(): MLMap | null;
  flyTo(p: LonLat, zoom?: number): void;
  fitBBox(b: BBox, padding?: number): void;
}

export interface TacticalMapProps {
  engine: Engine;
  selection: UnitId[];
  /** Left click on a unit / shift-drag box. additive=true when ctrl/meta/shift held. Empty clicks do NOT call onSelect (caller clears). */
  onSelect(ids: UnitId[], additive: boolean): void;
  /** button: 0 = left click on empty map, 2 = right click */
  onMapClick(lonlat: LonLat, button?: number): void;
  /** Right click → order destination */
  onContextOrder(lonlat: LonLat): void;
  overlays: MapOverlays;
  /** true = crosshair cursor, clicks always go to onMapClick, no drag-select */
  targeting?: boolean;
  /** fly-to when nonce changes */
  focusRequest?: { pos: LonLat; zoom?: number; nonce: number };
  /** throttled on moveend/zoomend */
  onViewChange?(v: ViewState): void;
  /** Basemap style: the self-contained Natural Earth vector style (the only one; no third-party tile servers) */
  basemap?: BasemapKind;
  /** Optional imperative handle (flyTo / fitBBox / getMap) */
  handleRef?: Ref<TacticalMapHandle>;
  className?: string;
  style?: React.CSSProperties;
}

const ART_Z0 = 6.5, ART_Z1 = 7.5;
const UNIT_LAYERS = ['units-icon', 'units-art'];
/** Frozen water (scenarios with ice only): state.special.sim.ice 0..1 drawn over river lines and Lake cells. Thin ice < 0.35 (pale, dashed), 0.35-0.7 (forming), >= 0.7 solid (white). */
const iceOf = (st: GameState): number => (st.special as { sim?: { ice?: number } } | undefined)?.sim?.ice ?? 0;
function applyIce(map: MLMap, terrain: TerrainGrid, ice: number) {
  const on = ice > 0;
  if (on && !map.getSource('ice-lakes')) {
    const feats: unknown[] = [];
    const { bbox: b, cellDeg: d, cols, cells } = terrain;
    for (let i = 0; i < cells.length; i++) if (cells[i] === Terrain.Lake) {
      const x = b.west + (i % cols) * d, y = b.north - Math.floor(i / cols) * d;
      feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + d, y], [x + d, y - d], [x, y - d], [x, y]]] } });
    }
    map.addSource('ice-lakes', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } as never });
    map.addLayer({ id: 'ice-lakes', type: 'fill', source: 'ice-lakes', layout: { visibility: 'none' }, paint: { 'fill-color': '#e4f2fa', 'fill-opacity': 0, 'fill-antialias': false } }, 'ice-rivers');
  }
  if (!map.getLayer('ice-rivers')) return;
  const thin = ice < 0.35, solid = ice >= 0.7;
  const colour = solid ? '#ffffff' : thin ? '#c9e3f1' : '#e1f0f8';
  const op = Math.min(0.92, 0.25 + ice * 0.7);
  for (const id of ['ice-rivers', 'ice-lakes']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  if (!on) return;
  map.setPaintProperty('ice-rivers', 'line-color', colour);
  map.setPaintProperty('ice-rivers', 'line-opacity', op);
  map.setPaintProperty('ice-rivers', 'line-dasharray', thin ? [1.2, 1.4] : [1, 0]);
  map.setPaintProperty('ice-lakes', 'fill-color', colour);
  map.setPaintProperty('ice-lakes', 'fill-opacity', op * (thin ? 0.55 : solid ? 0.9 : 0.75));
}

const SRC = ['preview', 'plan', 'control', 'contested', 'front', 'rivers', 'infra', 'cities', 'locations', 'units', 'routes', 'battles', 'supply'] as const;
const sideColour = ['match', ['get', 'side'], 'allies', '#3b82d6', 'axis', '#d64545', '#9aa3ad'] as never;
const zoomScale = (a: number, b: number, c: number, d: number) => ['interpolate', ['linear'], ['zoom'], 3, a, 6, b, 9, c, 12, d] as never;

export function TacticalMap(props: TacticalMapProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const boxEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const basemap = props.basemap ?? 'offline';

  useImperativeHandle(props.handleRef, () => ({
    getMap: () => mapRef.current,
    flyTo: (p, zoom) => mapRef.current?.flyTo({ center: p, zoom: zoom ?? mapRef.current.getZoom() }),
    fitBBox: (b, padding = 40) => mapRef.current?.fitBounds([[b.west, b.south], [b.east, b.north]], { padding, duration: 0 }),
  }), []);

  const focusNonce = props.focusRequest?.nonce;
  useEffect(() => {
    const f = propsRef.current.focusRequest;
    if (f && mapRef.current) mapRef.current.flyTo({ center: f.pos, zoom: f.zoom ?? Math.max(mapRef.current.getZoom(), 7), duration: 800 });
  }, [focusNonce]);

  useEffect(() => {
    const el = wrap.current!;
    const p0 = propsRef.current;
    const tb = p0.engine.terrain.bbox;
    const region = regionForTerrain(p0.engine.terrain);
    const map = new MLMap({
      container: el,
      style: styleFor(basemap, region.files),
      bounds: [[tb.west, tb.south], [tb.east, tb.north]],
      fitBoundsOptions: { padding: 20 },
      maxZoom: 13,
      minZoom: 3,
      dragRotate: false,
      pitchWithRotate: false,
      boxZoom: false,
      doubleClickZoom: false,
      attributionControl: { compact: true, customAttribution: NE_ATTRIBUTION },
    });
    map.touchZoomRotate.disableRotation();
    // zoom/pan limits follow the loaded scenario's terrain bbox (not hard-coded)
    {
      const cam = map.cameraForBounds([[tb.west, tb.south], [tb.east, tb.north]], { padding: 10 });
      if (cam?.zoom !== undefined) map.setMinZoom(Math.max(2, cam.zoom - 1));
      const px = (tb.east - tb.west) * 0.25, py = (tb.north - tb.south) * 0.25;
      map.setMaxBounds([[tb.west - px, tb.south - py], [tb.east + px, tb.north + py]]);
    }
    mapRef.current = map;

    // smooth movement: visual-only interpolation between ticks (sim state is never touched)
    const disp = new Map<string, LonLat>();
    let anim: { t0: number; dur: number; from: Map<string, LonLat>; to: Map<string, LonLat> } | null = null;
    let lastMin = NaN, lastTickAt = 0, lastPush = 0;
    // what is currently drawn (refreshed by refresh(); re-clustered on zoom / animation)
    let cur: { units: Unit[]; byId: Map<string, Unit>; sel: Set<string>; cut: Set<string>; art: Map<string, string>; side: SideId } | null = null;
    const pushUnits = (now: number) => {
      if (!cur || !map.getSource('units')) return;
      const t = anim ? Math.min(1, (now - anim.t0) / anim.dur) : 1;
      const items = [];
      const pos = new Map<string, LonLat>();
      for (const u of cur.units) {
        let p: LonLat = u.pos;
        const to = anim?.to.get(u.id), from = anim?.from.get(u.id);
        if (to && from && t < 1) p = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
        disp.set(u.id, p); pos.set(u.id, p);
        const px = map.project(p);
        items.push({ id: u.id, x: px.x, y: px.y, score: unitImportance(u) });
      }
      if (t >= 1) anim = null;
      const box = overlapBox(map.getZoom());
      const sideOf = (id: string) => cur!.byId.get(id)?.side ?? '';
      const clusters = clusterBySide(items, sideOf, box.w, box.h);
      const offs = separateSides(clusters, sideOf, box.w, box.h);
      const features = clusters.map((c) => {
        const lead = cur!.byId.get(c.leader.id)!;
        let sel = 0, enc = 0, cutF = 0, battle = 0;
        const ids: string[] = [], mine: string[] = [];
        for (const m of c.members) {
          const u = cur!.byId.get(m.id)!;
          ids.push(u.id); if (u.side === cur!.side) mine.push(u.id);
          if (cur!.sel.has(u.id)) sel = 1;
          if (u.encircled || u.combatStatus === 'encircled') enc = 1;
          if (cur!.cut.has(u.id)) cutF = 1;
          if (u.inBattle) battle = 1;
        }
        const o = offs.get(lead.id);
        const at: LonLat = o ? ((ll) => [ll.lng, ll.lat] as LonLat)(map.unproject([c.leader.x + o.dx, c.leader.y + o.dy])) : pos.get(lead.id)!;
        const q = Math.max(0, Math.min(4, Math.round((lead.manpower / Math.max(1, lead.manpowerMax)) * 4)));
        return {
          type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: at },
          properties: { id: lead.id, ids: ids.join(','), mine: mine.join(','), n: ids.length, side: lead.side, type: lead.type, label: lead.shortName, score: Math.round(c.leader.score),
            icon: `u-${lead.type}-${lead.side}-${q}`, art: cur!.art.get(lead.id) ?? `i-${lead.type}-${lead.nation}-${lead.side}-${q}`, sel, enc, cut: cutF, battle,
            moving: lead.moveStatus === 'moving' || lead.moveStatus === 'retreating' ? 1 : 0, supply: Math.round(lead.supply) },
        };
      });
      lastPush = now;
      (map.getSource('units') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
    };
    let ready = false, raf = 0, lastSig = '', lastHash = -1, lastControlOn = false, terrainReady = false, fitted = false, disposed = false;
    const added = new Set<string>();

    // ── setup (sources + layers) ──
    const setup = () => {
      for (const s of SRC) map.addSource(s, { type: 'geojson', data: EMPTY });
      map.addImage('battle', createBattleIcon(), { pixelRatio: 2 });
      const L = (l: Parameters<MLMap['addLayer']>[0]) => map.addLayer(l);
      // self-contained basemap shading from the bundled terrain grid (no external tiles): faint terrain tint + hillshade
      {
        const g = propsRef.current.engine.terrain, b = g.bbox, coords: [[number, number], [number, number], [number, number], [number, number]] = [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]];
        const url = (img: { width: number; height: number; data: Uint8ClampedArray }) => {
          const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
          cv.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
          return cv.toDataURL();
        };
        map.addSource('base-tint', { type: 'image', url: url(terrainImageData(g, g.cols * 3)), coordinates: coords });
        map.addSource('base-relief', { type: 'image', url: url(reliefImageData(g)), coordinates: coords });
        L({ id: 'base-tint', type: 'raster', source: 'base-tint', paint: { 'raster-opacity': 0.25, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });
        L({ id: 'base-relief', type: 'raster', source: 'base-relief', paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });
      }
      L({ id: 'control-fill', type: 'fill', source: 'control', paint: { 'fill-color': ['get', 'colour'], 'fill-opacity': 0.26 } });
      L({ id: 'control-line', type: 'line', source: 'control', paint: { 'line-color': ['get', 'colour'], 'line-width': 1.4, 'line-opacity': 0.7 } });
      L({ id: 'contested-fill', type: 'fill', source: 'contested', paint: { 'fill-color': '#ff9f1c', 'fill-opacity': 0.3 } });
      L({ id: 'rivers', type: 'line', source: 'rivers', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#3f86c8', 'line-opacity': 0.85, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.6, 11, 3] } });
      L({ id: 'ice-rivers', type: 'line', source: 'rivers', layout: { 'line-cap': 'butt', visibility: 'none' }, paint: { 'line-color': '#e4f2fa', 'line-opacity': 0, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.4, 8, 3.4, 11, 7] } });
      L({ id: 'infra-rail', type: 'line', source: 'infra', filter: ['==', ['get', 'kind'], 'rail'], layout: { visibility: 'none' }, paint: { 'line-color': '#222', 'line-width': 1.2, 'line-dasharray': [3, 2] } });
      L({ id: 'infra-road', type: 'line', source: 'infra', filter: ['==', ['get', 'kind'], 'road'], layout: { visibility: 'none' }, paint: { 'line-color': '#c98a12', 'line-width': 1.6, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, ['case', ['==', ['get', 'approx'], 1], 0, 1]] as never } }); // schematic (approximate) roads fade out when zoomed in, where they would visibly miss the real road
      L({ id: 'front-casing', type: 'line', source: 'front', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 6, 'line-opacity': 0.75 } });
      L({ id: 'front', type: 'line', source: 'front', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#8a0f0f', 'line-width': 3 } });
      // cities (Natural Earth) – three importance tiers
      const tiers: [string, number, unknown][] = [['0', 3.5, ['<=', ['get', 'rank'], 2]], ['1', 5.5, ['all', ['>', ['get', 'rank'], 2], ['<=', ['get', 'rank'], 5]]], ['2', 7.5, ['>', ['get', 'rank'], 5]]];
      for (const [t, minzoom, filter] of tiers) {
        L({ id: `city-${t}`, type: 'symbol', source: 'cities', minzoom, filter: filter as never, layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.4], 'text-optional': true }, paint: { 'text-color': '#2b2b2b', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.4 } });
        L({ id: `city-dot-${t}`, type: 'circle', source: 'cities', minzoom, filter: filter as never, paint: { 'circle-radius': 2.5, 'circle-color': '#444', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
      }
      // game locations / objectives, tiered by strategic value
      for (const [t, minzoom] of [[0, 3], [1, 5.5], [2, 7]] as const) {
        L({ id: `loc-${t}`, type: 'circle', source: 'locations', minzoom, filter: ['==', ['get', 'tier'], t], paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'value'], 0, 4, 10, 9], 'circle-color': sideColour, 'circle-stroke-color': ['case', ['==', ['get', 'obj'], 1], '#ffd23f', '#fff'], 'circle-stroke-width': ['case', ['==', ['get', 'obj'], 1], 3, 1.5] } });
        L({ id: `loc-label-${t}`, type: 'symbol', source: 'locations', minzoom, filter: ['==', ['get', 'tier'], t], layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': t === 0 ? 13 : 11.5, 'text-anchor': 'top', 'text-offset': [0, 0.9], 'text-optional': true }, paint: { 'text-color': '#101820', 'text-halo-color': '#fff', 'text-halo-width': 1.6 } });
      }
      L({ id: 'supply-nodes', type: 'circle', source: 'supply', layout: { visibility: 'none' }, paint: { 'circle-radius': 12, 'circle-color': 'rgba(76,195,107,0.25)', 'circle-stroke-color': '#2e9e4d', 'circle-stroke-width': 2 } });
      L({ id: 'supply-labels', type: 'symbol', source: 'supply', layout: { visibility: 'none', 'text-field': ['concat', 'Supply ', ['to-string', ['get', 'stock']]], 'text-font': FONT, 'text-size': 10, 'text-anchor': 'bottom', 'text-offset': [0, -1.1] }, paint: { 'text-color': '#14532d', 'text-halo-color': '#fff', 'text-halo-width': 1.4 } });
      L({ id: 'routes-line', type: 'line', source: 'routes', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'planned'], 0]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffd23f', 'line-width': 3, 'line-dasharray': [4, 1.5] } });
      L({ id: 'routes-planned', type: 'line', source: 'routes', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'planned'], 1]], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffd23f', 'line-width': 2.5, 'line-dasharray': [1, 2] } });
      L({ id: 'routes-target', type: 'circle', source: 'routes', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': 'rgba(255,210,63,0.3)', 'circle-stroke-color': '#ffd23f', 'circle-stroke-width': 2.5 } });
      L({ id: 'routes-eta', type: 'symbol', source: 'routes', filter: ['==', ['geometry-type'], 'Point'], layout: { 'text-field': ['case', ['!=', ['get', 'eta'], ''], ['concat', 'ETA ', ['get', 'eta']], ''], 'text-font': FONT, 'text-size': 12, 'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-allow-overlap': true }, paint: { 'text-color': '#3a2c00', 'text-halo-color': '#ffe58a', 'text-halo-width': 2 } });
      L({ id: 'preview-line', type: 'line', source: 'preview', filter: ['==', ['geometry-type'], 'LineString'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#5b4636', 'line-width': 2.5, 'line-dasharray': [2, 2] } });
      L({ id: 'preview-pts', type: 'circle', source: 'preview', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#f4ead0', 'circle-stroke-color': '#5b4636', 'circle-stroke-width': 2 } });
      L({ id: 'plan-pts', type: 'circle', source: 'plan', paint: { 'circle-radius': 6, 'circle-color': '#ffd23f', 'circle-stroke-color': '#3a2c00', 'circle-stroke-width': 2 } });
      L({ id: 'battles-glow', type: 'circle', source: 'battles', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 14, 9, 30], 'circle-color': 'rgba(220,40,40,0.25)', 'circle-stroke-color': 'rgba(220,40,40,0.8)', 'circle-stroke-width': 1.5 } });
      L({ id: 'battles', type: 'symbol', source: 'battles', layout: { 'icon-image': 'battle', 'icon-size': zoomScale(0.5, 0.65, 0.85, 1), 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      L({ id: 'units-sel', type: 'circle', source: 'units', filter: ['==', ['get', 'sel'], 1], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 14, 6, 20, 6.5, 24, 8, 36, 10, 44, 12, 50] as never, 'circle-color': 'rgba(255,210,63,0.18)', 'circle-stroke-color': '#ffd23f', 'circle-stroke-width': 3 } });
      L({ id: 'units-enc', type: 'circle', source: 'units', filter: ['==', ['get', 'enc'], 1], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 17, 6, 24, 6.5, 28, 8, 40, 10, 48, 12, 54] as never, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#e11d1d', 'circle-stroke-width': 3, 'circle-stroke-opacity': 0.9 } });
      // NATO symbols at strategic zoom crossfade into illustrated icons at operational/close zoom
      const symLayout = { 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['+', ['get', 'sel'], ['get', 'battle']] };
      L({ id: 'units-icon', type: 'symbol', source: 'units', maxzoom: ART_Z1, layout: { ...symLayout, 'icon-image': ['get', 'icon'], 'icon-size': zoomScale(0.42, 0.62, 0.85, 1) } as never, paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], ART_Z0, 1, ART_Z1, 0] } });
      L({ id: 'units-art', type: 'symbol', source: 'units', minzoom: ART_Z0, layout: { ...symLayout, 'icon-image': ['get', 'art'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 6.5, 0.6, 8, 0.9, 10, 1.1, 12, 1.2] } as never, paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], ART_Z0, 0, ART_Z1, 1] } });
      L({ id: 'units-label', type: 'symbol', source: 'units', layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': ['step', ['zoom'], 0, 7, 11], 'text-anchor': 'top', 'text-offset': ['interpolate', ['linear'], ['zoom'], 7, ['literal', [0, 2.3]], 8, ['literal', [0, 2.9]], 10, ['literal', [0, 3.8]], 12, ['literal', [0, 4.2]]] as never, 'text-optional': true, 'text-allow-overlap': false, 'symbol-sort-key': ['-', 0, ['get', 'score']] }, paint: { 'text-color': '#101820', 'text-halo-color': '#fff', 'text-halo-width': 1.6 } });
      const badgeT = ['interpolate', ['linear'], ['zoom'], 3, ['literal', [10, -8]], 6, ['literal', [15, -12]], 6.5, ['literal', [19, -15]], 7, ['literal', [26, -22]], 8, ['literal', [32, -26]], 10, ['literal', [39, -32]], 12, ['literal', [43, -35]]] as never;
      L({ id: 'units-count-bg', type: 'circle', source: 'units', filter: ['>', ['get', 'n'], 1], paint: { 'circle-radius': 9, 'circle-color': '#1d2733', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-translate': badgeT } });
      L({ id: 'units-count', type: 'symbol', source: 'units', filter: ['>', ['get', 'n'], 1], layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': FONT, 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#fff', 'text-translate': badgeT } });
      L({ id: 'units-cut', type: 'circle', source: 'units', filter: ['==', ['get', 'cut'], 1], layout: { visibility: 'none' }, paint: { 'circle-radius': 6, 'circle-color': '#ff8c1a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-translate': [18, -14] } });

      // rivers + infra are static
      const infra = propsRef.current.engine.infra;
      (map.getSource('rivers') as GeoJSONSource).setData(infraGeoJSON(infra, new Set(['river'])));
      (map.getSource('infra') as GeoJSONSource).setData(infraGeoJSON(infra, new Set(['road', 'rail'])));

      // cities: skip those already represented by scenario locations
      fetch(dataUrl('data/' + region.files.cities)).then((r) => (r.ok ? r.json() : [])).then((cities: { name: string; lon: number; lat: number; pop: number; rank: number; capital: boolean }[]) => {
        if (disposed || !mapRef.current) return;
        const locs = Object.values(propsRef.current.engine.getState().locations);
        const near = (c: { lon: number; lat: number; name: string }) => locs.some((l) => l.name.toLowerCase() === c.name.toLowerCase() || (Math.abs(l.pos[0] - c.lon) < 0.06 && Math.abs(l.pos[1] - c.lat) < 0.06));
        (map.getSource('cities') as GeoJSONSource).setData({ type: 'FeatureCollection', features: cities.filter((c) => !near(c)).map((c) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { name: c.name, rank: c.capital ? Math.min(c.rank, 2) : c.rank, pop: c.pop } })) });
      }).catch(() => undefined);

      ready = true;
      refresh(true);
    };

    const ensureTerrain = () => {
      if (terrainReady) return;
      terrainReady = true;
      const g = propsRef.current.engine.terrain;
      const img = terrainImageData(g);
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
      const b = g.bbox;
      map.addSource('terrain-img', { type: 'image', url: cv.toDataURL(), coordinates: [[b.west, b.north], [b.east, b.north], [b.east, b.south], [b.west, b.south]] });
      map.addLayer({ id: 'terrain-img', type: 'raster', source: 'terrain-img', paint: { 'raster-opacity': 0.6, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } }, 'control-fill');
    };

    // ── refresh: change-detected, only touches sources when something visible changed ──
    const refresh = (force = false) => {
      if (!ready) return;
      const p = propsRef.current, st = p.engine.getState(), ov = p.overlays;
      const previewKey = JSON.stringify([ov.targetPreview, ov.planMarkers]);
      let selSig = '';
      for (const id of p.selection) { const u = st.units[id]; if (u) selSig += `${id}:${u.orders?.length ?? 0}:${u.route?.length ?? 0}:${u.routeEtaMinutes ?? 0}:${u.moveStatus};`; }
      const sig = `${previewKey}|${st.clock.minutes}|${p.selection.join(',')}|${selSig}|${+ov.supply}${+(ov.control ?? true)}${+ov.fog}${+(ov.terrain ?? false)}${+(ov.routes ?? true)}${+(ov.battles ?? true)}|${st.playerSide}|${Object.keys(st.battles).length}|${iceOf(st)}`;
      if (!force && sig === lastSig) return;
      lastSig = sig;
      const control = ov.control ?? true;

      // visibility toggles
      const vis = (ids: string[], on: boolean) => { for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
      applyIce(map, p.engine.terrain, iceOf(st));
      if (ov.terrain) ensureTerrain();
      vis(['terrain-img'], !!ov.terrain);
      vis(['control-fill', 'control-line', 'contested-fill', 'front-casing', 'front'], control);
      vis(['routes-line', 'routes-planned', 'routes-target', 'routes-eta'], ov.routes ?? true);
      vis(['battles-glow', 'battles'], ov.battles ?? true);
      const pv = ov.targetPreview ?? [];
      (map.getSource('preview') as GeoJSONSource).setData({ type: 'FeatureCollection', features: [...(pv.length > 1 ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: pv } }] : []), ...pv.map((c) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: c } }))] });
      (map.getSource('plan') as GeoJSONSource).setData({ type: 'FeatureCollection', features: (ov.planMarkers ?? []).map((c) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: c } })) });
      vis(['supply-nodes', 'supply-labels', 'infra-rail', 'infra-road', 'units-cut'], ov.supply);

      // units
      const sel = new Set(p.selection);
      const units = visibleUnits(st, (s) => p.engine.visibleUnits(s), ov.fog);
      const art = new Map<string, string>();
      for (const u of units) {
        const q0 = Math.max(0, Math.min(4, Math.round((u.manpower / Math.max(1, u.manpowerMax)) * 4)));
        const an = `i-${u.type}-${u.nation}-${u.side}-${q0}`;
        if (!added.has(an)) { const m = parseIllustrationIconName(an); if (m && !map.hasImage(an)) map.addImage(an, createIllustratedIcon(m.type, m.nation, m.side, m.q), { pixelRatio: 2 }); added.add(an); }
        const name = `u-${u.type}-${u.side}-${q0}`;
        if (!added.has(name)) { const m = parseUnitIconName(name); if (m && !map.hasImage(name)) map.addImage(name, createUnitIcon(m.type, m.side, m.q), { pixelRatio: 2 }); added.add(name); }
        // real photograph thumbnail (src/art) when available; illustration is the fallback
        const info = photoFor(u);
        const img = info ? loadThumb(info.thumb, () => { lastSig = ''; }) : null;
        if (info && img) {
          const pn = `p-${u.type}-${u.nation}-${u.side}-${q0}-${hashStr(info.thumb)}`;
          if (!added.has(pn)) { if (!map.hasImage(pn)) map.addImage(pn, createPhotoIcon(u.type, u.nation, u.side, q0, img), { pixelRatio: 2 }); added.add(pn); }
          art.set(u.id, pn);
        } else art.set(u.id, an);
      }
      const cut = new Set(st.supply.cutOffUnits);
      const now = performance.now();
      if (st.clock.minutes !== lastMin) {
        if (st.clock.minutes > lastMin && lastTickAt) {
          const from = new Map<string, LonLat>(), to = new Map<string, LonLat>();
          for (const u of units) {
            const d = disp.get(u.id);
            if (d && (Math.abs(d[0] - u.pos[0]) > 1e-6 || Math.abs(d[1] - u.pos[1]) > 1e-6) && Math.abs(d[0] - u.pos[0]) < 1 && Math.abs(d[1] - u.pos[1]) < 1) { from.set(u.id, d); to.set(u.id, u.pos); }
          }
          anim = from.size ? { t0: now, dur: Math.min(2000, Math.max(120, now - lastTickAt)), from, to } : null;
        } else anim = null;
        lastMin = st.clock.minutes; lastTickAt = now;
      }
      cur = { units, byId: new Map(units.map((u) => [u.id, u])), sel, cut, art, side: st.playerSide };
      pushUnits(now);
      (map.getSource('routes') as GeoJSONSource).setData(routesGeoJSON(units.filter((u) => sel.has(u.id) && u.side === st.playerSide), sel));
      (map.getSource('battles') as GeoJSONSource).setData(battlesGeoJSON(st));
      (map.getSource('locations') as GeoJSONSource).setData(locationsGeoJSON(st));
      if (ov.supply) (map.getSource('supply') as GeoJSONSource).setData(supplyGeoJSON(st).nodes);

      // control polygons + front line (recomputed only when the ownership raster changed)
      if (control) {
        const h = controlHash(st.control.owner, st.control.nations) ^ controlHash(st.control.contested, []);
        if (h !== lastHash || !lastControlOn) {
          lastHash = h;
          const polys = computeControlPolygons(st.control);
          (map.getSource('control') as GeoJSONSource).setData({ type: 'FeatureCollection', features: polys.map((c) => ({ type: 'Feature', properties: { nation: c.nation, colour: NATION_COLOURS[c.nation] ?? '#999' }, geometry: { type: 'MultiPolygon', coordinates: c.polygons } })) });
          const cont = ringsToPolygons(computeMaskPolygons(st.control, (i) => st.control.contested[i] >= 40));
          (map.getSource('contested') as GeoJSONSource).setData({ type: 'FeatureCollection', features: cont.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: cont } }] : [] });
          (map.getSource('front') as GeoJSONSource).setData({ type: 'FeatureCollection', features: computeFrontLine(st.control).map((l) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: l } })) });
        }
      }
      lastControlOn = control;

      if (!fitted) {
        fitted = true;
        const b = boundsOfUnits(units.filter((u) => u.side === st.playerSide));
        if (b) map.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: 80, maxZoom: 7, duration: 0 });
      }
    };

    let zoomDirty = false;
    map.on('zoom', () => { zoomDirty = true; });
    map.on('zoomend', () => { zoomDirty = true; });
    const loop = () => {
      refresh();
      if (anim || zoomDirty) {
        const now = performance.now();
        if (now - lastPush >= 80) { zoomDirty = false; pushUnits(now); }
      }
      raf = requestAnimationFrame(loop);
    };
    map.on('load', () => { setup(); raf = requestAnimationFrame(loop); });

    // ── interaction ──
    const lonlat = (e: MapMouseEvent): LonLat => [e.lngLat.lng, e.lngLat.lat];
    /** Stacks under a point: [{lead, ids, mine, n}] topmost first. */
    const hitStacks = (x0: number, y0: number, x1 = x0, y1 = y0, r = 12) => {
      if (!map.getLayer('units-art')) return [];
      const f = map.queryRenderedFeatures([[x0 - r, y0 - r], [x1 + r, y1 + r]], { layers: UNIT_LAYERS });
      const seen = new Set<string>();
      const out: { lead: string; ids: string[]; mine: string[]; n: number; pos: LonLat; side: string }[] = [];
      for (const q of f) {
        const id = String(q.properties.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const split = (s: unknown) => (s ? String(s).split(',') : []);
        out.push({ lead: id, ids: split(q.properties.ids), mine: split(q.properties.mine), n: Number(q.properties.n) || 1, pos: (q.geometry as unknown as { coordinates: LonLat }).coordinates, side: String(q.properties.side) });
      }
      return out;
    };
    const hit = (x: number, y: number, r = 12): string[] => hitStacks(x, y, x, y, r).map((s) => s.lead);
    /** What a click on a stack selects: all own units in it, else just the top unit. */
    const pick = (s: { lead: string; mine: string[] }) => (s.mine.length ? s.mine : [s.lead]);
    let suppressClick = false, lastStack = { lead: '', t: 0 };
    map.on('click', (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const p = propsRef.current, stacks = p.targeting ? [] : hitStacks(e.point.x, e.point.y);
      if (stacks.length) {
        // double-click on a pile zooms in so it spreads out
        const nowT = performance.now();
        if (stacks[0].n > 1 && lastStack.lead === stacks[0].lead && nowT - lastStack.t < 400) map.easeTo({ center: stacks[0].pos, zoom: Math.min(12, map.getZoom() + 2), duration: 500 });
        lastStack = { lead: stacks[0].lead, t: nowT };
        p.onSelect(pick(stacks[0]), e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey); return; }
      p.onMapClick(lonlat(e), 0);
    });
    map.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();
      const p = propsRef.current;
      p.onMapClick(lonlat(e), 2);
      p.onContextOrder(lonlat(e));
    });
    map.on('mousemove', (e) => { const p = propsRef.current; map.getCanvas().style.cursor = p.targeting ? 'crosshair' : hit(e.point.x, e.point.y, 8).length ? 'pointer' : ''; });

    // view reporting
    let viewTimer = 0;
    const reportView = () => {
      const cb = propsRef.current.onViewChange; if (!cb) return;
      const c = map.getCenter(), b = map.getBounds();
      cb({ zoom: map.getZoom(), center: [c.lng, c.lat], bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] });
    };
    map.on('moveend', () => { clearTimeout(viewTimer); viewTimer = window.setTimeout(reportView, 120); });
    map.on('load', reportView);

    // shift-drag box select (handled on the wrapper in capture phase so MapLibre never starts a pan)
    let start: { x: number; y: number } | null = null;
    const rectOf = (e: MouseEvent) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !e.shiftKey || propsRef.current.targeting) return;
      e.stopPropagation(); e.preventDefault();
      start = rectOf(e);
      window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    };
    const onMove = (e: MouseEvent) => {
      if (!start || !boxEl.current) return;
      const q = rectOf(e), b = boxEl.current.style;
      b.display = 'block'; b.left = Math.min(start.x, q.x) + 'px'; b.top = Math.min(start.y, q.y) + 'px'; b.width = Math.abs(q.x - start.x) + 'px'; b.height = Math.abs(q.y - start.y) + 'px';
    };
    const onUp = (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      if (!start) return;
      const q = rectOf(e), s = start; start = null;
      if (boxEl.current) boxEl.current.style.display = 'none';
      const p = propsRef.current, additive = e.ctrlKey || e.metaKey;
      const small = Math.abs(q.x - s.x) < 4 && Math.abs(q.y - s.y) < 4;
      let ids: string[];
      if (small) ids = hitStacks(q.x, q.y).slice(0, 1).flatMap(pick);
      else {
        ids = [...new Set(hitStacks(Math.min(s.x, q.x), Math.min(s.y, q.y), Math.max(s.x, q.x), Math.max(s.y, q.y), 0).flatMap((x) => x.mine))];
      }
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 0);
      p.onSelect(ids, additive);
    };
    el.addEventListener('mousedown', onDown, true);
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener('contextmenu', noMenu);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf); clearTimeout(viewTimer);
      el.removeEventListener('mousedown', onDown, true);
      el.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
      map.remove();
      mapRef.current = null;
    };
  }, [basemap]);

  return (
    <div ref={wrap} className={props.className} style={{ position: 'relative', width: '100%', height: '100%', ...props.style }}>
      <div ref={boxEl} style={{ display: 'none', position: 'absolute', zIndex: 5, pointerEvents: 'none', border: '1px dashed #ffd23f', background: 'rgba(255,210,63,0.12)' }} />
    </div>
  );
}
