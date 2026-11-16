import type { BBox, LonLat } from './types';

const R = 6371.0088; // km
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance in km. */
export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing a→b in degrees 0..360. */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Point reached travelling distKm from a on bearing. */
export function destination(a: LonLat, bearing: number, distKm: number): LonLat {
  const d = distKm / R, br = rad(bearing), lat1 = rad(a[1]), lon1 = rad(a[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [deg(lon2), deg(lat2)];
}

/** Move from a toward b by distKm (clamped at b). */
export function moveToward(a: LonLat, b: LonLat, distKm: number): LonLat {
  const total = haversineKm(a, b);
  if (total <= distKm || total === 0) return [b[0], b[1]];
  return destination(a, bearingDeg(a, b), distKm);
}

export function pathLengthKm(p: LonLat[]): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += haversineKm(p[i - 1], p[i]);
  return s;
}

export function inBBox(p: LonLat, b: BBox): boolean {
  return p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north;
}

export function pointInPolygon(p: LonLat, poly: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Grid helpers: rows count from NORTH. */
export interface GridSpec { bbox: BBox; cellDeg: number; cols: number; rows: number }
export function gridSpec(bbox: BBox, cellDeg: number): GridSpec {
  return { bbox, cellDeg, cols: Math.ceil((bbox.east - bbox.west) / cellDeg), rows: Math.ceil((bbox.north - bbox.south) / cellDeg) };
}
export function cellOf(g: GridSpec, p: LonLat): [col: number, row: number] | null {
  const c = Math.floor((p[0] - g.bbox.west) / g.cellDeg);
  const r = Math.floor((g.bbox.north - p[1]) / g.cellDeg);
  return c < 0 || r < 0 || c >= g.cols || r >= g.rows ? null : [c, r];
}
export function cellCenter(g: GridSpec, col: number, row: number): LonLat {
  return [g.bbox.west + (col + 0.5) * g.cellDeg, g.bbox.north - (row + 0.5) * g.cellDeg];
}
export const cellIndex = (g: GridSpec, col: number, row: number) => row * g.cols + col;
