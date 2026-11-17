import { useEffect, useMemo } from 'react';
import type { BattleReport, GameEvent } from '../../core/types';
import { useEngineState } from '../hooks/useEngineState';
import { useStore } from '../store';
import { Bar, Icon, Tip } from '../components/kit';
import { buildDispatches } from './dispatches';
import { NATION_NAMES, fmtInt, fmtPos, fmtStamp } from '../format';
import { useGame, type BottomTab } from './gameStore';
import { buildNotifications, notifCount, notifSignature, type Notification } from './notifications';
import { equipName, reportHeadline, tidyConsequences } from './reportText';
import { UnitArt } from '../components/UnitArt';

const TABS: { id: BottomTab; label: string }[] = [
  { id: 'notifications', label: 'Notifications' }, { id: 'dispatches', label: 'Dispatches' }, { id: 'events', label: 'Events log' }, { id: 'reports', label: 'Battle reports' }, { id: 'history', label: 'Campaign history' },
];
const OUTCOME: Record<BattleReport['outcome'], string> = {
  attacker_victory: 'Attacker victory', defender_victory: 'Defender victory', stalemate: 'Stalemate', attacker_withdrew: 'Attacker withdrew',
};

export function BottomPanel() {
  const { engine, store } = useGame();
  const ui = useStore(store, s => ({ open: s.bottomOpen, tab: s.bottomTab }));
  const counts = useEngineState(engine, s => ({ n: notifCount(s), r: s.reports.length }));
  // mark notifications seen while the tab is visible
  useEffect(() => { if (ui.open && ui.tab === 'notifications') store.set({ notifSeen: counts.n }); }, [ui.open, ui.tab, counts.n, store]);
  return (
    <section className={`bottom-panel ${ui.open ? '' : 'collapsed'}`} aria-label="Reports and logs">
      <div className="bp-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={ui.tab === t.id && ui.open} className={ui.tab === t.id && ui.open ? 'on' : ''}
            onClick={() => store.set({ bottomTab: t.id, bottomOpen: true })}>
            {t.label}{t.id === 'reports' && counts.r > 0 && <span className="count">{counts.r}</span>}
          </button>
        ))}
        <span className="grow" />
        <Tip text={ui.open ? 'Collapse panel' : 'Expand panel'} pos="top"><button type="button" className="icon-btn" aria-label="Toggle bottom panel" onClick={() => store.set({ bottomOpen: !ui.open })}><span style={{ display: 'inline-block', transform: ui.open ? 'rotate(90deg)' : 'rotate(-90deg)' }}><Icon name="chev" size={14} /></span></button></Tip>
      </div>
      {ui.open && <div className="bp-body">
        {ui.tab === 'notifications' && <Notifications />}
        {ui.tab === 'dispatches' && <Dispatches />}
        {ui.tab === 'events' && <EventsLog />}
        {ui.tab === 'reports' && <Reports />}
        {ui.tab === 'history' && <History />}
      </div>}
    </section>
  );
}

/** Period-style feed of the campaign's own historical event text and objective results. */
function Dispatches() {
  const { engine, actions, scenario } = useGame();
  const list = useEngineState(engine, s => buildDispatches(s), (a, b) => a.length === b.length && a.every((x, i) => x.id === b[i].id));
  if (!list.length) return <p className="empty pad">No dispatches yet. Historical events and objective results are recorded here as they happen.</p>;
  return (
    <ul className="dispatches">
      {list.map(d => (
        <li key={d.id}>
          <time>{fmtStamp(scenario, d.t)}</time>
          <div><b>{d.headline}</b>{d.body && <p>{d.body}</p>}</div>
          {d.pos && <button type="button" className="mini-btn" onClick={() => actions.focusOn(d.pos!, 8)}>Go to</button>}
        </li>
      ))}
    </ul>
  );
}

function NotifRow({ n }: { n: Notification }) {
  const { scenario, actions, engine, store } = useGame();
  const unit = n.unitId ? engine.getState().units[n.unitId] : undefined;
  const go = () => { if (n.pos) actions.focusOn(n.pos, 8); if (n.kind === 'report') store.set({ bottomTab: 'reports', bottomOpen: true }); };
  return (
    <li className={`log ${n.severity} cat-${n.kind === 'log' ? n.label : n.kind}`}>
      <time>{fmtStamp(scenario, n.t)}</time>
      <span className="log-cat">{n.label}</span>
      <span className="log-text">{unit && <UnitArt type={unit.type} nation={unit.nation} side={unit.side} equipment={unit.equipment} seed={unit.id} size={18} />}{n.text}</span>
      {(n.pos || n.kind === 'report') && <Tip text={n.pos ? 'Show on map' : 'Open reports'} pos="left"><button type="button" className="icon-btn" aria-label={n.pos ? 'Show on map' : 'Open reports'} onClick={go}><Icon name="target" size={13} /></button></Tip>}
    </li>
  );
}

export function Notifications() {
  const { engine } = useGame();
  const sig = useEngineState(engine, s => notifSignature(s), Object.is);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => buildNotifications(engine.getState()).slice(0, 150), [engine, sig]);
  return <ul className="loglist">{items.length ? items.map(n => <NotifRow key={n.id} n={n} />) : <li className="empty">No notifications yet. Orders, battles and events will appear here.</li>}</ul>;
}

