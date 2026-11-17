/** Pure helpers for map atmosphere (rendering only, never feeds the sim): sun position, day/night tint, weather look. */
import type { WeatherKind } from '../core/types';

export interface Rgba { r: number; g: number; b: number; a: number }
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Solar altitude in degrees for a UTC time (ms since epoch) at lon/lat (standard declination + hour-angle formula; ~1 degree accuracy, plenty for a tint). */
export function sunAltitudeDeg(utcMs: number, lat: number, lon: number): number {
  const d = new Date(utcMs);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
  const dec = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const solarHour = (d.getUTCHours() + d.getUTCMinutes() / 60 + lon / 15 + 24) % 24;
  const h = ((solarHour - 12) * 15 * Math.PI) / 180, la = (lat * Math.PI) / 180;
  return (Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(h)) * 180) / Math.PI;
}

/** Colour laid over the basemap: nothing by day, warm at dawn/dusk, deep blue at night (alpha stays low so the map stays legible). */
export function dayNightTint(altDeg: number): Rgba {
  const t = clamp((8 - altDeg) / 22); // 0 at alt >= 8 deg, 1 at alt <= -14 deg
  const s = t * t * (3 - 2 * t);
  const warm = clamp(1 - t / 0.55); // dawn/dusk glow at the start of the fade
  const navy = [26, 40, 92], orange = [255, 150, 90];
  return { r: lerp(navy[0], orange[0], warm), g: lerp(navy[1], orange[1], warm), b: lerp(navy[2], orange[2], warm), a: 0.38 * s * (0.55 + 0.45 * (1 - warm)) };
}

export type PrecipKind = 'rain' | 'snow' | 'sand' | 'none';
export interface WeatherLook { veil: Rgba; precip: PrecipKind; count: number; speed: number; lightning: boolean }

/** Look of a weather state: a veil colour over the map plus optional animated precipitation. intensity 0..1. */
export function weatherLook(kind: WeatherKind, intensityIn: number): WeatherLook {
  const i = clamp(intensityIn || 0.5);
  switch (kind) {
    case 'cloud': return { veil: { r: 90, g: 100, b: 115, a: 0.05 + 0.05 * i }, precip: 'none', count: 0, speed: 0, lightning: false };
    case 'rain': return { veil: { r: 70, g: 85, b: 105, a: 0.07 + 0.1 * i }, precip: 'rain', count: Math.round(50 + 150 * i), speed: 1, lightning: false };
    case 'storm': return { veil: { r: 35, g: 45, b: 65, a: 0.16 + 0.14 * i }, precip: 'rain', count: Math.round(110 + 200 * i), speed: 1.6, lightning: true };
    case 'snow': return { veil: { r: 225, g: 235, b: 245, a: 0.07 + 0.1 * i }, precip: 'snow', count: Math.round(45 + 150 * i), speed: 1, lightning: false };
    case 'fog': return { veil: { r: 215, g: 220, b: 224, a: 0.18 + 0.32 * i }, precip: 'none', count: 0, speed: 0, lightning: false };
    case 'mud': return { veil: { r: 110, g: 85, b: 50, a: 0.05 + 0.06 * i }, precip: 'none', count: 0, speed: 0, lightning: false };
    case 'sandstorm': return { veil: { r: 205, g: 170, b: 110, a: 0.14 + 0.24 * i }, precip: 'sand', count: Math.round(60 + 140 * i), speed: 1.4, lightning: false };
    default: return { veil: { r: 0, g: 0, b: 0, a: 0 }, precip: 'none', count: 0, speed: 0, lightning: false };
  }
}
