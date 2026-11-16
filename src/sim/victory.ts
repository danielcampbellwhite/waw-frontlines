import type { Ending, GameState, Objective, SideId, Unit } from '../core/types';
import { Terrain } from '../core/types';
import { cellCenter, gridSpec, inBBox } from '../core/geo';
import type { SimContext } from './context';
import { activeModules } from './special';

const sideOf = (state: GameState, n: string): SideId => state.nations[n]?.side ?? 'neutral';
const gone = (u: Unit) => !!u.destroyed || !!u.surrendered;

const endCache = new WeakMap<object, number>();
export function scenarioEndMinutes(ctx: SimContext): number {
  let v = endCache.get(ctx.scenario);
  if (v === undefined) { v = Math.round((Date.parse(ctx.scenario.endDate) - Date.parse(ctx.scenario.startDate)) / 60_000); endCache.set(ctx.scenario, v); }
  return v;
}

/** Land cell indices (optionally within a region) per terrain raster; static for a scenario, so computed once. */
const landCache = new WeakMap<object, Map<string, Int32Array>>();
function landCells(state: GameState, ctx: SimContext, region?: { west: number; south: number; east: number; north: number }): Int32Array {
  let m = landCache.get(ctx.terrain.cells);
  if (!m) { m = new Map(); landCache.set(ctx.terrain.cells, m); }
  const key = region ? `${region.west},${region.south},${region.east},${region.north}` : '*';
  let a = m.get(key);
  if (a) return a;
  const c = state.control, spec = gridSpec(c.bbox, c.cellDeg);
  const out: number[] = [];
  for (let i = 0; i < c.owner.length; i++) {
    const t = ctx.terrain.cells[i];
    if (t === Terrain.Sea || t === Terrain.Lake) continue;
    if (region && !inBBox(cellCenter(spec, i % c.cols, (i / c.cols) | 0), region)) continue;
    out.push(i);
  }
  a = Int32Array.from(out);
  m.set(key, a);
  return a;
}

/** Fraction of land cells (optionally inside region) owned by nations of `side`. */
function controlFraction(state: GameState, ctx: SimContext, side: SideId, region?: { west: number; south: number; east: number; north: number }): number {
  const c = state.control;
  const palMine = c.nations.map((n) => sideOf(state, n) === side);
  const cells = landCells(state, ctx, region);
  let mine = 0;
  for (let k = 0; k < cells.length; k++) if (palMine[c.owner[cells[k]]]) mine++;
  return cells.length ? mine / cells.length : 0;
}

function evaluateObjective(state: GameState, ctx: SimContext, o: Objective): void {
  if (o.status !== 'pending') return;
  const t = state.clock.minutes;
  const cond = o.condition;
  let result: 'achieved' | 'failed' | 'pending' | undefined;
  switch (cond.kind) {
    case 'capture_location': {
      const l = state.locations[cond.locationId];
      if (!l) break;
      if (sideOf(state, l.owner) === o.side && sideOf(state, l.originalOwner) !== o.side) result = 'achieved';
      break;
    }
    case 'hold_location': {
      const l = state.locations[cond.locationId];
      if (!l) break;
      if (sideOf(state, l.owner) !== o.side) result = 'failed';
      else if (cond.untilMinutes !== undefined && t >= cond.untilMinutes) result = 'achieved';
      break;
    }
    case 'control_fraction':
      if (Math.floor(t / 60) % 3 === 0 && controlFraction(state, ctx, o.side, cond.region) >= cond.fraction) result = 'achieved';
      break;
    case 'destroy_units': {
      let total = 0, dead = 0;
      for (const id in state.units) { const u = state.units[id]; if (u.side !== cond.side) continue; total++; if (gone(u)) dead++; }
      if (total > 0 && dead / total >= cond.fraction) result = 'achieved';
      break;
    }
    case 'survive_until':
      if (t >= cond.minutes && !playerEliminated(state, o.side)) result = 'achieved';
      break;
    case 'custom':
      for (const m of activeModules(ctx)) {
        if (m.evaluate) { const r = m.evaluate(cond.script, o, state, ctx); if (r) { result = r; break; } }
      }
      break;
  }
  if (result === 'achieved' || result === 'failed') {
    o.status = result;
    if (result === 'achieved') o.achievedAt = t;
    ctx.log({ category: 'objective', severity: result === 'achieved' ? 'info' : 'warn', text: `Objective ${result}: ${o.title}` });
    state.history.push({ t, text: `Objective ${result}: ${o.title}` });
  }
}

