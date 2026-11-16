import { useState } from 'react';
import type { Unit, UnitId } from '../../core/types';
import { useEngineState } from '../hooks/useEngineState';
import { useStore } from '../store';
import { Bar, Icon, Segmented, Tip, UnitIcon } from '../components/kit';
import {
  NATION_NAMES, ORDER_META, POSTURES, PRIORITIES, UNIT_TYPE_LABEL, fmtDuration, fmtInt, fmtPos, fmtStamp, orderTargetText, previewEtaMinutes, sideColor, statusLabel, statusTone, strengthFrac,
} from '../format';
import { useGame } from './gameStore';
import { equipName } from './reportText';
import { UnitArt } from '../components/UnitArt';
import { keyLabel, useUiSettings, type KeyAction } from '../settings';

export function RightPanel() {
  const { engine, store } = useGame();
  const sel = useStore(store, s => s.selection);
  const state = useEngineState(engine);
  const units = sel.map(id => state.units[id]).filter((u): u is Unit => !!u && !u.destroyed);
  const playerSide = state.playerSide;
  const own = units.filter(u => u.side === playerSide);
  return (
    <aside className="panel right-panel" aria-label="Selected units">
      {units.length === 0 ? <TheatreSummary /> : own.length === 0 ? <EnemyIntel unit={units[0]} /> : own.length === 1 ? <UnitDetail unit={own[0]} /> : <MultiDetail units={own} />}
    </aside>
  );
}

function TheatreSummary() {
  const { engine } = useGame();
  const s = useEngineState(engine, st => {
    const mine = Object.values(st.units).filter(u => u.side === st.playerSide && !u.destroyed);
    return { n: mine.length, men: mine.reduce((a, u) => a + u.manpower, 0), battles: Object.keys(st.battles).length, cut: st.supply.cutOffUnits.length, enc: mine.filter(u => u.encircled).length };
  });
  return (
    <div className="rp-empty">
      <div className="panel-head"><h3>Command overview</h3></div>
      <dl className="kv">
        <dt>Formations</dt><dd>{s.n}</dd><dt>Men under arms</dt><dd>{fmtInt(s.men)}</dd>
        <dt>Battles in progress</dt><dd>{s.battles}</dd><dt>Units cut off</dt><dd className={s.cut ? 'crit' : ''}>{s.cut}</dd><dt>Encircled</dt><dd className={s.enc ? 'crit' : ''}>{s.enc}</dd>
      </dl>
      <p className="hint">Click a unit on the map or in the order of battle to command it. Hold Shift and drag on the map to box-select. Right-click the map for quick orders.</p>
    </div>
  );
}

function EnemyIntel({ unit }: { unit: Unit }) {
  const { engine, actions, store } = useGame();
  const seen = useEngineState(engine, s => ({ rec: unit.lastSeenBy?.[s.playerSide], now: s.clock.minutes, vis: !!unit.visibleTo?.includes(s.playerSide), own: s.playerSide }));
  const { scenario } = useGame();
  const band = (v: number, step: number) => `~${fmtInt(Math.round(v / step) * step)}`;
  const sizeWord = unit.manpowerMax >= 12000 ? 'division-strength' : unit.manpowerMax >= 4000 ? 'brigade or regiment' : unit.manpowerMax >= 500 ? 'battalion-sized' : 'detachment';
  return (
    <div className="rp-body">
      <header className="unit-head enemy">
        <div className="art-tile" style={{ '--side': sideColor(unit.side) } as React.CSSProperties}><UnitArt type={unit.type} nation={unit.nation} side={unit.side} variant="large" equipment={unit.equipment} seed={unit.id} /></div>
        <div><div className="unit-name">{unit.shortName}</div><div className="unit-sub">{NATION_NAMES[unit.nation]} - {UNIT_TYPE_LABEL[unit.type]}</div></div>
      </header>
      <div className="intel-card" style={{ borderColor: sideColor(unit.side) }}>
        <div className="kicker">Intelligence</div>
        <dl className="kv">
          <dt>Contact</dt><dd>{seen.vis ? 'Visible now' : seen.rec ? `Last seen ${fmtDuration(seen.now - seen.rec.minutes)} ago` : 'Reported'}</dd>
          <dt>Strength</dt><dd>{band(unit.manpower, 500)} men ({sizeWord})</dd>
          <dt>Activity</dt><dd>{seen.vis ? statusLabel(unit) : 'Unknown'}</dd>
          {seen.rec && <><dt>Position</dt><dd>{fmtPos(seen.rec.pos)}</dd></>}
        </dl>
        <p className="hint">Detailed readiness, supply and orders of enemy formations are not known. Probe with reconnaissance for better intel ({fmtStamp(scenario, seen.now)}).</p>
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={() => actions.focusOn(seen.rec?.pos ?? unit.pos, 8)}><Icon name="focus" size={14} /> Centre map</button>
        <button type="button" className="btn" onClick={() => store.set({ selection: [] })}>Deselect</button>
      </div>
      <p className="hint">To attack, select your units and press Attack, then click this formation.</p>
    </div>
  );
}

