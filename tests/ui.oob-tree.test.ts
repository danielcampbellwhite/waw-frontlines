import { describe, expect, it } from 'vitest';
import { buildTree } from '../src/ui/game/LeftPanel';
import type { Unit } from '../src/core/types';

const u = (id: string, nation: string, parentId?: string): Unit => ({ id, name: id, shortName: id, nation, parentId, type: 'infantry', domain: 'land' }) as unknown as Unit;

describe('order of battle grouping', () => {
  it('groups by unit nation, keeps same-nation formation trees, and tags cross-nation attachments', () => {
    const t = buildTree([u('corps', 'GBR'), u('div', 'GBR', 'corps'), u('nz', 'NZL', 'corps'), u('nzbde', 'NZL', 'nz'), u('ind', 'IND')]);
    expect(Object.keys(t).sort()).toEqual(['GBR', 'IND', 'NZL']);
    expect(t.GBR.map(n => n.unit.id)).toEqual(['corps']);
    expect(t.GBR[0].children.map(n => n.unit.id)).toEqual(['div']);
    expect(t.NZL.map(n => n.unit.id)).toEqual(['nz']);
    expect(t.NZL[0].under).toBe('corps');
    expect(t.NZL[0].children.map(n => n.unit.id)).toEqual(['nzbde']);
    expect(t.IND[0].under).toBeUndefined();
  });
});
