// @vitest-environment jsdom
import { createElement as h } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { cleanup(); vi.resetModules(); vi.doUnmock('../src/ui/mapAdapter'); });

describe('UnitArt', () => {
  it('falls back to the NATO icon when no illustration export exists', async () => {
    vi.doMock('../src/ui/mapAdapter', () => ({ unitIllustrationSvg: null, unitPhotoInfo: () => null }));
    const { UnitArt } = await import('../src/ui/components/UnitArt');
    const { container } = render(h(UnitArt, { type: 'armoured', nation: 'GER', side: 'axis' }));
    expect(container.querySelector('svg.unit-icon')).toBeTruthy();
    const big = render(h(UnitArt, { type: 'armoured', nation: 'GER', side: 'axis', variant: 'large' }));
    expect(big.container.querySelector('.unit-art.large.fallback')).toBeTruthy();
  });
  it('renders the supplied vector illustration and survives a throwing generator', async () => {
    vi.doMock('../src/ui/mapAdapter', () => ({ unitIllustrationSvg: (t: string, n: string) => `<svg data-k="${t}-${n}"></svg>`, unitPhotoInfo: () => null }));
    let mod = await import('../src/ui/components/UnitArt');
    expect(render(h(mod.UnitArt, { type: 'infantry', nation: 'FRA', side: 'allies' })).container.querySelector('svg[data-k="infantry-FRA"]')).toBeTruthy();
    vi.resetModules();
    vi.doMock('../src/ui/mapAdapter', () => ({ unitIllustrationSvg: () => { throw new Error('boom'); }, unitPhotoInfo: () => null }));
    mod = await import('../src/ui/components/UnitArt');
    expect(render(h(mod.UnitArt, { type: 'infantry', nation: 'FRA', side: 'allies' })).container.querySelector('svg.unit-icon')).toBeTruthy();
  });
  it('uses panel for the large variant, thumb for small, shows the credit, and falls back to the illustration on error', async () => {
    const seen: unknown[][] = [];
    vi.doMock('../src/ui/mapAdapter', () => ({ unitIllustrationSvg: () => '<svg data-k="ill"></svg>', unitPhotoInfo: (...a: unknown[]) => { seen.push(a); return { thumb: '/t.jpg', panel: '/p.jpg', credit: 'Panzer III - IWM - CC0', subject: 'Panzer III on the march' }; } }));
    const { UnitArt } = await import('../src/ui/components/UnitArt');
    const big = render(h(UnitArt, { type: 'armoured', nation: 'GER', side: 'axis', variant: 'large', seed: 'unit-7' }));
    expect(seen[0][3]).toBe('unit-7');
    const img = big.container.querySelector('img'); expect(img?.getAttribute('src')).toBe('/p.jpg');
    expect(big.container.querySelector('.photo-credit')?.textContent).toBe('Panzer III - IWM - CC0');
    expect(img?.getAttribute('alt')).toBe('Panzer III on the march');
    const tiny = render(h(UnitArt, { type: 'armoured', nation: 'GER', side: 'axis' }));
    expect(tiny.container.querySelector('img')).toBeNull();
    const small = render(h(UnitArt, { type: 'armoured', nation: 'GER', side: 'axis', size: 48 }));
    expect(small.container.querySelector('img')?.getAttribute('src')).toBe('/t.jpg');
    expect(small.container.querySelector('.unit-art')?.getAttribute('title')).toBe('Photo: Panzer III - IWM - CC0');
    fireEvent.error(img!);
    expect(big.container.querySelector('svg[data-k="ill"]')).toBeTruthy();
  });
  it('HQ units skip generic photos and use the illustration, but accept an HQ-specific photo', async () => {
    vi.doMock('../src/ui/mapAdapter', () => ({ unitIllustrationSvg: () => '<svg data-k="ill"></svg>', unitPhotoInfo: () => ({ thumb: '/t.jpg', panel: '/p.jpg', subject: 'German infantry at rest' }) }));
    let mod = await import('../src/ui/components/UnitArt');
    let r = render(h(mod.UnitArt, { type: 'hq', nation: 'GER', side: 'axis', variant: 'large' }));
    expect(r.container.querySelector('img')).toBeNull(); expect(r.container.querySelector('svg[data-k="ill"]')).toBeTruthy();
    vi.resetModules();
    vi.doMock('../src/ui/mapAdapter', () => ({ unitIllustrationSvg: () => '<svg data-k="ill"></svg>', unitPhotoInfo: () => ({ thumb: '/t.jpg', panel: '/p.jpg', subject: 'Divisional headquarters conference' }) }));
    mod = await import('../src/ui/components/UnitArt');
    r = render(h(mod.UnitArt, { type: 'hq', nation: 'GER', side: 'axis', variant: 'large' }));
    expect(r.container.querySelector('img')).toBeTruthy();
  });
});
