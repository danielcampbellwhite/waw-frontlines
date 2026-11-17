import { useMemo, useState } from 'react';
import { TooltipLayer } from '../components/kit';
import type { Difficulty, GameSettings, NationId, Objective, ScenarioDefinition, SideId } from '../../core/types';
import { NationChip, Pips, Segmented, Slider, Toggle } from '../components/kit';
import { NATION_NAMES, UNIT_TYPE_LABEL, fmtInt, fmtIsoDay, shortTitle, sideColor } from '../format';
import { settingsStore } from '../settings';
import '../ui.css';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  difficulty: 'normal', aiAggression: 0.5, fogOfWar: true, historicalDeployment: true, randomEvents: true,
  logisticsDifficulty: 1, reinforcementAvailability: 1, historicalEventFrequency: 1,
};

export interface NationSelectProps {
  scenario: ScenarioDefinition;
  onStart: (nation: NationId, settings: GameSettings, seed: number) => void;
  onBack: () => void;
  initialSettings?: GameSettings;
}

export function forcesOf(scn: ScenarioDefinition, nation: NationId) {
  const side = scn.nations.find(n => n.id === nation)?.side;
  const mine = scn.units.filter(u => u.nation === nation);
  const byType = new Map<string, number>();
  mine.forEach(u => byType.set(u.type, (byType.get(u.type) ?? 0) + 1));
  return { units: mine.length, men: mine.reduce((a, u) => a + u.manpower, 0), byType: [...byType.entries()].sort((a, b) => b[1] - a[1]), side: side ?? 'neutral' as SideId, reinf: scn.reinforcements.filter(r => r.unit.nation === nation).length };
}

const DIFF: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'easy', label: 'Easy', hint: 'Forgiving supply and weaker enemy. Good for learning.' },
  { id: 'normal', label: 'Normal', hint: 'The intended challenge.' },
  { id: 'hard', label: 'Hard', hint: 'Sharper enemy, scarcer resources.' },
  { id: 'veteran', label: 'Veteran', hint: 'Unforgiving. The enemy plans and exploits mistakes.' },
];

