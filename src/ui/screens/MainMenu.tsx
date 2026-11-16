import { useState } from 'react';
import { TooltipLayer } from '../components/kit';
import { SettingsPanel } from './Settings';
import { SaveLoadDialog } from './SaveLoad';
import type { SaveApi } from '../saveApi';
import '../ui.css';
import { useAudioSetup, audio } from '../../audio';
import { Credits } from './Credits';

export interface MainMenuProps {
  onNewCampaign: () => void;
  /** Resume the most recent save (shell decides which). Hidden when undefined. */
  onContinue?: () => void;
  saveApi?: SaveApi;
  /** Called after a slot was loaded via the Load dialog. */
  onLoaded?: (slot: string) => void;
  version?: string;
}

/** Staff-map backdrop: graticule, front line, and campaign arrows that draw in once on load. */
export function StaffMapBackdrop() {
  return (
    <svg className="staffmap" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="grat" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#1d2a24" strokeWidth="1" /></pattern>
        <marker id="ah-ax" markerUnits="userSpaceOnUse" markerWidth="34" markerHeight="34" refX="6" refY="17" orient="auto"><path d="M0 0L34 17L0 34z" fill="#c0705a" /></marker>
        <marker id="ah-al" markerUnits="userSpaceOnUse" markerWidth="34" markerHeight="34" refX="6" refY="17" orient="auto"><path d="M0 0L34 17L0 34z" fill="#6c9bc4" /></marker>
        <radialGradient id="vig" cx="55%" cy="45%" r="75%"><stop offset="0.35" stopColor="#0b0f0e" stopOpacity="0" /><stop offset="1" stopColor="#0b0f0e" stopOpacity="0.92" /></radialGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#grat)" />
      <path className="coast" d="M-20 520 C 90 500 170 560 260 540 S 380 430 470 450 S 560 560 640 520 S 720 380 800 400 S 930 470 1000 430 S 1120 330 1230 350 L1230 820 L-20 820Z" />
      <path className="coast-line" d="M-20 520 C 90 500 170 560 260 540 S 380 430 470 450 S 560 560 640 520 S 720 380 800 400 S 930 470 1000 430 S 1120 330 1230 350" />
      <path className="river" d="M560 810 C 590 700 520 640 560 560 S 640 470 610 380 S 650 260 700 200" />
      <path className="front" d="M300 120 C 330 220 290 300 350 380 S 420 520 380 620 S 340 720 360 800" />
      <path className="arrow ax a1" d="M130 180 C 260 190 360 250 470 300 S 620 340 760 330" markerEnd="url(#ah-ax)" />
      <path className="arrow ax a2" d="M140 380 C 270 400 390 440 520 470 S 700 560 850 620" markerEnd="url(#ah-ax)" />
      <path className="arrow al a3" d="M1120 150 C 990 190 900 250 800 270 S 640 240 560 190" markerEnd="url(#ah-al)" />
      <path className="arrow al a4" d="M1130 420 C 1010 400 930 360 840 380 S 700 450 640 520" markerEnd="url(#ah-al)" />
      {[[760, 330, 'ax'], [850, 620, 'ax'], [560, 190, 'al'], [640, 520, 'al'], [350, 380, 'ax'], [980, 300, 'al']].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y})`} className={`sym ${s}`}>
          {s === 'al' ? <rect x="-17" y="-12" width="34" height="24" /> : <path d="M0 -14L20 0L0 14L-20 0Z" />}
          <path d={i % 2 ? 'M-9 -6L9 6M9 -6L-9 6' : 'M-8 0H8'} />
        </g>
      ))}
      <rect width="1200" height="800" fill="url(#vig)" />
    </svg>
  );
}

export function MainMenu({ onNewCampaign, onContinue, saveApi, onLoaded, version = 'v0.1' }: MainMenuProps) {
  const [dlg, setDlg] = useState<null | 'load' | 'settings' | 'credits'>(null);
  useAudioSetup();
  const click = (fn: () => void) => () => { audio.unlock(); audio.sfx('click'); fn(); };
  return (
    <div className="screen menu-screen">
      <StaffMapBackdrop />
      <main className="menu-main">
        <div className="menu-title">
          <div className="menu-sub">World War II grand strategy</div>
          <h1>World at War<br />Frontlines</h1>
          <p className="menu-tag">Command armies across the great campaigns of 1939 to 1945. Move, supply and fight in real time on the real map.</p>
        </div>
        <nav className="menu-list" aria-label="Main menu">
          <button type="button" className="menu-btn primary" onClick={click(onNewCampaign)}><span>New campaign</span><small>Choose a theatre, side and scale</small></button>
          {onContinue && <button type="button" className="menu-btn" onClick={click(onContinue)}><span>Continue</span><small>Resume your latest save</small></button>}
          <button type="button" className="menu-btn" onClick={click(() => setDlg('load'))} disabled={!saveApi}><span>Load game</span><small>Saved slots and imported files</small></button>
          <button type="button" className="menu-btn" onClick={click(() => setDlg('settings'))}><span>Settings</span><small>Sound, interface and keys</small></button>
          <button type="button" className="menu-btn" onClick={click(() => setDlg('credits'))}><span>Credits</span><small>Sources and licences</small></button>
        </nav>
      </main>
      <TooltipLayer />
      <footer className="menu-foot">{version}</footer>
      {dlg === 'load' && saveApi && <SaveLoadDialog api={saveApi} mode="load" canSave={false} onClose={() => setDlg(null)} onLoaded={s => { setDlg(null); onLoaded?.(s); }} />}
      {dlg === 'settings' && <SettingsPanel onClose={() => setDlg(null)} />}
      {dlg === 'credits' && <Credits onClose={() => setDlg(null)} />}
    </div>
  );
}

export { Credits };
