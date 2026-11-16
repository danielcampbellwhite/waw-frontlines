// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_KEYBINDS, eventKey, sanitize, settingsStore } from '../src/ui/settings';

describe('ui settings persistence', () => {
  beforeEach(() => { localStorage.clear(); settingsStore.reload(); });
  it('persists volumes and mute to localStorage', () => {
    settingsStore.set({ master: 0.3, muted: true });
    settingsStore.reload();
    expect(settingsStore.get().master).toBeCloseTo(0.3); expect(settingsStore.get().muted).toBe(true);
  });
  it('clamps and sanitises corrupt data', () => {
    const s = sanitize({ master: 7, music: -1, uiScale: 99, keybinds: { pause: 'p' } as never });
    expect(s.master).toBe(1); expect(s.music).toBe(0); expect(s.uiScale).toBe(1); expect(s.keybinds.pause).toBe('p'); expect(s.keybinds.speed1).toBe(DEFAULT_KEYBINDS.speed1);
  });
  it('survives unavailable storage', () => {
    const orig = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('denied'); };
    expect(() => settingsStore.set({ sfx: 0.1 })).not.toThrow(); expect(settingsStore.get().sfx).toBeCloseTo(0.1);
    Storage.prototype.setItem = orig;
  });
  it('normalises key events', () => {
    expect(eventKey({ key: 'A', ctrlKey: true })).toBe('ctrl+a'); expect(eventKey({ key: ' ', ctrlKey: false })).toBe(' '); expect(eventKey({ key: 'F2', ctrlKey: false })).toBe('F2');
  });
});
