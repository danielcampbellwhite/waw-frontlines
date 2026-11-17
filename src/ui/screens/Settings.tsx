import { useEffect, useState } from 'react';
import { Modal, Segmented, Slider, Toggle } from '../components/kit';
import { FIXED_CONTROLS } from '../tutorial/steps';
import { KEY_ACTIONS, DEFAULT_KEYBINDS, DIFFICULTIES, eventKey, keyLabel, settingsStore, useUiSettings, type KeyAction } from '../settings';
import { audio } from '../../audio';
import { Credits } from './Credits';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useUiSettings();
  const [tab, setTab] = useState<'audio' | 'interface' | 'game' | 'keys'>('audio');
  const [rebind, setRebind] = useState<KeyAction | null>(null);
  const [credits, setCredits] = useState(false);
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  useEffect(() => {
    if (!rebind) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') { setRebind(null); return; }
      const k = eventKey(e);
      const clash = (Object.keys(s.keybinds) as KeyAction[]).find(a => a !== rebind && s.keybinds[a] === k);
      settingsStore.set({ keybinds: { ...s.keybinds, ...(clash ? { [clash]: s.keybinds[rebind] } : {}), [rebind]: k } });
      setRebind(null);
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [rebind, s.keybinds]);

  return (
    <>
    <Modal title="Settings" onClose={onClose} wide footer={<><button type="button" className="btn" onClick={() => settingsStore.reset()}>Restore defaults</button><button type="button" className="btn primary" onClick={onClose}>Done</button></>}>
      <Segmented value={tab} onChange={setTab} label="Settings section" options={[{ id: 'audio', label: 'Audio' }, { id: 'interface', label: 'Interface' }, { id: 'game', label: 'Game' }, { id: 'keys', label: 'Keyboard shortcuts' }]} />
      {tab === 'audio' && (
        <div className="settings-pane">
          <Toggle checked={s.muted} onChange={v => settingsStore.set({ muted: v })} label="Mute all audio" />
          <Slider label="Master" value={s.master} min={0} max={1} step={0.01} format={pct} onChange={v => settingsStore.set({ master: v })} />
          <Slider label="Music" value={s.music} min={0} max={1} step={0.01} format={pct} onChange={v => settingsStore.set({ music: v })} />
          <Slider label="Effects" value={s.sfx} min={0} max={1} step={0.01} format={pct} onChange={v => settingsStore.set({ sfx: v })} hint="Gunfire, artillery, engines, aircraft and interface sounds" />
          <Slider label="Ambience" value={s.ambience} min={0} max={1} step={0.01} format={pct} onChange={v => settingsStore.set({ ambience: v })} hint="Wind, weather and radio chatter" />
          <button type="button" className="btn" onClick={() => { audio.unlock(); audio.sfx('confirm'); }}>Test sound</button>
          <p className="hint">Sound effects are CC0 or public-domain recordings; music is generated live. Unit photographs come from licence-checked Wikimedia Commons sources. <button type="button" className="link-btn" onClick={() => setCredits(true)}>See Credits</button>. Levels are remembered on this device.</p>
        </div>
      )}
      {tab === 'interface' && (
        <div className="settings-pane">
          <Slider label="Interface scale" value={s.uiScale} min={0.8} max={1.4} step={0.05} format={v => `${Math.round(v * 100)}%`} onChange={v => settingsStore.set({ uiScale: v })} hint="Scales text and panels. Useful on 4K or small laptop screens." />
        </div>
      )}
      {tab === 'game' && (
        <div className="settings-pane">
          <div className="field-block"><span className="lbl">Default difficulty</span>
            <Segmented label="Default difficulty" value={s.defaultDifficulty} onChange={v => settingsStore.set({ defaultDifficulty: v })} options={DIFFICULTIES.map(d => ({ id: d, label: d[0].toUpperCase() + d.slice(1) }))} /></div>
          <p className="hint">Preselected when you start a new campaign. You can still change it for each campaign on the nation screen.</p>
        </div>
      )}
      {tab === 'keys' && (
        <div className="settings-pane">
          <ul className="keybinds">
            {KEY_ACTIONS.map(a => (
              <li key={a.action}><span>{a.label}</span>
                <button type="button" className={`keycap ${rebind === a.action ? 'listening' : ''}`} onClick={() => setRebind(rebind === a.action ? null : a.action)} aria-label={`Rebind ${a.label}`}>
                  {rebind === a.action ? 'Press a key' : keyLabel(s.keybinds[a.action])}</button>
                {s.keybinds[a.action] !== DEFAULT_KEYBINDS[a.action] && <button type="button" className="mini-btn" onClick={() => settingsStore.set({ keybinds: { ...s.keybinds, [a.action]: DEFAULT_KEYBINDS[a.action] } })}>Reset</button>}
              </li>
            ))}
          </ul>
          <h4>Fixed controls</h4>
          <ul className="keybinds fixed">{FIXED_CONTROLS.map(c => <li key={c.keys + c.label}><span>{c.label}</span><kbd className="keycap">{c.keys}</kbd></li>)}</ul>
          <p className="hint">Click a key to rebind it. Assigning a key that is already used swaps the two bindings.</p>
        </div>
      )}
    </Modal>
    {credits && <Credits onClose={() => setCredits(false)} />}
    </>
  );
}