function playerEliminated(state: GameState, side: SideId): boolean {
  let any = false;
  for (const id in state.units) {
    const u = state.units[id];
    if (u.side === side && !gone(u) && u.domain === 'land' && u.type !== 'hq' && u.type !== 'logistics') { any = true; break; }
  }
  if (any) return false;
  // reinforcements still to arrive keep a side alive
  for (const n in state.nations) if (state.nations[n].side === side && state.nations[n].reinforcements.some((r) => !r.arrived)) return false;
  return true;
}

const DEFAULT_TIERS = { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 };

export function computeEnding(state: GameState, side: SideId, timeUp: boolean, ctx: SimContext): { ending: Ending; score: number; summary: string } {
  const mine = state.objectives.filter((o) => o.side === side);
  const pts = (l: Objective[], s?: Objective['status']) => l.filter((o) => !s || o.status === s).reduce((a, o) => a + o.points, 0);
  const score = pts(mine, 'achieved');
  const maxScore = pts(mine) || 1;
  const t = ctx.scenario.victoryTiers?.[side] ?? DEFAULT_TIERS;
  const frac = score / maxScore;
  let ending: Ending;
  if (playerEliminated(state, side)) ending = 'defeat';
  else if (frac >= t.decisive) ending = 'decisive_victory';
  else if (frac >= t.strategic) ending = 'strategic_victory';
  else if (frac >= t.limited) ending = 'limited_victory';
  else if (frac >= t.stalemate) ending = 'stalemate';
  else ending = 'defeat';
  const done = mine.filter((o) => o.status === 'achieved').length;
  const summary = `${done} of ${mine.length} objectives achieved (${score}/${maxScore} points, ${Math.round(frac * 100)}%).` +
    (timeUp ? ' The campaign reached its end date.' : '');
  return { ending, score, summary };
}

/** Step 12: evaluate objectives; end the campaign when time is up, the player's primaries are all resolved, or they are eliminated. */
export function checkVictory(state: GameState, ctx: SimContext): void {
  if (state.result) return;
  for (const o of state.objectives) evaluateObjective(state, ctx, o);
  const side = state.playerSide;
  const t = state.clock.minutes;
  const timeUp = t >= scenarioEndMinutes(ctx);
  const prim = state.objectives.filter((o) => o.side === side && o.tier === 'primary');
  const primDone = prim.length > 0 && prim.every((o) => o.status !== 'pending');
  const eliminated = playerEliminated(state, side);
  // A resolved set of primary objectives only ends the campaign early when that is genuinely decisive: every primary achieved
  // with a strategic-or-better score, or at least half the scenario has been played. A single early failure (e.g. a hold line
  // lost on day 3) or a quick capture must not cut a long campaign short; objectives still pending keep it going.
  const mineAll = state.objectives.filter((o) => o.side === side);
  const allResolved = mineAll.length > 0 && mineAll.every((o) => o.status !== 'pending');
  let earlyOk = false;
  if (primDone && !timeUp && !eliminated) {
    const total = scenarioEndMinutes(ctx);
    const allAchieved = prim.every((o) => o.status === 'achieved');
    const e = computeEnding(state, side, false, ctx).ending;
    earlyOk = allResolved || t >= 0.5 * total || (allAchieved && (e === 'decisive_victory' || e === 'strategic_victory'));
  }
  if (!(timeUp || eliminated || earlyOk)) return;
  if (timeUp) {
    // objectives that merely required surviving/holding to the end
    for (const o of state.objectives) {
      if (o.status === 'pending' && o.condition.kind === 'hold_location' && o.condition.untilMinutes === undefined) {
        const l = state.locations[o.condition.locationId];
        if (l && sideOf(state, l.owner) === o.side) { o.status = 'achieved'; o.achievedAt = t; }
      }
    }
  }
  const e = computeEnding(state, side, timeUp && !primDone, ctx);
  state.result = { ending: e.ending, score: e.score, endedAt: t, summary: e.summary };
  ctx.log({ category: 'objective', severity: 'critical', text: `Campaign over: ${e.ending.replace(/_/g, ' ')}. ${e.summary}` });
  state.history.push({ t, text: `Campaign ended: ${e.ending.replace(/_/g, ' ')} (${e.score} points).` });
}

