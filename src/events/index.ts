/**
 * WORLD AT WAR: FRONTLINES event engine.
 *
 *   updateEvents(state, ctx)               – called once per tick by the sim (pipeline step 2)
 *   applyEventChoice(state, eventId, id)   – player (via `resolve_event`) picks a choice
 *
 * Historical events fire at researched dates (scenario.eventTemplateIds → registry); dynamic/random events are
 * rolled each tick, weighted by the actual game state, difficulty and settings, with per-template cooldowns.
 * All randomness comes from ctx.rand() (or state.rng when no ctx is available), so event sequences differ per
 * seed yet replay identically. Events that happen to an AI side are applied silently (optionally with a
 * generic intelligence report) so the player never sees the AI's private information.
 */
import type { CommandResult, GameEvent, GameState, SideId } from '../core/types';
import { makeEnv, opposite, pushLog } from './helpers';
import { getEventTemplate, listEventTemplates } from './registry';
import { registerBuiltinTemplates } from './templates';
import type { EventContext, EventData, EventEnv, EventTemplate, TemplateStat } from './types';

export { registerEventTemplate, getEventTemplate, listEventTemplates, unregisterEventTemplate, clearHistoricalTemplates } from './registry';
export { registerHistoricalEvent, validateHistoricalSpec, applyEffects } from './historical';
export { registerHistoricalEventsFromData } from './fromData';
export type { HistoricalEventDataLike } from './fromData';
export type { HistoricalEventSpec, EffectSpec } from './historical';
export type { EventTemplate, EventChoiceDef, EventContext, EventEnv, EventData } from './types';
export { registerBuiltinTemplates, BUILTIN_TEMPLATES } from './templates';

/** Tuning constants. */
export const EVENT_TUNING = {
  /** chance per tick that a dynamic/random event is attempted (before weighting) */
  baseChancePerTick: 0.04,
  /** minimum minutes between two dynamic/random events */
  minGapMinutes: 180,
  /** max unresolved choice events shown to the player at once */
  maxPending: 3,
  defaultExpiryMinutes: 720,
  maxStoredEvents: 400,
};

const statKey = (id: string, side: SideId) => `stat:${id}|${side}`;
const getStat = (state: GameState, id: string, side: SideId): (TemplateStat & { skipped?: boolean }) | undefined =>
  (state.eventState as Record<string, (TemplateStat & { skipped?: boolean }) | undefined>)[statKey(id, side)];

function noteFired(state: GameState, id: string, side: SideId): void {
  const k = statKey(id, side);
  const cur = (state.eventState[k] as TemplateStat | undefined) ?? { count: 0, last: -1e9 };
  state.eventState[k] = { count: cur.count + 1, last: state.clock.minutes };
}

