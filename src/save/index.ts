import { openDB, type IDBPDatabase } from 'idb';
import { SAVE_SCHEMA_VERSION, type GameState } from '../core/types';

export interface SaveMeta { id: string; name: string; savedAt: number; scenarioId: string; playerNation: string; simMinutes: number; summary: string; auto: boolean; schema: number; checksum: string }
export interface SaveRecord extends SaveMeta { state: GameState }

const DB = 'theatre-command';
let dbp: Promise<IDBPDatabase> | null = null;
const db = () => (dbp ??= openDB(DB, 1, { upgrade(d) { d.createObjectStore('saves', { keyPath: 'id' }); } }));

/** FNV-1a 32-bit over the JSON text — integrity check, not security. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

type Migration = (s: any) => any;
/** migrations[n] upgrades schema n -> n+1. */
export const migrations: Record<number, Migration> = {};
export function migrate(state: any, from: number): GameState {
  let s = state;
  for (let v = from; v < SAVE_SCHEMA_VERSION; v++) {
    const m = migrations[v];
    if (!m) throw new Error(`No migration from save schema ${v}`);
    s = m(s); s.schema = v + 1;
  }
  return s as GameState;
}

export function summarise(s: GameState): string {
  const mine = Object.values(s.units).filter(u => u.side === s.playerSide && !u.destroyed).length;
  return `${s.playerNation} · ${mine} formations · ${s.objectives.filter(o => o.status === 'achieved').length}/${s.objectives.length} objectives`;
}

export async function saveGame(id: string, name: string, state: GameState, auto = false): Promise<SaveMeta> {
  const json = JSON.stringify(state);
  const rec: SaveRecord = { id, name, savedAt: Date.now(), scenarioId: state.scenarioId, playerNation: state.playerNation,
    simMinutes: state.clock.minutes, summary: summarise(state), auto, schema: state.schema, checksum: checksum(json), state: JSON.parse(json) };
  await (await db()).put('saves', rec);
  const { state: _s, ...meta } = rec; return meta;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = (await (await db()).getAll('saves')) as SaveRecord[];
  return all.map(({ state: _s, ...m }) => m).sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadGame(id: string): Promise<GameState> {
  const rec = (await (await db()).get('saves', id)) as SaveRecord | undefined;
  if (!rec) throw new Error('Save not found');
  if (checksum(JSON.stringify(rec.state)) !== rec.checksum) throw new Error('Save failed integrity check (corrupt)');
  return rec.schema < SAVE_SCHEMA_VERSION ? migrate(rec.state, rec.schema) : rec.state;
}

export async function deleteSave(id: string) { await (await db()).delete('saves', id); }

export async function exportSave(id: string): Promise<Blob> {
  const rec = await (await db()).get('saves', id);
  if (!rec) throw new Error('Save not found');
  return new Blob([JSON.stringify({ format: 'tcsave', version: 1, record: rec })], { type: 'application/json' });
}

export async function importSave(file: File): Promise<SaveMeta> {
  const j = JSON.parse(await file.text());
  if (j?.format !== 'tcsave' || !j.record?.state) throw new Error('Not a World at War: Frontlines save file');
  const rec = j.record as SaveRecord;
  if (checksum(JSON.stringify(rec.state)) !== rec.checksum) throw new Error('Imported save failed integrity check');
  rec.id = `import-${Date.now()}`; rec.name = `${rec.name} (imported)`;
  await (await db()).put('saves', rec);
  const { state: _s, ...meta } = rec; return meta;
}

/** Autosave rotation: 3 rolling slots. */
export async function autosave(state: GameState) {
  const slot = `auto-${Math.floor(state.clock.minutes / 60 / 6) % 3}`;
  return saveGame(slot, `Autosave ${slot.slice(-1)}`, state, true);
}
