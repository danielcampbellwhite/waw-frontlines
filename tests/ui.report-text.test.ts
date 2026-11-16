import { describe, expect, it } from 'vitest';
import type { BattleReport } from '../src/core/types';
import { equipName, tidyConsequences } from '../src/ui/game/reportText';

const base: BattleReport = { id: 'r', battleId: 'b', startedAt: 0, endedAt: 60, pos: [0, 0], attackerSide: 'axis', outcome: 'defender_victory', summary: '', reasons: [], casualties: [], equipmentLosses: {}, orgChanges: [], retreats: [], territoryChangeCells: 0, consequences: [] };

describe('battle report text tidying', () => {
  it('de-duplicates unit names and uses catalog equipment names', () => {
    const out = tidyConsequences({ ...base, consequences: ['Retreated: 51e DI, 51e DI.', 'Equipment lost: 7 rifle, 4 gun_arty, 3 gun_at.'] });
    expect(out[0]).toBe('Retreated: 51e DI.');
    expect(out[1]).toBe('Equipment lost: 7 rifles / small arms, 4 artillery pieces, 3 anti-tank guns.');
  });
  it('says who gained ground', () => {
    expect(tidyConsequences({ ...base, outcome: 'attacker_victory', territoryChangeCells: 17 }).join(' ')).toMatch(/Axis forces gained ground.*17/);
    expect(tidyConsequences({ ...base, territoryChangeCells: 17 }).join(' ')).toMatch(/front line shifted/);
  });
  it('prettifies unknown equipment ids', () => { expect(equipName('weird_thing')).toBe('Weird thing'); });
});
