import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Modal } from '../components/kit';
import { audio } from '../../audio';
import { SAVE_SLOT_IDS, type SaveApi, type SaveSlotInfo } from '../saveApi';

const fmtWhen = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const AUTO_SLOTS = ['auto-0', 'auto-1', 'auto-2'];
const isAuto = (id: string) => id === 'auto' || /^auto-\d+$/.test(id);
const slotLabel = (id: string) => (id === 'auto' ? 'Autosave' : isAuto(id) ? `Autosave ${Number(id.slice(5)) + 1}` : id === 'quick' ? 'Quicksave' : `Slot ${id.replace(/\D/g, '')}`);

export function SaveLoadDialog({ api, mode: initial = 'load', canSave = true, onClose, onLoaded, defaultName }: {
  api: SaveApi; mode?: 'save' | 'load'; canSave?: boolean; onClose: () => void; onLoaded?: (slot: string) => void; defaultName?: string;
}) {
  const [mode, setMode] = useState<'save' | 'load'>(canSave ? initial : 'load');
  const [slots, setSlots] = useState<SaveSlotInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<{ slot: string; action: 'overwrite' | 'delete' } | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => { try { setSlots(await api.list()); } catch (e) { setMsg({ text: `Could not read saves: ${(e as Error).message}`, err: true }); } }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (slot: string, label: string, fn: () => unknown) => {
    setBusy(slot); setMsg(null);
    try { await fn(); setMsg({ text: label }); await refresh(); return true; } catch (e) { setMsg({ text: `${(e as Error).message || 'Operation failed'}`, err: true }); return false; } finally { setBusy(null); }
  };
  const byId = new Map(slots.map(s => [s.slot, s]));
  // App autosaves rotate through auto-0..auto-2 (src/save); a legacy plain 'auto' slot is listed only if it exists.
  const rows = [...AUTO_SLOTS, ...(byId.has('auto') ? ['auto'] : []), 'quick', ...SAVE_SLOT_IDS].filter(id => (mode === 'save' ? !isAuto(id) : true));

  const doSave = async (slot: string) => { if (await run(slot, `Saved to ${slotLabel(slot)}.`, () => api.save(slot, (names[slot] ?? '').trim() || defaultName || slotLabel(slot)))) audio.cue('save'); };
  const doLoad = async (slot: string) => { if (await run(slot, 'Loaded.', () => api.load(slot))) { audio.cue('load'); onLoaded?.(slot); } };
  const doExport = (slot: string) => run(slot, 'Exported.', async () => {
    const r = await api.exportSave(slot);
    if (r instanceof Blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(r); a.download = `${slot}.tcsave`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  });

  return (
    <Modal title={mode === 'save' ? 'Save game' : 'Load game'} onClose={onClose} wide
      footer={<>
        <input ref={file} type="file" accept=".tcsave,.json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void run('import', 'Imported save file.', () => api.importSave(f)); e.target.value = ''; }} />
        <button type="button" className="btn" onClick={() => file.current?.click()}>Import .tcsave file</button>
        <button type="button" className="btn" onClick={onClose}>Close</button></>}>
      {canSave && <div className="seg" role="tablist" aria-label="Mode">
        <button type="button" className={mode === 'save' ? 'on' : ''} onClick={() => setMode('save')}>Save</button>
        <button type="button" className={mode === 'load' ? 'on' : ''} onClick={() => setMode('load')}>Load</button>
      </div>}
      {msg && <div className={`notice ${msg.err ? 'err' : ''}`} role="status">{msg.text}</div>}
      <ul className="slots">
        {rows.map(id => {
          const s = byId.get(id);
          return (
            <li key={id} className={`slot ${s ? '' : 'empty-slot'} ${s?.corrupt ? 'corrupt' : ''}`}>
              <div className="slot-id">{slotLabel(id)}</div>
              <div className="slot-info">
                {s ? <><b>{s.name}</b><span>{s.summary}</span><time>{fmtWhen(s.savedAt)}{s.sizeBytes ? ` - ${(s.sizeBytes / 1024).toFixed(0)} KB` : ''}{s.corrupt ? ' - damaged' : ''}</time></>
                  : mode === 'save' ? <input placeholder="Name this save" value={names[id] ?? ''} onChange={e => setNames(n => ({ ...n, [id]: e.target.value }))} aria-label={`Name for ${slotLabel(id)}`} maxLength={40} /> : <span className="dim">Empty</span>}
              </div>
              <div className="slot-actions">
                {mode === 'save' && !isAuto(id) && (confirm?.slot === id && confirm.action === 'overwrite'
                  ? <><button type="button" className="btn danger" onClick={() => { setConfirm(null); void doSave(id); }}>Overwrite</button><button type="button" className="btn" onClick={() => setConfirm(null)}>Keep</button></>
                  : <button type="button" className="btn primary" disabled={busy === id} onClick={() => (s ? setConfirm({ slot: id, action: 'overwrite' }) : void doSave(id))}>Save</button>)}
                {mode === 'load' && s && <button type="button" className="btn primary" disabled={busy === id || s.corrupt} onClick={() => void doLoad(id)}>Load</button>}
                {s && <button type="button" className="btn" onClick={() => void doExport(id)} aria-label={`Export ${slotLabel(id)}`}>Export</button>}
                {s && !isAuto(id) && (confirm?.slot === id && confirm.action === 'delete'
                  ? <><button type="button" className="btn danger" onClick={() => { setConfirm(null); void run(id, 'Deleted.', () => api.delete(id)); }}>Delete</button><button type="button" className="btn" onClick={() => setConfirm(null)}>Keep</button></>
                  : <button type="button" className="icon-btn" aria-label={`Delete ${slotLabel(id)}`} onClick={() => setConfirm({ slot: id, action: 'delete' })}><Icon name="x" size={12} /></button>)}
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
