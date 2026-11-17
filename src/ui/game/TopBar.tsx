import type { ReactNode } from 'react';
import { useEngineState } from '../hooks/useEngineState';
import { useStore } from '../store';
import { Icon, Tip } from '../components/kit';
import { fmtClock, fmtDay, fmtK, isNightHour, shortTitle, simDate } from '../format';
import { useGame } from './gameStore';
import { notifCount } from './notifications';
import { useUiSettings, keyLabel } from '../settings';
import type { NationState } from '../../core/types';

const RES: { k: keyof NationState['resources']; label: string; hint: string }[] = [
  { k: 'manpower', label: 'MAN', hint: 'Manpower: replacement pool for losses and new formations.' },
  { k: 'fuel', label: 'FUEL', hint: 'Fuel stockpile. Mechanised and air units stall without it.' },
  { k: 'ammo', label: 'AMMO', hint: 'Ammunition stockpile for resupply.' },
  { k: 'equipment', label: 'EQUIP', hint: 'Equipment stockpile: tanks, guns and aircraft replacements.' },
  { k: 'supplyPoints', label: 'SUPPLY', hint: 'General supply points distributed through depots, ports and rail.' },
];

/** River and lake ice readout; thresholds mirror sim/pathfinding.ts iceLake (foot 35%, wheeled 55%, tracked 70%). */
export function iceTip(ice: number): string {
  const pct = Math.round(ice * 100);
  const can = [ice >= 0.35 && 'infantry', ice >= 0.55 && 'wheeled transport', ice >= 0.7 && 'tracked vehicles'].filter(Boolean) as string[];
  return `Frozen rivers and lakes: ${pct}% thick.\n${can.length ? `Can cross: ${can.join(', ')}.` : 'Too thin to cross yet.'}\nInfantry 35%, wheeled 55%, tracked 70%.`;
}

export function TopBar() {
  const { engine, scenario, store, actions, onExit } = useGame();
  const ui = useUiSettings();
  const top = useEngineState(engine, s => {
    const n = s.nations[s.playerNation];
    const notif = notifCount(s);
    const ice = (s.special as { sim?: { ice?: number } } | undefined)?.sim?.ice ?? 0;
    return { minutes: s.clock.minutes, speed: s.clock.speed, weather: s.weather.kind, temp: s.weather.temperatureC, res: n?.resources, inc: n?.income, nation: n?.name ?? s.playerNation, ice, notif, over: !!s.result };
  });
  const seen = useStore(store, s => s.notifSeen, Object.is);
  const unread = Math.max(0, top.notif - seen);
  const d = simDate(scenario, top.minutes);
  const k = ui.keybinds;
  const open = (m: 'objectives' | 'ops' | 'save' | 'menu' | 'help') => store.set({ modal: m, saveMode: 'save' });

  const sp: [0 | 1 | 2 | 4 | 8, ReactNode][] = [[0, <Icon key="p" name="pause" size={14} />], [1, '1'], [2, '2'], [4, '4'], [8, '8']];
  return (
    <header className="topbar">
      <div className="tb-brand">
        <div className="tb-campaign">{shortTitle(scenario.title)}</div>
        <div className="tb-nation">{top.nation}</div>
      </div>
      <div className="tb-clock" aria-live="off">
        <div className="tb-date">{fmtDay(d)}</div>
        <div className="tb-time">{fmtClock(d)}<span className="tb-wx">{top.weather} {Math.round(top.temp)}&deg;C</span><span className="tb-dn" aria-label={isNightHour(d.getUTCHours()) ? 'Night' : 'Daytime'}>{isNightHour(d.getUTCHours()) ? 'Night' : 'Day'}</span>{top.ice > 0 && <Tip text={iceTip(top.ice)} pos="bottom"><span className="tb-ice">Ice {Math.round(top.ice * 100)}%</span></Tip>}</div>
      </div>
      <div className="tb-speed" role="group" aria-label="Game speed">
        {sp.map(([v, label], i) => (
          <Tip key={v} text={v === 0 ? `Pause (${keyLabel(k.pause)})` : `Speed x${v} (${keyLabel(i === 0 ? k.pause : [k.speed1, k.speed2, k.speed3, k.speed4][i - 1])})`} pos="bottom">
            <button type="button" className={top.speed === v ? 'on' : ''} aria-pressed={top.speed === v} aria-label={v === 0 ? 'Pause' : `Speed ${v}`}
              onClick={() => (v === 0 ? (top.speed !== 0 && actions.togglePause()) : actions.setSpeed(v))}>{label}</button>
          </Tip>
        ))}
      </div>
      <div className="tb-res" aria-label="National resources">
        {RES.map(r => {
          const v = top.res?.[r.k] ?? 0, inc = top.inc?.[r.k] ?? 0;
          return (
            <Tip key={r.k} text={`${r.hint}\nIncome: ${inc >= 0 ? '+' : ''}${Math.round(inc)} per hour`} pos="bottom">
              <div className="res"><span className="res-l">{r.label}</span><span className="res-v">{fmtK(v)}</span><span className={`res-i ${inc < 0 ? 'neg' : ''}`}>{inc >= 0 ? '+' : ''}{Math.round(inc)}</span></div>
            </Tip>
          );
        })}
      </div>
      <div className="tb-tools">
        <Tip text={`Notifications (${keyLabel(k.tabNotifications)})`} pos="bottom">
          <button type="button" className="tool-btn bell" aria-label={`Notifications, ${unread} unread`} onClick={() => store.set({ bottomOpen: true, bottomTab: 'notifications', notifSeen: top.notif })}>
            <Icon name="bell" size={18} />{unread > 0 && <b className="badge">{unread > 99 ? '99+' : unread}</b>}
          </button>
        </Tip>
        <Tip text={`Objectives (${keyLabel(k.panelObjectives)})`} pos="bottom"><button type="button" className="tool-btn" aria-label="Objectives" onClick={() => open('objectives')}><Icon name="flag" size={18} /></button></Tip>
        <Tip text={`Operations planner (${keyLabel(k.panelOps)})`} pos="bottom"><button type="button" className="tool-btn" aria-label="Operations planner" onClick={() => open('ops')}><Icon name="ops" size={18} /></button></Tip>
        <Tip text={`Save / load (${keyLabel(k.panelSave)})`} pos="bottom"><button type="button" className="tool-btn" aria-label="Save or load" onClick={() => open('save')}><Icon name="save" size={18} /></button></Tip>
        <Tip text={`Help and tutorial (${keyLabel(k.panelHelp)})`} pos="bottom"><button type="button" className="tool-btn help-btn" aria-label="Help" onClick={() => open('help')}>?</button></Tip>
        <Tip text="Menu" pos="bottom"><button type="button" className="tool-btn" aria-label="Menu" onClick={() => open('menu')}><Icon name="menu" size={18} /></button></Tip>
        {onExit && null}
      </div>
    </header>
  );
}

export { notifCount };