function EventsLog() {
  const { engine, scenario } = useGame();
  const events = useEngineState(engine, s => s.events, (a, b) => a.length === b.length && a.every((e, i) => e === b[i] && e.resolved === b[i].resolved));
  return (
    <ul className="loglist events">
      {events.length === 0 && <li className="empty">No events have occurred.</li>}
      {[...events].reverse().map((e: GameEvent) => (
        <li key={e.id} className={`log ev ${e.kind}`}>
          <time>{fmtStamp(scenario, e.firedAt)}</time><span className="log-cat">{e.kind}</span>
          <span className="log-text"><b>{e.title}</b> {e.body}{e.choices && e.resolved && <em className="chosen"> Decision: {e.choices.find(c => c.id === e.chosen)?.label ?? 'none'}</em>}{e.choices && !e.resolved && <em className="pending"> Awaiting decision</em>}</span>
        </li>
      ))}
    </ul>
  );
}

function History() {
  const { engine, scenario } = useGame();
  const h = useEngineState(engine, s => s.history, (a, b) => a.length === b.length);
  return (
    <ol className="timeline">
      {h.length === 0 && <li className="empty">The campaign record starts when major events occur.</li>}
      {[...h].reverse().map((x, i) => <li key={i}><time>{fmtStamp(scenario, x.t)}</time><span>{x.text}</span></li>)}
    </ol>
  );
}

function Reports() {
  const { engine, store, actions, scenario } = useGame();
  const reports = useEngineState(engine, s => s.reports, (a, b) => a.length === b.length);
  const selId = useStore(store, s => s.selectedReport, Object.is);
  const sel = reports.find(r => r.id === selId) ?? reports[reports.length - 1];
  const list = [...reports].reverse();
  if (!reports.length) return <p className="empty pad">No battles have been fought yet. Detailed reports with casualties and the reasons for each outcome appear here.</p>;
  return (
    <div className="reports">
      <ul className="report-list" role="listbox" aria-label="Battle reports">
        {list.map(r => (
          <li key={r.id}><button type="button" role="option" aria-selected={sel?.id === r.id} className={sel?.id === r.id ? 'on' : ''} onClick={() => store.set({ selectedReport: r.id })}>
            <b>{r.placeName ?? fmtPos(r.pos)}</b><span>{OUTCOME[r.outcome]}</span><time>{fmtStamp(scenario, r.endedAt)}</time></button></li>
        ))}
      </ul>
      {sel && <ReportDetail r={sel} onFocus={() => actions.focusOn(sel.pos, 9)} />}
    </div>
  );
}

export function ReportDetail({ r, onFocus }: { r: BattleReport; onFocus?: () => void }) {
  const { scenario, engine } = useGame();
  const parts = r.casualties.map(c => engine.getState().units[c.unitId]).filter(Boolean).slice(0, 4);
  const totals = r.casualties.reduce((a, c) => ({ k: a.k + c.killed, w: a.w + c.wounded, c: a.c + c.captured }), { k: 0, w: 0, c: 0 });
  const eq = Object.entries(r.equipmentLosses);
  return (
    <article className="report" aria-label="Battle report detail">
      <header>
        <div>{parts.length > 0 && <div className="report-art">{parts.map(u => <UnitArt key={u.id} type={u.type} nation={u.nation} side={u.side} equipment={u.equipment} seed={u.id} size={26} />)}</div>}<div className="kicker">{OUTCOME[r.outcome]}</div><h3>{r.placeName ?? 'Battle'} <small>{fmtPos(r.pos)}</small></h3>
          <div className="meta">{fmtStamp(scenario, r.startedAt)} to {fmtStamp(scenario, r.endedAt)} - attacker: {r.attackerSide}</div></div>
        {onFocus && <button type="button" className="btn" onClick={onFocus}><Icon name="target" size={14} /> Show</button>}
      </header>
      <p className="headline">{reportHeadline(r, engine.getState().units, id => NATION_NAMES[id as keyof typeof NATION_NAMES] ?? id)}</p>
      <p className="summary">{r.summary}</p>
      <div className="report-cols">
        <div><h4>Why it happened</h4><ul className="bullets">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><h4>Consequences</h4><ul className="bullets">{tidyConsequences(r).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      <h4>Casualties <small>{fmtInt(totals.k)} killed, {fmtInt(totals.w)} wounded, {fmtInt(totals.c)} captured</small></h4>
      <table className="grid"><thead><tr><th>Unit</th><th>Killed</th><th>Wounded</th><th>Captured</th><th>Organisation</th></tr></thead><tbody>
        {r.casualties.map(c => { const o = r.orgChanges.find(x => x.unitId === c.unitId); return (
          <tr key={c.unitId}><td>{c.name}</td><td>{fmtInt(c.killed)}</td><td>{fmtInt(c.wounded)}</td><td>{fmtInt(c.captured)}</td>
            <td>{o ? <span className="org-change"><Bar value={o.after} segments={10} compact text={`${Math.round(o.before)} to ${Math.round(o.after)}`} warnBelow={40} /></span> : '-'}</td></tr>
        ); })}</tbody></table>
      {eq.length > 0 && <p className="eqloss"><b>Equipment lost:</b> {eq.map(([k, v]) => `${v} ${equipName(k).toLowerCase()}`).join(', ')}</p>}
    </article>
  );
}
