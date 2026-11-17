import { describe, expect, it } from 'vitest';
import { buildNotifications, notifCount, notifSignature } from '../src/ui/game/notifications';

type S = Parameters<typeof buildNotifications>[0];
const st = (o: Record<string, unknown> = {}): S => ({ log: [], reports: [], events: [], objectives: [], playerSide: 'allies', ...o }) as unknown as S;
const report = (id: string, t = 100) => ({ id, battleId: 'b', startedAt: 0, endedAt: t, pos: [5, 50], placeName: 'Sedan', summary: 'Held the line.' });

describe('notifications', () => {
  it('a new BattleReport creates a notification (even with an empty log) with a position to focus', () => {
    const before = st(), after = st({ reports: [report('r1')] });
    expect(notifCount(before)).toBe(0);
    const n = buildNotifications(after);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: 'report', pos: [5, 50] });
    expect(n[0].text).toContain('at Sedan');
    expect(notifSignature(after)).not.toBe(notifSignature(before));
  });
  it('includes battle/supply/system log entries, player-facing events and objective changes, newest first', () => {
    const s = st({
      log: [{ t: 10, category: 'supply', severity: 'warn', text: 'Fuel low' }, { t: 20, category: 'order', severity: 'info', text: 'ordered' }, { t: 30, category: 'battle', severity: 'info', text: 'Contact' }, { t: 5, category: 'event', severity: 'info', text: 'dup of event' }],
      events: [{ id: 'e1', firedAt: 40, title: 'Radio intercept', side: 'allies', choices: [{ id: 'a' }], resolved: false }, { id: 'e2', firedAt: 41, title: 'Enemy only', side: 'axis' }],
      objectives: [{ id: 'o1', side: 'allies', title: 'Hold Sedan', status: 'achieved', achievedAt: 50 }, { id: 'o2', side: 'allies', title: 'Take X', status: 'pending' }, { id: 'o3', side: 'axis', title: 'Other', status: 'achieved', achievedAt: 60 }],
    });
    const n = buildNotifications(s);
    expect(n.map(x => x.text)).toEqual(['Objective achieved: Hold Sedan', 'Radio intercept', 'Contact', 'Fuel low']);
    expect(n.find(x => x.kind === 'event')!.severity).toBe('warn');
    expect(notifCount(s)).toBe(4);
  });
  it('failed objectives are critical; ids are stable between rebuilds so toasts do not repeat', () => {
    const s = st({ objectives: [{ id: 'o', side: 'allies', title: 'Hold', status: 'failed' }], reports: [report('r1')] });
    expect(buildNotifications(s).find(x => x.kind === 'objective')!.severity).toBe('critical');
    expect(buildNotifications(s).map(x => x.id)).toEqual(buildNotifications(s).map(x => x.id));
  });
});

import { iceTip } from '../src/ui/game/TopBar';
describe('ice readout', () => {
  it('lists which units can cross at the current thickness', () => {
    expect(iceTip(0.2)).toContain('Too thin');
    expect(iceTip(0.45)).toContain('Can cross: infantry.');
    expect(iceTip(0.75)).toContain('infantry, wheeled transport, tracked vehicles');
  });
});
