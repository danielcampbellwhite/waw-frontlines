import { keyLabel, type KeyAction } from '../settings';

export type TourTopic = 'map' | 'select' | 'orders' | 'supply' | 'fog' | 'reports' | 'time' | 'saves';

export interface TourStep {
  id: TourTopic;
  title: string;
  /** CSS selector of the element to highlight in the game; the card is centred when it is absent or hidden. */
  anchor: string;
  /** Preferred side of the anchor for the card. */
  side: 'right' | 'left' | 'top' | 'bottom' | 'center';
  body: (k: Record<KeyAction, string>) => string[];
}

const L = keyLabel;

/** The guided tour. Order follows a first game: look, select, order, feed, see, read, run time, save. */
export const TOUR_STEPS: TourStep[] = [
  { id: 'map', title: 'The map', anchor: '.map-wrap', side: 'center', body: () => [
    'This is the theatre. Drag to pan and use the mouse wheel to zoom.',
    'Zoom out for the strategic picture with grouped formations. Zoom in to see individual units, roads, rivers and towns.',
  ] },
  { id: 'select', title: 'Selecting units', anchor: '.left-panel', side: 'right', body: k => [
    'Click a unit on the map or in the order of battle to select it. Shift-drag a box on the map to select several. ' + L(k.selectAll) + ' selects all of your units.',
    'The panel on the right shows the selected unit: strength, supply, fuel, morale and equipment.',
  ] },
  { id: 'orders', title: 'Giving orders', anchor: '.right-panel', side: 'left', body: () => [
    'With your units selected, pick an order in the right panel, then click the target on the map. Move, attack, defend, recon, withdraw and more are listed there.',
    'Right-click the map for quick orders. Replace or Queue decides whether the new order replaces the current ones or is added after them.',
    'Defensive lines: choose Line, click each point, then press Enter or double-click to finish.',
  ] },
  { id: 'supply', title: 'Supply and fuel', anchor: '.tb-res', side: 'bottom', body: () => [
    'Units burn ammunition, food and fuel. Out of supply they slow down, lose morale and fight badly.',
    'Turn on the Supply layer on the map to see the network that feeds your units. Keep depots, ports and roads connected, and do not push too far from them.',
  ] },
  { id: 'fog', title: 'Fog of war', anchor: '.map-tools', side: 'bottom', body: () => [
    'You see only what your units and towns can see. Enemy units appear when they are spotted and fade to a last-known position when they are lost.',
    'Use recon orders to find the enemy. The Fog chip shows or hides the area you cannot see.',
  ] },
  { id: 'reports', title: 'Combat and reports', anchor: '.bottom-panel', side: 'top', body: k => [
    'Battles are marked on the map. When one ends, a report records who fought, the losses and the result.',
    'The Notifications and Battle reports tabs here collect them (' + L(k.tabNotifications) + ' and ' + L(k.tabReports) + '). Click a report to jump to the place.',
  ] },
  { id: 'time', title: 'Speed and pause', anchor: '.tb-speed', side: 'bottom', body: k => [
    'The game runs in real time. Pause with ' + L(k.pause) + ' and change speed with ' + L(k.speed1) + ' to ' + L(k.speed4) + '.',
    'You can pause and still give orders, then resume to watch them play out. Important decisions pause the game while you think.',
  ] },
  { id: 'saves', title: 'Saving your game', anchor: '.tb-tools', side: 'bottom', body: k => [
    'The game autosaves as you play. ' + L(k.quickSave) + ' makes a quick save and ' + L(k.panelSave) + ' opens the save and load dialog with eight named slots.',
    'Help and controls are always one click away on the ? button, or press ' + L(k.panelHelp) + '. You can replay this tour from there.',
  ] },
];

export const TOUR_TOPICS: TourTopic[] = TOUR_STEPS.map(s => s.id);

/** Fixed (non-rebindable) controls, listed in Settings and Help beside the rebindable ones. */
export const FIXED_CONTROLS: { keys: string; label: string }[] = [
  { keys: 'Esc', label: 'Cancel targeting, close dialogs, clear selection, open the game menu' },
  { keys: 'Enter', label: 'Finish a defensive line' },
  { keys: 'Double-click', label: 'Finish a defensive line' },
  { keys: 'Shift-drag', label: 'Box-select units on the map' },
  { keys: 'Right-click', label: 'Quick orders at that place on the map' },
  { keys: 'Wheel', label: 'Zoom the map' },
  { keys: 'Drag', label: 'Pan the map' },
];

export type Rect = { left: number; top: number; width: number; height: number };

/** Places a card of the given size next to an anchor rect inside the viewport; centred when no rect fits. */
export function placeCard(anchor: Rect | null, side: TourStep['side'], card: { w: number; h: number }, vp: { w: number; h: number }, gap = 14): { left: number; top: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const center = { left: Math.round((vp.w - card.w) / 2), top: Math.round((vp.h - card.h) / 2) };
  if (!anchor || side === 'center') return center;
  const cx = anchor.left + anchor.width / 2, cy = anchor.top + anchor.height / 2;
  const tries: [TourStep['side'], () => { left: number; top: number } | null][] = [
    ['right', () => anchor.left + anchor.width + gap + card.w <= vp.w ? { left: anchor.left + anchor.width + gap, top: cy - card.h / 2 } : null],
    ['left', () => anchor.left - gap - card.w >= 0 ? { left: anchor.left - gap - card.w, top: cy - card.h / 2 } : null],
    ['bottom', () => anchor.top + anchor.height + gap + card.h <= vp.h ? { left: cx - card.w / 2, top: anchor.top + anchor.height + gap } : null],
    ['top', () => anchor.top - gap - card.h >= 0 ? { left: cx - card.w / 2, top: anchor.top - gap - card.h } : null],
  ];
  const ordered = [...tries.filter(t => t[0] === side), ...tries.filter(t => t[0] !== side)];
  for (const [, f] of ordered) {
    const p = f();
    if (p) return { left: Math.round(clamp(p.left, 8, vp.w - card.w - 8)), top: Math.round(clamp(p.top, 8, vp.h - card.h - 8)) };
  }
  return center;
}
