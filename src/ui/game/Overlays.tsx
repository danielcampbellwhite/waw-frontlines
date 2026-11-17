import { useEffect, useMemo } from 'react';
import type { GameEvent, Objective, OrderKind, Unit } from '../../core/types';
import { useEngineState } from '../hooks/useEngineState';
import { useStore } from '../store';
import { Icon, Modal } from '../components/kit';
import { KEY_ACTIONS, keyLabel, useUiSettings } from '../settings';
import { ORDER_META, fmtDuration, fmtPos, fmtStamp, orderMeta, previewEtaMinutes } from '../format';
import { buildNotifications, notifSignature } from './notifications';
import { useGame, type PhaseDraft } from './gameStore';
import { audio } from '../../audio';
import { FIXED_CONTROLS } from '../tutorial/steps';

// ───────────── Event choice modal
export function EventModal() {
  const { engine, store, actions, scenario } = useGame();
  const ev = useEngineState(engine, s => s.events.find(e => !e.resolved && e.choices?.length && (!e.side || e.side === s.playerSide)) ?? null, Object.is);
  useEffect(() => {
    if (!ev) return;
    const c = engine.getState().clock;
    if (c.speed !== 0) { store.set({ lastSpeed: c.speed as 1 | 2 | 4 | 8, pausedByEvent: true }); engine.setSpeed(0); }
  }, [ev?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ev) return null;
  return <EventChoice ev={ev} stamp={fmtStamp(scenario, ev.firedAt)} onPick={cid => actions.resolveEvent(ev.id, cid)} onFocus={ev.pos ? () => actions.focusOn(ev.pos!, 8) : undefined} />;
}

export function EventChoice({ ev, stamp, onPick, onFocus }: { ev: GameEvent; stamp: string; onPick: (choiceId: string) => void; onFocus?: () => void }) {
  return (
    <Modal title={ev.title} kicker={`${ev.kind === 'historical' ? 'Historical event' : ev.kind === 'dynamic' ? 'Developing situation' : 'Unexpected event'} - ${stamp}`} className="event-modal"
      footer={onFocus ? <button type="button" className="btn" onClick={onFocus}><Icon name="target" size={14} /> Show location</button> : undefined}>
      <p className="event-body">{ev.body}</p>
      <div className="choices" role="group" aria-label="Decisions">
        {ev.choices!.map(c => (
          <button key={c.id} type="button" className="choice" onClick={() => onPick(c.id)}>
            <span className="choice-label">{c.label}</span><span className="choice-fx">{c.effectSummary}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ───────────── Objectives
const TIER_LABEL = { primary: 'Primary objectives', secondary: 'Secondary objectives', strategic: 'Strategic objectives' } as const;

export function ObjectivesPanel({ onClose }: { onClose: () => void }) {
  const { engine, actions, scenario } = useGame();
  const s = useEngineState(engine, st => ({ obj: st.objectives, side: st.playerSide, locs: st.locations, now: st.clock.minutes }), (a, b) => a.obj === b.obj && a.now === b.now);
  const mine = s.obj.filter(o => o.side === s.side);
  const enemy = s.obj.filter(o => o.side !== s.side && o.status === 'achieved');
  const points = mine.filter(o => o.status === 'achieved').reduce((a, o) => a + o.points, 0);
  const total = mine.reduce((a, o) => a + o.points, 0);
  const where = (o: Objective) => { const c = o.condition; return 'locationId' in c ? s.locs[c.locationId] : undefined; };
  const detail = (o: Objective): string => {
    const c = o.condition;
    switch (c.kind) {
      case 'hold_location': return `Hold ${s.locs[c.locationId]?.name ?? c.locationId}${c.untilMinutes ? ` until ${fmtStamp(scenario, c.untilMinutes)}` : ''}`;
      case 'capture_location': return `Capture ${s.locs[c.locationId]?.name ?? c.locationId}`;
      case 'control_fraction': return `Control ${Math.round(c.fraction * 100)}% of the ${c.region ? 'region' : 'theatre'}`;
      case 'destroy_units': return `Destroy ${Math.round(c.fraction * 100)}% of ${c.side} forces`;
      case 'survive_until': return `Survive until ${fmtStamp(scenario, c.minutes)} (${fmtDuration(c.minutes - s.now)} left)`;
      default: return 'Special condition';
    }
  };
  return (
    <Modal title="Objectives" kicker={`${points} of ${total} points secured`} onClose={onClose} wide>
      {(['primary', 'secondary', 'strategic'] as const).map(tier => {
        const list = mine.filter(o => o.tier === tier); if (!list.length) return null;
        return (
          <section key={tier} className="obj-tier"><h4>{TIER_LABEL[tier]}</h4>
            <ul className="objectives">{list.map(o => (
              <li key={o.id} className={`obj ${o.status}`}>
                <span className="obj-state" aria-label={o.status}>{o.status === 'achieved' ? 'Done' : o.status === 'failed' ? 'Failed' : 'Open'}</span>
                <div className="obj-main"><b>{o.title}</b><p>{o.description}</p><small>{detail(o)}</small></div>
                <span className="obj-pts">{o.points} pts</span>
                {where(o) && <button type="button" className="icon-btn" aria-label="Show on map" onClick={() => { actions.focusOn(where(o)!.pos, 8); onClose(); }}><Icon name="target" size={14} /></button>}
              </li>
            ))}</ul></section>
        );
      })}
      {mine.length === 0 && <p className="empty">This scenario defines no objectives for your side.</p>}
      {enemy.length > 0 && <section className="obj-tier"><h4>Enemy achievements</h4><ul className="objectives">{enemy.map(o => <li key={o.id} className="obj failed"><span className="obj-state">Enemy</span><div className="obj-main"><b>{o.title}</b></div></li>)}</ul></section>}
    </Modal>
  );
}

// ───────────── Operations planner
export function OpsPlanner({ onClose }: { onClose: () => void }) {
  const { engine, store, actions } = useGame();
  const draft = useStore(store, s => s.draft, Object.is);
  const sel = useStore(store, s => s.selection);
  const ops = useEngineState(engine, s => Object.values(s.operations).filter(o => o.side === s.playerSide), (a, b) => a.length === b.length && a.every((o, i) => o === b[i] && o.status === b[i].status));
  const now = useEngineState(engine, s => s.clock.minutes, Object.is);
  const upd = (patch: Partial<typeof draft>) => store.set(s => ({ draft: { ...s.draft, ...patch } }));
  const updPhase = (i: number, patch: Partial<PhaseDraft>) => store.set(s => ({ draft: { ...s.draft, phases: s.draft.phases.map((p, j) => (j === i ? { ...p, ...patch } : p)) } }));
  const addPhase = () => store.set(s => ({ draft: { ...s.draft, phases: [...s.draft.phases, { name: `Phase ${s.draft.phases.length + 1}`, unitIds: [], kind: 'move' as OrderKind, startAfterMinutes: s.draft.phases.length ? 360 : 0, priority: 1 }] } }));
  const units = engine.getState().units;
  const pick = (i: number) => {
    const p = draft.phases[i]; const need = orderMeta(p.kind).need;
    if (need === 'none') return;
    onClose();
    store.set({ targeting: { kind: p.kind, unitIds: p.unitIds, points: [], forPhase: i }, modal: null });
  };
  const name = (id: string) => units[id]?.shortName ?? id;
  return (
    <Modal title="Operations planner" kicker="Coordinate phased offensives and defences" onClose={onClose} wide
      footer={<><button type="button" className="btn" onClick={() => store.set({ draft: { name: 'Operation ', delayMinutes: 0, phases: [] } })}>Clear draft</button>
        <button type="button" className="btn primary" onClick={() => { const r = actions.createOperation(); if (r?.ok) onClose(); }}>Create operation</button></>}>
      <div className="ops-grid">
        <section>
          <h4>New operation</h4>
          <label className="field"><span>Name</span><input value={draft.name} onChange={e => upd({ name: e.target.value })} maxLength={48} aria-label="Operation name" /></label>
          <label className="field"><span>Start in (hours)</span><input type="number" min={0} max={720} value={Math.round(draft.delayMinutes / 60)} onChange={e => upd({ delayMinutes: Math.max(0, Number(e.target.value) || 0) * 60 })} aria-label="Start delay in hours" /></label>
          <ol className="phases">
            {draft.phases.map((p, i) => {
              const meta = orderMeta(p.kind);
              const first = units[p.unitIds[0]] as Unit | undefined;
              const eta = p.target && first ? previewEtaMinutes(first, p.target) : null;
              return (
                <li key={i} className="phase">
                  <div className="phase-head"><input value={p.name} onChange={e => updPhase(i, { name: e.target.value })} aria-label={`Phase ${i + 1} name`} />
                    <button type="button" className="icon-btn" aria-label={`Remove phase ${i + 1}`} onClick={() => store.set(s => ({ draft: { ...s.draft, phases: s.draft.phases.filter((_, j) => j !== i) } }))}><Icon name="x" size={12} /></button></div>
                  <div className="phase-row">
                    <label className="field inline"><span>Order</span>
                      <select value={p.kind} onChange={e => updPhase(i, { kind: e.target.value as OrderKind, target: undefined, line: undefined, targetUnit: undefined })} aria-label={`Phase ${i + 1} order`}>
                        {ORDER_META.map(m => <option key={m.kind} value={m.kind}>{m.label}</option>)}</select></label>
                    <label className="field inline"><span>Starts after (h)</span><input type="number" min={0} max={720} value={Math.round(p.startAfterMinutes / 60)} onChange={e => updPhase(i, { startAfterMinutes: Math.max(0, Number(e.target.value) || 0) * 60 })} aria-label={`Phase ${i + 1} delay`} /></label>
                  </div>
                  <div className="phase-row">
                    <button type="button" className="mini-btn" disabled={!sel.length} onClick={() => updPhase(i, { unitIds: sel.filter(id => units[id]?.side === engine.getState().playerSide) })}>Assign selected ({sel.length})</button>
                    <span className="phase-units">{p.unitIds.length ? p.unitIds.map(name).join(', ') : 'No units assigned'}</span>
                  </div>
                  <div className="phase-row">
                    {meta.need !== 'none' ? <button type="button" className="mini-btn" disabled={!p.unitIds.length} onClick={() => pick(i)}><Icon name="target" size={11} /> Pick target on map</button> : <span className="hint">No target needed</span>}
                    <span className="phase-target">{p.line ? `${p.line.length}-point line` : p.targetUnit ? name(p.targetUnit) : p.target ? fmtPos(p.target) : meta.need === 'none' ? '' : 'No target'}{eta ? ` - about ${Math.round(eta.km)} km, ETA ${fmtDuration(eta.minutes)}` : ''}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn" onClick={addPhase}><Icon name="plus" size={13} /> Add phase</button>
        </section>
        <section>
          <h4>Active and planned operations</h4>
          <ul className="op-list">
            {ops.length === 0 && <li className="empty">No operations yet.</li>}
            {ops.map(o => (
              <li key={o.id} className={`op ${o.status}`}>
                <div><b>{o.name}</b><span className={`chip ${o.status === 'active' ? 'ok' : ''}`}>{o.status}</span></div>
                <small>{o.phases.length} phase(s) - {o.startMinutes > now ? `starts in ${fmtDuration(o.startMinutes - now)}` : 'underway'}</small>
                {(o.status === 'planned' || o.status === 'active') && <button type="button" className="mini-btn danger" onClick={() => actions.cancelOperation(o.id)}>Cancel operation</button>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

// ───────────── Help
export function HelpModal({ onClose, onTour }: { onClose: () => void; onTour?: () => void }) {
  const ui = useUiSettings();
  return (
    <Modal title="Help and controls" kicker="Keys can be changed in Settings" onClose={onClose} wide footer={onTour ? <button type="button" className="btn primary" onClick={onTour}>Replay the tutorial</button> : undefined}>
      <div className="help-grid">
        <ul className="keylist">{KEY_ACTIONS.map(a => <li key={a.action}><kbd>{keyLabel(ui.keybinds[a.action])}</kbd><span>{a.label}</span></li>)}
          {FIXED_CONTROLS.map(c => <li key={c.keys + c.label}><kbd>{c.keys}</kbd><span>{c.label}</span></li>)}</ul>
        <div className="help-text">
          <h4>Giving orders</h4>
          <p>Select your units (click, or Shift-drag a box on the map), choose an order in the right panel, then click the target on the map. Hold Replace/Queue to decide whether the order replaces the queue or is added to it. Right-click the map for quick orders.</p>
          <h4>Defensive lines</h4><p>Choose Line, click each point, then press Enter or double-click to finish.</p>
          <h4>Time</h4><p>The game runs in real time; pause with Space. Decisions pause the game while you think.</p>
        </div>
      </div>
    </Modal>
  );
}

// ───────────── Context menu
export function ContextMenu() {
  const { engine, store, actions } = useGame();
  const m = useStore(store, s => s.ctxMenu, Object.is);
  const sel = useStore(store, s => s.selection);
  const own = useEngineState(engine, s => sel.filter(id => s.units[id]?.side === s.playerSide), (a, b) => a.length === b.length && a.every((x, i) => x === b[i]));
  useEffect(() => {
    if (!m) return;
    const close = () => store.set({ ctxMenu: null });
    const t = setTimeout(() => window.addEventListener('pointerdown', close, { once: true }), 0);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', close); };
  }, [m, store]);
  const items = useMemo(() => (m ? [
    { k: 'move' as const, label: 'Move here' }, { k: 'attack' as const, label: 'Attack here' }, { k: 'recon' as const, label: 'Reconnoitre' },
    { k: 'defend' as const, label: 'Defend here' }, { k: 'withdraw' as const, label: 'Withdraw to here' },
  ] : []), [m]);
  if (!m) return null;
  const x = Math.min(m.x, window.innerWidth - 190), y = Math.min(m.y, window.innerHeight - 260);
  return (
    <div className="ctx-menu" style={{ left: x, top: y }} role="menu" onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
      <div className="ctx-head">{fmtPos(m.pos)}</div>
      {own.length > 0 ? <>
        {items.map(i => <button key={i.k} type="button" role="menuitem" onClick={() => { actions.issue(own, { kind: i.k, target: m.pos }); store.set({ ctxMenu: null }); }}>{i.label}<small>{own.length > 1 ? `${own.length} units` : ''}</small></button>)}
        <hr /><button type="button" role="menuitem" onClick={() => { actions.cancelOrders(own); store.set({ ctxMenu: null }); }}>Cancel orders</button>
      </> : <p className="ctx-note">Select your units to give orders.</p>}
      <hr /><button type="button" role="menuitem" onClick={() => { actions.focusOn(m.pos); store.set({ ctxMenu: null }); }}>Centre map here</button>
    </div>
  );
}

// ───────────── Toasts
export function Toasts() {
  const { store, actions } = useGame();
  const toasts = useStore(store, s => s.toasts, Object.is);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.severity}`} role="status">
          <span>{t.text}</span>
          {t.pos && <button type="button" className="mini-btn" onClick={() => { actions.focusOn(t.pos!, 8); actions.dismissToast(t.id); }}>Show</button>}
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => actions.dismissToast(t.id)}><Icon name="x" size={11} /></button>
        </div>
      ))}
    </div>
  );
}

/** Raises toasts for new warn/critical log entries and campaign ending. */
export function useToastFeed() {
  const { engine, store, actions } = useGame();
  useEffect(() => {
    // Toasts come from the same notification list as the bell badge and the Notifications tab.
    const first = engine.getState();
    let sig = notifSignature(first);
    const known = new Set(buildNotifications(first).map(n => n.id));
    let announcedEnd = !!first.result;
    return engine.subscribe(s => {
      const ns = notifSignature(s);
      if (ns !== sig) {
        sig = ns;
        for (const n of buildNotifications(s)) {
          if (known.has(n.id)) continue;
          known.add(n.id);
          if (n.kind === 'event') continue; // events open their own modal / are announced by the telegraph
          if (n.severity === 'critical') { actions.toast(n.text, 'critical', n.pos); audio.sfx('alert'); }
          else actions.toast(n.text, n.severity === 'warn' ? 'warn' : 'info', n.pos);
        }
      }
      if (s.result && !announcedEnd) { announcedEnd = true; actions.toast('The campaign has ended.', 'info'); }
      void store;
    });
  }, [engine, actions, store]);
}

