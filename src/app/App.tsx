import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MainMenu, CampaignSelect, NationSelect, BriefingScreen, GameScreen, EndScreen, type SaveApi, type SaveSlotInfo,
} from '../ui';
import { listScenarios, loadScenario, getHistoricalEvents, type LoadedScenario } from '../data';
import { createEngine, restoreEngine } from '../sim';
import { clearHistoricalTemplates, registerHistoricalEventsFromData } from '../events';
import { autosave, deleteSave, exportSave, importSave, listSaves, loadGame, saveGame, type SaveMeta } from '../save';
import type { Engine, GameSettings, NationId } from '../core/types';

type Screen = 'menu' | 'campaign' | 'nation' | 'briefing' | 'game' | 'end';

const toSlot = (m: SaveMeta): SaveSlotInfo => ({ slot: m.id, name: m.name, savedAt: m.savedAt, summary: m.summary });

function registerEvents(campaignId: string, scenarioId?: string) {
  clearHistoricalTemplates();
  try { registerHistoricalEventsFromData(getHistoricalEvents(campaignId, scenarioId)); } catch { /* campaign without events */ }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedScenario | null>(null);
  const [pending, setPending] = useState<{ nation: NationId; settings: GameSettings; seed: number } | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const engineRef = useRef<Engine | null>(null);
  engineRef.current = engine;
  const scenarios = useMemo(() => listScenarios().map(m => ({ ...m, mapSize: m.mapSize ?? 'medium' as const, complexity: (m.complexity ?? 3) as 1 | 2 | 3 | 4 | 5, estimatedPlayMinutes: m.estimatedPlayMinutes ?? [60, 120] as [number, number] })), []);

  const openScenario = useCallback(async (id: string) => {
    setBusy(true); setError(null);
    try { const l = await loadScenario(id); setLoaded(l); setScenarioId(id); return l; }
    catch (e) { setError(String((e as Error).message ?? e)); return null; }
    finally { setBusy(false); }
  }, []);

  const startEngine = useCallback((l: LoadedScenario, p: { nation: NationId; settings: GameSettings; seed: number }) => {
    registerEvents(l.def.campaignId, l.def.id);
    setEngine(createEngine(l.def, l.terrain, l.infra, { playerNation: p.nation, settings: p.settings, seed: p.seed }));
    setScreen('briefing');
  }, []);

  const loadSlot = useCallback(async (slot: string) => {
    setBusy(true); setError(null);
    try {
      const state = await loadGame(slot);
      const l = await loadScenario(state.scenarioId);
      registerEvents(l.def.campaignId, l.def.id);
      setLoaded(l); setScenarioId(state.scenarioId);
      setEngine(restoreEngine(state, l.def, l.terrain, l.infra));
      setScreen('game');
    } catch (e) { setError(`Could not load save: ${(e as Error).message}`); }
    finally { setBusy(false); }
  }, []);

  const saveApi: SaveApi = useMemo(() => ({
    async list() { return (await listSaves()).map(toSlot); },
    async save(slot, name) { const e = engineRef.current; if (!e) throw new Error('No campaign running'); await saveGame(slot, name, e.serialize()); },
    async load(slot) { await loadSlot(slot); },
    async delete(slot) { await deleteSave(slot); },
    async exportSave(slot) { return exportSave(slot); },
    async importSave(file) { return toSlot(await importSave(file)); },
  }), [loadSlot]);

  // Autosave: every 6 sim-hours while a campaign is live, and on tab hide/close.
  useEffect(() => {
    if (!engine || screen !== 'game') return;
    let last = engine.getState().clock.minutes;
    const unsub = engine.subscribe(s => {
      if (s.clock.minutes - last >= 360) { last = s.clock.minutes; void autosave(engine.serialize()).catch(() => {}); }
    });
    const flush = () => { if (document.visibilityState === 'hidden') void autosave(engine.serialize()).catch(() => {}); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => { unsub(); document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); };
  }, [engine, screen]);

  const continueLatest = useCallback(async () => {
    const all = await listSaves(); if (all[0]) await loadSlot(all[0].id);
  }, [loadSlot]);

  const exitToMenu = useCallback(() => {
    const e = engineRef.current; if (e) { e.setSpeed(0); void autosave(e.serialize()).catch(() => {}); }
    setEngine(null); setScreen('menu');
  }, []);

  return (
    <>
      {error && <div role="alert" style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#5a1d1d', color: '#fff', padding: '8px 16px', borderRadius: 4 }} onClick={() => setError(null)}>{error}</div>}
      {busy && <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'grid', placeItems: 'center', background: '#000a', color: '#cfd8c8', fontFamily: 'monospace' }}>Loading theatre data…</div>}
      {screen === 'menu' && <MainMenu onNewCampaign={() => setScreen('campaign')} onContinue={() => void continueLatest()} saveApi={saveApi} onLoaded={slot => void loadSlot(slot)} />}
      {screen === 'campaign' && <CampaignSelect scenarios={scenarios} onBack={() => setScreen('menu')} onSelect={async id => { if (await openScenario(id)) setScreen('nation'); }} />}
      {screen === 'nation' && loaded && scenarioId && <NationSelect scenario={loaded.def} onBack={() => setScreen('campaign')} onStart={(nation, settings, seed) => { const p = { nation, settings, seed }; setPending(p); startEngine(loaded, p); }} />}
      {screen === 'briefing' && loaded && pending && <BriefingScreen scenario={loaded.def} nation={pending.nation} onBack={() => setScreen('nation')} onBegin={() => setScreen('game')} />}
      {screen === 'game' && loaded && engine && <GameScreen key={engine.getState().seed + ':' + engine.getState().scenarioId} engine={engine} scenario={loaded.def} saveApi={saveApi} onExit={exitToMenu} onCampaignEnd={() => setScreen('end')} onLoaded={slot => void loadSlot(slot)} />}
      {screen === 'end' && loaded && engine && <EndScreen state={engine.getState()} scenario={loaded.def} onMainMenu={exitToMenu} onReplay={() => { if (pending) startEngine(loaded, { ...pending, seed: Math.floor(Math.random() * 1e9) }); }} />}
    </>
  );
}
