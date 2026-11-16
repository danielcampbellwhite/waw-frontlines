import { describe, expect, it } from 'vitest';
import { nextFloat } from '../src/core/rng';
import { pointInPolygon } from '../src/core/geo';
import type { GameState, ScenarioDefinition, SideId, Unit } from '../src/core/types';
import { getHistoricalEvents, getScenarioDefinition } from '../src/data';
import { aiThink, describeAi, type AiContext } from '../src/ai';
import { fastKm } from '../src/ai/model';
import { applyEventChoice, clearHistoricalTemplates, registerHistoricalEventsFromData, updateEvents } from '../src/events';

function stateFrom(def: ScenarioDefinition, playerNation: 'FRA' | 'GER'): GameState {
  const cellDeg = 0.25;
  const cols = Math.ceil((def.bbox.east - def.bbox.west) / cellDeg), rows = Math.ceil((def.bbox.north - def.bbox.south) / cellDeg);
  const palette = ['NEUTRAL', ...def.nations.map((n) => n.id)];
  const owner = new Array(cols * rows).fill(0);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const p: [number, number] = [def.bbox.west + (c + 0.5) * cellDeg, def.bbox.north - (r + 0.5) * cellDeg];
    for (const ic of def.initialControl) if (pointInPolygon(p, ic.polygon)) owner[r * cols + c] = palette.indexOf(ic.nation);
  }
  const units: Record<string, Unit> = {}; for (const u of def.units) units[u.id] = structuredClone(u);
  const nations: GameState['nations'] = {}; for (const n of def.nations) nations[n.id] = structuredClone(n);
  const locations: GameState['locations'] = {}; for (const l of def.locations) locations[l.id] = structuredClone(l);
  return {
    schema: 1, scenarioId: def.id, playerNation, playerSide: nations[playerNation].side,
    settings: { difficulty: 'normal', aiAggression: 0.6, fogOfWar: true, historicalDeployment: true, randomEvents: true, logisticsDifficulty: 1, reinforcementAvailability: 1, historicalEventFrequency: 1 },
    clock: { minutes: 0, speed: 1, startMinutes: 0, accumulatorMs: 0 }, rng: { s: 1 }, seed: 1, idCounter: 1, units, nations, locations,
    control: { bbox: def.bbox, cellDeg, cols, rows, nations: palette as never, owner, contested: owner.map(() => 0) },
    weather: { kind: 'clear', intensity: 0, temperatureC: 12, nextChangeMinutes: 99999 }, supply: { nodes: [], unitSupplyDistKm: {}, cutOffUnits: [] },
    battles: {}, reports: [], operations: {}, events: [], eventState: {}, log: [], objectives: structuredClone(def.objectives), aiState: {}, special: {}, history: [],
  };
}

/** Hand-built fog: an enemy unit is visible when within 30 km of any of the side's units. */
function fog(state: Readonly<GameState>, side: SideId): Unit[] {
  const mine = Object.values(state.units).filter((u) => u.side === side && !u.destroyed);
  return Object.values(state.units).filter((u) => u.side !== side && u.side !== 'neutral' && !u.destroyed && mine.some((m) => fastKm(m.pos, u.pos) <= 30));
}
const ctxOf = (seed: number): AiContext => { const r = { s: seed }; return { rand: () => nextFloat(r), visibleTo: fog }; };

describe('real Fall of France scenario', () => {
  const def = getScenarioDefinition('fall_of_france.standard')!;

  it('AI produces valid, fog-respecting commands for both sides', () => {
    for (const nation of ['GER', 'FRA', 'GBR'] as const) {
      const st = stateFrom(def, nation === 'GER' ? 'FRA' : 'GER');
      const visible = new Set(fog(st, st.nations[nation].side).map((u) => u.id));
      const t0 = performance.now();
      const cmds = aiThink(st, nation, ctxOf(7));
      const ms = performance.now() - t0;
      expect(cmds.length, nation).toBeGreaterThan(0);
      expect(ms).toBeLessThan(250); // first think incl. JIT warm-up; steady-state is far lower
      for (const c of cmds) {
        if (c.type === 'issue_order' || c.type === 'set_posture') for (const id of c.unitIds) expect(st.units[id]?.nation).toBe(nation);
        if (c.type === 'issue_order' && c.order.targetUnit) expect(visible.has(c.order.targetUnit)).toBe(true);
      }
      const mem = st.aiState[nation] as { contacts: Record<string, unknown> };
      for (const id of Object.keys(mem.contacts)) expect(visible.has(id)).toBe(true);
      expect(describeAi(st, nation).posture).toBeTruthy();
      if (process.env.AI_DEBUG) console.log(nation, describeAi(st, nation), cmds.length, cmds.filter((c) => c.type === 'create_operation').map((c) => c.type === 'create_operation' && c.operation.name));
    }
  });

  it('is deterministic on the real scenario and steady-state think is fast', () => {
    const a = aiThink(stateFrom(def, 'FRA'), 'GER', ctxOf(5));
    const b = aiThink(stateFrom(def, 'FRA'), 'GER', ctxOf(5));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const st = stateFrom(def, 'FRA');
    for (let i = 0; i < 5; i++) aiThink(st, 'GER', ctxOf(i));
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) { st.clock.minutes += 60; aiThink(st, 'GER', ctxOf(i)); }
    expect((performance.now() - t0) / 20).toBeLessThan(15);
  });

  it('registers the 19 sourced historical events and fires them at their dates', () => {
    clearHistoricalTemplates();
    const data = getHistoricalEvents('fall_of_france');
    expect(data.length).toBe(19);
    registerHistoricalEventsFromData(data);
    const st = stateFrom(def, 'FRA');
    st.settings.randomEvents = false;
    const ctx = { ...ctxOf(1), scenario: def };
    updateEvents(st, ctx);
    expect(st.events.map((e) => e.templateId)).toContain('fof.ev.invasion');
    expect(st.events.some((e) => e.templateId === 'fof.ev.sedan_crossing')).toBe(false);
    st.clock.minutes = 4320; // 13 May
    updateEvents(st, ctx);
    expect(st.events.some((e) => e.templateId === 'fof.ev.sedan_crossing')).toBe(true);
    st.clock.minutes = 60 * 24 * 60; // after the armistice
    updateEvents(st, ctx);
    for (const id of def.eventTemplateIds) expect(st.events.filter((e) => e.templateId === id).length, id).toBe(1);
    expect(applyEventChoice(st, st.events[0].id, 'x').ok).toBe(false);
    clearHistoricalTemplates();
  });
});
