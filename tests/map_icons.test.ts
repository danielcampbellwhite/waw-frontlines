import { describe, expect, it } from 'vitest';
import type { NationId } from '../src/core/types';
import { UNIT_TYPES, unitIllustrationSvg } from '../src/map/illustrations';
import { illustrationIconName, parseIllustrationIconName, parseUnitIconName, unitIconName } from '../src/map/icons';

const NATIONS: NationId[] = ['GER', 'FRA', 'GBR', 'USA', 'POL', 'NEUTRAL'];

describe('unitIllustrationSvg', () => {
  it('covers every unit type and nation with self-contained SVG', () => {
    for (const t of UNIT_TYPES) for (const n of NATIONS) {
      const svg = unitIllustrationSvg(t, n);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain('viewBox="0 0 64 40"');
      expect(svg).not.toMatch(/<image|href=|<script|url\(/);
      expect((svg.match(/<path /g) ?? []).length).toBeGreaterThan(4);
      expect(svg).not.toContain('NaN');
      // every path has data
      for (const m of svg.matchAll(/ d="([^"]*)"/g)) expect(m[1].length).toBeGreaterThan(3);
    }
  });
  it('has nation variants for armour, aircraft and infantry', () => {
    for (const t of ['armoured', 'air_fighter', 'air_bomber', 'infantry'] as const) {
      const set = new Set(['GER', 'FRA', 'GBR'].map((n) => unitIllustrationSvg(t, n as NationId)));
      expect(set.size).toBe(3);
    }
    expect(unitIllustrationSvg('armoured', 'USA')).toBe(unitIllustrationSvg('armoured', 'POL'));
  });
  it('is deterministic', () => {
    expect(unitIllustrationSvg('armoured', 'GER')).toBe(unitIllustrationSvg('armoured', 'GER'));
  });
});

describe('icon names', () => {
  it('round trips', () => {
    expect(parseIllustrationIconName(illustrationIconName('air_bomber', 'GBR', 'allies', 3))).toEqual({ type: 'air_bomber', nation: 'GBR', side: 'allies', q: 3 });
    expect(parseUnitIconName(unitIconName('hq', 'axis', 0))).toEqual({ type: 'hq', side: 'axis', q: 0 });
  });
});
