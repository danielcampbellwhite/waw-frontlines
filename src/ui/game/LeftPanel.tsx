import { useMemo, useState } from 'react';
import type { Unit, UnitId, NationId } from '../../core/types';
import { useEngineState } from '../hooks/useEngineState';
import { useStore } from '../store';
import { Icon, NationChip, Tip, UnitIcon } from '../components/kit';
import { UnitArt } from '../components/UnitArt';
import { NATION_NAMES, UNIT_TYPE_LABEL, fmtDuration, fmtStamp, statusLabel, statusTone, strengthFrac } from '../format';
import { useGame, type OobStatusFilter } from './gameStore';

interface Node { unit: Unit; children: Node[]; /** formation this unit is attached to when that formation belongs to another nation */ under?: string }

export function buildTree(units: Unit[]): Record<string, Node[]> {
  const byId = new Map(units.map(u => [u.id, u]));
  const nodes = new Map<UnitId, Node>(units.map(u => [u.id, { unit: u, children: [] }]));
  const roots: Record<string, Node[]> = {};
  const sortFn = (a: Node, b: Node) => rank(a.unit) - rank(b.unit) || a.unit.name.localeCompare(b.unit.name, 'en', { numeric: true });
  for (const u of units) {
    const p = u.parentId && u.parentId !== u.id ? byId.get(u.parentId) : undefined;
    // Grouped by the unit's own nation: a formation attached to another nation's HQ (e.g. NZ/Indian/South African
    // divisions under a British corps) becomes a root of its own nation, tagged with the formation it serves under.
    if (p && p.nation === u.nation) nodes.get(p.id)!.children.push(nodes.get(u.id)!);
    else { const n = nodes.get(u.id)!; if (p) n.under = p.shortName; (roots[u.nation] ??= []).push(n); }
  }
  const sortRec = (n: Node[]) => { n.sort(sortFn); n.forEach(x => sortRec(x.children)); };
  Object.values(roots).forEach(sortRec);
  return roots;
}
const rank = (u: Unit) => (u.type === 'hq' ? 0 : u.domain === 'land' ? 1 : u.domain === 'air' ? 2 : 3);

const statusFilters: { id: OobStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'moving', label: 'Moving' }, { id: 'combat', label: 'In combat' }, { id: 'low_supply', label: 'Low supply' }, { id: 'low_org', label: 'Low org' },
];

export function matchesFilters(u: Unit, q: string, type: string, status: OobStatusFilter): boolean {
  if (type !== 'all' && u.domain !== type) return false;
  if (q) { const s = q.toLowerCase(); if (!u.name.toLowerCase().includes(s) && !u.shortName.toLowerCase().includes(s) && !UNIT_TYPE_LABEL[u.type].toLowerCase().includes(s)) return false; }
  switch (status) {
    case 'moving': return u.moveStatus !== 'stationary';
    case 'combat': return u.combatStatus !== 'idle' || !!u.inBattle;
    case 'low_supply': return u.supply < 35 || u.fuel < 20 || u.ammo < 25;
    case 'low_org': return u.organisation < 40;
  }
  return true;
}

