import { useSyncExternalStore } from 'react';

export type KeyAction =
  | 'pause' | 'speed1' | 'speed2' | 'speed3' | 'speed4' | 'cancelOrders' | 'selectAll'
  | 'panelHelp' | 'panelObjectives' | 'panelOps' | 'panelOob' | 'quickSave' | 'tabNotifications' | 'tabReports' | 'panelSave'
  | 'ord_move' | 'ord_attack' | 'ord_defend' | 'ord_hold' | 'ord_withdraw' | 'ord_entrench' | 'ord_recon'
  | 'ord_regroup' | 'ord_rest' | 'ord_capture' | 'ord_support' | 'ord_follow';

export const KEY_ACTIONS: { action: KeyAction; label: string; fixed?: boolean }[] = [
  { action: 'pause', label: 'Pause / resume' },
  { action: 'speed1', label: 'Speed x1' }, { action: 'speed2', label: 'Speed x2' },
  { action: 'speed3', label: 'Speed x4' }, { action: 'speed4', label: 'Speed x8' },
  { action: 'cancelOrders', label: 'Cancel orders of selection' },
  { action: 'selectAll', label: 'Select all own units' },
  { action: 'panelHelp', label: 'Help and controls' },
  { action: 'panelObjectives', label: 'Objectives panel' },
  { action: 'panelOps', label: 'Operations planner' },
  { action: 'panelOob', label: 'Order of battle panel' },
  { action: 'quickSave', label: 'Quick save' },
  { action: 'tabNotifications', label: 'Notifications tab' },
  { action: 'tabReports', label: 'Battle reports tab' },
  { action: 'panelSave', label: 'Save / load dialog' },
  { action: 'ord_move', label: 'Order: move' }, { action: 'ord_attack', label: 'Order: attack' },
  { action: 'ord_defend', label: 'Order: defend' }, { action: 'ord_hold', label: 'Order: hold' },
  { action: 'ord_withdraw', label: 'Order: withdraw' }, { action: 'ord_entrench', label: 'Order: entrench' },
  { action: 'ord_recon', label: 'Order: recon' }, { action: 'ord_regroup', label: 'Order: regroup' },
  { action: 'ord_rest', label: 'Order: rest' }, { action: 'ord_capture', label: 'Order: capture' },
  { action: 'ord_support', label: 'Order: support' }, { action: 'ord_follow', label: 'Order: follow' },
];

/** Keys are KeyboardEvent.key values (lower-cased single chars, or named keys like ' ', 'F1', 'Delete'). */
export const DEFAULT_KEYBINDS: Record<KeyAction, string> = {
  pause: ' ', speed1: '1', speed2: '2', speed3: '3', speed4: '4', cancelOrders: 'Delete', selectAll: 'ctrl+a',
  panelHelp: 'F1', panelObjectives: 'F2', panelOps: 'F3', panelOob: 'F4', quickSave: 'F5', tabNotifications: 'F6',
  tabReports: 'F7', panelSave: 'F8',
  ord_move: 'm', ord_attack: 'a', ord_defend: 'd', ord_hold: 'h', ord_withdraw: 'w', ord_entrench: 'e', ord_recon: 'r',
  ord_regroup: 'g', ord_rest: 't', ord_capture: 'c', ord_support: 's', ord_follow: 'f',
};

export type DefaultDifficulty = 'easy' | 'normal' | 'hard' | 'veteran';
export const DIFFICULTIES: DefaultDifficulty[] = ['easy', 'normal', 'hard', 'veteran'];

export interface UiSettings {
  /** Difficulty preselected on the nation screen; the per-campaign choice still wins. */
  defaultDifficulty: DefaultDifficulty;
  /** True once the first-run tour has been shown (or skipped). */
  tourSeen: boolean;
  master: number; music: number; sfx: number; ambience: number; muted: boolean;
  uiScale: number;
  keybinds: Record<KeyAction, string>;
}

export const DEFAULT_SETTINGS: UiSettings = {
  defaultDifficulty: 'normal', tourSeen: false, master: 0.8, music: 0.5, sfx: 0.8, ambience: 0.7, muted: false, uiScale: 1, keybinds: { ...DEFAULT_KEYBINDS },
};

const KEY = 'theatre-command.ui-settings.v1';

function load(): UiSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } };
    const p = JSON.parse(raw) as Partial<UiSettings>;
    return sanitize(p);
  } catch { return { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } }; }
}

const clamp01 = (n: unknown, d: number) => (typeof n === 'number' && isFinite(n) ? Math.min(1, Math.max(0, n)) : d);

export function sanitize(p: Partial<UiSettings>): UiSettings {
  const d = DEFAULT_SETTINGS;
  return {
    defaultDifficulty: DIFFICULTIES.includes(p.defaultDifficulty as DefaultDifficulty) ? p.defaultDifficulty as DefaultDifficulty : d.defaultDifficulty,
    tourSeen: !!p.tourSeen,
    master: clamp01(p.master, d.master), music: clamp01(p.music, d.music), sfx: clamp01(p.sfx, d.sfx),
    ambience: clamp01(p.ambience, d.ambience), muted: !!p.muted,
    uiScale: typeof p.uiScale === 'number' && p.uiScale >= 0.75 && p.uiScale <= 1.5 ? p.uiScale : 1,
    keybinds: { ...DEFAULT_KEYBINDS, ...(p.keybinds ?? {}) },
  };
}

let current: UiSettings = load();
const listeners = new Set<() => void>();

function applyScale() {
  try { if (typeof document !== 'undefined') document.documentElement.style.setProperty('--ui-scale', String(current.uiScale)); } catch { /* ignore */ }
}
applyScale();

export const settingsStore = {
  get: () => current,
  set(patch: Partial<UiSettings>) {
    current = sanitize({ ...current, ...patch });
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
    applyScale();
    listeners.forEach(l => l());
  },
  reset() { settingsStore.set({ ...DEFAULT_SETTINGS, tourSeen: current.tourSeen, keybinds: { ...DEFAULT_KEYBINDS } }); },
  /** Re-read from storage (tests). */
  reload() { current = load(); applyScale(); listeners.forEach(l => l()); },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

export function useUiSettings(): UiSettings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get);
}

export function keyLabel(k: string): string {
  return k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k.replace('ctrl+', 'Ctrl+').replace(/^(\w)/, s => s.toUpperCase());
}

/** Normalises a KeyboardEvent to the keybind notation. */
export function eventKey(e: { key: string; ctrlKey: boolean; metaKey?: boolean }): string {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return (e.ctrlKey || e.metaKey) && k.length === 1 ? 'ctrl+' + k : k;
}
