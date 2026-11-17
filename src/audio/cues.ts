/**
 * Pure event -> sound-cue mapping and throttling (no Web Audio here, so it is unit-testable).
 * The bridge diffs successive engine states into cues; UI actions map commands to cues; a CueGate keeps
 * 600 units from spamming the mixer.
 */
import type { Command, CommandResult, GameState, SideId } from '../core/types';

export type CueName =
  | 'click' | 'panel_open' | 'panel_close' | 'select' | 'confirm' | 'error' | 'pause' | 'resume' | 'speed' | 'notify' | 'save' | 'load'
  | 'order_move' | 'order_attack' | 'order_defend' | 'order' | 'ack'
  | 'event' | 'alert' | 'battle_start' | 'report' | 'obj_captured' | 'obj_lost' | 'victory' | 'defeat';

export interface CueDef {
  /** sample ids (one chosen at random) from public/audio */
  samples: string[];
  gain: number;
  /** minimum ms between plays of this cue */
  gap: number;
  /** priority cues ignore the global budget */
  priority?: boolean;
  /** procedural fallback used until/unless the sample loads */
  fallback?: 'click' | 'order' | 'alert' | 'confirm';
  /** sample is layered after a short radio squelch */
  radio?: boolean;
  /** playback-rate jitter (+/-) */
  jitter?: number;
  /** also routed through the ambience-independent sfx bus only; stings are not scaled by battle mix */
  sting?: boolean;
}

export const CUES: Record<CueName, CueDef> = {
  click: { samples: ['ui_click'], gain: 0.7, gap: 40, fallback: 'click', jitter: 0.04 },
  panel_open: { samples: ['ui_panel_open'], gain: 0.7, gap: 120, fallback: 'click' },
  panel_close: { samples: ['ui_panel_close'], gain: 0.7, gap: 120, fallback: 'click' },
  select: { samples: ['ui_select_1', 'ui_select_2'], gain: 0.75, gap: 90, fallback: 'click', jitter: 0.03 },
  confirm: { samples: ['ui_confirm'], gain: 0.7, gap: 150, fallback: 'confirm' },
  error: { samples: ['ui_error'], gain: 0.7, gap: 250, fallback: 'alert' },
  pause: { samples: ['ui_pause'], gain: 0.8, gap: 150, fallback: 'click' },
  resume: { samples: ['ui_resume'], gain: 0.8, gap: 150, fallback: 'click' },
  speed: { samples: ['ui_speed'], gain: 0.7, gap: 80, fallback: 'click' },
  notify: { samples: ['ui_notify'], gain: 0.8, gap: 600, fallback: 'alert' },
  save: { samples: ['ui_save'], gain: 0.75, gap: 400, fallback: 'confirm' },
  load: { samples: ['ui_load'], gain: 0.75, gap: 400, fallback: 'confirm' },
  order_move: { samples: ['ord_move'], gain: 0.8, gap: 100, fallback: 'order', radio: true },
  order_attack: { samples: ['ord_attack'], gain: 0.85, gap: 100, fallback: 'order', radio: true },
  order_defend: { samples: ['ord_defend'], gain: 0.8, gap: 100, fallback: 'order', radio: true },
  order: { samples: ['ord_generic'], gain: 0.75, gap: 100, fallback: 'order' },
  ack: { samples: ['radio_squelch_1', 'radio_squelch_2'], gain: 0.5, gap: 2500, jitter: 0.05 },
  event: { samples: ['event_telegraph'], gain: 0.9, gap: 1500, fallback: 'alert', radio: true },
  alert: { samples: ['alert_beep'], gain: 0.5, gap: 1200, fallback: 'alert' },
  battle_start: { samples: ['battle_start'], gain: 0.7, gap: 2500, fallback: 'alert' },
  report: { samples: ['ui_notify'], gain: 0.6, gap: 1500, fallback: 'alert' },
  obj_captured: { samples: ['sting_obj_captured'], gain: 0.9, gap: 1500, priority: true, fallback: 'confirm', sting: true },
  obj_lost: { samples: ['sting_obj_lost'], gain: 0.9, gap: 1500, priority: true, fallback: 'alert', sting: true },
  victory: { samples: ['sting_victory'], gain: 0.9, gap: 5000, priority: true, fallback: 'confirm', sting: true },
  defeat: { samples: ['sting_defeat'], gain: 0.9, gap: 5000, priority: true, fallback: 'alert', sting: true },
};

