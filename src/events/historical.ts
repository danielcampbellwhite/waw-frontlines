/**
 * Declarative historical events. The campaign engineer (src/data) supplies researched dates + citations as
 * plain JSON; this module turns them into registered EventTemplates. The event engine never invents dates:
 * a spec without `date` and at least one `sources` entry is rejected.
 */
import type { LocationId, LonLat, NationId, SideId, UnitId, UnitType, WeatherKind } from '../core/types';
import { adj, adjManpower, adjRes, isAlive, scheduleReinforcement, type Resource, type Stat } from './helpers';
import { setPortRelief } from '../military/logistics';
import { registerEventTemplate } from './registry';
import type { EventChoiceDef, EventEnv, EventTemplate } from './types';

export type EffectSpec =
  | { op: 'resource'; nation: NationId; key: Resource; delta: number }
  | { op: 'unit_stat'; nation?: NationId; side?: SideId; unitTypes?: UnitType[]; unitIds?: UnitId[]; stat: Stat; delta: number }
  | { op: 'unit_manpower'; nation?: NationId; side?: SideId; unitTypes?: UnitType[]; unitIds?: UnitId[]; fraction: number }
  | { op: 'location_owner'; locationId: LocationId; owner: NationId }
  | { op: 'location_damage'; locationId: LocationId; delta: number }
  | { op: 'weather'; kind: WeatherKind; intensity?: number; durationMinutes?: number }
  | { op: 'reinforce'; nation: NationId; locationId?: LocationId; delayMinutes?: number; unitTypes?: UnitType[]; strength?: number; label?: string }
  /** Sea relief of a besieged port (military setPortRelief): it keeps a share of its throughput while encircled. `on` defaults to true. */
  | { op: 'port_relief'; locationId: LocationId; on?: boolean }
  | { op: 'log'; text: string; severity?: 'info' | 'warn' | 'critical' };

export interface HistoricalEventSpec {
  id: string;
  /** ISO date-time (UTC) the event historically occurred. REQUIRED, researched by the campaign engineer. */
  date: string;
  title: string;
  body: string;
  /** Citations (ids from the scenario's sources[]/docs/HISTORICAL_SOURCES.md). REQUIRED. */
  sources: string[];
  /** Side it concerns (default: the player's side). */
  side?: SideId;
  essential?: boolean;
  pos?: LonLat;
  effects?: EffectSpec[];
  choices?: { id: string; label: string; effectSummary: string; effects: EffectSpec[] }[];
  defaultChoiceId?: string;
}

export function validateHistoricalSpec(s: HistoricalEventSpec): string[] {
  const e: string[] = [];
  if (!s.id) e.push('missing id');
  if (!s.date || Number.isNaN(Date.parse(s.date))) e.push(`${s.id}: missing/invalid date`);
  if (!s.sources || s.sources.length === 0) e.push(`${s.id}: no sources cited`);
  if (!s.title || !s.body) e.push(`${s.id}: missing title/body`);
  for (const c of s.choices ?? []) if (!c.id || !c.label || !c.effectSummary) e.push(`${s.id}: choice incomplete`);
  return e;
}

function matchUnits(env: EventEnv, f: { nation?: NationId; side?: SideId; unitTypes?: UnitType[]; unitIds?: UnitId[] }) {
  return Object.values(env.state.units).filter((u) => isAlive(u)
    && (!f.nation || u.nation === f.nation) && (!f.side || u.side === f.side)
    && (!f.unitTypes || f.unitTypes.includes(u.type)) && (!f.unitIds || f.unitIds.includes(u.id)));
}

export function applyEffects(env: EventEnv, effects: EffectSpec[]): void {
  const { state } = env;
  for (const fx of effects) {
    switch (fx.op) {
      case 'resource': adjRes(state, fx.nation, fx.key, fx.delta); break;
      case 'unit_stat': for (const u of matchUnits(env, fx)) adj(u, fx.stat, fx.delta); break;
      case 'unit_manpower': for (const u of matchUnits(env, fx)) adjManpower(u, fx.fraction); break;
      case 'location_owner': { const l = state.locations[fx.locationId]; if (l) l.owner = fx.owner; break; }
      case 'location_damage': { const l = state.locations[fx.locationId]; if (l) l.damaged = Math.max(0, Math.min(100, (l.damaged ?? 0) + fx.delta)); break; }
      case 'weather': state.weather = { kind: fx.kind, intensity: fx.intensity ?? 0.6, temperatureC: state.weather.temperatureC, nextChangeMinutes: env.now + (fx.durationMinutes ?? 24 * 60) }; break;
      case 'reinforce': scheduleReinforcement(env, fx.nation, { types: fx.unitTypes, delayMinutes: fx.delayMinutes, strength: fx.strength, label: fx.label, locationId: fx.locationId }); break;
      case 'port_relief': if (state.locations[fx.locationId]) setPortRelief(state, fx.locationId, fx.on ?? true); break;
      case 'log': env.log(fx.text, fx.severity ?? 'info'); break;
    }
  }
}

/** Validate and register a historical event as a template. Throws on invalid/uncited specs. */
export function registerHistoricalEvent(spec: HistoricalEventSpec): EventTemplate {
  const errs = validateHistoricalSpec(spec);
  if (errs.length) throw new Error(`invalid historical event: ${errs.join('; ')}`);
  const choices: EventChoiceDef[] | undefined = spec.choices?.map((c) => ({
    id: c.id, label: c.label, effectSummary: c.effectSummary, apply: (env) => { applyEffects(env, c.effects); },
  }));
  const t: EventTemplate = {
    id: spec.id, kind: 'historical', category: 'history', title: spec.title, body: spec.body,
    sources: spec.sources, schedule: { atDate: spec.date }, essential: spec.essential,
    side: spec.side,
    impact: spec.effects?.length ? (env) => applyEffects(env, spec.effects!) : undefined,
    choices, defaultChoiceId: spec.defaultChoiceId ?? spec.choices?.[0]?.id,
    prepare: spec.pos ? () => ({ pos: spec.pos }) : undefined,
  };
  registerEventTemplate(t);
  return t;
}
