import { describe, expect, it } from 'vitest';
import type { NationId } from '../../src/core/types';
import { loadWorld, mkEngine } from './harness';

const CASES: [string, NationId[]][] = [
  ['fall_of_france.standard', ['GER', 'FRA', 'GBR']], ['bulge.short', ['GER', 'USA', 'GBR']],
  ['crusader.short', ['GER', 'GBR', 'ITA']], ['stalingrad.short', ['SOV', 'GER']], ['normandy.short', ['USA', 'GBR', 'CAN', 'GER']],
];

describe('event side-gating', () => {
  for (const [id, nations] of CASES) {
    it(`${id}: events shown to the player never carry the other side's wording`, () => {
      const w = loadWorld(id); const titles = new Map<string, Set<string>>(); const bad: string[] = []; let histOther = 0;
      for (const n of nations) for (const seed of [1, 2, 3]) {
        const e = mkEngine(w, n, seed); e.step(700);
        const s = e.getState(); const ps = s.playerSide;
        for (const ev of s.events) {
          const k = `${n}/${ps}`; if (!titles.has(k)) titles.set(k, new Set()); titles.get(k)!.add(ev.title);
          if (ev.kind !== 'historical' && ev.side && ev.side !== ps) bad.push(`${n} seed${seed}: event for ${ev.side} shown to ${ps}: ${ev.title}`);
          if (ev.kind === 'historical' && ev.side && ev.side !== ps) histOther++;
          const txt = ev.title + ' ' + ev.body;
          if (ps === 'axis' && /\bAllied (shipment|war material)/.test(txt)) bad.push(`${n} seed${seed}: ${ev.title}`);
          if (ps === 'allies' && /Axis (shipment|war material)|from the homeland/.test(txt)) bad.push(`${n} seed${seed}: ${ev.title}`);
        }
      }
      console.log(`[gating] ${id}`, JSON.stringify([...titles].map(([k, v]) => [k, v.size])), 'historical events tagged to the other side but shown:', histOther);
      expect([...new Set(bad)]).toEqual([]);
    }, 240_000);
  }
});
