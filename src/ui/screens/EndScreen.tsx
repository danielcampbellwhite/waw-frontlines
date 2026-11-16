import { Fragment, useEffect, useState } from 'react';
import type { Ending, GameState, ScenarioDefinition } from '../../core/types';
import { fmtInt, fmtStamp, NATION_NAMES, shortTitle } from '../format';
import '../ui.css';

const ENDING: Record<Ending, { title: string; tone: string; line: string }> = {
  decisive_victory: { title: 'Decisive victory', tone: 'win', line: 'Every strategic aim was achieved. The enemy cannot continue the campaign.' },
  strategic_victory: { title: 'Strategic victory', tone: 'win', line: 'The major objectives were secured and the initiative is yours.' },
  limited_victory: { title: 'Limited victory', tone: 'part', line: 'Some key aims were achieved, at a cost. The war goes on.' },
  stalemate: { title: 'Stalemate', tone: 'part', line: 'Neither side could force a decision.' },
  defeat: { title: 'Defeat', tone: 'loss', line: 'Your forces were unable to hold. The campaign is lost.' },
};

export function EndScreen({ state, scenario, onMainMenu, onReplay }: { state: Readonly<GameState>; scenario: ScenarioDefinition; onMainMenu: () => void; onReplay?: () => void }) {
  const r = state.result;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!r) return; let raf = 0; const t0 = performance.now();
    const f = (t: number) => { const k = Math.min(1, (t - t0) / 1400); setShown(Math.round(r.score * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [r?.score]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return <div className="screen end-screen"><p className="empty">The campaign is still in progress.</p><button type="button" className="btn" onClick={onMainMenu}>Main menu</button></div>;
  const e = ENDING[r.ending];
  const mine = state.objectives.filter(o => o.side === state.playerSide);
  const killed = state.reports.reduce((a, b) => a + b.casualties.reduce((x, c) => x + c.killed, 0), 0);
  const stats: [string, string][] = [
    ['Campaign length', `${Math.round((r.endedAt - state.clock.startMinutes) / 1440)} days`], ['Battles fought', fmtInt(state.reports.length)], ['Men killed (all sides)', fmtInt(killed)],
    ['Objectives achieved', `${mine.filter(o => o.status === 'achieved').length} of ${mine.length}`],
    ['Formations surviving', fmtInt(Object.values(state.units).filter(u => u.side === state.playerSide && !u.destroyed && !u.surrendered).length)],
  ];
  return (
    <div className={`screen end-screen ${e.tone}`}>
      <div className="end-card">
        <div className="kicker">{shortTitle(scenario.title)} - {NATION_NAMES[state.playerNation]}</div>
        <h1>{e.title}</h1>
        <p className="end-line">{e.line}</p>
        <p className="prose">{r.summary}</p>
        <div className="score"><span>Final score</span><b>{fmtInt(shown)}</b></div>
        <div className="end-cols">
          <section><h4>Objectives</h4><ul className="objectives compact">{mine.map(o => <li key={o.id} className={`obj ${o.status}`}><span className="obj-state">{o.status === 'achieved' ? 'Done' : o.status === 'failed' ? 'Failed' : 'Open'}</span><div className="obj-main"><b>{o.title}</b></div><span className="obj-pts">{o.points}</span></li>)}</ul>
            <dl className="kv">{stats.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl></section>
          <section><h4>Campaign record</h4><ol className="timeline short">{state.history.length ? state.history.map((h, i) => <li key={i}><time>{fmtStamp(scenario, h.t)}</time><span>{h.text}</span></li>) : <li className="empty">No record kept.</li>}</ol></section>
        </div>
        <footer>{onReplay && <button type="button" className="btn" onClick={onReplay}>Play again</button>}<button type="button" className="btn primary big" onClick={onMainMenu}>Return to main menu</button></footer>
      </div>
    </div>
  );
}
