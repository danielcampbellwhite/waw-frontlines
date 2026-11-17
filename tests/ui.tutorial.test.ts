// @vitest-environment jsdom
import { createElement as h } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_KEYBINDS, sanitize, settingsStore } from '../src/ui/settings';
import { TOUR_STEPS, TOUR_TOPICS, placeCard } from '../src/ui/tutorial/steps';
import { Tour, TutorialDialog } from '../src/ui/tutorial/Tour';
import { CampaignSelect, type ScenarioMetaLike } from '../src/ui/screens/CampaignSelect';
import { MainMenu } from '../src/ui/screens/MainMenu';

afterEach(cleanup);
beforeEach(() => { localStorage.clear(); settingsStore.reload(); });

describe('tour content', () => {
  it('covers every required topic', () => {
    for (const t of ['map', 'select', 'orders', 'supply', 'fog', 'reports', 'time', 'saves']) expect(TOUR_TOPICS).toContain(t);
  });
  it('anchors point at classes that exist in the game UI sources', () => {
    const src = ['game/GameScreen.tsx', 'game/TopBar.tsx', 'game/LeftPanel.tsx', 'game/RightPanel.tsx', 'game/BottomPanel.tsx'].map(f => readFileSync(`src/ui/${f}`, 'utf8')).join('\n');
    for (const s of TOUR_STEPS) expect(src, s.anchor).toContain(s.anchor.slice(1));
  });
  it('step text uses the live key bindings', () => {
    const saves = TOUR_STEPS.find(s => s.id === 'saves')!;
    expect(saves.body({ ...DEFAULT_KEYBINDS, quickSave: 'q' }).join(' ')).toContain('Q');
  });
});

describe('placeCard', () => {
  const vp = { w: 1366, h: 768 }, card = { w: 340, h: 220 };
  it('stays inside the viewport for any anchor', () => {
    for (const side of ['right', 'left', 'top', 'bottom', 'center'] as const) {
      const p = placeCard({ left: 1200, top: 10, width: 150, height: 40 }, side, card, vp);
      expect(p.left).toBeGreaterThanOrEqual(0); expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.left + card.w).toBeLessThanOrEqual(vp.w); expect(p.top + card.h).toBeLessThanOrEqual(vp.h);
    }
  });
  it('centres when the anchor is missing', () => {
    expect(placeCard(null, 'right', card, vp)).toEqual({ left: 513, top: 274 });
  });
});

describe('tour behaviour', () => {
  it('steps with Next/Back and closes on skip, never needing an engine', () => {
    const onClose = vi.fn();
    render(h(Tour, { onClose }));
    expect(screen.getByText(/step 1 of 8/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(/step 2 of 8/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(/step 1 of 8/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('arrow keys move and the last step finishes', () => {
    const onClose = vi.fn();
    render(h(Tour, { onClose }));
    for (let i = 0; i < TOUR_STEPS.length - 1; i++) act(() => { fireEvent.keyDown(window, { key: 'ArrowRight' }); });
    expect(screen.getByText(/step 8 of 8/i)).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: 'ArrowRight' }); });
    expect(onClose).toHaveBeenCalled();
  });
  it('the menu tutorial dialog walks the same steps', () => {
    render(h(TutorialDialog, { onClose: () => {} }));
    expect(screen.getByText(/step 1 of 8/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe(TOUR_STEPS[1].title);
  });
  it('main menu offers a Tutorial entry', () => {
    render(h(MainMenu, { onNewCampaign: () => {} }));
    fireEvent.click(screen.getByRole('button', { name: /Tutorial/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('settings additions', () => {
  it('defaults and sanitises difficulty and tourSeen', () => {
    expect(settingsStore.get().defaultDifficulty).toBe('normal'); expect(settingsStore.get().tourSeen).toBe(false); expect(settingsStore.get().mapDayNight).toBe(true); expect(settingsStore.get().mapWeather).toBe(true);
    expect(sanitize({ defaultDifficulty: 'bogus' as never }).defaultDifficulty).toBe('normal');
    expect(sanitize({ defaultDifficulty: 'hard' }).defaultDifficulty).toBe('hard');
  });
  it('old stored settings without the new fields still load', () => {
    localStorage.setItem('theatre-command.ui-settings.v1', JSON.stringify({ master: 0.4, muted: false }));
    settingsStore.reload();
    expect(settingsStore.get().master).toBeCloseTo(0.4); expect(settingsStore.get().defaultDifficulty).toBe('normal');
  });
  it('restore defaults keeps the tour-seen flag', () => {
    settingsStore.set({ tourSeen: true, defaultDifficulty: 'veteran' }); settingsStore.reset();
    expect(settingsStore.get().tourSeen).toBe(true); expect(settingsStore.get().defaultDifficulty).toBe('normal');
  });
});

describe('campaign select: coming later', () => {
  const base = { scale: 'short' as const, startDate: '1940-05-10T00:00:00Z', endDate: '1940-06-25T00:00:00Z', estimatedPlayMinutes: [60, 120] as [number, number], mapSize: 'medium' as const, complexity: 3 as const };
  const metas: ScenarioMetaLike[] = [
    { ...base, id: 'fof.short', campaignId: 'fof', title: 'Fall of France - Short' },
    { ...base, id: 'pacific.grand', campaignId: 'pacific', title: 'Pacific War', scale: 'grand', status: 'planned' },
    { ...base, id: 'kursk.short', campaignId: 'kursk', title: 'Kursk', planned: true },
  ];
  it('selects playable campaigns and lists planned ones as non-interactive tiles', () => {
    const onSelect = vi.fn();
    render(h(CampaignSelect, { scenarios: metas, onSelect, onBack: () => {} }));
    expect(screen.getAllByRole('button', { name: 'Select campaign' })).toHaveLength(1);
    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(screen.getAllByText('COMING SOON')).toHaveLength(2);
    expect(screen.getByText('Pacific War')).toBeTruthy();
    expect(screen.queryAllByText('Not yet available')).toHaveLength(0);
    fireEvent.click(screen.getByText('Pacific War'));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Select campaign' }));
    expect(onSelect).toHaveBeenCalledWith('fof.short');
  });
  it('a planned campaign becomes a card once it is no longer planned', () => {
    render(h(CampaignSelect, { scenarios: metas.map(m => (m.campaignId === 'pacific' ? { ...m, status: 'available' as const } : m)), onSelect: () => {}, onBack: () => {} }));
    expect(screen.getAllByRole('button', { name: 'Select campaign' })).toHaveLength(2);
  });
});
