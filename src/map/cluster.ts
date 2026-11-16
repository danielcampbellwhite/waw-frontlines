/** Screen-space declutter: greedy stacking of overlapping markers around the most important unit. Pure. */
export interface ClusterItem { id: string; x: number; y: number; score: number }
export interface Cluster { leader: ClusterItem; members: ClusterItem[] }

/**
 * Items are processed by descending score (ties by id for determinism). An item joins the first leader whose
 * marker box overlaps it (|dx| < w and |dy| < h); otherwise it becomes a leader. O(n) with a spatial hash.
 */
export function clusterItems(items: ClusterItem[], w: number, h: number): Cluster[] {
  const order = [...items].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cw = Math.max(1, w), ch = Math.max(1, h);
  const grid = new Map<number, Cluster[]>();
  const key = (cx: number, cy: number) => cx * 73856093 ^ cy * 19349663;
  const out: Cluster[] = [];
  for (const it of order) {
    const gx = Math.floor(it.x / cw), gy = Math.floor(it.y / ch);
    let best: Cluster | null = null, bd = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const cell = grid.get(key(gx + dx, gy + dy));
      if (!cell) continue;
      for (const c of cell) {
        const ax = Math.abs(c.leader.x - it.x), ay = Math.abs(c.leader.y - it.y);
        if (ax < cw && ay < ch) { const d = ax / cw + ay / ch; if (d < bd) { bd = d; best = c; } }
      }
    }
    if (best) best.members.push(it);
    else {
      const c: Cluster = { leader: it, members: [it] };
      out.push(c);
      const k = key(gx, gy);
      const cell = grid.get(k);
      if (cell) cell.push(c); else grid.set(k, [c]);
    }
  }
  return out;
}

/** Cluster each side separately (opposing units never share a stack). `sideOf` maps an item id to its side key. */
export function clusterBySide(items: ClusterItem[], sideOf: (id: string) => string, w: number, h: number): Cluster[] {
  const groups = new Map<string, ClusterItem[]>();
  for (const it of items) { const k = sideOf(it.id); const g = groups.get(k); if (g) g.push(it); else groups.set(k, [it]); }
  const out: Cluster[] = [];
  for (const k of [...groups.keys()].sort()) out.push(...clusterItems(groups.get(k)!, w, h));
  return out;
}

/**
 * Screen-space offsets (px, by leader id) that push overlapping stacks of OPPOSING sides apart so both badges stay readable
 * side by side (horizontal when possible, vertical when that needs less movement). Stacks of one side never overlap (clustered).
 */
export function separateSides(clusters: Cluster[], sideOf: (id: string) => string, w: number, h: number, passes = 3): Map<string, { dx: number; dy: number }> {
  const off = new Map<string, { dx: number; dy: number }>();
  const pos = clusters.map((c) => ({ id: c.leader.id, side: sideOf(c.leader.id), x: c.leader.x, y: c.leader.y }));
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j];
      if (a.side === b.side) continue;
      const dx = b.x - a.x, dy = b.y - a.y, ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax >= w || ay >= h) continue;
      const horiz = (w - ax) / w <= (h - ay) / h;
      if (horiz) { const d = ((w - ax) / 2 + 1) * (dx >= 0 ? 1 : -1); a.x -= d; b.x += d; }
      else { const d = ((h - ay) / 2 + 1) * (dy >= 0 ? 1 : -1); a.y -= d; b.y += d; }
      moved = true;
    }
    if (!moved) break;
  }
  for (let i = 0; i < pos.length; i++) { const dx = pos[i].x - clusters[i].leader.x, dy = pos[i].y - clusters[i].leader.y; if (dx || dy) off.set(pos[i].id, { dx, dy }); }
  return off;
}

const lerpStops = (z: number, stops: [number, number][]): number => {
  if (z <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (z <= stops[i][0]) { const [z0, v0] = stops[i - 1], [z1, v1] = stops[i]; return v0 + ((v1 - v0) * (z - z0)) / (z1 - z0); }
  return stops[stops.length - 1][1];
};
/** Icon scale used by the map layers (must match the icon-size expressions). */
export const ART_SIZE_STOPS: [number, number][] = [[6.5, 0.6], [8, 0.9], [10, 1.1], [12, 1.2]];
export const NATO_SIZE_STOPS: [number, number][] = [[3, 0.42], [6, 0.62], [9, 0.85], [12, 1]];
export const iconScale = (zoom: number): number => (zoom >= 7 ? lerpStops(zoom, ART_SIZE_STOPS) : lerpStops(zoom, NATO_SIZE_STOPS));

/** Overlap box (px) for the current zoom: markers closer than this stack. */
export function overlapBox(zoom: number): { w: number; h: number } {
  // The illustrated cards start fading in at z6.5 (see TacticalMap ART_Z0) and are the larger marker, so from there on
  // the box is the card's (using the art scale, not the NATO one) with a small gap; below it the NATO symbol's.
  if (zoom >= 6.5) { const s = lerpStops(zoom, ART_SIZE_STOPS); return { w: 78 * s, h: 62 * s + 20 }; }
  const s = iconScale(zoom);
  return { w: 50 * s, h: 40 * s + 4 };
}
