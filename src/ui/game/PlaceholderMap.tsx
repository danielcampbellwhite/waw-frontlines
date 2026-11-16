import { useEffect, useMemo, useRef, useState } from 'react';
import type { LonLat } from '../../core/types';
import { useEngineState } from '../hooks/useEngineState';
import { sideColor } from '../format';
import type { TacticalMapProps } from '../mapAdapter';
import { UnitIcon } from '../components/kit';

/**
 * Stand-in map used only when src/map is not available yet. Pure SVG: shows units, battles and
 * locations with click-select, pan (drag), wheel zoom, right-click orders and focus requests, so that every
 * UI flow (targeting, context menu, audio zoom bands) can be exercised without the real map.
 */
export default function PlaceholderMap(p: TacticalMapProps) {
  const bb = p.engine.terrain.bbox;
  const W = 1000, kx = Math.cos(((bb.north + bb.south) / 2) * Math.PI / 180);
  const H = ((bb.north - bb.south) / ((bb.east - bb.west) * kx)) * W;
  const proj = (l: LonLat) => [((l[0] - bb.west) / (bb.east - bb.west)) * W, ((bb.north - l[1]) / (bb.north - bb.south)) * H] as const;
  const unproj = (x: number, y: number): LonLat => [bb.west + (x / W) * (bb.east - bb.west), bb.north - (y / H) * (bb.north - bb.south)];
  const [cam, setCam] = useState({ cx: W / 2, cy: H / 2, s: 1 });
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const world = useEngineState(p.engine, s => ({ units: s.units, battles: s.battles, locations: s.locations, side: s.playerSide }), (a, b) => a.units === b.units && a.battles === b.battles && false);

  const vb = { w: W / cam.s, h: H / cam.s };
  const toWorld = (cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    return [cam.cx - vb.w / 2 + ((cx - r.left) / r.width) * vb.w, cam.cy - vb.h / 2 + ((cy - r.top) / r.height) * vb.h] as const;
  };
  const view = useMemo(() => {
    const nw = unproj(cam.cx - vb.w / 2, cam.cy - vb.h / 2), se = unproj(cam.cx + vb.w / 2, cam.cy + vb.h / 2);
    return { zoom: 4 + Math.log2(cam.s) * 1.5, center: unproj(cam.cx, cam.cy), bounds: [nw[0], se[1], se[0], nw[1]] as [number, number, number, number] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam]);
  useEffect(() => { p.onViewChange?.(view); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.focusRequest) { const [x, y] = proj(p.focusRequest.pos); setCam(c => ({ cx: x, cy: y, s: Math.max(c.s, p.focusRequest!.zoom ? 2.4 : c.s) })); } }, [p.focusRequest?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = world.units && Object.values(world.units).filter(u => !u.destroyed && (u.side === world.side || u.visibleTo?.includes(world.side) || !p.overlays.fog));
  const k = 1 / cam.s;
  return (
    <div className={`placeholder-map ${p.targeting ? 'targeting' : ''}`}>
      <svg ref={ref} viewBox={`${cam.cx - vb.w / 2} ${cam.cy - vb.h / 2} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid slice"
        onWheel={e => { setCam(c => ({ ...c, s: Math.min(12, Math.max(0.6, c.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) })); }}
        onPointerDown={e => { if (e.button === 0) { drag.current = { x: e.clientX, y: e.clientY, moved: false }; (e.currentTarget as Element).setPointerCapture(e.pointerId); } }}
        onPointerMove={e => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.hypot(dx, dy) > 3) d.moved = true; if (d.moved) { const r = ref.current!.getBoundingClientRect(); setCam(c => ({ ...c, cx: c.cx - (dx / r.width) * vb.w, cy: c.cy - (dy / r.height) * vb.h })); d.x = e.clientX; d.y = e.clientY; } }}
        onPointerUp={e => { const d = drag.current; drag.current = null; if (d && !d.moved) { const [x, y] = toWorld(e.clientX, e.clientY); p.onMapClick(unproj(x, y)); } }}
        onContextMenu={e => { e.preventDefault(); const [x, y] = toWorld(e.clientX, e.clientY); p.onContextOrder(unproj(x, y)); }}>
        <rect x={0} y={0} width={W} height={H} fill="#12201b" />
        {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={(W / 10) * i} x2={(W / 10) * i} y1={0} y2={H} stroke="#1d2d26" strokeWidth={k} />)}
        {Array.from({ length: 11 }, (_, i) => <line key={`h${i}`} y1={(H / 10) * i} y2={(H / 10) * i} x1={0} x2={W} stroke="#1d2d26" strokeWidth={k} />)}
        {Object.values(world.locations ?? {}).map(l => { const [x, y] = proj(l.pos); return <g key={l.id} transform={`translate(${x} ${y})`}><rect x={-4 * k} y={-4 * k} width={8 * k} height={8 * k} fill="none" stroke="#c9a24a" strokeWidth={1.4 * k} /><text x={7 * k} y={3 * k} fontSize={11 * k} fill="#c9a24a" style={{ paintOrder: 'stroke' }} stroke="#0b0f0e" strokeWidth={3 * k}>{l.name}</text></g>; })}
        {p.overlays.routes && visible?.map(u => u.route && u.route.length > 0 && u.side === world.side && <polyline key={`r${u.id}`} fill="none" stroke="#e0a83a" strokeDasharray={`${5 * k} ${4 * k}`} strokeWidth={1.2 * k} points={[u.pos, ...u.route].map(pt => proj(pt).join(',')).join(' ')} />)}
        {Object.values(world.battles ?? {}).map(b => { const [x, y] = proj(b.pos); return <g key={b.id} transform={`translate(${x} ${y})`}><circle r={13 * k} fill="rgba(224,87,47,.2)" stroke="#e0572f" strokeWidth={1.6 * k} /><path d={`M${-6 * k} ${-6 * k}L${6 * k} ${6 * k}M${6 * k} ${-6 * k}L${-6 * k} ${6 * k}`} stroke="#e0572f" strokeWidth={2 * k} /></g>; })}
        {p.overlays.targetPreview && p.overlays.targetPreview.length > 0 && <polyline fill="none" stroke="#e0572f" strokeWidth={2 * k} strokeDasharray={`${6 * k} ${4 * k}`} points={p.overlays.targetPreview.map(pt => proj(pt).join(',')).join(' ')} />}
        {visible?.map(u => {
          const [x, y] = proj(u.pos); const sel = p.selection.includes(u.id);
          return (
            <g key={u.id} transform={`translate(${x} ${y}) scale(${k})`} onPointerDown={e => e.stopPropagation()} onPointerUp={e => { e.stopPropagation(); p.onSelect([u.id], e.shiftKey || e.ctrlKey); }} style={{ cursor: 'pointer' }}>
              {sel && <rect x={-17} y={-13} width={34} height={26} fill="none" stroke="#fff" strokeWidth={1.5} strokeDasharray="4 3" />}
              <foreignObject x={-15} y={-11} width={30} height={22}><div><UnitIcon type={u.type} side={u.side} size={30} /></div></foreignObject>
              <text y={24} textAnchor="middle" fontSize={10} fill={sideColor(u.side)} stroke="#0b0f0e" strokeWidth={3} style={{ paintOrder: 'stroke' }}>{u.shortName}</text>
            </g>
          );
        })}
      </svg>
      <div className="pm-note">Placeholder map. The real map loads from src/map once available.</div>
    </div>
  );
}
