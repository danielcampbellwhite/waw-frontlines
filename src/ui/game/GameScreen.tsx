import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Engine, LonLat, ScenarioDefinition } from '../../core/types';
import { useStore } from '../store';
import { Icon, Modal, Tip, TooltipLayer } from '../components/kit';
import type { SaveApi } from '../saveApi';
import { RealTacticalMap, type MapView } from '../mapAdapter';
import PlaceholderMap from './PlaceholderMap';
import { GameContext, createActions, createGameStore, useGame, type GameCtx } from './gameStore';
import { TopBar } from './TopBar';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { BottomPanel } from './BottomPanel';
import { ContextMenu, EventModal, HelpModal, ObjectivesPanel, OpsPlanner, Toasts, useToastFeed } from './Overlays';
import { SaveLoadDialog } from '../screens/SaveLoad';
import { SettingsPanel } from '../screens/Settings';
import { useUiSettings, eventKey, type KeyAction } from '../settings';
import { orderMeta, ORDER_META, shortTitle } from '../format';
import { audio, useAudioBridge, useAudioSetup } from '../../audio';
import { useEngineState } from '../hooks/useEngineState';
import '../ui.css';

export interface GameScreenProps {
  engine: Engine;
  scenario: ScenarioDefinition;
  saveApi?: SaveApi;
  /** Return to the main menu (the shell decides whether to confirm / autosave). */
  onExit?: () => void;
  /** Called once when the engine reports a CampaignResult; shell shows the EndScreen. */
  onCampaignEnd?: () => void;
  /** Set false if the shell already drives engine.advance() each frame. Default true. */
  driveEngine?: boolean;
  /** Called after a save slot has been loaded through the dialog (shell swaps the engine). */
  onLoaded?: (slot: string) => void;
}

export function GameScreen({ engine, scenario, saveApi, onExit, onCampaignEnd, driveEngine = true, onLoaded }: GameScreenProps) {
  const store = useMemo(() => createGameStore(), [engine]); // eslint-disable-line react-hooks/exhaustive-deps
  const actions = useMemo(() => createActions(engine, scenario, store), [engine, scenario, store]);
  const ctx: GameCtx = useMemo(() => ({ engine, scenario, store, actions, saveApi, onExit }), [engine, scenario, store, actions, saveApi, onExit]);
  return (
    <GameContext.Provider value={ctx}>
      <GameInner driveEngine={driveEngine} onCampaignEnd={onCampaignEnd} onLoaded={onLoaded} />
    </GameContext.Provider>
  );
}

