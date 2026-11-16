import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { BriefingScreen, CampaignSelect, EndScreen, GameScreen, MainMenu, NationSelect, type SaveApi, type SaveSlotInfo, type ScenarioMetaLike } from '../index';
import { createMockEngine, mockScenario } from './mockEngine';

const slots = new Map<string, SaveSlotInfo>([['slot-1', { slot: 'slot-1', name: 'Before the Meuse', savedAt: Date.now() - 86400000, summary: 'Fall of France - 12 May 1940 - Germany', sizeBytes: 482000 }]]);
const saveApi: SaveApi = {
  list: () => [...slots.values()],
  save: (slot, name) => { slots.set(slot, { slot, name, savedAt: Date.now(), summary: 'Fall of France (mock)', sizeBytes: 300000 }); },
  load: slot => { if (!slots.has(slot)) throw new Error('empty slot'); },
  delete: slot => { slots.delete(slot); }, exportSave: () => new Blob(['{}']), importSave: () => undefined,
};
const metas: ScenarioMetaLike[] = [
  { id: 'mock.short', campaignId: 'fof', title: 'Fall of France - Short', campaignTitle: 'Fall of France', scale: 'short', startDate: '1940-05-10T00:00:00Z', endDate: '1940-05-25T00:00:00Z', estimatedPlayMinutes: [60, 90], mapSize: 'small', complexity: 2, blurb: 'The German breakthrough at the Meuse and the race to the Channel.' },
  { id: 'mock.standard', campaignId: 'fof', title: 'Fall of France - Standard', campaignTitle: 'Fall of France', scale: 'standard', startDate: '1940-05-10T00:00:00Z', endDate: '1940-06-25T00:00:00Z', estimatedPlayMinutes: [180, 300], mapSize: 'medium', complexity: 3, blurb: 'The German breakthrough at the Meuse and the race to the Channel.' },
  { id: 'bob.standard', campaignId: 'bob', title: 'Battle of Britain - Standard', campaignTitle: 'Battle of Britain', scale: 'standard', startDate: '1940-07-10T00:00:00Z', endDate: '1940-10-31T00:00:00Z', estimatedPlayMinutes: [240, 420], mapSize: 'medium', complexity: 4, status: 'planned', blurb: 'Fighter Command against the Luftwaffe over southern England.' },
  { id: 'bar.grand', campaignId: 'bar', title: 'Barbarossa - Grand', campaignTitle: 'Operation Barbarossa', scale: 'grand', startDate: '1941-06-22T00:00:00Z', endDate: '1941-12-05T00:00:00Z', estimatedPlayMinutes: [600, 1200], mapSize: 'large', complexity: 5, status: 'planned' },
];

type Step = 'menu' | 'campaign' | 'nation' | 'briefing' | 'game' | 'end';
function Dev() {
  const params = new URLSearchParams(location.search);
  const [step, setStep] = useState<Step>((params.get('step') as Step) || 'menu');
  const [nation, setNation] = useState<'GER' | 'FRA'>('GER');
  const scn = useMemo(() => mockScenario(), []);
  const [run, setRun] = useState(() => createMockEngine());
  const start = (n: 'GER' | 'FRA') => { setNation(n); setRun(createMockEngine(n)); };
  if (step === 'menu') return <MainMenu onNewCampaign={() => setStep('campaign')} onContinue={() => setStep('game')} saveApi={saveApi} onLoaded={() => setStep('game')} />;
  if (step === 'campaign') return <CampaignSelect scenarios={metas} onSelect={() => setStep('nation')} onBack={() => setStep('menu')} />;
  if (step === 'nation') return <NationSelect scenario={scn} onBack={() => setStep('campaign')} onStart={n => { start(n as 'GER' | 'FRA'); setStep('briefing'); }} />;
  if (step === 'briefing') return <BriefingScreen scenario={scn} nation={nation} onBegin={() => setStep('game')} onBack={() => setStep('nation')} />;
  if (step === 'end') { const st = run.engine.serialize(); st.result = { ending: 'strategic_victory', score: 12840, endedAt: st.clock.minutes, summary: 'The Meuse line was broken and the Channel coast reached.' }; return <EndScreen state={st} scenario={run.scenario} onMainMenu={() => setStep('menu')} />; }
  return <GameScreen engine={run.engine} scenario={run.scenario} saveApi={saveApi} onExit={() => setStep('menu')} onCampaignEnd={() => setStep('end')} />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Dev /></StrictMode>);