function UnitDetail({ unit }: { unit: Unit }) {
  const { actions, engine, scenario } = useGame();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(unit.name);
  const locs = useEngineState(engine, s => s.locations, Object.is);
  const units = useEngineState(engine, s => s.units, Object.is);
  const now = useEngineState(engine, s => s.clock.minutes, Object.is);
  const battle = unit.inBattle ? engine.getState().battles[unit.inBattle] : undefined;
  const tone = statusTone(unit);
  const equipKeys = Array.from(new Set([...Object.keys(unit.equipment.authorised), ...Object.keys(unit.equipment.held)]));

  return (
    <div className="rp-body">
      <header className="unit-head">
        <div className="art-tile" style={{ '--side': sideColor(unit.side) } as React.CSSProperties}><UnitArt type={unit.type} nation={unit.nation} side={unit.side} variant="large" equipment={unit.equipment} seed={unit.id} /></div>
        <div className="unit-id">
          {editing
            ? <input className="rename" autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={() => { setEditing(false); if (name !== unit.name) actions.rename(unit.id, name); }}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setName(unit.name); setEditing(false); } }} aria-label="Unit name" />
            : <Tip text="Click to rename" pos="bottom" block><button type="button" className="unit-name as-text" onClick={() => { setName(unit.name); setEditing(true); }}>{unit.name}</button></Tip>}
          <div className="unit-sub">{NATION_NAMES[unit.nation]} - {UNIT_TYPE_LABEL[unit.type]}{unit.parentId && units[unit.parentId] ? ` - under ${units[unit.parentId].shortName}` : ''}</div>
          <div className="art-caption">{topEquipment(unit).slice(0, 2).map(([k, v]) => <span key={k}><b>{fmtInt(v)}</b> {equipName(k).toLowerCase().split(" / ")[0]}</span>)}</div>
        </div>
        <Tip text="Centre map on unit" pos="left"><button type="button" className="icon-btn" aria-label="Centre map" onClick={() => actions.focusOn(unit.pos, 8)}><Icon name="focus" /></button></Tip>
      </header>

      <div className="chips status-chips">
        <span className={`chip ${tone}`}>{statusLabel(unit)}</span>
        <span className="chip">{unit.posture}</span>
        {unit.entrenchment > 0 && <span className="chip">Dug in {Math.round(unit.entrenchment)}%</span>}
        {battle && <Tip text={battle.log.slice(-3).join('\n') || 'Battle in progress'} pos="left"><button type="button" className="chip crit as-btn" onClick={() => actions.focusOn(battle.pos, 9)}>In battle - round {battle.rounds}</button></Tip>}
      </div>

      <section className="stats">
        <Tip text={`Manpower ${fmtInt(unit.manpower)} of ${fmtInt(unit.manpowerMax)}`} pos="left" block><Bar label="Strength" value={unit.manpower} max={unit.manpowerMax} text={fmtInt(unit.manpower)} warnBelow={50} /></Tip>
        <Tip text="Organisation: cohesion. At zero the unit routs." pos="left" block><Bar label="Organisation" value={unit.organisation} warnBelow={40} /></Tip>
        <Tip text="Morale: willingness to keep fighting." pos="left" block><Bar label="Morale" value={unit.morale} warnBelow={40} /></Tip>
        <Tip text="Experience improves combat effectiveness." pos="left" block><Bar label="Experience" value={unit.experience} tone="brass" /></Tip>
        <Tip text="Fuel: mechanised and air units stop when empty." pos="left" block><Bar label="Fuel" value={unit.fuel} warnBelow={30} /></Tip>
        <Tip text="Ammunition: low ammo cuts firepower." pos="left" block><Bar label="Ammo" value={unit.ammo} warnBelow={30} /></Tip>
        <Tip text="Composite supply state (connection to depots)." pos="left" block><Bar label="Supply" value={unit.supply} warnBelow={35} /></Tip>
        <Tip text="Fatigue: high values slow movement and weaken attacks." pos="left" block><Bar label="Fatigue" value={unit.fatigue} tone={unit.fatigue > 70 ? 'crit' : unit.fatigue > 45 ? 'warn' : 'ok'} /></Tip>
        <Tip text="Overall readiness derived from all of the above." pos="left" block><Bar label="Readiness" value={unit.readiness} warnBelow={50} /></Tip>
        <Bar label="Entrenchment" value={unit.entrenchment} tone="brass" />
      </section>

      <section>
        <h4>Equipment</h4>
        <table className="equip"><tbody>
          {equipKeys.map(k => { const h = unit.equipment.held[k] ?? 0, a = unit.equipment.authorised[k] ?? 0; return (
            <tr key={k}><th>{equipName(k)}</th><td><Bar value={h} max={Math.max(a, h, 1)} text={`${fmtInt(h)}/${fmtInt(a)}`} segments={12} warnBelow={60} compact /></td></tr>
          ); })}
          {equipKeys.length === 0 && <tr><td className="empty">No equipment record.</td></tr>}
        </tbody></table>
      </section>

      <section>
        <div className="sec-head"><h4>Orders</h4>
          {unit.orders.some(o => o.status === 'active' || o.status === 'queued') && <button type="button" className="mini-btn danger" onClick={() => actions.cancelOrders([unit.id])}>Cancel all</button>}
        </div>
        <ol className="orders">
          {unit.orders.filter(o => o.status === 'active' || o.status === 'queued').map((o, i) => {
            const meta = ORDER_META.find(m => m.kind === o.kind);
            const eta = i === 0 && o.status === 'active' && unit.routeEtaMinutes !== undefined ? unit.routeEtaMinutes : o.target ? previewEtaMinutes(unit, o.target).minutes : undefined;
            return (
              <li key={o.id} className={`order ${o.status}`}>
                <span className="o-kind">{meta?.label ?? o.kind}</span>
                <span className="o-target">{orderTargetText(o, units, id => locs[id]?.name)}</span>
                <span className="o-eta">{o.status === 'queued' ? 'queued' : eta !== undefined ? `ETA ${fmtDuration(eta)}` : 'active'}</span>
                {o.operationId && <span className="chip tiny">op</span>}
                <span className="o-actions">
                  {o.target && <Tip text="Redirect: pick a new target for this order" pos="left"><button type="button" className="mini-btn" aria-label="Redirect order" onClick={() => { actions.cancelOrders([unit.id], o.id); actions.startOrder(o.kind); }}>Redirect</button></Tip>}
                  <Tip text="Cancel this order" pos="left"><button type="button" className="mini-btn danger" aria-label="Cancel order" onClick={() => actions.cancelOrders([unit.id], o.id)}><Icon name="x" size={10} /></button></Tip>
                </span>
                <span className="o-issued" title={fmtStamp(scenario, o.issuedAt)}>issued {fmtDuration(now - o.issuedAt)} ago</span>
              </li>
            );
          })}
          {!unit.orders.some(o => o.status === 'active' || o.status === 'queued') && <li className="empty">No orders. Unit is {unit.posture === 'hold' ? 'holding' : unit.posture}.</li>}
        </ol>
      </section>

      <OrderControls unitIds={[unit.id]} />
    </div>
  );
}

