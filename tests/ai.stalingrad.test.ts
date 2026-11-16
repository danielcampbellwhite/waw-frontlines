import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDoctrine } from '../src/ai';
import type { NationId } from '../src/core/types';
import { loadWorld, mkEngine } from './qa/harness';

const out = (...a: unknown[]) => appendFileSync(process.env.AI_LOG ?? 'ai_probe.log', a.join(' ') + String.fromCharCode(10));
const seeds = String(process.env.AI_SEEDS ?? '1').split(',').map(Number);

describe('Stalingrad (stalingrad.short) AI', () => {
  it('resolves the registered doctrines', () => {
    const s = mkEngine(loadWorld('stalingrad.short'), 'SOV', 1).getState();
    expect(resolveDoctrine(s, 'SOV').armourObjectives).toContain('kalach');
    expect(resolveDoctrine(s, 'GER').pocketLocations).toContain('stalingrad');
    expect(resolveDoctrine(s, 'ROU').holdLocations).toContain('kletskaya');
  });

  for (const player of ['SOV', 'GER'] as NationId[]) {
    it(`runs with a passive ${player} player (AI plays the rest)`, () => {
      for (const seed of seeds) {
        const e = mkEngine(loadWorld('stalingrad.short'), player, seed);
        const at: Record<string, number> = {};
        const ticks = Number(process.env.AI_TICKS ?? 300);
        for (let t = 0; t < ticks && !e.getState().result; t += 4) {
          e.step(4);
          for (const o of e.getState().objectives) if (o.status === 'achieved' && at[o.id] === undefined) at[o.id] = Math.round(e.getState().clock.minutes / 60);
        }
        const s = e.getState();
        const pts = (side: string) => s.objectives.filter((o) => o.side === side && o.status === 'achieved').reduce((a, o) => a + o.points, 0);
        out('STALINGRAD passive', player, 'seed', seed, 'axis', pts('axis'), 'allies', pts('allies'), 'owners', ['kalach', 'surovikino', 'tatsinskaya', 'beketovka', 'stalingrad'].map((i) => i + ':' + s.locations[i].owner).join(' '), JSON.stringify(at));
        expect(Object.keys(s.units).length).toBeGreaterThan(0);
      }
    }, 900000);
  }
});