/** Deterministic 0..1 hash (FNV-1a) used for frequency thinning of historical events. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

const text = (v: string | ((e: EventEnv, d: EventData) => string), env: EventEnv, d: EventData): string =>
  typeof v === 'function' ? v(env, d) : v;

function toneFactor(state: GameState, tpl: EventTemplate, side: SideId): number {
  const t = tpl.tone;
  if (!t || t === 'neutral') return 1;
  // factor expressed from the player's point of view
  const playerView = side === state.playerSide ? t : t === 'adverse' ? 'favourable' : 'adverse';
  const d = state.settings.difficulty;
  const adverse = d === 'easy' ? 0.7 : d === 'hard' ? 1.25 : d === 'veteran' ? 1.5 : 1;
  const fav = d === 'easy' ? 1.3 : d === 'hard' ? 0.85 : d === 'veteran' ? 0.7 : 1;
  return playerView === 'adverse' ? adverse : fav;
}

// ───────────────────────────── firing ─────────────────────────────

function fireWith(state: GameState, tpl: EventTemplate, env: EventEnv, data: EventData): GameEvent | null {
  const side = env.side;
  // Historical events that concern the other side still happen (their effects apply) but are not presented to the player as
  // their own events: the text is written from that side's point of view. The player gets a one-line intelligence note instead.
  const foreign = tpl.kind === 'historical' && !!tpl.side && tpl.side !== state.playerSide;
  const isAi = foreign || (tpl.kind !== 'historical' && side !== state.playerSide);
  noteFired(state, tpl.id, side);

  if (isAi) {
    tpl.impact?.(env, data);
    const choice = tpl.choices?.find((c) => c.id === tpl.aiChoiceId && (!c.available || c.available(env, data)))
      ?? tpl.choices?.find((c) => !c.available || c.available(env, data));
    if (choice) choice.apply(env, data);
    const log = ((state.eventState.aiLog as unknown[]) ?? []) as { t: number; templateId: string; side: SideId; choice?: string }[];
    log.push({ t: env.now, templateId: tpl.id, side, choice: choice?.id });
    state.eventState.aiLog = log.slice(-40);
    if (tpl.opponentReport) pushLog(state, { category: 'event', text: tpl.opponentReport, severity: 'info' });
    else if (foreign) pushLog(state, { category: 'event', text: `Intelligence report: ${text(tpl.title, env, data)}`, severity: 'info' });
    return null;
  }

  const id = `ev_${state.idCounter++}`;
  const choices = (tpl.choices ?? []).filter((c) => !c.available || c.available(env, data));
  const title = text(tpl.title, env, data);
  const body = text(tpl.body, env, data);
  const ev: GameEvent = {
    id, templateId: tpl.id, firedAt: env.now, title, body, kind: tpl.kind, side, pos: data.pos as GameEvent['pos'],
    choices: choices.length ? choices.map((c) => ({ id: c.id, label: c.label, effectSummary: c.effectSummary })) : undefined,
    resolved: choices.length === 0,
  };
  state.events.push(ev);
  state.eventState[`data:${id}`] = data;
  tpl.impact?.(env, data);
  env.log(title, tpl.tone === 'adverse' ? 'warn' : 'info', ev.pos);
  if (!choices.length) state.history.push({ t: env.now, text: title });
  else state.eventState[`exp:${id}`] = env.now + (tpl.expiresMinutes ?? EVENT_TUNING.defaultExpiryMinutes);

  // prune old resolved events
  if (state.events.length > EVENT_TUNING.maxStoredEvents) {
    const keep: GameEvent[] = []; let drop = state.events.length - EVENT_TUNING.maxStoredEvents;
    for (const e of state.events) { if (drop > 0 && e.resolved) { drop--; delete state.eventState[`data:${e.id}`]; delete state.eventState[`exp:${e.id}`]; } else keep.push(e); }
    state.events = keep;
  }
  return ev;
}

// ───────────────────────────── historical ─────────────────────────────

function minutesFor(state: GameState, tpl: EventTemplate, ctx: EventContext): number | null {
  const s = tpl.schedule;
  if (!s) return null;
  if (s.atMinutes !== undefined) return s.atMinutes;
  const start = ctx.scenario?.startDate;
  if (s.atDate === undefined || !start) return null;
  const a = Date.parse(s.atDate), b = Date.parse(start);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  // clock.minutes counts from the scenario epoch (startDate) plus clock.startMinutes
  return state.clock.startMinutes + Math.round((a - b) / 60000);
}

function fireHistorical(state: GameState, ctx: EventContext): void {
  const ids = ctx.scenario?.eventTemplateIds ?? (state.special.eventTemplateIds as string[] | undefined) ?? [];
  const now = state.clock.minutes;
  const freq = state.settings.historicalEventFrequency;
  for (const id of ids) {
    const tpl = getEventTemplate(id);
    if (!tpl || tpl.kind !== 'historical') continue;
    const side = tpl.side ?? state.playerSide;
    const st = getStat(state, id, side);
    if (st) continue; // fired or skipped before
    const at = minutesFor(state, tpl, ctx);
    if (at === null || at > now) continue;
    if (at < state.clock.startMinutes) { state.eventState[statKey(id, side)] = { count: 0, last: -1, skipped: true }; continue; }
    if (!tpl.essential && (freq <= 0 || (freq < 1 && hash01(`${id}:${state.seed}`) >= freq))) {
      state.eventState[statKey(id, side)] = { count: 0, last: -1, skipped: true };
      continue;
    }
    const env = makeEnv(state, side, ctx);
    const data = tpl.prepare ? tpl.prepare(env) ?? ({} as EventData) : ({} as EventData);
    fireWith(state, tpl, env, data);
  }
}

// ───────────────────────────── dynamic / random ─────────────────────────────

function sidesFor(state: GameState, tpl: EventTemplate): SideId[] {
  const p = state.playerSide, e = opposite(p);
  const t = tpl.target ?? 'player';
  return (t === 'player' ? [p] : t === 'enemy' ? [e] : [p, e]).filter((s) => s !== 'neutral' && relevantTo(state, tpl, s));
}

/** Side/nation relevance gate: a template that declares `sides`/`nations` never happens to anyone else. */
export function relevantTo(state: GameState, tpl: EventTemplate, side: SideId): boolean {
  if (tpl.sides && !tpl.sides.includes(side)) return false;
  if (tpl.nations) {
    const own = Object.values(state.nations).filter((n) => n.side === side).map((n) => n.id);
    if (!tpl.nations.some((n) => own.includes(n))) return false;
  }
  return true;
}