function MultiDetail({ units }: { units: Unit[] }) {
  const { actions } = useGame();
  const avg = (f: (u: Unit) => number) => units.reduce((a, u) => a + f(u), 0) / units.length;
  const men = units.reduce((a, u) => a + u.manpower, 0), max = units.reduce((a, u) => a + u.manpowerMax, 0);
  const ids = units.map(u => u.id);
  return (
    <div className="rp-body">
      <header className="unit-head"><div className="unit-id"><div className="unit-name">{units.length} units selected</div><div className="unit-sub">{fmtInt(men)} men</div></div>
        <button type="button" className="icon-btn" aria-label="Clear selection" onClick={() => actions.select([])}><Icon name="x" /></button></header>
      <section className="stats">
        <Bar label="Strength" value={men} max={max} text={fmtInt(men)} warnBelow={50} />
        <Bar label="Organisation" value={avg(u => u.organisation)} warnBelow={40} />
        <Bar label="Morale" value={avg(u => u.morale)} warnBelow={40} />
        <Bar label="Fuel" value={avg(u => u.fuel)} warnBelow={30} />
        <Bar label="Ammo" value={avg(u => u.ammo)} warnBelow={30} />
        <Bar label="Supply" value={avg(u => u.supply)} warnBelow={35} />
      </section>
      <section>
        <div className="sec-head"><h4>Selection</h4><button type="button" className="mini-btn danger" onClick={() => actions.cancelOrders(ids)}>Cancel all orders</button></div>
        <ul className="sel-list">
          {units.map(u => (
            <li key={u.id}><button type="button" onClick={() => actions.select([u.id])}><UnitIcon type={u.type} side={u.side} size={18} /><span>{u.shortName}</span><span className={`oob-state ${statusTone(u)}`} /><em>{Math.round(strengthFrac(u) * 100)}%</em></button></li>
          ))}
        </ul>
      </section>
      <OrderControls unitIds={ids} />
    </div>
  );
}

