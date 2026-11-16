import type { GameState, LonLat, NationId, SideId, Unit, UnitType } from '../core/types';
import { Terrain, TICK_MINUTES } from '../core/types';
import { bearingDeg, cellCenter, cellOf, gridSpec } from '../core/geo';
import type { SimContext } from './context';
import { SUPPLY_EVERY_TICKS } from './constants';
import { fastKm } from './gridutil';
import { getSimMeta } from './meta';
import { SpatialHash } from './spatial';

const alive = (u: Unit) => !u.destroyed && !u.surrendered;
const isWater = (t: number) => t === Terrain.Sea || t === Terrain.Lake;

/** Influence radius (km) and weight by unit type. */
const INFLUENCE: Partial<Record<UnitType, [radiusKm: number, weight: number]>> = {
  infantry: [9, 1], paratroop: [8, 0.8], armoured: [14, 1.3], mechanised: [12, 1.1], motorised: [11, 0.9], recon: [10, 0.5],
  artillery: [6, 0.5], antitank: [6, 0.6], engineer: [5, 0.5], hq: [4, 0.2], logistics: [3, 0.15],
};
const T_CLAIM = 0.15;
const T_FLIP = 0.35;
const FLIP_RATIO = 1.6;
const CAPTURE_RADIUS_KM = 4;
/** Only real fighting troops can take or hold ground. */
const CAN_CAPTURE: Partial<Record<UnitType, true>> = { infantry: true, armoured: true, mechanised: true, motorised: true, paratroop: true, engineer: true, antitank: true, artillery: true };
/** Force required (thousand effective men) and hold time (ticks = game hours) scale with the location's value. */
export const captureForceNeeded = (value: number) => 1.5 + 0.5 * value;
export const captureTicksNeeded = (value: number) => (value >= 8 ? 24 + (value - 8) * 6 : Math.round(2 + value * 2.5));
const effForce = (u: Unit) => (Math.max(0, u.manpower) / 1000) * (0.5 + 0.5 * (u.organisation / 100)) * (0.6 + 0.4 * (u.morale / 100));

export function nationIndex(state: GameState, n: NationId): number {
  const pal = state.control.nations;
  let i = pal.indexOf(n);
  if (i < 0) { pal.push(n); i = pal.length - 1; }
  return i;
}
const sideOfNation = (state: GameState, n: NationId): SideId => state.nations[n]?.side ?? 'neutral';

/** Side owning the territory at p (neutral if unclaimed); null if outside the grid. */
export function ownerSideAt(state: GameState, p: LonLat): SideId | null {
  const c = state.control;
  const cell = cellOf(gridSpec(c.bbox, c.cellDeg), p);
  if (!cell) return null;
  const idx = c.owner[cell[1] * c.cols + cell[0]];
  return idx === 0 ? 'neutral' : sideOfNation(state, c.nations[idx]);
}

// scratch buffers (cleared via touched lists; contents never leak between ticks)
interface Scratch { inf: Float32Array[]; best: Float32Array[]; bestNat: Int16Array[]; mark: Uint8Array[]; touched: Int32Array; nTouched: number; seen: Uint8Array }
const scratchCache = new Map<string, Scratch>();
function getScratch(cols: number, rows: number): Scratch {
  const key = cols + 'x' + rows;
  let s = scratchCache.get(key);
  if (!s) {
    const n = cols * rows;
    s = {
      inf: [new Float32Array(n), new Float32Array(n)], best: [new Float32Array(n), new Float32Array(n)],
      bestNat: [new Int16Array(n), new Int16Array(n)], mark: [new Uint8Array(n), new Uint8Array(n)],
      touched: new Int32Array(n), nTouched: 0, seen: new Uint8Array(n),
    };
    scratchCache.set(key, s);
  }
  return s;
}

