import { describe, expect, it } from 'vitest';
import { aiThink, resolveDoctrine, type AiContext } from '../src/ai';
import { scheduledPosture } from '../src/ai/doctrine';
import { loadWorld, mkEngine } from './qa/harness';
import type { GameState } from '../src/core/types';
import { setLocationThroughputFactor } from '../src/military';

describe('normandy doctrine scaffold', () => {
  const st = (): GameState => { const s = structuredClone(mkEngine(loadWorld(), 'FRA', 1).getState() as GameState); s.scenarioId = 'normandy.short'; s.special = { ...(s.special ?? {}) }; delete (s.special as Record<string, unknown>).aiDoctrine; return s; };

  it('registers allied and German doctrines under the normandy prefix', () => {
    const s = st();
    const a = resolveDoctrine(s, 'USA');
    const g = resolveDoctrine(s, 'GER');
    expect(a.phases.length).toBeGreaterThan(0);
    expect(a.captureLocations).toContain('cherbourg');
    expect(a.objectiveSchedule.avranches).toBe((49 * 24 + 24) * 60); // Cobra (25 Jul, D+49) plus a day
    expect(a.objectiveSchedule.caen).toBeGreaterThan(a.objectiveSchedule.carentan); // Caen is paced well after the lodgement
    expect(a.objectiveSchedule.avranches).toBeGreaterThan(a.objectiveSchedule.saint_lo);
    expect(g.holdLocations).toEqual(expect.arrayContaining(['caen', 'cherbourg', 'carentan']));
    expect(scheduledPosture(a, 0)).toBe('attack');
    expect(scheduledPosture(a, 49 * 24 * 60)).toBe('attack');
    expect(g.posture).toBe('defend');
    expect(g.armour).toBe('reserve');
    expect(g.reserveReleases.length).toBeGreaterThan(0);
    for (const r of g.reserveReleases) expect(r.fromMinutes !== undefined || r.eventId !== undefined).toBe(true);
  });

  it('sanitises scenario-supplied reserve releases', () => {
    const s = st();
    s.special = { ...s.special, aiDoctrine: { GER: { reserveReleases: [{ match: 'Panzer Lehr', fromMinutes: 100 }, { match: 'x' }, { fromMinutes: 5 }, { match: 'SS', eventId: 'ev.release' }, 7] } } };
    const d = resolveDoctrine(s, 'GER');
    expect(d.reserveReleases).toEqual([{ match: 'panzer lehr', fromMinutes: 100, eventId: undefined }, { match: 'ss', fromMinutes: undefined, eventId: 'ev.release' }]);
  });

  it('holds a unit that would otherwise be tasked until its release hour or event', () => {
    const base = mkEngine(loadWorld(), 'FRA', 1).getState() as GameState;
    const fresh = (rules: unknown): GameState => { const s = structuredClone(base); s.special = { ...s.special, aiDoctrine: rules ? { GER: { reserveReleases: rules } } : undefined }; return s; };
    const ctx = (s: GameState) => ({ rand: () => 0.5, gauss: () => 0, visibleTo: () => Object.values(s.units) }) as unknown as AiContext;
    const tasked = (cmds: ReturnType<typeof aiThink>, id: string) => cmds.some((c) => (c.type === 'issue_order' && c.unitIds.includes(id)) || (c.type === 'create_operation' && JSON.stringify(c).includes(`"${id}"`)));
    const s0 = fresh([]); // same (default) doctrine as the cases below, no rules
    const cmds0 = aiThink(s0, 'GER', ctx(s0));
    const ids = Object.values(base.units).filter((u) => u.nation === 'GER' && u.domain === 'land').map((u) => u.id);
    // a German unit whose id is not a substring of another unit's id, and that the unmodified AI does task
    const target = ids.find((id) => tasked(cmds0, id) && ids.filter((o) => o.toLowerCase().includes(id.toLowerCase())).length === 1);
    expect(target).toBeDefined();
    const m = target!.toLowerCase();
    // held before fromMinutes: untasked
    const a = fresh([{ match: m, fromMinutes: 100_000 }]);
    expect(tasked(aiThink(a, 'GER', ctx(a)), target!)).toBe(false);
    // released once the hour is reached: tasked again
    const b = fresh([{ match: m, fromMinutes: 0 }]);
    expect(tasked(aiThink(b, 'GER', ctx(b)), target!)).toBe(true);
    // event trigger: held until the event template has fired
    const c = fresh([{ match: m, eventId: 'ev.test_release' }]);
    expect(tasked(aiThink(c, 'GER', ctx(c)), target!)).toBe(false);
    const d = fresh([{ match: m, eventId: 'ev.test_release' }]);
    d.eventState['stat:ev.test_release|axis'] = { count: 1, last: 0 };
    expect(tasked(aiThink(d, 'GER', ctx(d)), target!)).toBe(true);
  });
});