export function NationSelect({ scenario, onStart, onBack, initialSettings }: NationSelectProps) {
  const [nation, setNation] = useState<NationId>(scenario.playableNations[0]?.nation as NationId);
  const [settings, setSettings] = useState<GameSettings>(initialSettings ?? { ...DEFAULT_GAME_SETTINGS, difficulty: settingsStore.get().defaultDifficulty });
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setSettings(s => ({ ...s, [k]: v }));
  const pn = scenario.playableNations.find(p => p.nation === nation);
  const forces = useMemo(() => forcesOf(scenario, nation), [scenario, nation]);
  const objs: Objective[] = useMemo(() => (pn?.objectiveIds ?? []).map(id => scenario.objectives.find(o => o.id === id)).filter((o): o is Objective => !!o), [pn, scenario]);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const level = (v: number) => (v < 0.7 ? 'Strained' : v < 1.3 ? 'Standard' : 'Generous');

  return (
    <div className="screen select-screen">
      <header className="screen-head">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <div><div className="kicker">{shortTitle(scenario.title)} - {fmtIsoDay(scenario.startDate)}</div><h1>Choose your command</h1></div>
        <button type="button" className="btn primary big" disabled={!pn} onClick={() => onStart(nation, settings, seed)}>Proceed to briefing</button>
      </header>
      <TooltipLayer />
      <div className="nation-layout">
        <ul className="nation-list" role="radiogroup" aria-label="Playable nations">
          {scenario.playableNations.map(p => {
            const side = scenario.nations.find(n => n.id === p.nation)?.side;
            return (
              <li key={p.nation}>
                <button type="button" role="radio" aria-checked={p.nation === nation} className={`nation-card ${p.nation === nation ? 'on' : ''}`} style={{ '--side': sideColor(side) } as React.CSSProperties} onClick={() => setNation(p.nation as NationId)}>
                  <b><NationChip nation={p.nation} /> {NATION_NAMES[p.nation as NationId] ?? p.nation}</b>
                  <span className="side">{side === 'axis' ? 'Axis' : side === 'allies' ? 'Allies' : ''}</span>
                  <span className="diff"><Pips n={p.difficultyRating} label={`Difficulty ${p.difficultyRating} of 5`} /></span>
                  <p>{p.summary}</p>
                </button>
              </li>
            );
          })}
        </ul>
        <section className="nation-detail">
          <h2><NationChip nation={nation} /> {NATION_NAMES[nation] ?? nation}</h2>
          {pn && <div className="detail-row"><span className="lbl">Difficulty</span><Pips n={pn.difficultyRating} label={`Difficulty ${pn.difficultyRating} of 5`} /><span className="dim">{['', 'Gentle', 'Moderate', 'Demanding', 'Severe', 'Desperate'][pn.difficultyRating]}</span></div>}
          <h4>Historical situation</h4>
          <p className="prose">{scenario.briefing.historical}</p>
          <p className="prose">{scenario.briefing.situation}</p>
          <h4>Starting forces</h4>
          <div className="force-grid">
            <div><b>{fmtInt(forces.units)}</b><span>formations</span></div>
            <div><b>{fmtInt(forces.men)}</b><span>men</span></div>
            <div><b>{forces.reinf}</b><span>reinforcement waves</span></div>
          </div>
          <ul className="force-types">{forces.byType.map(([t, n]) => <li key={t}><b>{n}</b> {UNIT_TYPE_LABEL[t as keyof typeof UNIT_TYPE_LABEL] ?? t}</li>)}</ul>
          <h4>Objectives</h4>
          <ul className="objectives compact">{objs.length ? objs.map(o => <li key={o.id} className={`obj tier-${o.tier}`}><span className="obj-state">{o.tier}</span><div className="obj-main"><b>{o.title}</b><p>{o.description}</p></div><span className="obj-pts">{o.points} pts</span></li>) : <li className="empty">Objectives are revealed in the briefing.</li>}</ul>
        </section>
        <aside className="settings-card" aria-label="Game settings">
          <h3>Game settings</h3>
          <div className="field-block"><span className="lbl">Difficulty</span><Segmented label="Difficulty" value={settings.difficulty} onChange={v => set('difficulty', v)} options={DIFF} /></div>
          <Slider label="Enemy aggression" value={settings.aiAggression} min={0} max={1} step={0.05} format={pct} onChange={v => set('aiAggression', v)} hint="How readily the enemy commander attacks and takes risks." />
          <Toggle checked={settings.fogOfWar} onChange={v => set('fogOfWar', v)} label="Fog of war" hint="Enemy units are hidden until your forces detect them." />
          <div className="field-block"><span className="lbl">Deployment</span>
            <Segmented label="Deployment" value={settings.historicalDeployment ? 'hist' : 'dyn'} onChange={v => set('historicalDeployment', v === 'hist')} options={[{ id: 'hist', label: 'Historical', hint: 'Forces start where they historically stood.' }, { id: 'dyn', label: 'Dynamic', hint: 'Starting positions are varied for replayability.' }]} /></div>
          <Toggle checked={settings.randomEvents} onChange={v => set('randomEvents', v)} label="Random events" hint="Unexpected incidents such as weather, sabotage and local initiative." />
          <Slider label="Logistics" value={settings.logisticsDifficulty} min={0} max={2} step={0.1} format={level} onChange={v => set('logisticsDifficulty', v)} hint="Higher means supply lines matter more." />
          <Slider label="Reinforcements" value={settings.reinforcementAvailability} min={0} max={2} step={0.1} format={level} onChange={v => set('reinforcementAvailability', v)} hint="Volume and timing of arriving units." />
          <Slider label="Historical events" value={settings.historicalEventFrequency} min={0} max={2} step={0.1} format={v => (v < 0.7 ? 'Rare' : v < 1.3 ? 'Normal' : 'Frequent')} onChange={v => set('historicalEventFrequency', v)} hint="How often scripted historical events fire." />
          <div className="field-block"><span className="lbl">Random seed</span>
            <div className="seed-row"><input type="number" value={seed} onChange={e => setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))} aria-label="Random seed" /><button type="button" className="mini-btn" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>Randomise</button></div>
            <p className="hint">The same seed and orders always produce the same war.</p></div>
        </aside>
      </div>
    </div>
  );
}