const NB8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function updateTerritory(state: GameState, ctx: SimContext): void {
  const ctl = state.control;
  const { cols, rows } = ctl;
  const spec = gridSpec(ctl.bbox, ctl.cellDeg);
  const terr = ctx.terrain;
  const sc = getScratch(cols, rows);
  const palSide: SideId[] = ctl.nations.map((n) => sideOfNation(state, n));
  const sideIdx = (s: SideId) => (s === 'allies' ? 0 : s === 'axis' ? 1 : -1);
  const t = Math.floor(state.clock.minutes / TICK_MINUTES);
  const meta = getSimMeta(state);

  // ── 1. unit influence ──
  sc.nTouched = 0;
  sc.seen.fill(0); sc.mark[0].fill(0); sc.mark[1].fill(0);
  const landUnits: Unit[] = [];
  for (const id in state.units) {
    const u = state.units[id];
    if (!alive(u) || u.domain !== 'land') continue;
    landUnits.push(u);
    const si = sideIdx(u.side);
    const inf = INFLUENCE[u.type];
    if (si < 0 || !inf) continue;
    const manFrac = u.manpowerMax > 0 ? Math.min(1, u.manpower / u.manpowerMax) : 1;
    let strength = inf[1] * (0.3 + 0.7 * manFrac) * (0.5 + 0.5 * (u.organisation / 100));
    if (u.moveStatus === 'retreating' || u.combatStatus === 'routed') strength *= 0.3;
    else if (u.moveStatus === 'moving') strength *= 0.8;
    if (strength <= 0.001) continue;
    const natIdx = nationIndex(state, u.nation);
    const home = cellOf(spec, u.pos);
    if (!home) continue;
    sc.mark[si][home[1] * cols + home[0]] = 1;
    const rad = inf[0];
    const kmLon = 111.32 * Math.cos((u.pos[1] * Math.PI) / 180);
    const rc = Math.ceil(rad / (ctl.cellDeg * Math.max(1, kmLon))) + 0;
    const rr = Math.ceil(rad / (ctl.cellDeg * 110.57));
    for (let r = Math.max(0, home[1] - rr); r <= Math.min(rows - 1, home[1] + rr); r++) {
      for (let c = Math.max(0, home[0] - rc); c <= Math.min(cols - 1, home[0] + rc); c++) {
        const i = r * cols + c;
        if (isWater(terr.cells[i] ?? 0)) continue;
        const cc = cellCenter(spec, c, r);
        const d = fastKm(cc, u.pos);
        let w = d >= rad ? 0 : 1 - d / rad;
        if (c === home[0] && r === home[1]) w = Math.max(w, 0.7);
        if (w <= 0) continue;
        const v = strength * w;
        if (!sc.seen[i]) { sc.seen[i] = 1; sc.touched[sc.nTouched++] = i; sc.inf[0][i] = 0; sc.inf[1][i] = 0; sc.best[0][i] = 0; sc.best[1][i] = 0; }
        sc.inf[si][i] += v;
        if (v > sc.best[si][i]) { sc.best[si][i] = v; sc.bestNat[si][i] = natIdx; }
      }
    }
  }

  // ── 2. flips (computed against pre-tick ownership, then applied) ──
  const flips: number[] = []; // pairs: cell, newOwnerIdx
  const changedCells: number[] = [];
  const bothCells = new Set<number>();
  for (let k = 0; k < sc.nTouched; k++) {
    const i = sc.touched[k];
    const ia = sc.inf[0][i], ix = sc.inf[1][i];
    if (ia > 0.05 && ix > 0.05) bothCells.add(i);
    const o = ctl.owner[i];
    const so = palSide[o] ?? 'neutral';
    let winner = -1;
    if (so === 'neutral') {
      if (ia > T_CLAIM && ix < 0.3 * ia) winner = 0;
      else if (ix > T_CLAIM && ia < 0.3 * ix) winner = 1;
    } else {
      const own = so === 'allies' ? 0 : 1;
      const oppI = 1 - own;
      const oi = oppI === 0 ? ia : ix, wi = own === 0 ? ia : ix;
      if (oi >= T_FLIP && oi > FLIP_RATIO * wi) winner = oppI;
    }
    if (winner < 0) continue;
    // connectivity: a unit of the winner stands in/next to the cell, or an adjacent cell already belongs to the winner's side
    const c = i % cols, r = (i / cols) | 0;
    let connected = sc.mark[winner][i] === 1;
    for (let n = 0; n < 8 && !connected; n++) {
      const nc = c + NB8[n][0], nr = r + NB8[n][1];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (sc.mark[winner][ni] === 1) connected = true;
      else if (palSide[ctl.owner[ni]] === (winner === 0 ? 'allies' : 'axis')) connected = true;
    }
    if (!connected) continue;
    flips.push(i, sc.bestNat[winner][i]);
  }
  for (let k = 0; k < flips.length; k += 2) {
    ctl.owner[flips[k]] = flips[k + 1];
    changedCells.push(flips[k]);
  }
  // contested values
  for (let i = 0; i < ctl.contested.length; i++) if (ctl.contested[i] > 0 && !bothCells.has(i)) ctl.contested[i] = Math.max(0, ctl.contested[i] - 10);
  for (const i of bothCells) {
    const ia = sc.inf[0][i], ix = sc.inf[1][i];
    ctl.contested[i] = Math.round((100 * Math.min(ia, ix)) / (ia + ix));
  }

  // ── 3. location capture by occupation ──
  if (landUnits.length) {
    const midLat = (terr.bbox.north + terr.bbox.south) / 2;
    const hash = new SpatialHash<Unit>(CAPTURE_RADIUS_KM, midLat);
    for (const u of landUnits) if (u.side !== 'neutral' && u.type !== 'logistics') hash.insert(u, u.pos);
    for (const lid in state.locations) {
      const loc = state.locations[lid];
      const ownerSide = sideOfNation(state, loc.owner);
      let own = false, occ: Unit | undefined;
      let occMass = 0;
      const force: Record<string, number> = {};
      hash.query(loc.pos, CAPTURE_RADIUS_KM, (u) => {
        if (fastKm(u.pos, loc.pos) > CAPTURE_RADIUS_KM) return;
        if (!CAN_CAPTURE[u.type] || u.combatStatus === 'routed' || u.moveStatus === 'retreating') return;
        if (ownerSide !== 'neutral' && u.side === ownerSide) own = true;
        else if (ownerSide === 'neutral' || u.side !== ownerSide) {
          const m = u.manpower;
          force[u.side] = (force[u.side] ?? 0) + effForce(u);
          if (!occ || m > occMass) { occ = u; occMass = m; }
        }
      });
      if (occ && !own && (force[(occ as Unit).side] ?? 0) >= captureForceNeeded(loc.value)) {
        const o = meta.occupy[lid];
        if (o && o.nation === occ.nation) o.ticks++;
        else meta.occupy[lid] = { nation: occ.nation, ticks: 1 };
        if (meta.occupy[lid].ticks >= captureTicksNeeded(loc.value) && occ.nation !== loc.owner) {
          const prev = loc.owner;
          loc.owner = occ.nation;
          delete meta.occupy[lid];
          const txt = `${state.nations[occ.nation]?.name ?? occ.nation} forces captured ${loc.name} from ${state.nations[prev]?.name ?? prev}.`;
          ctx.log({ category: 'battle', severity: 'warn', pos: loc.pos, text: txt });
          state.history.push({ t: state.clock.minutes, text: txt });
        }
      } else if (meta.occupy[lid]) delete meta.occupy[lid];
    }
  }
  // locations anchor the cell they stand in
  for (const lid in state.locations) {
    const loc = state.locations[lid];
    const cell = cellOf(spec, loc.pos);
    if (!cell) continue;
    const i = cell[1] * cols + cell[0];
    const want = nationIndex(state, loc.owner);
    if (ctl.owner[i] !== want && !isWater(terr.cells[i] ?? 0)) { ctl.owner[i] = want; changedCells.push(i); }
  }

  // ── 4. isolation / encirclement ──
  if (t % SUPPLY_EVERY_TICKS === 0) updateIsolation(state, ctx, landUnits, spec);

  { const keep = new Set(state.reports.slice(-30).map((r) => r.id)); for (const id of Object.keys(meta.gains)) if (!keep.has(id)) delete meta.gains[id]; }
  // ── 5. attribute territory change to recent battle reports ──
  if (changedCells.length && state.reports.length) {
    const centres = changedCells.map((i) => ({ p: cellCenter(spec, i % cols, (i / cols) | 0), nat: ctl.nations[ctl.owner[i]] }));
    for (let k = state.reports.length - 1, seen = 0; k >= 0 && seen < 20; k--, seen++) {
      const rep = state.reports[k];
      if (rep.endedAt < state.clock.minutes - 12 * TICK_MINUTES) break;
      const gained: Record<string, number> = {};
      for (const c of centres) if (fastKm(c.p, rep.pos) < 40) { rep.territoryChangeCells++; gained[c.nat] = (gained[c.nat] ?? 0) + 1; }
      // owner = nation with the most cells gained in total for this report (earlier gains tracked in the sim meta)
      const acc = (meta.gains[rep.id] ??= {});
      for (const n in gained) acc[n] = (acc[n] ?? 0) + gained[n];
      let best: string | undefined, bn = 0;
      for (const n of Object.keys(acc).sort()) if (acc[n] > bn) { bn = acc[n]; best = n; }
      if (best && best !== 'NEUTRAL') rep.territoryChangeOwner = best as NationId;
    }
  }
}

