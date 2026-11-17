import { describe, expect, it } from 'vitest';
import { allPhotoCredits, mainEquipmentKey, unitPhoto } from './index';
import manifest from './manifest.json';

describe('unitPhoto', () => {
  it('maps tank_medium to the right vehicle per nation', () => {
    expect(unitPhoto('armoured', 'GER', 'tank_medium')?.subject).toMatch(/Panzer (III|IV)/);
    expect(unitPhoto('armoured', 'FRA', 'tank_medium')?.subject).toMatch(/SOMUA|B1/);
    expect(unitPhoto('armoured', 'GBR', 'tank_medium')?.subject).toMatch(/Matilda|Cruiser|Crusader|Valentine/);
  });
  it('never returns another nation\'s photo and returns null when nothing honest matches', () => {
    expect(unitPhoto('infantry', 'JPN')).toBeNull();
    expect(unitPhoto('armoured', 'NEUTRAL', 'tank_medium')).toBeNull();
  });
  it('is deterministic and supports a variant seed', () => {
    expect(unitPhoto('infantry', 'GER', 'rifle')).toEqual(unitPhoto('infantry', 'GER', 'rifle'));
    expect(unitPhoto('armoured', 'GER', 'tank_medium', 'unit-a')).toEqual(unitPhoto('armoured', 'GER', 'tank_medium', 'unit-a'));
  });
  it('free-text hints work', () => {
    expect(unitPhoto('armoured', 'FRA', 'somua')?.subject).toMatch(/SOMUA/);
  });
  it('HQ units only get HQ photos and combat units never do', () => {
    for (const n of ['GER', 'GBR', 'FRA'] as const) {
      const hq = unitPhoto('hq', n);
      expect(hq?.role).toBe('hq');
      expect(unitPhoto('infantry', n, 'rifle')?.role).toBe('combat');
    }
    expect(unitPhoto('hq', 'NED')).toBeNull();
  });
  it('seed varies photos across a stack of same-type units', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 40; i++) ids.add(unitPhoto('infantry', 'GER', 'rifle', `unit-${i}`)!.thumb);
    expect(ids.size).toBeGreaterThan(1);
  });
  it('infantry-like units never get a gun/vehicle photo, whatever the hint', () => {
    for (const hint of ['gun_at', 'gun_arty', 'tank_medium', 'truck', undefined])
      for (const t of ['infantry', 'engineer', 'paratroop'] as const) {
        const p = unitPhoto(t, 'GER', hint);
        if (p) expect(p.subject).not.toMatch(/Flak|howitzer|Opel|half-track/i);
      }
    expect(unitPhoto('infantry', 'GER', 'gun_at')?.subject).not.toMatch(/Flak/);
  });
  it('armoured units with tank hints get tank photos', () => {
    expect(unitPhoto('armoured', 'GER', 'tank_light')?.subject).toMatch(/Panzer (II|38)/);
    expect(unitPhoto('armoured', 'GBR', 'tank_light')?.subject).toMatch(/Light Tank|Stuart/);
  });
  it('mainEquipmentKey ignores support weapons for infantry types', () => {
    expect(mainEquipmentKey({ rifle: 9000, gun_at: 50, gun_arty: 70 }, 'infantry')).toBe('rifle');
    expect(mainEquipmentKey({ gun_at: 50 }, 'infantry')).toBeUndefined();
  });
  it('picks main equipment key by priority', () => {
    expect(mainEquipmentKey({ rifle: 900, tank_light: 10, truck: 40 })).toBe('tank_light');
    expect(mainEquipmentKey({})).toBeUndefined();
  });
  it('every manifest entry has files on disk, an accepted licence and an author', () => {
    for (const e of manifest as { id: string; thumb: string; panel: string; license: string; author: string; sourceUrl: string }[]) {
      expect(e.thumb).toMatch(/^\/art\/units\/.+\.webp$/);
      expect(e.panel).toMatch(/^\/art\/units\/.+\.jpg$/);
      expect(e.license).toMatch(/^(Public domain|CC0|CC BY|CC BY-SA|No restrictions)/i);
      expect(e.author.length).toBeGreaterThan(0);
      expect(e.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
    expect(allPhotoCredits().length).toBe((manifest as unknown[]).length);
  });
});
