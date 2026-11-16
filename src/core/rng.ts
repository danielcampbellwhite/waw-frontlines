import type { RngState } from './types';

/** Deterministic mulberry32. State lives in GameState.rng so saves reproduce exactly. */
export function nextFloat(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) | 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const nextInt = (r: RngState, lo: number, hi: number) => lo + Math.floor(nextFloat(r) * (hi - lo + 1));
/** Approximate normal(0,1) (sum of 4 uniforms). */
export function nextGauss(r: RngState): number {
  return (nextFloat(r) + nextFloat(r) + nextFloat(r) + nextFloat(r) - 2) * 1.7320508;
}
export function pickWeighted<T>(r: RngState, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = nextFloat(r) * total;
  for (const [it, w] of items) { if ((x -= w) <= 0) return it; }
  return items[items.length - 1][0];
}
