import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDoctrine } from '../src/ai';
import type { NationId } from '../src/core/types';
import { loadWorld, mkEngine } from './qa/harness';

const out = (...a: unknown[]) => appendFileSync(process.env.AI_LOG ?? 'ai_probe.log', a.join(' ') + String.fromCharCode(10));
const seeds = String(process.env.AI_SEEDS ?? '1').split(',').map(Number);

describe('Crusader (crusader.short) AI', () => {
  it('resolves the registered doctrines', () => {
    const e = mkEngine(loadWorld('crusader.short'), 'GBR', 1);
    const s = e.getState();
    expect(resolveDoctrine(s, 'GER').armourObjectives[0]).toBe('sidi_rezegh');
    expect(resolveDoctrine(s, 'GBR').holdLocations).toContain('tobruk');
    expect(resolveDoctrine(s, 'ITA').holdLocations).toContain('bardia');
    expect(resolveDoctrine(s, 'RSA').posture).toBe('attack');
  });

  for (const player of ['GBR', 'GER', 'ITA'] as NationId[]) {
    it(`runs with a passive ${player} player (AI plays the rest)`, () => {
      for (const seed of seeds) {
        const e = mkEngine(loadWorld('crusader.short'), player, seed);
        const at: Record<string, number> = {};
        const ticks = Number(process.env.AI_TICKS ?? 300);
        for (let t = 0; t < ticks && !e.getState().result; t += 4) {
          e.step(4);
          for (const o of e.getState().objectives) if (o.status === 'achieved' && at[o.id] === undefined) at[o.id] = Math.round(e.getState().clock.minutes / 60);
        }
        const s = e.getState();
        const pts = (side: string) => s.objectives.filter((o) => o.side === side && o.status === 'achieved').reduce((a, o) => a + o.points, 0);
        out('CRUSADER passive', player, 'seed', seed, 'axis', pts('axis'), 'allies', pts('allies'), 'owners', ['tobruk', 'sidi_rezegh', 'bardia', 'gazala', 'benghazi'].map((i) => i + ':' + s.locations[i].owner).join(' '), JSON.stringify(at));
        expect(Object.keys(s.units).length).toBeGreaterThan(0);
      }
    }, 600000);
  }
});
