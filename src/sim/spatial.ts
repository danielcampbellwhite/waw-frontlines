import type { LonLat } from '../core/types';

/** Simple bucketed spatial hash over degrees. Items keep insertion order inside a bucket (deterministic). */
export class SpatialHash<T> {
  private buckets = new Map<number, T[]>();
  private bLat: number;
  private bLon: number;
  private cellKm: number;
  constructor(cellKm: number, midLat: number) {
    this.cellKm = cellKm;
    this.bLat = cellKm / 110.57;
    this.bLon = cellKm / (111.32 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  }
  private key(ix: number, iy: number) { return (ix + 30000) * 60000 + (iy + 30000); }
  insert(item: T, p: LonLat) {
    const k = this.key(Math.floor(p[0] / this.bLon), Math.floor(p[1] / this.bLat));
    const b = this.buckets.get(k);
    if (b) b.push(item); else this.buckets.set(k, [item]);
  }
  /** Calls fn for every item in buckets overlapping the circle (caller does exact distance test). */
  query(p: LonLat, radiusKm: number, fn: (item: T) => void) {
    const spanLat = Math.ceil(radiusKm / this.cellKm), spanLon = spanLat;
    const cx = Math.floor(p[0] / this.bLon), cy = Math.floor(p[1] / this.bLat);
    for (let ix = cx - spanLon; ix <= cx + spanLon; ix++) {
      for (let iy = cy - spanLat; iy <= cy + spanLat; iy++) {
        const b = this.buckets.get(this.key(ix, iy));
        if (b) for (let i = 0; i < b.length; i++) fn(b[i]);
      }
    }
  }
}