describe('port-capacity-aware reinforcement requests', () => {
  it('does not request reinforcement at a wrecked port', () => {
    const base = structuredClone(mkEngine(loadWorld('normandy.short'), 'GER', 1).getState() as GameState);
    const ports = Object.values(base.locations).filter((l) => l.kind === 'port' && l.owner === 'GBR');
    expect(ports.length).toBeGreaterThan(0);
    const port = ports[0];
    const nation = 'GBR' as const;
    // the Allied units arrive by schedule, so make an Allied unit by re-badging a German one
    const src = Object.values(base.units).find((u) => u.nation === 'GER' && u.domain === 'land' && u.manpowerMax > 0)!;
    const unit = { ...structuredClone(src), id: 'gbr.test', nation, side: 'allies' as const };
    base.units[unit.id] = unit;
    const run = (wreck: boolean) => {
      const s = structuredClone(base);
      const u = s.units[unit.id];
      u.pos = [...port.pos] as typeof u.pos; u.manpower = Math.floor(u.manpowerMax * 0.3); u.inBattle = undefined;
      s.nations[nation].resources.manpower = 5000;
      if (wreck) setLocationThroughputFactor(s, port.id, 0);
      const ctx = { rand: () => 0.5, gauss: () => 0, visibleTo: () => Object.values(s.units) } as unknown as AiContext;
      return aiThink(s, nation, ctx).filter((c) => c.type === 'request_reinforcement' && c.unitId === u.id).map((c) => (c as { locationId: string }).locationId);
    };
    const open = run(false);
    const wrecked = run(true);
    expect(open.length).toBe(1);
    expect(wrecked).not.toContain(port.id);
  });
});

describe('barbarossa doctrine scaffold', () => {
  it('registers Axis and Soviet draft doctrines under the barbarossa prefix', () => {
    const s = structuredClone(mkEngine(loadWorld(), 'FRA', 1).getState() as GameState);
    s.scenarioId = 'barbarossa.short';
    const ger = resolveDoctrine(s, 'GER');
    const sov = resolveDoctrine(s, 'SOV');
    expect(ger.posture).toBe('attack');
    expect(ger.fuelAware).toBe(true);
    expect(ger.encirclement).toBe(true);
    expect(ger.armourGroups.map((g) => g.name)).toEqual(['north', 'centre', 'south']);
    expect(ger.objectiveSchedule.minsk).toBe(5 * 24 * 60); // Minsk 28 Jun
    expect(ger.objectiveSchedule.kiev).toBeGreaterThan(ger.objectiveSchedule.uman);
    expect(sov.posture).toBe('defend');
    expect(sov.reactionMinutes).toBeGreaterThan(120);
    expect(sov.holdLocations).toContain('leningrad');
  });
});

describe('armourGroups (opt-in per-army-group armour groups)', () => {
  const mk = (groups: unknown): GameState => {
    const s = structuredClone(mkEngine(loadWorld(), 'FRA', 1).getState() as GameState);
    s.special = { ...s.special, aiDoctrine: { GER: { posture: 'attack', armour: 'breakthrough', armourGroups: groups } } };
    return s;
  };
  const ctx = (s: GameState) => ({ rand: () => 0.5, gauss: () => 0, visibleTo: () => Object.values(s.units) }) as unknown as AiContext;

  it('sanitises groups (drops nameless, empty and duplicate ones)', () => {
    const d = resolveDoctrine(mk([{ name: 'north', objectives: ['rotterdam'], size: 99 }, { name: 'north', objectives: ['x'] }, { objectives: ['y'] }, { name: 'empty', objectives: [] }, { name: 'south', objectives: ['sedan', 7] }]), 'GER');
    expect(d.armourGroups).toEqual([{ name: 'north', objectives: ['rotterdam'], size: 16 }, { name: 'south', objectives: ['sedan'], size: undefined }]);
  });

  it('fills disjoint groups and leaves existing doctrines on the single-group path', () => {
    const s = mk([{ name: 'a', objectives: ['sedan'], size: 3 }, { name: 'b', objectives: ['rotterdam', 'brussels'], size: 3 }]);
    aiThink(s, 'GER', ctx(s));
    const book = ((s.aiState as Record<string, { armourGroups?: Record<string, string[]> }>).GER).armourGroups!;
    expect(Object.keys(book).sort()).toEqual(['a', 'b']);
    expect(book.a.length).toBeGreaterThan(0);
    expect(book.b.length).toBeGreaterThan(0);
    expect(book.a.some((id) => book.b.includes(id))).toBe(false);
    // no groups: the legacy single group path is used and no group book is created
    const t = structuredClone(mkEngine(loadWorld(), 'FRA', 1).getState() as GameState);
    t.special = { ...t.special, aiDoctrine: { GER: { posture: 'attack', armourObjectives: ['sedan'] } } };
    aiThink(t, 'GER', ctx(t));
    expect(((t.aiState as Record<string, { armourGroups?: unknown; axisGroup?: unknown }>).GER).armourGroups).toBeUndefined();
    expect(((t.aiState as Record<string, { axisGroup?: unknown }>).GER).axisGroup).toBeDefined();
  });
});
