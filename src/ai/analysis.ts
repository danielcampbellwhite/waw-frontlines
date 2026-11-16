/**
 * Front analysis from the territorial control raster: front segments, sectors, salients/pockets,
 * and per-sector threat / opportunity figures.
 */
import { bearingDeg } from '../core/geo';
import type { ControlGrid, GameState, LocationId, LonLat, NationId, SideId, Unit } from '../core/types';
import type { Contact } from './perception';
import { fastKm, sideOfNation, unitPower } from './model';

export interface ClassGrid {
  g: ControlGrid;
  /** 0 other/neutral, 1 = own side, 2 = enemy side */
  cls: Uint8Array;
}

export function buildClassGrid(state: Readonly<GameState>, mySide: SideId): ClassGrid {
  const g = state.control;
  const pal = g.nations.map((n: NationId) => {
    const s = sideOfNation(state, n);
    return s === mySide ? 1 : s === 'neutral' ? 0 : 2;
  });
  const cls = new Uint8Array(g.cols * g.rows);
  for (let i = 0; i < cls.length; i++) cls[i] = pal[g.owner[i]] ?? 0;
  return { g, cls };
}

function cellOfPos(cg: ClassGrid, p: LonLat): number {
  const g = cg.g;
  const c = Math.floor((p[0] - g.bbox.west) / g.cellDeg);
  const r = Math.floor((g.bbox.north - p[1]) / g.cellDeg);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return -1;
  return r * g.cols + c;
}

/** 0 neutral/unknown/outside, 1 own side, 2 enemy side. */
export function classAt(cg: ClassGrid, p: LonLat): number {
  const i = cellOfPos(cg, p);
  return i < 0 ? 0 : cg.cls[i];
}

export interface Sector {
  id: number;
  /** centroid of own-side front cells */
  anchor: LonLat;
  /** centroid of enemy-side front cells facing this sector (null if none) */
  enemyAnchor: LonLat | null;
  /** bearing from our line toward the enemy (deg) */
  enemyDir: number;
  cells: number;
  ownPower: number;
  enemyPower: number;
  ratio: number;
  /** enemy bulges protruding into our territory (counterattack opportunities) */
  enemySalient: LonLat | null;
  /** our bulges protruding into theirs (vulnerable) */
  ownSalient: LonLat | null;
  valueOwn: number;
  valueEnemy: number;
  threat: number;
  opportunity: number;
}

export interface FrontAnalysis {
  sectors: Sector[];
  ownCentroid: LonLat | null;
  enemyCentroid: LonLat | null;
  ownSalientCells: Set<number>;
  cg: ClassGrid;
}

const SECTOR_KM = 70;

