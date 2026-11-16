import type { NationId, ScenarioDefinition } from '../../core/types';
import { NationChip } from '../components/kit';
import { NATION_NAMES, fmtIsoDay, shortTitle, UNIT_TYPE_LABEL, fmtInt } from '../format';
import { forcesOf } from './NationSelect';
import '../ui.css';

export function BriefingScreen({ scenario, nation, onBegin, onBack }: { scenario: ScenarioDefinition; nation: NationId; onBegin: () => void; onBack?: () => void }) {
  const pn = scenario.playableNations.find(p => p.nation === nation);
  const objs = (pn?.objectiveIds ?? []).map(id => scenario.objectives.find(o => o.id === id)).filter(Boolean) as ScenarioDefinition['objectives'];
  const f = forcesOf(scenario, nation);
  return (
    <div className="screen briefing-screen">
      <div className="dossier">
        <header>
          <div className="stamp"><NationChip nation={nation} /> {NATION_NAMES[nation] ?? nation} - eyes only</div>
          <h1>{shortTitle(scenario.title)}</h1>
          <div className="meta">{fmtIsoDay(scenario.startDate)}</div>
        </header>
        <div className="dossier-cols">
          <section>
            <h4>Strategic background</h4><p className="prose">{scenario.briefing.historical}</p>
            <h4>Situation</h4><p className="prose">{scenario.briefing.situation}</p>
            {pn && <><h4>Your command</h4><p className="prose">{pn.summary}</p></>}
          </section>
          <section>
            <h4>Orders from high command</h4>
            <ul className="objectives compact">{objs.map(o => <li key={o.id} className={`obj tier-${o.tier}`}><span className="obj-state">{o.tier}</span><div className="obj-main"><b>{o.title}</b><p>{o.description}</p></div><span className="obj-pts">{o.points} pts</span></li>)}</ul>
            <h4>Forces available</h4>
            <p className="prose">{fmtInt(f.units)} formations, {fmtInt(f.men)} men at the start. {f.byType.slice(0, 5).map(([t, n]) => `${n} ${UNIT_TYPE_LABEL[t as keyof typeof UNIT_TYPE_LABEL] ?? t}`).join(', ')}.</p>
          </section>
        </div>
        <footer>
          {onBack && <button type="button" className="btn" onClick={onBack}>Back</button>}
          <button type="button" className="btn primary big" onClick={onBegin}>Begin the campaign</button>
        </footer>
      </div>
    </div>
  );
}
