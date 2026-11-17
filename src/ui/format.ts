import type { NationId, OrderKind, Posture, ScenarioDefinition, SideId, Unit, UnitType, Order, LonLat } from '../core/types';
import { haversineKm } from '../core/geo';

export const NATION_NAMES: Record<NationId, string> = {
  GER: 'Germany', FRA: 'France', GBR: 'United Kingdom', USA: 'United States', SOV: 'Soviet Union', ITA: 'Italy',
  JPN: 'Japan', CAN: 'Canada', POL: 'Poland', BEL: 'Belgium', NED: 'Netherlands', AUS: 'Australia',
  NZL: 'New Zealand', IND: 'India', RSA: 'South Africa', ROU: 'Romania', HUN: 'Hungary', CHN: 'China', NEUTRAL: 'Neutral',
};

/** Nation plate colours (kept in step with the map's nation colours). Unknown nations get a neutral grey. */
export const NATION_COLOURS: Record<NationId, string> = {
  GER: '#7b7f86', ITA: '#6f9a52', JPN: '#d8c9d6', FRA: '#4a78c2', GBR: '#3aa6a0', USA: '#4f8f4f', SOV: '#b34a4a',
  CAN: '#b3566b', POL: '#a8508a', BEL: '#d9b13a', NED: '#e58f3a', AUS: '#7aa0d0', NZL: '#5aa0a0', IND: '#c78f4a', RSA: '#6f9a5a', ROU: '#c9b23a', HUN: '#7a9a4a', CHN: '#c9a04a', NEUTRAL: '#999999',
};
export const nationColour = (n: string): string => (NATION_COLOURS as Record<string, string>)[n] ?? '#8a8f94';

export function sideColor(side: SideId | undefined): string {
  return side === 'allies' ? 'var(--allies)' : side === 'axis' ? 'var(--axis)' : 'var(--neutral)';
}

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  infantry: 'Infantry', armoured: 'Armour', mechanised: 'Mechanised', motorised: 'Motorised', paratroop: 'Airborne',
  artillery: 'Artillery', antitank: 'Anti-tank', recon: 'Reconnaissance', engineer: 'Engineers', logistics: 'Logistics',
  air_fighter: 'Fighters', air_bomber: 'Bombers', naval: 'Naval', carrier: 'Carrier group', hq: 'Headquarters',
};

export const POSTURES: { id: Posture; label: string; hint: string }[] = [
  { id: 'hold', label: 'Hold', hint: 'Stay put, fight if attacked, no digging in.' },
  { id: 'defend', label: 'Defend', hint: 'Prepared defence of the current position.' },
  { id: 'entrench', label: 'Entrench', hint: 'Fortify. Slow, but raises entrenchment steadily.' },
  { id: 'attack', label: 'Attack', hint: 'Aggressive stance: engages contacts, burns more supply.' },
  { id: 'rest', label: 'Rest', hint: 'Recover fatigue and organisation.' },
  { id: 'recon', label: 'Recon', hint: 'Screen and observe. Avoids decisive engagement.' },
  { id: 'regroup', label: 'Regroup', hint: 'Reorganise and absorb replacements.' },
];

export type OrderNeed = 'none' | 'point' | 'unit' | 'location' | 'line';
export interface OrderMeta { kind: OrderKind; label: string; need: OrderNeed; hint: string; actionKey?: string; group: 'move' | 'fight' | 'hold' | 'support' }

export const ORDER_META: OrderMeta[] = [
  { kind: 'move', label: 'Move', need: 'point', group: 'move', hint: 'March to a point. Follows roads where it can.', actionKey: 'ord_move' },
  { kind: 'attack', label: 'Attack', need: 'point', group: 'fight', hint: 'Assault a point or an enemy formation.', actionKey: 'ord_attack' },
  { kind: 'capture', label: 'Capture', need: 'location', group: 'fight', hint: 'Seize a town, port, airfield or depot.', actionKey: 'ord_capture' },
  { kind: 'recon', label: 'Recon', need: 'point', group: 'move', hint: 'Probe toward a point to reveal enemy positions.', actionKey: 'ord_recon' },
  { kind: 'defend', label: 'Defend', need: 'point', group: 'hold', hint: 'Take up a defensive position at a point.', actionKey: 'ord_defend' },
  { kind: 'defensive_line', label: 'Line', need: 'line', group: 'hold', hint: 'Draw a defensive line: click points, Enter or double-click to finish.' },
  { kind: 'hold', label: 'Hold', need: 'none', group: 'hold', hint: 'Hold the current position.', actionKey: 'ord_hold' },
  { kind: 'entrench', label: 'Entrench', need: 'none', group: 'hold', hint: 'Dig in where the unit stands.', actionKey: 'ord_entrench' },
  { kind: 'withdraw', label: 'Withdraw', need: 'point', group: 'move', hint: 'Fall back to a point, breaking contact.', actionKey: 'ord_withdraw' },
  { kind: 'regroup', label: 'Regroup', need: 'none', group: 'hold', hint: 'Reorganise in place.', actionKey: 'ord_regroup' },
  { kind: 'rest', label: 'Rest', need: 'none', group: 'hold', hint: 'Rest and recover.', actionKey: 'ord_rest' },
  { kind: 'support', label: 'Support', need: 'unit', group: 'support', hint: 'Support a friendly formation (fire, cover).', actionKey: 'ord_support' },
  { kind: 'follow', label: 'Follow', need: 'unit', group: 'support', hint: 'Follow and keep pace with another unit.', actionKey: 'ord_follow' },
  { kind: 'reinforce', label: 'Reinforce', need: 'unit', group: 'support', hint: 'Move to reinforce a friendly formation.' },
];