function GameInner({ driveEngine, onCampaignEnd, onLoaded }: { driveEngine: boolean; onCampaignEnd?: () => void; onLoaded?: (slot: string) => void }) {
  const { engine, store, actions, saveApi, onExit, scenario } = useGame();
  useAudioSetup();
  useToastFeed();
  useKeyboard();

  // engine clock
  useEffect(() => {
    if (!driveEngine) return;
    let raf = 0, last = performance.now();
    const loop = (t: number) => { const dt = Math.min(250, t - last); last = t; if (engine.getState().clock.speed > 0 && !engine.getState().result) engine.advance(dt); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, driveEngine]);

  // audio mixer feed
  const viewRef = useRef<MapView | null>(null);
  const getView = useCallback(() => viewRef.current, []);
  useAudioBridge(engine, getView);

  const ui = useStore(store, s => ({ left: s.leftOpen, right: s.rightOpen, modal: s.modal, saveMode: s.saveMode, tgt: s.targeting, sel: s.selection, ov: s.overlays, focus: s.focus }));
  const over = useEngineState(engine, s => s.result ?? null, Object.is);
  const sideRef = useRef(engine.getState().playerSide);
  sideRef.current = engine.getState().playerSide;
  const targetCount = ui.tgt?.points.length ?? 0;
  const overlays = useMemo(() => ({ ...ui.ov, targetPreview: ui.tgt?.points }), [ui.ov, ui.tgt?.points]);
  const closeModal = () => store.set({ modal: null });

  // Save/load and the game menu pause the sim and restore the previous speed when they close.
  const pausedForModal = useRef(false);
  useEffect(() => {
    const pausing = ui.modal === 'save' || ui.modal === 'menu';
    const c = engine.getState().clock;
    if (pausing && !pausedForModal.current && c.speed !== 0) { pausedForModal.current = true; store.set({ lastSpeed: c.speed as 1 | 2 | 4 | 8 }); engine.setSpeed(0); }
    else if (!pausing && pausedForModal.current) { pausedForModal.current = false; if (!store.get().pausedByEvent && c.speed === 0) engine.setSpeed(store.get().lastSpeed); }
  }, [ui.modal, engine, store]);

  const mapProps = {
    engine, selection: ui.sel, targeting: !!ui.tgt, focusRequest: ui.focus, overlays,
    onSelect: actions.mapSelect, onMapClick: (pos: LonLat, button?: number) => actions.mapClick(pos, button), onContextOrder: actions.contextAt,
    onViewChange: (v: MapView) => { viewRef.current = v; store.set({ view: v }); },
  };
  const Map = RealTacticalMap ?? PlaceholderMap;
  const meta = ui.tgt ? orderMeta(ui.tgt.kind) : null;

  return (
    <div className="game" data-targeting={ui.tgt ? 'on' : 'off'}>
      <TopBar />
      <div className="game-main">
        {ui.left && <LeftPanel />}
        <div className="game-center">
          <div className="map-wrap">
            <Map {...mapProps} />
            <div className="map-tools" role="toolbar" aria-label="Map layers and panels">
              <Tip text={ui.left ? 'Hide order of battle' : 'Show order of battle'} pos="bottom"><button type="button" className={`tool-btn ${ui.left ? 'on' : ''}`} aria-pressed={ui.left} aria-label="Toggle order of battle" onClick={() => store.set({ leftOpen: !ui.left })}><Icon name="oob" /></button></Tip>
              {(['routes', 'supply', 'battles', 'fog'] as const).map(k => (
                <Tip key={k} text={`${ui.ov[k] ? 'Hide' : 'Show'} ${k === 'fog' ? 'fog of war' : k === 'routes' ? 'movement routes' : k === 'supply' ? 'supply network' : 'battle markers'}`} pos="bottom">
                  <button type="button" className={`chip-btn ${ui.ov[k] ? 'on' : ''}`} aria-pressed={ui.ov[k]} onClick={() => store.set(s => ({ overlays: { ...s.overlays, [k]: !s.overlays[k] } }))}>{k === 'fog' ? 'Fog' : k[0].toUpperCase() + k.slice(1)}</button>
                </Tip>
              ))}
              <Tip text={ui.right ? 'Hide unit panel' : 'Show unit panel'} pos="bottom"><button type="button" className={`tool-btn ${ui.right ? 'on' : ''}`} aria-pressed={ui.right} aria-label="Toggle unit panel" onClick={() => store.set({ rightOpen: !ui.right })}><Icon name="menu" /></button></Tip>
            </div>
            {meta && ui.tgt && (
              <div className="target-banner" role="status">
                <b>{meta.label}</b>
                <span>{meta.need === 'line' ? `Click points for the line (${targetCount} placed). Enter or double-click to finish.` : meta.need === 'unit' ? 'Click the target unit on the map.' : meta.need === 'location' ? 'Click a town, port or depot.' : 'Click the destination on the map.'}</span>
                {meta.need === 'line' && <button type="button" className="mini-btn" onClick={actions.finishLine}>Finish line</button>}
                <button type="button" className="mini-btn" onClick={actions.cancelTargeting}>Cancel (Esc)</button>
              </div>
            )}
            <Toasts />
            {over && <div className="end-banner"><span>The campaign has ended.</span>{onCampaignEnd && <button type="button" className="btn primary" onClick={onCampaignEnd}>View results</button>}</div>}
          </div>
          <BottomPanel />
        </div>
        {ui.right && <RightPanel />}
      </div>

      <TooltipLayer />
      <ContextMenu />
      <EventModal />
      {ui.modal === 'objectives' && <ObjectivesPanel onClose={closeModal} />}
      {ui.modal === 'ops' && <OpsPlanner onClose={closeModal} />}
      {ui.modal === 'help' && <HelpModal onClose={closeModal} />}
      {ui.modal === 'settings' && <SettingsPanel onClose={closeModal} />}
      {ui.modal === 'save' && saveApi && <SaveLoadDialog api={saveApi} mode={ui.saveMode} canSave={!over} defaultName={shortTitle(scenario.title)} onClose={closeModal} onLoaded={s => { closeModal(); onLoaded?.(s); }} />}
      {ui.modal === 'save' && !saveApi && <Modal title="Save / load" onClose={closeModal}><p className="empty">Saving is not available in this build.</p></Modal>}
      {ui.modal === 'menu' && (
        <Modal title="Game menu" onClose={closeModal}>
          <div className="menu-list">
            <button type="button" className="btn primary" onClick={closeModal}>Resume</button>
            <button type="button" className="btn" onClick={() => store.set({ modal: 'save', saveMode: 'save' })}>Save game</button>
            <button type="button" className="btn" onClick={() => store.set({ modal: 'save', saveMode: 'load' })}>Load game</button>
            <button type="button" className="btn" onClick={() => store.set({ modal: 'objectives' })}>Objectives</button>
            <button type="button" className="btn" onClick={() => store.set({ modal: 'settings' })}>Settings</button>
            <button type="button" className="btn" onClick={() => store.set({ modal: 'help' })}>Controls</button>
            {onExit && <button type="button" className="btn danger" onClick={() => { closeModal(); onExit(); }}>Quit to main menu</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}


function useKeyboard() {
  const { engine, store, actions, saveApi, scenario } = useGame();
  const ui = useUiSettings();
  const kb = ui.keybinds;
  useEffect(() => {
    const byKey = new Map<string, KeyAction>();
    (Object.keys(kb) as KeyAction[]).forEach(a => byKey.set(kb[a], a));
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const st = store.get();
      if (e.key === 'Escape') {
        if (st.targeting) { actions.cancelTargeting(); e.preventDefault(); return; }
        if (st.ctxMenu) { store.set({ ctxMenu: null }); return; }
        if (st.modal) { store.set({ modal: null }); return; }
        if (typing) return;
        if (st.selection.length) { store.set({ selection: [] }); return; }
        store.set({ modal: 'menu' }); return;
      }
      if (e.key === 'Enter' && st.targeting?.kind === 'defensive_line' && !typing) { actions.finishLine(); return; }
      if (typing) return;
      const action = byKey.get(eventKey(e));
      if (!action) return;
      if (e.repeat && action !== 'cancelOrders') return;
      const fkey = /^F\d+$/.test(e.key);
      if (st.modal && !fkey) return;
      e.preventDefault();
      switch (action) {
        case 'pause': actions.togglePause(); break;
        case 'speed1': actions.setSpeed(1); break; case 'speed2': actions.setSpeed(2); break;
        case 'speed3': actions.setSpeed(4); break; case 'speed4': actions.setSpeed(8); break;
        case 'cancelOrders': actions.cancelOrders(st.selection); break;
        case 'selectAll': actions.select(actions.ownUnits().map(u => u.id)); break;
        case 'panelHelp': store.set({ modal: st.modal === 'help' ? null : 'help' }); break;
        case 'panelObjectives': store.set({ modal: st.modal === 'objectives' ? null : 'objectives' }); break;
        case 'panelOps': store.set({ modal: st.modal === 'ops' ? null : 'ops' }); break;
        case 'panelOob': store.set({ leftOpen: !st.leftOpen }); break;
        case 'panelSave': store.set({ modal: st.modal === 'save' ? null : 'save', saveMode: 'save' }); break;
        case 'tabNotifications': store.set({ bottomOpen: true, bottomTab: 'notifications' }); break;
        case 'tabReports': store.set({ bottomOpen: true, bottomTab: 'reports' }); break;
        case 'quickSave':
          if (!saveApi) { actions.toast('Saving is not available.', 'warn'); break; }
          Promise.resolve(saveApi.save('quick', `Quicksave - ${shortTitle(scenario.title)}`)).then(() => { actions.toast('Quicksaved.', 'ok'); audio.cue('save'); }, (err: Error) => actions.toast(`Quicksave failed: ${err.message}`, 'critical'));
          break;
        default: {
          const kind = ORDER_META.find(m => m.actionKey === action)?.kind;
          if (kind) actions.startOrder(kind);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const onDbl = () => { if (store.get().targeting?.kind === 'defensive_line') actions.finishLine(); };
    window.addEventListener('dblclick', onDbl);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('dblclick', onDbl); };
  }, [kb, engine, store, actions, saveApi, scenario]);
}
