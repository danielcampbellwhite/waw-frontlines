import { useMemo, useState } from 'react';
import { TooltipLayer } from '../components/kit';
import type { CampaignScale } from '../../core/types';
import { Icon, Pips } from '../components/kit';
import { fmtIsoDay, fmtPlayTime, historicalSpan, shortTitle } from '../format';
import '../ui.css';

/** Structural subset of `ScenarioMeta` (src/data) the UI needs. Extra fields are ignored. */
export interface ScenarioMetaLike {
  id: string;
  campaignId: string;
  title: string;
  scale: CampaignScale;
  startDate: string;
  endDate: string;
  estimatedPlayMinutes: [number, number];
  mapSize: 'small' | 'medium' | 'large';
  complexity: 1 | 2 | 3 | 4 | 5;
  /** 'planned' campaigns are shown locked and cannot be selected. Default 'available'. */
  status?: 'available' | 'planned';
  planned?: boolean;
  blurb?: string;
  campaignTitle?: string;
}

const SCALES: { id: CampaignScale; label: string; hint: string }[] = [
  { id: 'short', label: 'Short', hint: 'A focused episode of the war' },
  { id: 'standard', label: 'Standard', hint: 'The full campaign at a measured pace' },
  { id: 'grand', label: 'Grand', hint: 'The widest scope and longest play' },
];
const isPlanned = (m: ScenarioMetaLike) => m.status === 'planned' || m.planned === true;
/** Drops a trailing scale tag ("- Short") and a trailing parenthetical that holds a date or year; keeps alternate names. */
const stripScale = shortTitle;

export function CampaignSelect({ scenarios, onSelect, onBack }: { scenarios: ScenarioMetaLike[]; onSelect: (scenarioId: string) => void; onBack: () => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, ScenarioMetaLike[]>();
    for (const s of scenarios) { const a = m.get(s.campaignId) ?? []; a.push(s); m.set(s.campaignId, a); }
    return [...m.entries()].map(([id, list]) => ({ id, list, locked: list.every(isPlanned) }))
      .sort((a, b) => Number(a.locked) - Number(b.locked) || Date.parse(a.list[0].startDate) - Date.parse(b.list[0].startDate));
  }, [scenarios]);
  const playable = groups.filter(g => !g.locked);
  const later = groups.filter(g => g.locked);
  return (
    <div className="screen select-screen">
      <header className="screen-head">
        <button type="button" className="btn" onClick={onBack}>Back</button>
        <div><div className="kicker">New campaign</div><h1>Choose a theatre of war</h1></div>
      </header>
      <TooltipLayer />
      <div className="campaign-grid">
        {playable.map(g => <CampaignCard key={g.id} list={g.list} locked={false} onSelect={onSelect} />)}
        {playable.length === 0 && <p className="empty">No campaigns are installed.</p>}
      </div>
      {later.length > 0 && (
        <section className="coming-later" aria-label="Coming later">
          <h2>Coming later</h2>
          <ul>{later.map(g => { const m = g.list[0]; return (
            <li key={g.id}><b>{m.campaignTitle ?? stripScale(m.title)}</b><span>{fmtIsoDay(m.startDate)} to {fmtIsoDay(m.endDate)}</span></li>
          ); })}</ul>
        </section>
      )}
    </div>
  );
}

function CampaignCard({ list, locked, onSelect }: { list: ScenarioMetaLike[]; locked: boolean; onSelect: (id: string) => void }) {
  const byScale = new Map(list.map(s => [s.scale, s]));
  const first: CampaignScale = (['standard', 'short', 'grand'] as const).find(s => byScale.has(s) && !isPlanned(byScale.get(s)!)) ?? list[0].scale;
  const [scale, setScale] = useState<CampaignScale>(first);
  const m = byScale.get(scale) ?? list[0];
  const title = m.campaignTitle ?? stripScale(m.title);
  const planned = isPlanned(m);
  return (
    <article className={`campaign-card ${locked ? 'locked' : ''}`} aria-disabled={locked}>
      <header>
        <h2>{title}</h2>
        {locked && <span className="lock"><Icon name="lock" size={14} /> Planned</span>}
      </header>
      <div className="era">{fmtIsoDay(m.startDate)} to {fmtIsoDay(m.endDate)}</div>
      {m.blurb && <p className="blurb">{m.blurb}</p>}
      <div className="scale-tabs" role="tablist" aria-label={`${title} scale`}>
        {SCALES.map(s => { const sm = byScale.get(s.id); const dis = !sm || locked || isPlanned(sm); return (
          <button key={s.id} type="button" role="tab" aria-selected={scale === s.id} disabled={dis && !!locked} className={`${scale === s.id ? 'on' : ''} ${!sm || (sm && isPlanned(sm)) ? 'unavail' : ''}`} data-tip={sm ? (isPlanned(sm) ? 'Planned for a later release' : s.hint) : 'Not available for this campaign'} onClick={() => sm && setScale(s.id)}>{s.label}</button>
        ); })}
      </div>
      <dl className="facts">
        <dt>Play time</dt><dd>{fmtPlayTime(m.estimatedPlayMinutes[0])} to {fmtPlayTime(m.estimatedPlayMinutes[1])}</dd>
        <dt>Historical span</dt><dd>{historicalSpan(m.startDate, m.endDate)}</dd>
        <dt>Map size</dt><dd>{m.mapSize[0].toUpperCase() + m.mapSize.slice(1)}</dd>
        <dt>Complexity</dt><dd><Pips n={m.complexity} label={`Complexity ${m.complexity} of 5`} /></dd>
      </dl>
      <button type="button" className="btn primary wide" disabled={locked || planned} onClick={() => onSelect(m.id)}>{locked || planned ? 'Not yet available' : 'Select campaign'}</button>
    </article>
  );
}