/** Per-cue minimum gap plus a global budget so a burst of simultaneous state changes cannot flood the mixer. */
export class CueGate {
  private last = new Map<CueName, number>();
  private recent: number[] = [];
  private budget: number; private windowMs: number;
  constructor(budget = 6, windowMs = 1000) { this.budget = budget; this.windowMs = windowMs; }
  /** Returns true if the cue may play now (and records it). */
  allow(cue: CueName, nowMs: number): boolean {
    const def = CUES[cue];
    const prev = this.last.get(cue);
    if (prev !== undefined && nowMs - prev < def.gap) return false;
    if (!def.priority) {
      while (this.recent.length && nowMs - this.recent[0] > this.windowMs) this.recent.shift();
      if (this.recent.length >= this.budget) return false;
      this.recent.push(nowMs);
    }
    this.last.set(cue, nowMs);
    return true;
  }
  reset() { this.last.clear(); this.recent = []; }
}

/** Maps a dispatched command and its result to a cue (null = silent). */
export function cueForCommand(cmd: Command, res: CommandResult): CueName | null {
  if (!res.ok) return 'error';
  switch (cmd.type) {
    case 'issue_order': {
      const k = cmd.order.kind;
      if (k === 'attack') return 'order_attack';
      if (k === 'move' || k === 'withdraw' || k === 'recon' || k === 'reinforce' || k === 'follow' || k === 'capture') return 'order_move';
      if (k === 'defend' || k === 'hold' || k === 'entrench' || k === 'defensive_line') return 'order_defend';
      return 'order';
    }
    case 'cancel_orders': case 'set_posture': case 'rename': return 'click';
    case 'resolve_event': case 'create_operation': case 'request_reinforcement': return 'confirm';
    case 'cancel_operation': return 'click';
    default: return null;
  }
}

type Snap = Pick<GameState, 'battles' | 'reports' | 'events' | 'objectives' | 'units' | 'result' | 'playerSide'>;

/** Compact summary of the parts of a state that produce sounds; cheap to keep between 2 Hz samples. */
export interface Observed {
  battleIds: Set<string>;
  reports: number;
  eventIds: Set<string>;
  objectives: Map<string, string>;
  moving: Set<string>;
  resultSeen: boolean;
}

export function observe(s: Snap): Observed {
  const moving = new Set<string>();
  for (const u of Object.values(s.units)) if (!u.destroyed && u.moveStatus !== 'stationary' && sideMatches(u, s.playerSide)) moving.add(u.id);
  return {
    battleIds: new Set(Object.keys(s.battles)),
    reports: s.reports.length,
    eventIds: new Set(s.events.map(e => e.id)),
    objectives: new Map(s.objectives.map(o => [o.id, o.status])),
    moving,
    resultSeen: !!s.result,
  };
}

function sideMatches(u: { side?: SideId }, side: SideId) { return u.side === undefined || u.side === side; }

/**
 * Turns the difference between two observations into an ordered, de-duplicated list of cues.
 * At most one cue per category per diff, however many things changed.
 */
export function diffCues(prev: Observed | null, next: Observed, s: Snap): CueName[] {
  if (!prev) return [];
  const out: CueName[] = [];
  if (!prev.resultSeen && next.resultSeen && s.result) {
    out.push(s.result.ending === 'defeat' ? 'defeat' : s.result.ending === 'stalemate' ? 'notify' : 'victory');
    return out; // the end sting stands alone
  }
  let captured = false, lost = false;
  for (const o of s.objectives) {
    const before = prev.objectives.get(o.id);
    if (before === undefined || before === o.status || o.status === 'pending') continue;
    const mine = o.side === s.playerSide;
    if (o.status === 'achieved') { if (mine) captured = true; else lost = true; } else if (o.status === 'failed') { if (mine) lost = true; else captured = true; }
  }
  if (captured) out.push('obj_captured'); else if (lost) out.push('obj_lost');
  for (const id of next.battleIds) if (!prev.battleIds.has(id)) { out.push('battle_start'); break; }
  if (next.reports > prev.reports) {
    // a lost or failed battle sounds the alert cue; every other outcome the plain report cue
    const bad = s.reports.slice(prev.reports).some(r => r.outcome !== undefined && (r.attackerSide === s.playerSide ? r.outcome === 'defender_victory' || r.outcome === 'attacker_withdrew' : r.outcome === 'attacker_victory'));
    out.push(bad ? 'alert' : 'report');
  }
  for (const e of s.events) {
    if (prev.eventIds.has(e.id) || e.resolved) continue;
    if (e.side !== undefined && e.side !== s.playerSide) continue;
    out.push('event'); break;
  }
  for (const id of next.moving) if (!prev.moving.has(id)) { out.push('ack'); break; }
  return out;
}

/** Combined helper used by the bridge: returns cues for this sample and the new observation to keep. */
export function sample(prev: Observed | null, s: Snap): { cues: CueName[]; obs: Observed } {
  const obs = observe(s);
  return { cues: diffCues(prev, obs, s), obs };
}
