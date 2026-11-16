import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import type { SideId, UnitType } from '../../core/types';
import { nationColour, sideColor } from '../format';
import { audio } from '../../audio';

/** Tooltip wrapper (CSS driven; multi-line via \n). */
export function Tip({ text, children, pos = 'top', block }: { text: string; children: ReactNode; pos?: 'top' | 'bottom' | 'left' | 'right'; block?: boolean }) {
  return <span className={`tip${block ? ' tip-block' : ''}`} data-tip={text} data-pos={pos}>{children}</span>;
}

export function Bar({ value, max = 100, tone, label, text, warnBelow, segments = 20, compact }: {
  value: number; max?: number; tone?: 'ok' | 'warn' | 'crit' | 'brass' | 'allies' | 'axis'; label?: string; text?: string; warnBelow?: number; segments?: number; compact?: boolean;
}) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  let t = tone;
  if (!t) t = warnBelow !== undefined ? (frac * 100 < warnBelow * 0.5 ? 'crit' : frac * 100 < warnBelow ? 'warn' : 'ok') : 'ok';
  const full = Math.round(frac * segments);
  return (
    <div className={`bar bar-${t}${compact ? ' bar-compact' : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      {label && <span className="bar-label">{label}</span>}
      <span className="bar-track" style={{ '--n': segments } as CSSProperties}>
        {Array.from({ length: segments }, (_, i) => <i key={i} className={i < full ? 'on' : ''} />)}
      </span>
      <span className="bar-val">{text ?? `${Math.round(frac * 100)}`}</span>
    </div>
  );
}

export function Pips({ n, of = 5, label }: { n: number; of?: number; label?: string }) {
  return <span className="pips" role="img" aria-label={label ?? `${n} of ${of}`}>{Array.from({ length: of }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { id: T; label: string; hint?: string; disabled?: boolean }[]; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={String(o.id)} type="button" role="radio" aria-checked={o.id === value} disabled={o.disabled}
          className={o.id === value ? 'on' : ''} data-tip={o.hint} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle" data-tip={hint}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-sw" aria-hidden />
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export function Slider({ value, min, max, step = 0.05, onChange, label, format, hint }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string; hint?: string;
}) {
  return (
    <label className="slider" data-tip={hint}>
      <span className="slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} aria-label={label} />
      <span className="slider-val">{format ? format(value) : value.toFixed(2)}</span>
    </label>
  );
}

export function Modal({ title, onClose, children, wide, footer, kicker, className }: {
  title: string; onClose?: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode; kicker?: string; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); audio.cue('panel_open'); return () => { audio.cue('panel_close'); }; }, []);
  return (
    <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''} ${className ?? ''}`} role="dialog" aria-modal aria-label={title} tabIndex={-1} ref={ref}
        onKeyDown={e => { if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); } }}>
        <header className="modal-head">
          <div>{kicker && <div className="kicker">{kicker}</div>}<h2>{title}</h2></div>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Close" type="button"><Icon name="close" /></button>}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export type IconName = 'close' | 'bell' | 'pause' | 'play' | 'save' | 'menu' | 'target' | 'flag' | 'chev' | 'search' | 'lock' | 'cog' | 'ops' | 'oob' | 'focus' | 'x' | 'plus' | 'skull';
const PATHS: Record<IconName, string> = {
  close: 'M5 5l10 10M15 5L5 15', x: 'M5 5l10 10M15 5L5 15',
  bell: 'M10 3a4 4 0 0 0-4 4v3l-1.5 3h11L14 10V7a4 4 0 0 0-4-4zM8.5 15.5a1.6 1.6 0 0 0 3 0',
  pause: 'M6.5 4v12M13.5 4v12', play: 'M6 4l9 6-9 6z',
  save: 'M4 4h10l2 2v10H4zM7 4v4h6V4M7 16v-4h6v4',
  menu: 'M3 6h14M3 10h14M3 14h14', target: 'M10 3v4M10 13v4M3 10h4M13 10h4M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  flag: 'M5 17V3M5 4h9l-2 3 2 3H5', chev: 'M7 5l5 5-5 5', search: 'M8.5 3a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM13 13l4 4',
  lock: 'M5 9h10v8H5zM7 9V6a3 3 0 0 1 6 0v3', cog: 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4',
  ops: 'M3 15l4-4 3 3 7-8M13 6h4v4', oob: 'M10 3v4M4 11V7h12v4M4 11v3M10 11v3M16 11v3M2 14h4v3H2zM8 14h4v3H8zM14 14h4v3h-4z',
  focus: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4', plus: 'M10 4v12M4 10h12', skull: 'M5 9a5 5 0 0 1 10 0v3h-2v3H7v-3H5zM8 10h.01M12 10h.01',
};
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" strokeLinejoin="miter" aria-hidden><path d={PATHS[name]} /></svg>;
}

