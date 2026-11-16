import { describe, expect, it } from 'vitest';
import { computeMix, MAX_VOICES, ZOOM_SFX } from '../src/audio/mix';

const view = (cx: number, cy: number, half: number): { center: [number, number]; bounds: [number, number, number, number] } => ({ center: [cx, cy], bounds: [cx - half, cy - half, cx + half, cy + half] });
const base = { units: [], battles: [] };
const moving = (n: number) => Array.from({ length: n }, () => ({ pos: [5, 50] as [number, number], type: 'armoured', moving: true }));

describe('threshold-gated audio mix', () => {
  it('below the zoom threshold no battle or vehicle effects play, even for on-screen sources', () => {
    const m = computeMix({ ...base, zoom: ZOOM_SFX - 0.01, ...view(5, 50, 1), battles: [{ id: 'b', pos: [5, 50], size: 8 }], units: moving(5) });
    expect(m.sfxOn).toBe(false); expect(m.voices).toHaveLength(0); expect(m.vehicles).toBe(0);
  });
  it('strategic bed is a constant switch: music and radio on below the threshold, low music and no radio above', () => {
    const lo = computeMix({ ...base, zoom: 3, ...view(5, 50, 6) }), lo2 = computeMix({ ...base, zoom: 6.9, ...view(5, 50, 6) });
    expect(lo.music).toBe(lo2.music); expect(lo.radio).toBe(lo2.radio); // no zoom ramp inside a band
    expect(lo.music).toBeGreaterThan(0.8); expect(lo.radio).toBeGreaterThanOrEqual(0.3);
    const hi = computeMix({ ...base, zoom: 7, ...view(5, 50, 1) }), hi2 = computeMix({ ...base, zoom: 12, ...view(5, 50, 1) });
    expect(hi.music).toBe(hi2.music); expect(hi.music).toBeLessThan(0.2); expect(hi.radio).toBe(0);
  });
  it('at or above the threshold only battles inside the viewport sound, at constant full level, panned by screen x', () => {
    const v = view(5, 50, 0.5);
    const battles = [{ id: 'left', pos: [4.6, 50] as [number, number], size: 8 }, { id: 'right', pos: [5.4, 50] as [number, number], size: 8 }, { id: 'far', pos: [9, 52] as [number, number], size: 20 }];
    const m = computeMix({ ...base, zoom: ZOOM_SFX, ...v, battles });
    expect(m.voices.map(x => x.id).sort()).toEqual(['left', 'right']);
    expect(m.voices.every(x => x.gain === 1)).toBe(true);
    expect(m.voices.find(x => x.id === 'left')!.pan).toBeLessThan(-0.2);
    expect(m.voices.find(x => x.id === 'right')!.pan).toBeGreaterThan(0.2);
  });
  it('has no distance or zoom attenuation: a centre battle and an edge battle are equally loud, and so are zoom 7 and 12', () => {
    const v = view(5, 50, 1);
    const battles = [{ id: 'near', pos: [5.02, 50] as [number, number], size: 8 }, { id: 'edge', pos: [5.98, 50] as [number, number], size: 8 }];
    const a = computeMix({ ...base, zoom: 7, ...v, battles }), b = computeMix({ ...base, zoom: 12, ...v, battles });
    for (const m of [a, b]) expect(m.voices.map(x => x.gain)).toEqual([1, 1]);
  });
  it('a battle just outside the viewport is silent', () => {
    const m = computeMix({ ...base, zoom: 9, ...view(5, 50, 1), battles: [{ id: 'out', pos: [6.01, 50], size: 30 }, { id: 'in', pos: [5.99, 50], size: 2 }] });
    expect(m.voices.map(x => x.id)).toEqual(['in']);
  });
  it('caps simultaneous voices, keeping the biggest fights', () => {
    const battles = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, pos: [5 + (i % 5) * 0.05, 50 + Math.floor(i / 5) * 0.05] as [number, number], size: 2 + i }));
    const m = computeMix({ ...base, zoom: 9, ...view(5.1, 50.1, 0.5), battles });
    expect(m.voices.length).toBe(MAX_VOICES); expect(m.voices[0].id).toBe('b19');
  });
  it('engines are on/off: any moving ground unit on screen turns them fully on; off-screen, stationary or air units do not', () => {
    const v = view(5, 50, 1);
    expect(computeMix({ ...base, zoom: 8, ...v, units: moving(1) }).vehicles).toBe(1);
    expect(computeMix({ ...base, zoom: 8, ...v, units: moving(50) }).vehicles).toBe(1);
    expect(computeMix({ ...base, zoom: 8, ...v, units: [{ pos: [9, 50], type: 'armoured', moving: true }] }).vehicles).toBe(0);
    expect(computeMix({ ...base, zoom: 8, ...v, units: [{ pos: [5, 50], type: 'armoured', moving: false }] }).vehicles).toBe(0);
    expect(computeMix({ ...base, zoom: 8, ...v, units: [{ pos: [5, 50], type: 'air_fighter', moving: true }] }).vehicles).toBe(0);
  });
  it('machine-gun bursts are flagged only for battles whose participants hold machine guns', () => {
    const m = computeMix({ ...base, zoom: 9, ...view(5, 50, 1), battles: [{ id: 'a', pos: [5, 50], size: 4, mg: true }, { id: 'b', pos: [5.1, 50], size: 3 }] });
    expect(m.voices.find(x => x.id === 'a')!.mg).toBe(true); expect(m.voices.find(x => x.id === 'b')!.mg).toBe(false);
  });
});
