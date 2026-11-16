import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveDoctrine } from '../src/ai';
import { loadWorld, mkEngine } from './qa/harness';

const out = (...a: unknown[]) => appendFileSync(process.env.AI_LOG ?? 'ai_probe.log', a.join(' ') + String.fromCharCode(10));

describe('Ardennes (bulge.short) AI', () => {
  it('uses the registered doctrines and the German AI attacks toward St Vith / Stavelot over a passive US player', () => {
    const w = loadWorld('bulge.short');
    const e = mkEngine(w, 'USA', 5);
    const s0 = e.getState();
    expect(resolveDoctrine(s0, 'GER').armourObjectives[0]).toBe('stavelot');
    expect(resolveDoctrine(s0, 'USA').holdLocations).toContain('bastogne');
    const at: Record<string, number> = {};
    for (let t = 0; t < 400 && !e.getState().result; t += 4) {
      e.step(4);
      for (const o of e.getState().objectives) if (o.status === 'achieved' && at[o.side + ':' + o.id] === undefined) at[o.side + ':' + o.id] = Math.round(e.getState().clock.minutes / 60);
    }
    const s = e.getState();
    const owned = ['stavelot', 'st_vith', 'bastogne', 'houffalize', 'dinant'].map((i) => i + ':' + s.locations[i].owner).join(' ');
    out('BULGE 400t', owned, JSON.stringify(at));
    const moved = Object.values(s.units).filter((u) => u.nation === 'GER' && u.domain === 'land' && !u.destroyed && u.pos[0] < 6.2).length;
    expect(moved).toBeGreaterThan(0);
  }, 300000);
});