export function OrderControls({ unitIds }: { unitIds: UnitId[] }) {
  const { actions, store, engine } = useGame();
  const ui = useUiSettings();
  const st = useStore(store, s => ({ mode: s.orderMode, prio: s.priority, t: s.targeting }));
  const posture = useEngineState(engine, s => (unitIds.length === 1 ? s.units[unitIds[0]]?.posture : undefined), Object.is);
  return (
    <section className="order-controls">
      <div className="sec-head"><h4>Issue order</h4>
        <Segmented label="Order mode" value={st.mode} onChange={m => store.set({ orderMode: m })} options={[{ id: 'replace', label: 'Replace', hint: 'New order replaces the queue' }, { id: 'append', label: 'Queue', hint: 'Add to the end of the order queue' }]} />
      </div>
      <div className="order-grid">
        {ORDER_META.map(m => {
          const k = m.actionKey ? ui.keybinds[m.actionKey as KeyAction] : undefined;
          const active = st.t?.kind === m.kind;
          return (
            <Tip key={m.kind} text={`${m.hint}${m.need === 'none' ? '' : '\nThen click the map' + (m.need === 'unit' ? ' on a unit' : m.need === 'location' ? ' near a town or depot' : '')}`} pos="top" block>
              <button type="button" className={`order-btn ${active ? 'on' : ''}`} aria-pressed={active} onClick={() => (active ? actions.cancelTargeting() : actions.startOrder(m.kind))}>
                <span>{m.label}</span>{k && <kbd>{keyLabel(k)}</kbd>}
              </button>
            </Tip>
          );
        })}
      </div>
      <div className="prio-row"><span className="lbl">Priority</span>
        <Segmented label="Priority" value={st.prio} onChange={p => store.set({ priority: p })} options={PRIORITIES.map((p, i) => ({ id: i, label: p }))} />
      </div>
      <div className="sec-head"><h4>Posture</h4></div>
      <div className="posture-row">
        {POSTURES.map(p => <Tip key={p.id} text={p.hint} pos="top"><button type="button" className={`chip-btn ${posture === p.id ? 'on' : ''}`} onClick={() => actions.setPosture(unitIds, p.id)}>{p.label}</button></Tip>)}
      </div>
    </section>
  );
}

/** Largest equipment holdings, for the illustration caption. */
function topEquipment(u: Unit): [string, number][] {
  return Object.entries(u.equipment.held).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
}