export const orderMeta = (k: OrderKind): OrderMeta => ORDER_META.find(o => o.kind === k)!;

export const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n: number) => String(n).padStart(2, '0');

export function simDate(scn: Pick<ScenarioDefinition, 'startDate'>, minutes: number): Date {
  return new Date(Date.parse(scn.startDate) + minutes * 60000);
}
export const fmtDay = (d: Date) => `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
/** Night as the sim's fog of war counts it (21:00 to 05:00); the top bar must agree with what units can actually see. */
export const isNightHour = (hour: number) => hour < 5 || hour >= 21;
export const fmtClock = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
export const fmtStamp = (scn: Pick<ScenarioDefinition, 'startDate'>, minutes: number) => {
  const d = simDate(scn, minutes); return `${fmtDay(d)} ${fmtClock(d)}`;
};
export function fmtIsoDay(iso: string): string { return fmtDay(new Date(iso)); }

export function fmtDuration(min: number): string {
  if (!isFinite(min) || min < 0) return '-';
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export function fmtPlayTime(min: number): string {
  if (min < 90) return `${Math.round(min)} min`;
  const h = min / 60; return `${h % 1 === 0 ? h : h.toFixed(1)} h`;
}

export function historicalSpan(startIso: string, endIso: string): string {
  const days = Math.max(1, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 86400000));
  if (days < 21) return `${days} days`;
  if (days < 120) return `${Math.round(days / 7)} weeks`;
  if (days < 800) return `${Math.round(days / 30.4)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-GB');
export const fmtK = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : fmtInt(n));
export const pct = (n: number) => `${Math.round(n)}%`;

export const strengthFrac = (u: Unit) => (u.manpowerMax > 0 ? Math.max(0, Math.min(1, u.manpower / u.manpowerMax)) : 0);

export function statusLabel(u: Unit): string {
  if (u.destroyed) return 'Destroyed';
  if (u.surrendered) return 'Surrendered';
  if (u.encircled || u.combatStatus === 'encircled') return 'Encircled';
  if (u.combatStatus === 'routed') return 'Routed';
  if (u.combatStatus === 'attacking') return 'Attacking';
  if (u.combatStatus === 'defending') return 'Defending';
  if (u.moveStatus === 'retreating') return 'Retreating';
  if (u.moveStatus === 'moving') return 'Moving';
  return 'Stationary';
}

export function statusTone(u: Unit): 'ok' | 'warn' | 'crit' | 'dim' {
  if (u.destroyed || u.surrendered || u.encircled || u.combatStatus === 'routed' || u.combatStatus === 'encircled') return 'crit';
  if (u.combatStatus !== 'idle' || u.moveStatus === 'retreating') return 'warn';
  return u.moveStatus === 'moving' ? 'ok' : 'dim';
}

export function orderTargetText(o: Order, units: Record<string, Unit>, locName?: (id: string) => string | undefined): string {
  if (o.targetUnit) return units[o.targetUnit]?.shortName ?? o.targetUnit;
  if (o.targetLocation) return locName?.(o.targetLocation) ?? o.targetLocation;
  if (o.target) return fmtPos(o.target);
  if (o.line?.length) return `${o.line.length}-pt line`;
  return 'in place';
}

export const fmtPos = (p: LonLat) => `${Math.abs(p[1]).toFixed(2)}${p[1] >= 0 ? 'N' : 'S'} ${Math.abs(p[0]).toFixed(2)}${p[0] >= 0 ? 'E' : 'W'}`;

/** Rough ETA planning speed (km/h) for order preview before the sim computes a real route. */
const SPEED: Partial<Record<UnitType, number>> = {
  infantry: 4, paratroop: 4, engineer: 4, antitank: 5, artillery: 5, logistics: 8, recon: 14, motorised: 14,
  mechanised: 13, armoured: 12, hq: 8, air_fighter: 350, air_bomber: 280, naval: 25, carrier: 28,
};
export function previewEtaMinutes(u: Unit, to: LonLat): { km: number; minutes: number } {
  const km = haversineKm(u.pos, to) * 1.25;
  const v = SPEED[u.type] ?? 6;
  return { km, minutes: (km / v) * 60 };
}

export function activeOrder(u: Unit): Order | undefined {
  return u.orders.find(o => o.status === 'active') ?? u.orders.find(o => o.status === 'queued');
}

export const SEVERITY_ORDER = { info: 0, warn: 1, critical: 2 } as const;

/** Scenario title without a trailing scale tag or dated parenthetical ("Operation Crusader (18 Nov 1941 - 1 Jan 1942)" -> "Operation Crusader"). */
export const shortTitle = (t: string): string => t.replace(/\s*[-(:]\s*(short|standard|grand)\)?\s*$/i, '').replace(/\s*\([^)]*\d[^)]*\)\s*$/, '').trim() || t;
