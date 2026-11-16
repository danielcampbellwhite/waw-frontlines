/**
 * Pure contextual-mix model (no Web Audio): converts the game situation into target layer gains.
 *
 * Sound effects are strictly ON or OFF. A battle's gunfire/artillery, and moving ground units' engines, play at
 * full constant level only when the map is zoomed in to ZOOM_SFX or closer AND the source is inside the viewport;
 * otherwise they are silent. There is no zoom or distance attenuation of effects (the engine adds only a ~40 ms
 * anti-click ramp). Stereo pan follows screen x. Below the threshold the strategic bed (music + radio) is on at a
 * constant level; at or above it the bed drops to a constant low level. Both are threshold switches, not crossfades.
 */
import type { LonLat } from '../core/types';

export interface MixBattle { id: string; pos: LonLat; /** participants (units on both sides) */ size: number; ageMinutes?: number; /** any participant holds machine guns */ mg?: boolean }
export interface MixUnit { pos: LonLat; type: string; moving: boolean }
export interface MixInput {
  zoom: number;
  center: LonLat;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  battles: MixBattle[];
  /** player-visible units */
  units: MixUnit[];
  weather?: string;
}

export interface BattleVoice { id: string; /** always 1: effects have no level ramp */ gain: number; pan: number; /** 0..1, drives firing density only */ intensity: number; mg: boolean }

export interface MixTargets {
  /** true when zoomed in far enough for unit/battle sound effects */
  sfxOn: boolean;
  ambience: number;       // wind / room tone (constant)
  radio: number;          // chatter & static (strategic zoom only)
  music: number;          // procedural bed (strategic zoom high, otherwise low)
  vehicles: number;       // 0 or 1: a moving ground unit is on screen
  voices: BattleVoice[];  // battles inside the viewport (max MAX_VOICES), only when sfxOn
  combatIntensity: number; // 0..1 global
  weatherGain: number;
}

/** Minimum map zoom at which unit and battle sound effects are audible. */
export const ZOOM_SFX = 7.0;
export const MAX_VOICES = 6;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function inBounds(p: LonLat, b: MixInput['bounds']): boolean {
  return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
}

/** Stereo pan -1..1 from the screen-relative x position. */
export function pan(p: LonLat, b: MixInput['bounds']): number {
  const hw = Math.max(1e-6, (b[2] - b[0]) / 2), cx = (b[0] + b[2]) / 2;
  return clamp((p[0] - cx) / hw, -1, 1) * 0.85;
}

export function computeMix(inp: MixInput): MixTargets {
  const sfxOn = inp.zoom >= ZOOM_SFX;
  const view = inp.bounds;
  const intensityOf = (size: number) => clamp(Math.log2(1 + size) / 4);

  const voices: BattleVoice[] = !sfxOn ? [] : inp.battles
    .filter(b => inBounds(b.pos, view))
    .sort((a, b) => b.size - a.size || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_VOICES)
    .map(b => ({ id: b.id, gain: 1, pan: pan(b.pos, view), intensity: intensityOf(b.size), mg: !!b.mg }));

  const combatIntensity = clamp(inp.battles.reduce((s, b) => s + intensityOf(b.size), 0) / 3);
  const vehicles = sfxOn && inp.units.some(u => u.moving && !isAir(u.type) && inBounds(u.pos, view)) ? 1 : 0;

  const w = inp.weather ?? 'clear';
  const weatherGain = w === 'storm' || w === 'sandstorm' ? 1 : w === 'rain' || w === 'snow' ? 0.7 : w === 'fog' || w === 'mud' ? 0.4 : 0.2;

  return {
    sfxOn,
    ambience: 0.5 + weatherGain * 0.2,
    radio: sfxOn ? 0 : 0.5 * (0.6 + 0.4 * combatIntensity),
    music: sfxOn ? 0.12 : 0.9,
    vehicles,
    voices,
    combatIntensity,
    weatherGain,
  };
}

export const isAir = (t: string) => t === 'air_fighter' || t === 'air_bomber';
