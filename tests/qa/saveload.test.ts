import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SAVE_SCHEMA_VERSION } from '../../src/core/types';
import { checksum, deleteSave, exportSave, importSave, listSaves, loadGame, saveGame } from '../../src/save';
import { CJ, J, longWorld, mkEngine, restore } from './harness';

const L = longWorld();

describe('save / load', () => {
  it('serialize -> checksum -> JSON -> restoreEngine -> continue == uninterrupted run', () => {
    const a = mkEngine(L, 'GER', 11); a.step(200);
    const json = J(a.serialize());
    const sum = checksum(json);
    expect(checksum(json)).toBe(sum);
    const b = restore(L, JSON.parse(json)); // fresh JSON parse = what a real load yields
    expect(J(b.getState())).toBe(json);
    a.step(150); b.step(150);
    expect(CJ(b.getState())).toBe(CJ(a.getState()));
  }, 240_000);

  it('restore preserves running speed/accumulator and aiOff meta', () => {
    const a = mkEngine(L, 'FRA', 3, { disableAI: true }); a.setSpeed(4); a.advance(900); a.step(20);
    const b = restore(L, JSON.parse(J(a.serialize())));
    a.step(60); b.step(60);
    expect(CJ(b.getState())).toBe(CJ(a.getState()));
  }, 120_000);

  it('IndexedDB round trip: checksum stable across structured clone, state identical, resume identical', async () => {
    const a = mkEngine(L, 'GER', 5); a.step(120);
    const meta = await saveGame('qa1', 'QA slot', a.serialize());
    expect(meta.checksum).toBe(checksum(J(a.serialize())));
    const loaded = await loadGame('qa1');                       // throws if checksum unstable
    expect(J(loaded)).toBe(J(a.getState()));
    const list = await listSaves();
    expect(list.find((s) => s.id === 'qa1')?.simMinutes).toBe(120 * 60);
    const b = restore(L, loaded);
    a.step(80); b.step(80);
    expect(CJ(b.getState())).toBe(CJ(a.getState()));
  }, 240_000);

  it('checksum survives structured-clone for states with every optional field populated (late-game, many battles)', async () => {
    const a = mkEngine(L, 'FRA', 21); a.step(400);
    await saveGame('qa2', 'late', a.serialize());
    await expect(loadGame('qa2')).resolves.toBeTruthy();
  }, 240_000);

  it('detects corruption (tampered record in IndexedDB)', async () => {
    const a = mkEngine(L, 'GER', 5); a.step(10);
    await saveGame('qa3', 'to-corrupt', a.serialize());
    const { openDB } = await import('idb');
    const raw = await openDB('theatre-command', 1);
    const rec = await raw.get('saves', 'qa3');
    rec.state.clock.minutes += 60;
    await raw.put('saves', rec);
    raw.close();
    await expect(loadGame('qa3')).rejects.toThrow(/corrupt|integrity/i);
  });

  it('export / import round trip; tampered import rejected; non-save rejected', async () => {
    const a = mkEngine(L, 'GER', 8); a.step(30);
    await saveGame('qa4', 'exp', a.serialize());
    const blob = await exportSave('qa4');
    const text = await blob.text();
    const file = new File([text], 'x.tcsave');
    const meta = await importSave(file);
    expect(meta.id).not.toBe('qa4');
    expect(J(await loadGame(meta.id))).toBe(J(a.getState()));
    const bad = JSON.parse(text); bad.record.state.seed = 999;
    await expect(importSave(new File([JSON.stringify(bad)], 'bad.tcsave'))).rejects.toThrow();
    await expect(importSave(new File(['{"hello":1}'], 'bad2.tcsave'))).rejects.toThrow();
    await expect(importSave(new File(['not json'], 'bad3.tcsave'))).rejects.toThrow();
    await deleteSave(meta.id);
    await expect(loadGame(meta.id)).rejects.toThrow(/not found/i);
  }, 120_000);

  it('schema migration: older schema without a migration is a clear error, current passes', async () => {
    const a = mkEngine(L, 'GER', 8); a.step(2);
    const { openDB } = await import('idb');
    await saveGame('qa5', 'old', a.serialize());
    const raw = await openDB('theatre-command', 1);
    const rec = await raw.get('saves', 'qa5'); rec.schema = 0; await raw.put('saves', rec); raw.close();
    if (SAVE_SCHEMA_VERSION > 0) await expect(loadGame('qa5')).rejects.toThrow(/migration/i);
  });

  it('rolling autosave slot naming does not exceed 3 slots over 1000 hours', async () => {
    const { autosave } = await import('../../src/save');
    const a = mkEngine(L, 'GER', 8);
    const ids = new Set<string>();
    for (const h of [0, 6, 12, 18, 24, 100, 500, 1000]) { const s = a.serialize(); s.clock.minutes = h * 60; ids.add((await autosave(s)).id); }
    expect(ids.size).toBeLessThanOrEqual(3);
  });
});
