import type { ComponentType } from 'react';
import type { Engine, LonLat, UnitId, Unit } from '../core/types';

export interface MapOverlays {
  routes: boolean; supply: boolean; battles: boolean; fog: boolean;
  targetPreview?: LonLat[];
  planMarkers?: LonLat[];
}
export interface MapView { zoom: number; center: LonLat; bounds: [west: number, south: number, east: number, north: number] }
export interface FocusRequest { pos: LonLat; zoom?: number; nonce: number }

/** Props the UI passes to <TacticalMap/> (agreed with the map engineer). */
export interface TacticalMapProps {
  engine: Engine;
  selection: UnitId[];
  onSelect: (ids: UnitId[], additive: boolean) => void;
  onMapClick: (pos: LonLat, button?: number) => void;
  onContextOrder: (pos: LonLat) => void;
  overlays: MapOverlays;
  targeting: boolean;
  focusRequest?: FocusRequest;
  onViewChange?: (v: MapView) => void;
}

// Auto-detect the map engineer's module so the UI compiles and runs whether or not src/map exists yet.
const found = import.meta.glob('../map/index.{ts,tsx}', { eager: true }) as Record<string, { default?: ComponentType<TacticalMapProps>; TacticalMap?: ComponentType<TacticalMapProps> }>;
const mod = Object.values(found)[0];
export const RealTacticalMap: ComponentType<TacticalMapProps> | null = mod?.default ?? mod?.TacticalMap ?? null;

/** Vector unit illustration from the map module (`unitIllustrationSvg(type, nation)`), or null until it exists. */
type IllustrationFn = (type: string, nation: string) => string;
const maybeFn = (mod as unknown as { unitIllustrationSvg?: IllustrationFn } | undefined)?.unitIllustrationSvg;
export const unitIllustrationSvg: IllustrationFn | null = typeof maybeFn === 'function' ? maybeFn : null;

/** Real photo info from the art module (`unitPhoto(type, nation, hint, variantSeed)`), or null so callers keep the drawn icon. */
export interface PhotoInfo { thumb: string; panel?: string; credit?: string; subject?: string }
type ArtMod = { unitPhoto?: (type: string, nation: string, hint?: string, seed?: string) => PhotoInfo | null; mainEquipmentKey?: (held: Record<string, number>) => string | undefined };
const artFound = import.meta.glob('../art/index.ts', { eager: true }) as Record<string, ArtMod>;
const art = Object.values(artFound)[0];
/** hint = main equipment key; seed = unit id so same-type units can show different photos. */
export function unitPhotoInfo(type: string, nation: string, equipment?: Unit['equipment'], seed?: string): PhotoInfo | null {
  if (typeof art?.unitPhoto !== 'function') return null;
  try {
    const hint = equipment && typeof art.mainEquipmentKey === 'function' ? art.mainEquipmentKey(equipment.held) : undefined;
    const r = art.unitPhoto(type, nation, hint, seed);
    return r && typeof r.thumb === 'string' ? r : null;
  } catch { return null; }
}
