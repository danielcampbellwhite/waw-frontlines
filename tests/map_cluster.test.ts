import { describe, expect, it } from 'vitest';
import { clusterBySide, clusterItems, iconScale, overlapBox, separateSides } from '../src/map/cluster';
import { equipmentHint } from '../src/map/photos';

describe('clusterItems', () => {
  it('stacks overlapping markers under the highest score and keeps distant ones apart', () => {
    const items = [
      { id: 'a', x: 100, y: 100, score: 5 }, { id: 'b', x: 105, y: 102, score: 9 }, { id: 'c', x: 98, y: 99, score: 1 },
      { id: 'd', x: 400, y: 400, score: 3 },
    ];
    const cl = clusterItems(items, 40, 30);
    expect(cl).toHaveLength(2);
    const big = cl.find((c) => c.members.length === 3)!;
    expect(big.leader.id).toBe('b');
    expect(cl.find((c) => c.members.length === 1)!.leader.id).toBe('d');
  });
  it('partitions every item exactly once and is deterministic', () => {
    const items = Array.from({ length: 300 }, (_, i) => ({ id: `u${i}`, x: (i * 37) % 500, y: (i * 91) % 400, score: i % 7 }));
    const a = clusterItems(items, 50, 40), b = clusterItems([...items].reverse(), 50, 40);
    expect(a.reduce((s, c) => s + c.members.length, 0)).toBe(300);
    expect(new Set(a.flatMap((c) => c.members.map((m) => m.id))).size).toBe(300);
    expect(a.map((c) => c.leader.id).sort()).toEqual(b.map((c) => c.leader.id).sort());
    // leaders never overlap each other
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) expect(Math.abs(a[i].leader.x - a[j].leader.x) >= 50 || Math.abs(a[i].leader.y - a[j].leader.y) >= 40).toBe(true);
  });
  it('overlap box grows with zoom', () => {
    expect(overlapBox(9).w).toBeGreaterThan(overlapBox(5).w);
    expect(iconScale(12)).toBeGreaterThan(iconScale(8));
  });
});

describe('equipmentHint', () => {
  it('picks the largest non-small-arms holding', () => {
    expect(equipmentHint({ equipment: { held: { rifle: 9000, tank_medium: 120, gun_arty: 30 }, authorised: {} } })).toBe('tank_medium');
    expect(equipmentHint({ equipment: { held: { rifle: 9000 }, authorised: {} } })).toBe('rifle');
    expect(equipmentHint({ equipment: { held: {}, authorised: {} } })).toBeUndefined();
  });
});

describe('per-side clustering', () => {
  const items = [{ id: 'a1', x: 100, y: 100, score: 5 }, { id: 'a2', x: 102, y: 101, score: 3 }, { id: 'g1', x: 101, y: 100, score: 9 }, { id: 'g2', x: 103, y: 99, score: 1 }];
  const side = (id: string) => (id.startsWith('a') ? 'allies' : 'axis');
  it('never merges opposing units', () => {
    const cl = clusterBySide(items, side, 70, 70);
    expect(cl.length).toBe(2);
    for (const c of cl) expect(new Set(c.members.map((m) => side(m.id))).size).toBe(1);
  });
  it('separates overlapping opposing stacks', () => {
    const cl = clusterBySide(items, side, 70, 70);
    const off = separateSides(cl, side, 70, 70);
    const p = cl.map((c) => ({ x: c.leader.x + (off.get(c.leader.id)?.dx ?? 0), y: c.leader.y + (off.get(c.leader.id)?.dy ?? 0) }));
    expect(Math.abs(p[0].x - p[1].x) >= 70 || Math.abs(p[0].y - p[1].y) >= 70).toBe(true);
  });
});