export function analyseFront(
  state: Readonly<GameState>, cg: ClassGrid, mine: Unit[], contacts: Contact[], mySide: SideId,
  weights: Record<LocationId, number>,
): FrontAnalysis {
  const { g, cls } = cg;
  const { cols, rows } = g;
  const cellKm = g.cellDeg * 111.195;
  const bin = Math.max(2, Math.round(SECTOR_KM / Math.max(1, cellKm)));
  const bcols = Math.ceil(cols / bin);

  interface Acc { n: number; sx: number; sy: number; dx: number; dy: number; en: number; ex: number; ey: number; esN: number; esx: number; esy: number; osN: number; osx: number; osy: number }
  const accs = new Map<number, Acc>();
  const get = (key: number): Acc => {
    let a = accs.get(key);
    if (!a) { a = { n: 0, sx: 0, sy: 0, dx: 0, dy: 0, en: 0, ex: 0, ey: 0, esN: 0, esx: 0, esy: 0, osN: 0, osx: 0, osy: 0 }; accs.set(key, a); }
    return a;
  };
  const ownSalientCells = new Set<number>();

  // integral images of the two side classes: windowed dominance in O(1) per front cell
  const stride = cols + 1;
  const I1 = new Int32Array(stride * (rows + 1)), I2 = new Int32Array(stride * (rows + 1));
  for (let r = 0; r < rows; r++) {
    let r1 = 0, r2 = 0;
    for (let c = 0; c < cols; c++) {
      const k = cls[r * cols + c];
      if (k === 1) r1++; else if (k === 2) r2++;
      I1[(r + 1) * stride + c + 1] = I1[r * stride + c + 1] + r1;
      I2[(r + 1) * stride + c + 1] = I2[r * stride + c + 1] + r2;
    }
  }
  const box = (I: Int32Array, c0: number, r0: number, c1: number, r1: number): number =>
    I[(r1 + 1) * stride + c1 + 1] - I[r0 * stride + c1 + 1] - I[(r1 + 1) * stride + c0] + I[r0 * stride + c0];

  const west = g.bbox.west, north = g.bbox.north, cd = g.cellDeg;
  let oc = 0, ox = 0, oy = 0, ec = 0, ex = 0, ey = 0;
  const W = 3;
  for (let r = 0; r < rows; r++) {
    const py = north - (r + 0.5) * cd;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const k = cls[i];
      if (k === 0) continue;
      const px = west + (c + 0.5) * cd;
      if (k === 1) { oc++; ox += px; oy += py; } else { ec++; ex += px; ey += py; }
      // front: 4-neighbour of the opposite class
      let dxs = 0, dys = 0, opp = 0;
      if (c + 1 < cols) { const kn = cls[i + 1]; if (kn !== 0 && kn !== k) { opp++; dxs += 1; } }
      if (c > 0) { const kn = cls[i - 1]; if (kn !== 0 && kn !== k) { opp++; dxs -= 1; } }
      if (r + 1 < rows) { const kn = cls[i + cols]; if (kn !== 0 && kn !== k) { opp++; dys -= 1; } }
      if (r > 0) { const kn = cls[i - cols]; if (kn !== 0 && kn !== k) { opp++; dys += 1; } }
      if (opp === 0) continue;
      const key = Math.floor(r / bin) * bcols + Math.floor(c / bin);
      const a = get(key);
      const c0 = Math.max(0, c - W), c1 = Math.min(cols - 1, c + W), r0 = Math.max(0, r - W), r1 = Math.min(rows - 1, r + W);
      const n1 = box(I1, c0, r0, c1, r1), n2 = box(I2, c0, r0, c1, r1);
      const tot = n1 + n2, same = k === 1 ? n1 : n2;
      const frac = tot > 0 ? same / tot : 1;
      if (k === 1) {
        a.n++; a.sx += px; a.sy += py; a.dx += dxs; a.dy += dys;
        if (frac <= 0.38) { a.osN++; a.osx += px; a.osy += py; ownSalientCells.add(i); }
      } else {
        a.en++; a.ex += px; a.ey += py;
        if (frac <= 0.38) { a.esN++; a.esx += px; a.esy += py; }
      }
    }
  }

  const sectors: Sector[] = [];
  let id = 0;
  const keys = [...accs.keys()].sort((a, b) => a - b);
  for (const key of keys) {
    const a = accs.get(key)!;
    if (a.n === 0) continue; // sectors are anchored on our own line
    const anchor: LonLat = [a.sx / a.n, a.sy / a.n];
    const enemyAnchor: LonLat | null = a.en > 0 ? [a.ex / a.en, a.ey / a.en] : null;
    let enemyDir: number;
    if (a.dx !== 0 || a.dy !== 0) {
      enemyDir = ((Math.atan2(a.dx, a.dy) * 180) / Math.PI + 360) % 360;
    } else if (enemyAnchor) enemyDir = bearingDeg(anchor, enemyAnchor);
    else enemyDir = 0;
    sectors.push({
      id: id++, anchor, enemyAnchor, enemyDir, cells: a.n, ownPower: 0, enemyPower: 0, ratio: 1,
      enemySalient: a.esN >= 2 ? [a.esx / a.esN, a.esy / a.esN] : null,
      ownSalient: a.osN >= 2 ? [a.osx / a.osN, a.osy / a.osN] : null,
      valueOwn: 0, valueEnemy: 0, threat: 0, opportunity: 0,
    });
  }

  // per-sector balance
  const living = mine.filter((u) => unitPower(u) > 0);
  for (const s of sectors) {
    for (const u of living) if (fastKm(u.pos, s.anchor) <= SECTOR_KM * 1.2) s.ownPower += unitPower(u);
    for (const c of contacts) if (fastKm(c.pos, s.anchor) <= SECTOR_KM * 1.2) s.enemyPower += c.power * c.conf;
    s.ratio = (s.ownPower + 0.15) / (s.enemyPower + 0.15);
    for (const lid in state.locations) {
      const l = state.locations[lid];
      if (fastKm(l.pos, s.anchor) > SECTOR_KM * 1.3) continue;
      const w = (weights[lid] ?? 1) * l.value;
      const ls = sideOfNation(state, l.owner);
      if (ls === mySide) s.valueOwn += w; else if (ls !== 'neutral') s.valueEnemy += w;
    }
    s.threat = s.enemyPower * (1 + (s.enemySalient ? 0.1 : 0)) + s.valueOwn * 0.04;
    s.opportunity = s.ratio * (1 + s.valueEnemy * 0.05) * (s.enemySalient ? 1.25 : 1);
  }

  return {
    sectors,
    ownCentroid: oc ? [ox / oc, oy / oc] : null,
    enemyCentroid: ec ? [ex / ec, ey / ec] : null,
    ownSalientCells,
    cg,
  };
}

export function inOwnSalient(fa: FrontAnalysis, p: LonLat): boolean {
  const i = cellOfPos(fa.cg, p);
  if (i < 0) return false;
  if (fa.ownSalientCells.has(i)) return true;
  const g = fa.cg.g;
  const c = i % g.cols, r = Math.floor(i / g.cols);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const cc = c + dc, rr = r + dr;
    if (cc >= 0 && rr >= 0 && cc < g.cols && rr < g.rows && fa.ownSalientCells.has(rr * g.cols + cc)) return true;
  }
  return false;
}
