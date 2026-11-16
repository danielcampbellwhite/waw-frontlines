import { describe, expect, it } from 'vitest';
import type { ControlGrid } from '../src/core/types';
import { chaikin, computeControlPolygons, computeFrontLine } from '../src/map/frontline';

function grid(cols: number, rows: number, f: (c: number, r: number) => number): ControlGrid {
  const owner: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) owner.push(f(c, r));
  return { bbox: { west: 0, south: 0, east: cols, north: rows }, cellDeg: 1, cols, rows, nations: ['NEUTRAL', 'FRA', 'GER'], owner, contested: owner.map(() => 0) };
}

describe('computeFrontLine', () => {
  it('returns a single vertical line between two halves', () => {
    const g = grid(10, 6, (c) => (c < 5 ? 1 : 2));
    const fl = computeFrontLine(g, { smooth: 0 });
    expect(fl).toHaveLength(1);
    expect(fl[0].every((p) => p[0] === 5)).toBe(true);
    expect(fl[0][0][1]).not.toBe(fl[0][fl[0].length - 1][1]);
  });
  it('is empty when one side owns everything or only neutral touches', () => {
    expect(computeFrontLine(grid(8, 8, () => 1))).toEqual([]);
    expect(computeFrontLine(grid(8, 8, (c) => (c < 4 ? 1 : 0)))).toEqual([]);
  });
  it('smoothing keeps endpoints and stays within the bbox', () => {
    const g = grid(20, 12, (c, r) => (c < 8 + (r % 2) ? 1 : 2));
    const fl = computeFrontLine(g, { smooth: 2 });
    expect(fl.length).toBeGreaterThan(0);
    for (const line of fl) for (const [x, y] of line) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(20); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(12); }
    const raw = computeFrontLine(g, { smooth: 0 })[0];
    expect(fl[0][0]).toEqual(raw[0]);
    expect(fl[0][fl[0].length - 1]).toEqual(raw[raw.length - 1]);
  });
  it('encircled pocket gives a closed loop', () => {
    const g = grid(10, 10, (c, r) => (c >= 3 && c <= 5 && r >= 3 && r <= 5 ? 2 : 1));
    const fl = computeFrontLine(g, { smooth: 1 });
    expect(fl).toHaveLength(1);
    expect(fl[0][0]).toEqual(fl[0][fl[0].length - 1]);
  });
  it('is deterministic', () => {
    const g = grid(15, 9, (c, r) => (c + (r % 3) < 7 ? 1 : 2));
    expect(computeFrontLine(g)).toEqual(computeFrontLine(g));
  });
});

describe('computeControlPolygons', () => {
  it('produces closed smooth rings per nation, skipping NEUTRAL', () => {
    const g = grid(10, 6, (c) => (c < 5 ? 1 : c < 8 ? 2 : 0));
    const polys = computeControlPolygons(g);
    expect(polys.map((p) => p.nation).sort()).toEqual(['FRA', 'GER']);
    for (const p of polys) for (const ring of p.rings) expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});

describe('chaikin', () => {
  it('doubles points for closed rings', () => {
    const sq: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(chaikin(sq, 1, true)).toHaveLength(8);
  });
});
