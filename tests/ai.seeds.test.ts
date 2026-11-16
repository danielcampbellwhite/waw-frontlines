import { appendFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { loadWorld, mkEngine } from './qa/harness';
import { aiThink } from '../src/ai';
import type { GameState, NationId, SideId } from '../src/core/types';

const out = (...a: unknown[]) => appendFileSync(process.env.AI_LOG ?? 'ai_probe.log', a.join(' ') + String.fromCharCode(10));
const seeds = String(process.env.AI_SEEDS ?? '').split(',').filter(Boolean).map(Number);

function play(player: NationId, seed: number, ticks: number, aiPlayerToo: boolean) {
  const e = mkEngine(loadWorld(process.env.AI_SCEN ?? 'fall_of_france.standard'), player, seed);
  const t0 = performance.now();
  const at: Record<string, number> = {};
  for (let t = 0; t < ticks && !e.getState().result; t += 4) {
    e.step(4);
    const st = e.getState() as GameState;
    if (aiPlayerToo) {
      const ctxp = { rand: () => Math.abs(Math.sin(st.clock.minutes * 12.9898)) % 1, gauss: () => 0, visibleTo: (_s: Readonly<GameState>, side: SideId) => e.visibleUnits(side) };
      for (const c of aiThink(st, player, ctxp)) e.dispatch(c, st.playerSide);
    }
    for (const o of st.objectives) if (o.status === 'achieved' && at[o.side + ':' + o.id.split('.').pop()] === undefined) at[o.side + ':' + o.id.split('.').pop()] = Math.round(st.clock.minutes / 60);
  }
  const s = e.getState();
  const pts = (side: string) => s.objectives.filter((o) => o.side === side && o.status === 'achieved').reduce((a, o) => a + o.points, 0);
  return { axis: pts('axis'), allies: pts('allies'), at, ms: (performance.now() - t0) / ticks };
}

describe.skipIf(!seeds.length)('seed sweep', () => {
  for (const mode of String(process.env.AI_MODES ?? 'FRA').split(',')) {
    it('mode ' + mode, () => {
      for (const seed of seeds) {
        const ticks = Number(process.env.AI_TICKS ?? 1100);
        const ai = (process.env.AI_PLAYER ?? 'FRA') as NationId;
        const r = mode === 'AIFRA' ? play(ai, seed, ticks, true) : play(mode as NationId, seed, ticks, false);
        out(mode, 'seed', seed, 'axis', r.axis, 'allies', r.allies, 'ms/tick', r.ms.toFixed(1), JSON.stringify(Object.fromEntries(Object.entries(r.at).filter(([k]) => process.env.AI_ALLSIDES || k.startsWith('axis')))));
      }
    }, 1800000);
  }
});
