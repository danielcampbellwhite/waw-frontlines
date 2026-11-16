import { useEffect } from 'react';
import type { Engine, LonLat } from '../core/types';
import { AudioEngine } from './engine';
import { settingsStore, useUiSettings } from '../ui/settings';
import type { MixInput } from './mix';
import { sample, type Observed } from './cues';

export { AudioEngine } from './engine';
export { computeMix, ZOOM_SFX, MAX_VOICES } from './mix';
export type { MixInput, MixTargets } from './mix';
export { CUES, CueGate, cueForCommand, diffCues, observe } from './cues';
export type { CueName } from './cues';
export { SOUND_CREDITS, REJECTED_SOUNDS } from './credits';

/** App-wide audio singleton. */
export const audio = new AudioEngine();

/** Unlocks audio on the first user gesture and keeps levels in sync with persisted UI settings. */
export function useAudioSetup() {
  const s = useUiSettings();
  useEffect(() => { audio.setLevels({ master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience, muted: s.muted }); }, [s.master, s.music, s.sfx, s.ambience, s.muted]);
  useEffect(() => {
    const remove = () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    const unlock = () => {
      if (audio.unlock()) {
        const c = settingsStore.get();
        audio.setLevels({ master: c.master, music: c.music, sfx: c.sfx, ambience: c.ambience, muted: c.muted });
        remove();
      }
    };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    return remove;
  }, []);
}

export interface ViewLike { zoom: number; center: LonLat; bounds: [number, number, number, number] }

/** Feeds the contextual mixer from engine state + the map viewport (2 Hz). `getView` returns the latest map view. */
export function useAudioBridge(engine: Engine, getView: () => ViewLike | null, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let prev: Observed | null = null;
    const id = setInterval(() => {
      const s = engine.getState();
      // event-driven cues (battles appearing, reports, events, objectives, result, units starting to move)
      const r = sample(prev, s); prev = r.obs;
      for (const c of r.cues) audio.cue(c);
      const view = getView(); if (!view) return;
      const units = engine.visibleUnits(s.playerSide).filter(u => !u.destroyed).map(u => ({ pos: u.pos, type: u.type, moving: u.moveStatus !== 'stationary' }));
      const battles = Object.values(s.battles).map(b => ({ id: b.id, pos: b.pos, size: b.attackers.length + b.defenders.length, mg: [...b.attackers, ...b.defenders].some(id => (s.units[id]?.equipment.held.mg ?? 0) > 0) }));
      const input: MixInput = { zoom: view.zoom, center: view.center, bounds: view.bounds, battles, units, weather: s.weather.kind };
      audio.update(input);
    }, 500);
    return () => clearInterval(id);
  }, [engine, getView, enabled]);
}