export function LeftPanel() {
  const { engine, scenario, store, actions } = useGame();
  const f = useStore(store, s => ({ q: s.query, type: s.typeFilter, status: s.statusFilter, sel: s.selection }));
  const units = useEngineState(engine, s => Object.values(s.units).filter(u => u.side === s.playerSide && !u.destroyed && !u.surrendered));
  const pending = useEngineState(engine, s => {
    const n = s.nations[s.playerNation]; const now = s.clock.minutes;
    return (n?.reinforcements ?? []).filter(r => !r.arrived).sort((a, b) => a.atMinutes - b.atMinutes).slice(0, 12).map(r => ({ id: r.id, name: r.unit.shortName, at: r.atMinutes, loc: r.locationId, uid: r.unit.id, in: r.atMinutes - now, type: r.unit.type, side: r.unit.side }));
  });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const filtered = useMemo(() => {
    const any = f.q || f.type !== 'all' || f.status !== 'all';
    if (!any) return units;
    // keep ancestors of matches so the tree stays navigable
    const byId = new Map(units.map(u => [u.id, u])); const keep = new Set<UnitId>();
    for (const u of units) if (matchesFilters(u, f.q, f.type, f.status)) { let c: Unit | undefined = u; while (c && !keep.has(c.id)) { keep.add(c.id); c = c.parentId ? byId.get(c.parentId) : undefined; } }
    return units.filter(u => keep.has(u.id));
  }, [units, f.q, f.type, f.status]);
  const tree = useMemo(() => buildTree(filtered), [filtered]);
  const nations = (Object.keys(tree) as NationId[]).sort((a, b) => units.filter(u => u.nation === b).length - units.filter(u => u.nation === a).length);

  const click = (e: React.MouseEvent, u: Unit) => {
    actions.select([u.id], e.ctrlKey || e.metaKey || e.shiftKey);
    if (e.detail === 2) actions.focusOn(u.pos, 8);
  };
  const allIds = (ns: Node[]): UnitId[] => ns.flatMap(n => [n.unit.id, ...allIds(n.children)]);

  const renderNode = (n: Node, depth: number) => {
    const u = n.unit; const open = !collapsed[u.id]; const sel = f.sel.includes(u.id);
    return (
      <li key={u.id}>
        <div className={`oob-row ${sel ? 'sel' : ''}`} style={{ paddingLeft: 6 + depth * 14 }} onClick={e => click(e, u)} role="treeitem" aria-selected={sel} aria-expanded={n.children.length ? open : undefined}>
          {n.children.length ? <button type="button" className={`twisty ${open ? 'open' : ''}`} aria-label={open ? 'Collapse' : 'Expand'} onClick={e => { e.stopPropagation(); setCollapsed(c => ({ ...c, [u.id]: open })); }}><Icon name="chev" size={10} /></button> : <span className="twisty-sp" />}
          <UnitArt type={u.type} nation={u.nation} side={u.side} equipment={u.equipment} seed={u.id} size={22} />
          <span className="oob-name" title={`${u.name}\n${UNIT_TYPE_LABEL[u.type]} - ${statusLabel(u)}\nStrength ${Math.round(strengthFrac(u) * 100)}%  Org ${Math.round(u.organisation)}  Supply ${Math.round(u.supply)}`}>{u.shortName}{n.under && <i className="oob-under"> under {n.under}</i>}</span>
          <span className={`oob-state ${statusTone(u)}`} title={statusLabel(u)} />
          <span className="oob-str"><i style={{ width: `${strengthFrac(u) * 100}%` }} className={strengthFrac(u) < 0.4 ? 'low' : ''} /></span>
        </div>
        {n.children.length > 0 && open && <ul role="group">{n.children.map(c => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <aside className="panel left-panel" aria-label="Order of battle">
      <div className="panel-head"><h3>Order of battle</h3><span className="count">{units.length}</span></div>
      <div className="oob-filters">
        <label className="search"><Icon name="search" size={14} /><input type="search" placeholder="Search units" value={f.q} onChange={e => store.set({ query: e.target.value })} aria-label="Search units" /></label>
        <div className="chips" role="group" aria-label="Domain filter">
          {(['all', 'land', 'air', 'sea'] as const).map(t => <button key={t} type="button" className={f.type === t ? 'on' : ''} onClick={() => store.set({ typeFilter: t })}>{t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>
        <div className="chips" role="group" aria-label="Status filter">
          {statusFilters.map(s => <button key={s.id} type="button" className={f.status === s.id ? 'on' : ''} onClick={() => store.set({ statusFilter: s.id })}>{s.label}</button>)}
        </div>
      </div>
      <div className="oob-scroll">
        {nations.length === 0 && <p className="empty">No units match these filters.</p>}
        {nations.map(nat => (
          <section key={nat} className="oob-nation">
            <button type="button" className="oob-nat-head" onClick={() => actions.select(allIds(tree[nat]))} title="Select every unit of this nation">
              <span><NationChip nation={nat} /> {NATION_NAMES[nat] ?? nat}</span><span className="count">{allIds(tree[nat]).length}</span>
            </button>
            <ul role="tree">{tree[nat].map(n => renderNode(n, 0))}</ul>
          </section>
        ))}
        {pending.length > 0 && (
          <section className="oob-reserve">
            <div className="oob-nat-head static"><span>Arriving reinforcements</span><span className="count">{pending.length}</span></div>
            <ul>
              {pending.map(r => (
                <li key={r.id} className="reserve-row">
                  <UnitIcon type={r.type} side={r.side} size={18} dim />
                  <span className="oob-name">{r.name}</span>
                  <span className="reserve-eta" title={fmtStamp(scenario, r.at)}>{r.in > 0 ? fmtDuration(r.in) : 'due'}</span>
                  {r.loc && <Tip text="Request early arrival at the designated location" pos="left"><button type="button" className="mini-btn" onClick={() => actions.dispatch({ type: 'request_reinforcement', locationId: r.loc!, unitId: r.uid })}>Call up</button></Tip>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