// ───────────────────────── isolation ─────────────────────────

function updateIsolation(state: GameState, ctx: SimContext, landUnits: Unit[], spec: ReturnType<typeof gridSpec>): void {
  const meta = getSimMeta(state);
  const ctl = state.control;
  const { cols, rows } = ctl;
  const cutNow: string[] = [];
  // palette index -> side code (0 neutral, 1 allies, 2 axis), resolved once instead of per neighbour per cell
  const palCode = new Int8Array(ctl.nations.length);
  for (let k = 0; k < palCode.length; k++) { const s = k === 0 ? 'neutral' : sideOfNation(state, ctl.nations[k]); palCode[k] = s === 'allies' ? 1 : s === 'axis' ? 2 : 0; }
  const tcells = ctx.terrain.cells, owner = ctl.owner;
  const enemyHash: Record<string, SpatialHash<Unit>> = {};
  const midLat = (ctx.terrain.bbox.north + ctx.terrain.bbox.south) / 2;
  for (const s of ['allies', 'axis'] as SideId[]) enemyHash[s] = new SpatialHash<Unit>(25, midLat);
  for (const u of landUnits) if (u.side === 'allies' || u.side === 'axis') enemyHash[u.side].insert(u, u.pos);

  for (const side of ['allies', 'axis'] as SideId[]) {
    const sources: number[] = [];
    for (const nat in ctx.scenario.supplySources) {
      if (state.nations[nat]?.side !== side) continue;
      for (const lid of ctx.scenario.supplySources[nat]) {
        const loc = state.locations[lid];
        if (!loc || sideOfNation(state, loc.owner) !== side) continue;
        const c = cellOf(spec, loc.pos);
        if (c) sources.push(c[1] * cols + c[0]);
      }
    }
    const mine = landUnits.filter((u) => u.side === side);
    if (!mine.length) continue;
    const enemySide: SideId = side === 'allies' ? 'axis' : 'allies';
    if (!ctx.scenario.supplySources || Object.keys(ctx.scenario.supplySources).length === 0) {
      // no supply model for this scenario: nobody is "cut off"
      for (const u of mine) clearEncircled(u);
      continue;
    }
    // layered BFS: own/neutral ground costs 0, enemy-held ground costs 1, reach limited to 2
    const enemyCode = enemySide === 'allies' ? 1 : 2;
    const dist = bfsScratch(cols * rows).dist;
    dist.fill(-1);
    const water = waterMask(tcells);
    const bq = bfsScratch(cols * rows);
    let level = bq.a, next = bq.b, nLevel = 0;
    for (const s of sources) if (dist[s] < 0) { dist[s] = 0; level[nLevel++] = s; }
    for (let d = 0; d <= 2; d++) {
      let nNext = 0;
      for (let q = 0; q < nLevel; q++) {
        const i = level[q];
        const c = i % cols, r = (i / cols) | 0;
        const r0 = r > 0 ? -1 : 0, r1 = r < rows - 1 ? 1 : 0, c0 = c > 0 ? -1 : 0, c1 = c < cols - 1 ? 1 : 0;
        for (let dr = r0; dr <= r1; dr++) {
          for (let dc = c0; dc <= c1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const ni = i + dr * cols + dc;
            if (dist[ni] >= 0 || water[ni]) continue;
            if (palCode[owner[ni]] === enemyCode) {
              if (d + 1 > 2) continue;
              dist[ni] = d + 1; next[nNext++] = ni;
            } else { dist[ni] = d; level[nLevel++] = ni; }
          }
        }
      }
      const tmp = level; level = next; next = tmp; nLevel = nNext;
    }
    for (const u of mine) {
      const c = cellOf(spec, u.pos);
      const connected = !!c && dist[c[1] * cols + c[0]] >= 0;
      if (connected) { clearEncircled(u); continue; }
      cutNow.push(u.id);
      // encircled when enemy troops are on at least 3 of 4 sides within 25 km
      const quad = [false, false, false, false];
      enemyHash[enemySide].query(u.pos, 25, (e) => {
        if (e.side !== enemySide || fastKm(e.pos, u.pos) > 25) return;
        const b = bearingDeg(u.pos, e.pos);
        quad[Math.floor(((b + 45) % 360) / 90)] = true;
      });
      const enc = quad.filter(Boolean).length >= 3;
      if (enc) { u.encircled = true; if (!u.inBattle && u.combatStatus !== 'routed') u.combatStatus = 'encircled'; }
      else clearEncircled(u);
    }
  }
  // merge with entries other modules may have written (we only manage our own previous list)
  const prev = new Set(meta.isolated);
  const out: string[] = [];
  const seenId = new Set<string>();
  for (const id of state.supply.cutOffUnits) if (!prev.has(id) && !seenId.has(id) && state.units[id] && alive(state.units[id])) { seenId.add(id); out.push(id); }
  for (const id of cutNow) if (!seenId.has(id)) { seenId.add(id); out.push(id); }
  state.supply.cutOffUnits = out;
  meta.isolated = cutNow;
}

const bfsCache = new Map<number, { dist: Int8Array; a: Int32Array; b: Int32Array }>();
function bfsScratch(n: number) {
  let s = bfsCache.get(n);
  if (!s) { s = { dist: new Int8Array(n), a: new Int32Array(n), b: new Int32Array(n) }; bfsCache.set(n, s); }
  return s;
}
const waterCache = new WeakMap<object, Uint8Array>();
function waterMask(cells: ArrayLike<number> & object): Uint8Array {
  let m = waterCache.get(cells);
  if (!m) { m = new Uint8Array(cells.length); for (let i = 0; i < cells.length; i++) m[i] = isWater(cells[i] ?? 0) ? 1 : 0; waterCache.set(cells, m); }
  return m;
}

function clearEncircled(u: Unit): void {
  if (u.encircled) u.encircled = false;
  if (u.combatStatus === 'encircled') u.combatStatus = u.inBattle ? 'defending' : 'idle';
}