/** NATO-style unit frame with type glyph. Side colours the frame. */
/** Small nation plate: colour swatch plus the three-letter code. */
export function NationChip({ nation }: { nation: string }) {
  return <span className="nation-chip" style={{ '--nat': nationColour(nation) } as CSSProperties} aria-hidden>{nation === 'NEUTRAL' ? 'NEU' : nation}</span>;
}

export function UnitIcon({ type, side, size = 22, dim }: { type: UnitType; side: SideId; size?: number; dim?: boolean }) {
  const col = sideColor(side);
  const air = type === 'air_fighter' || type === 'air_bomber';
  const sea = type === 'naval' || type === 'carrier';
  return (
    <svg className="unit-icon" width={size} height={size * 0.72} viewBox="0 0 30 22" aria-hidden style={{ opacity: dim ? 0.45 : 1 }}>
      {side === 'allies'
        ? <rect x="1.5" y="1.5" width="27" height="19" fill="rgba(108,155,196,.16)" stroke={col} strokeWidth="1.6" />
        : side === 'axis'
          ? <path d="M15 1.2 28.5 11 15 20.8 1.5 11z" fill="rgba(192,112,90,.16)" stroke={col} strokeWidth="1.6" />
          : <circle cx="15" cy="11" r="9.5" fill="none" stroke={col} strokeWidth="1.6" />}
      <g stroke={col} strokeWidth="1.5" fill="none" strokeLinecap="square">{glyph(type, air, sea)}</g>
    </svg>
  );
}
function glyph(type: UnitType, air: boolean, sea: boolean) {
  if (air) return type === 'air_bomber' ? <path d="M7 12l8-5 8 5M15 7v8" /> : <path d="M8 13l7-6 7 6" />;
  if (sea) return <path d="M8 13h14M15 7v8M10 15q5 3 10 0" />;
  switch (type) {
    case 'infantry': return <path d="M9 6l12 10M21 6L9 16" />;
    case 'armoured': return <ellipse cx="15" cy="11" rx="6" ry="3.2" />;
    case 'mechanised': return <g><ellipse cx="15" cy="11" rx="6" ry="3.2" /><path d="M9 6l12 10" /></g>;
    case 'motorised': return <g><path d="M9 6l12 10M21 6L9 16" /><circle cx="15" cy="11" r="1.2" /></g>;
    case 'paratroop': return <path d="M8 12q7-8 14 0zM15 12v4" />;
    case 'artillery': return <circle cx="15" cy="11" r="2.2" fill="currentColor" />;
    case 'antitank': return <path d="M9 15l6-8 6 8" />;
    case 'recon': return <path d="M8 16L22 6" />;
    case 'engineer': return <path d="M9 14v-4h12v4M12 10V8M18 10V8" />;
    case 'logistics': return <path d="M15 6v10M9 11h12" />;
    case 'hq': return <path d="M10 6v10M10 6h9l-2 3 2 3h-9" />;
    default: return <path d="M9 11h12" />;
  }
}

/** One global tooltip bubble driven by [data-tip] attributes; fixed-positioned and clamped to the viewport (never clipped by panels). */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; r: DOMRect; pos: string } | null>(null);
  const [xy, setXy] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined; let cur: Element | null = null;
    const hide = () => { clearTimeout(timer); cur = null; setTip(null); setXy(null); };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
      if (el === cur) return;
      hide();
      const text = el?.getAttribute('data-tip');
      if (!el || !text) return;
      cur = el;
      timer = setTimeout(() => setTip({ text, r: el.getBoundingClientRect(), pos: el.getAttribute('data-pos') ?? 'top' }), 350);
    };
    document.addEventListener('pointerover', over); document.addEventListener('pointerdown', hide, true); document.addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('pointerover', over); document.removeEventListener('pointerdown', hide, true); document.removeEventListener('scroll', hide, true); clearTimeout(timer); };
  }, []);
  useLayoutEffect(() => {
    if (!tip || !ref.current) return;
    const b = ref.current.getBoundingClientRect(), r = tip.r, m = 6;
    let x = r.left + r.width / 2 - b.width / 2, y = tip.pos === 'bottom' ? r.bottom + m : r.top - b.height - m;
    if (tip.pos === 'left') { x = r.left - b.width - m; y = r.top + r.height / 2 - b.height / 2; }
    if (tip.pos === 'right') { x = r.right + m; y = r.top + r.height / 2 - b.height / 2; }
    if (y < 4) y = r.bottom + m; if (y + b.height > innerHeight - 4) y = Math.max(4, r.top - b.height - m);
    x = Math.max(4, Math.min(innerWidth - b.width - 4, x));
    setXy({ x, y });
  }, [tip]);
  if (!tip) return null;
  return <div ref={ref} className="tip-layer" role="tooltip" style={{ left: xy?.x ?? 0, top: xy?.y ?? 0, visibility: xy ? 'visible' : 'hidden' }}>{tip.text}</div>;
}
