import { describe, expect, it } from 'vitest';
import { dayNightTint, sunAltitudeDeg, weatherLook } from '../src/map/atmosphere';
import { computeVisibleFront } from '../src/map/frontline';

describe('sun and tint', () => {
  it('noon is high and midnight is below the horizon at Normandy in June', () => {
    const noon = Date.UTC(1944, 5, 6, 12, 0) , mid = Date.UTC(1944, 5, 6, 0, 0);
    expect(sunAltitudeDeg(noon, 49.3, -0.5)).toBeGreaterThan(55);
    expect(sunAltitudeDeg(mid, 49.3, -0.5)).toBeLessThan(-10);
  });
  it('white nights: Leningrad in June stays much brighter than Stalingrad in December at midnight', () => {
    expect(sunAltitudeDeg(Date.UTC(1941, 5, 22, 22, 30), 59.9, 30.3)).toBeGreaterThan(-8);
    expect(sunAltitudeDeg(Date.UTC(1942, 11, 19, 20, 0), 48.7, 44.5)).toBeLessThan(-20);
  });
  it('tint is none by day, subtle and blue at night', () => {
    expect(dayNightTint(40).a).toBe(0);
    const n = dayNightTint(-30);
    expect(n.a).toBeGreaterThan(0.2); expect(n.a).toBeLessThan(0.45); expect(n.b).toBeGreaterThan(n.r);
  });
});

describe('weather look', () => {
  it('maps each state', () => {
    expect(weatherLook('clear', 1).veil.a).toBe(0);
    expect(weatherLook('rain', 0.7).precip).toBe('rain');
    expect(weatherLook('storm', 0.7).lightning).toBe(true);
    expect(weatherLook('snow', 0.7).precip).toBe('snow');
    expect(weatherLook('fog', 0.7).veil.a).toBeGreaterThan(weatherLook('cloud', 0.7).veil.a);
    expect(weatherLook('rain', 1).count).toBeGreaterThan(weatherLook('rain', 0.2).count);
  });
});

describe('visible front line', () => {
  const bbox = { west: 0, east: 10, south: 45, north: 50 };
  it('runs between the two sides', () => {
    const lines = computeVisibleFront([{ pos: [4.5, 47], side: 'allies' }, { pos: [4.5, 48], side: 'allies' }, { pos: [5.5, 47], side: 'axis' }, { pos: [5.5, 48], side: 'axis' }], bbox);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) for (const [x] of l) { expect(x).toBeGreaterThan(4.6); expect(x).toBeLessThan(5.4); }
  });
  it('has no line when only one side is visible (fog) or the sides are far apart', () => {
    expect(computeVisibleFront([{ pos: [2, 47], side: 'allies' }], bbox)).toEqual([]);
    expect(computeVisibleFront([{ pos: [0.2, 45.2], side: 'allies' }, { pos: [9.8, 49.8], side: 'axis' }], bbox, { rangeKm: 100 })).toEqual([]);
  });
});
