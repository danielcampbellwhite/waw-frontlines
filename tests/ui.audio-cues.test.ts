import { describe, expect, it } from 'vitest';
import { CUES, CueGate, cueForCommand, diffCues, observe } from '../src/audio/cues';
import { SAMPLE_GROUPS, SampleBank } from '../src/audio/samples';
import { SOUND_CREDITS, SOUND_FILES } from '../src/audio/credits';
import type { Command, GameState } from '../src/core/types';

type S = Parameters<typeof observe>[0];
const unit = (id: string, side: string, moveStatus = 'stationary') => ({ id, side, moveStatus, destroyed: false });
function st(over: Record<string, unknown> = {}): S {
  return { playerSide: 'allies', battles: {}, reports: [], events: [], objectives: [], units: {}, result: undefined, ...over } as unknown as S;
}
const run = (a: S, b: S) => diffCues(observe(a), observe(b), b);

describe('event to cue mapping', () => {
  it('a new battle starts one battle_start cue, however many appear', () => {
    const b = st({ battles: { b1: {}, b2: {}, b3: {} } });
    expect(run(st(), b)).toEqual(['battle_start']);
    expect(run(b, b)).toEqual([]);
  });
  it('a new battle report and a new player-facing event map to report and event', () => {
    const next = st({ reports: [{ id: 'r' }], events: [{ id: 'e1', side: 'allies' }, { id: 'e2', side: 'axis' }] });
    expect(run(st(), next)).toEqual(['report', 'event']);
    expect(run(st(), st({ events: [{ id: 'x', side: 'axis' }] }))).toEqual([]);
    expect(run(st(), st({ events: [{ id: 'x', resolved: true }] }))).toEqual([]);
  });
  it('objective changes are judged from the player side', () => {
    const o = (side: string, status: string) => ({ id: 'o', side, status });
    expect(run(st({ objectives: [o('allies', 'pending')] }), st({ objectives: [o('allies', 'achieved')] }))).toEqual(['obj_captured']);
    expect(run(st({ objectives: [o('allies', 'pending')] }), st({ objectives: [o('allies', 'failed')] }))).toEqual(['obj_lost']);
    expect(run(st({ objectives: [o('axis', 'pending')] }), st({ objectives: [o('axis', 'achieved')] }))).toEqual(['obj_lost']);
    expect(run(st({ objectives: [o('allies', 'achieved')] }), st({ objectives: [o('allies', 'achieved')] }))).toEqual([]);
  });
  it('campaign result gives a victory or defeat sting on its own', () => {
    const base = st({ battles: { b: {} } });
    const res = (ending: string) => st({ battles: { b: {}, c: {} }, result: { ending } as GameState['result'] });
    expect(run(base, res('decisive_victory'))).toEqual(['victory']);
    expect(run(base, res('defeat'))).toEqual(['defeat']);
    expect(run(base, res('stalemate'))).toEqual(['notify']);
  });
  it('first sample after load produces nothing', () => {
    expect(diffCues(null, observe(st({ battles: { b: {} } })), st())).toEqual([]);
  });
  it('600 own units starting to move produce a single ack, enemies none', () => {
    const units: Record<string, unknown> = {}; const moving: Record<string, unknown> = {};
    for (let i = 0; i < 600; i++) { units['u' + i] = unit('u' + i, 'allies'); moving['u' + i] = unit('u' + i, 'allies', 'moving'); }
    expect(run(st({ units }), st({ units: moving }))).toEqual(['ack']);
    const enemy: Record<string, unknown> = { e: unit('e', 'axis', 'moving') };
    expect(run(st(), st({ units: enemy }))).toEqual([]);
  });
});

describe('command to cue mapping', () => {
  const issue = (kind: string): Command => ({ type: 'issue_order', unitIds: ['a'], mode: 'replace', order: { kind, priority: 1 } } as unknown as Command);
  it('picks move / attack / defend variants', () => {
    expect(cueForCommand(issue('move'), { ok: true })).toBe('order_move');
    expect(cueForCommand(issue('attack'), { ok: true })).toBe('order_attack');
    expect(cueForCommand(issue('defend'), { ok: true })).toBe('order_defend');
    expect(cueForCommand(issue('rest'), { ok: true })).toBe('order');
  });
  it('failed commands play the error cue', () => {
    expect(cueForCommand(issue('move'), { ok: false, error: 'x' })).toBe('error');
  });
  it('resolving an event confirms', () => {
    expect(cueForCommand({ type: 'resolve_event', eventId: 'e', choiceId: 'c' }, { ok: true })).toBe('confirm');
  });
});

describe('throttling', () => {
  it('enforces a per-cue minimum gap', () => {
    const g = new CueGate();
    expect(g.allow('select', 0)).toBe(true);
    expect(g.allow('select', CUES.select.gap - 1)).toBe(false);
    expect(g.allow('select', CUES.select.gap + 1)).toBe(true);
  });
  it('caps the number of non-priority cues per window but never blocks stings', () => {
    const g = new CueGate(3, 1000);
    const names = ['click', 'select', 'confirm', 'pause', 'speed', 'order'] as const;
    const played = names.filter(n => g.allow(n, 10)).length;
    expect(played).toBe(3);
    expect(g.allow('victory', 20)).toBe(true);
    expect(g.allow('click', 1500)).toBe(true); // window has passed
  });
  it('every cue references shipped sample ids', () => {
    const known = new Set(Object.values(SAMPLE_GROUPS).flat());
    for (const [name, d] of Object.entries(CUES)) for (const s of d.samples) expect(known.has(s), `${name} -> ${s}`).toBe(true);
  });
});

describe('sample bank and credits', () => {
  const fakeCtx = { decodeAudioData: async (b: ArrayBuffer) => ({ duration: 1, byteLength: b.byteLength }) } as unknown as AudioContext;
  it('loads lazily once and falls back (play returns null) when a file is missing', async () => {
    let fetches = 0;
    const bank = new SampleBank('/audio/', async url => { fetches++; if (url.includes('missing')) throw new Error('404'); return new ArrayBuffer(8); });
    expect(bank.has('ui_click')).toBe(false);
    await Promise.all([bank.load(fakeCtx, 'ui_click'), bank.load(fakeCtx, 'ui_click')]);
    expect(bank.has('ui_click')).toBe(true); expect(fetches).toBe(1);
    await bank.load(fakeCtx, 'missing');
    expect(bank.hasFailed('missing')).toBe(true);
    expect(bank.play(fakeCtx, 'missing', { dest: {} as AudioNode })).toBeNull();
    await bank.load(fakeCtx, 'missing'); expect(fetches).toBe(2); // failures are not retried
  });
  it('every shipped sample is credited with a CC0 / public-domain licence and a source URL', () => {
    const all = Object.values(SAMPLE_GROUPS).flat();
    expect(new Set(SOUND_FILES)).toEqual(new Set(all));
    for (const c of SOUND_CREDITS) { expect(c.licence).toMatch(/CC0|public domain/i); expect(c.url).toMatch(/^https:\/\//); expect(c.author).not.toBe(''); }
  });
});