function rollDynamic(state: GameState, ctx: EventContext): void {
  if (!state.settings.randomEvents) return;
  const now = state.clock.minutes;
  const last = (state.eventState.lastDynamic as number | undefined) ?? -1e9;
  if (now - last < EVENT_TUNING.minGapMinutes) return;
  if (ctx.rand() >= EVENT_TUNING.baseChancePerTick) return;

  const disabled = (state.special.disabledEvents as string[] | undefined) ?? [];
  const pending = state.events.filter((e) => !e.resolved && e.choices?.length).length;
  const cands: { tpl: EventTemplate; side: SideId; w: number }[] = [];
  for (const tpl of listEventTemplates()) {
    if (tpl.kind === 'historical' || disabled.includes(tpl.id)) continue;
    for (const side of sidesFor(state, tpl)) {
      if (side === state.playerSide && tpl.choices?.length && pending >= EVENT_TUNING.maxPending) continue;
      const st = getStat(state, tpl.id, side);
      if (st && ((tpl.maxOccurrences !== undefined && st.count >= tpl.maxOccurrences) || now - st.last < (tpl.cooldownMinutes ?? 0))) continue;
      const env = makeEnv(state, side, ctx);
      if (tpl.condition && !tpl.condition(env)) continue;
      const w0 = typeof tpl.weight === 'function' ? tpl.weight(env) : tpl.weight ?? 1;
      const w = w0 * toneFactor(state, tpl, side);
      if (w > 0) cands.push({ tpl, side, w });
    }
  }
  for (let attempt = 0; attempt < 4 && cands.length; attempt++) {
    const total = cands.reduce((s, c) => s + c.w, 0);
    let x = ctx.rand() * total, idx = cands.length - 1;
    for (let i = 0; i < cands.length; i++) { x -= cands[i].w; if (x <= 0) { idx = i; break; } }
    const c = cands.splice(idx, 1)[0];
    const env = makeEnv(state, c.side, ctx);
    const data = c.tpl.prepare ? c.tpl.prepare(env) : ({} as EventData);
    if (!data) continue; // nothing suitable to target: try another template
    fireWith(state, c.tpl, env, data);
    state.eventState.lastDynamic = now;
    return;
  }
}

function expirePending(state: GameState, ctx: EventContext): void {
  const now = state.clock.minutes;
  for (const ev of state.events) {
    if (ev.resolved || !ev.choices?.length) continue;
    const exp = state.eventState[`exp:${ev.id}`] as number | undefined;
    if (exp === undefined || now < exp) continue;
    const tpl = getEventTemplate(ev.templateId);
    const cid = tpl?.defaultChoiceId && ev.choices.some((c) => c.id === tpl.defaultChoiceId) ? tpl.defaultChoiceId : ev.choices[ev.choices.length - 1].id;
    resolve(state, ev, cid, makeEnv(state, ev.side ?? state.playerSide, ctx), true);
  }
}

function resolve(state: GameState, ev: GameEvent, choiceId: string, env: EventEnv, expired = false): string {
  const tpl = getEventTemplate(ev.templateId);
  const def = tpl?.choices?.find((c) => c.id === choiceId);
  const data = (state.eventState[`data:${ev.id}`] as EventData | undefined) ?? ({} as EventData);
  const outcome = def ? def.apply(env, data) : undefined;
  ev.resolved = true; ev.chosen = choiceId;
  delete state.eventState[`exp:${ev.id}`];
  const label = ev.choices?.find((c) => c.id === choiceId)?.label ?? choiceId;
  env.log(`${ev.title}: ${expired ? 'no decision, defaulted to' : 'decision'} "${label}"${outcome ? ` - ${outcome}` : ''}`);
  state.history.push({ t: state.clock.minutes, text: `${ev.title} - ${label}` });
  return label;
}

// ───────────────────────────── public API ─────────────────────────────

/** Fire a registered template immediately (scripted triggers, debug tools, tests). Null if it has no valid target. */
export function forceFireEvent(state: GameState, ctx: EventContext, templateId: string, side?: SideId): GameEvent | null {
  registerBuiltinTemplates();
  const tpl = getEventTemplate(templateId);
  if (!tpl) return null;
  const s = side ?? tpl.side ?? (tpl.target === 'enemy' ? opposite(state.playerSide) : state.playerSide);
  if (!relevantTo(state, tpl, s)) return null;
  const env = makeEnv(state, s, ctx);
  const data = tpl.prepare ? tpl.prepare(env) : ({} as EventData);
  if (!data) return null;
  return fireWith(state, tpl, env, data);
}

export function updateEvents(state: GameState, ctx: EventContext): void {
  registerBuiltinTemplates();
  expirePending(state, ctx);
  fireHistorical(state, ctx);
  rollDynamic(state, ctx);
}

export function applyEventChoice(state: GameState, eventId: string, choiceId: string): CommandResult {
  registerBuiltinTemplates();
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return { ok: false, error: `unknown event ${eventId}` };
  if (ev.resolved) return { ok: false, error: 'event already resolved' };
  if (!ev.choices?.some((c) => c.id === choiceId)) return { ok: false, error: `invalid choice ${choiceId}` };
  const tpl = getEventTemplate(ev.templateId);
  if (!tpl) return { ok: false, error: `template ${ev.templateId} is not registered` };
  const env = makeEnv(state, ev.side ?? state.playerSide);
  const data = (state.eventState[`data:${ev.id}`] as EventData | undefined) ?? ({} as EventData);
  const def = tpl.choices?.find((c) => c.id === choiceId);
  if (def?.available && !def.available(env, data)) return { ok: false, error: 'choice no longer available' };
  resolve(state, ev, choiceId, env);
  return { ok: true, ids: [ev.id] };
}
