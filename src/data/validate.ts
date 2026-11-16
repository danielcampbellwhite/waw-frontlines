import type { BBox, LonLat, NationId, ScenarioDefinition } from '../core/types.ts';

/** Per-fact source references kept beside a scenario (ScenarioDefinition has no per-unit sourceRef field). */
export interface ScenarioSidecar {
  scenarioId: string;
  units: Record<string, { sources: string[]; positionApproximate?: boolean }>;
  locations: Record<string, { sources: string[]; approximate?: boolean }>;
  reinforcements?: Record<string, { sources: string[]; approximate?: boolean }>;
  nations?: Record<string, { sources: string[]; gameScale?: boolean }>;
  objectives?: Record<string, { sources: string[] }>;
  uncertain?: { item: string; note: string }[];
}

const NATIONS: readonly NationId[] = ['GER', 'FRA', 'GBR', 'USA', 'SOV', 'ITA', 'JPN', 'CAN', 'POL', 'BEL', 'NED', 'AUS', 'NZL', 'IND', 'RSA', 'ROU', 'HUN', 'CHN', 'NEUTRAL'];
const SIDES = ['allies', 'axis', 'neutral'];
const UNIT_TYPES = ['infantry', 'armoured', 'mechanised', 'motorised', 'paratroop', 'artillery', 'antitank', 'recon', 'engineer', 'logistics', 'air_fighter', 'air_bomber', 'naval', 'carrier', 'hq'];

export const inBBox = (b: BBox, p: LonLat): boolean => p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north;
const isPos = (p: unknown): p is LonLat => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n));

/**
 * Validate a scenario definition. Returns a list of human-readable errors (empty = valid).
 * Pass the sidecar (`<id>.sources.json`) to additionally require per-unit / per-location source refs.
 */
export function validateScenario(def: ScenarioDefinition, sidecar?: ScenarioSidecar): string[] {
  const errs: string[] = [];
  const e = (m: string) => errs.push(m);
  if (!def || typeof def !== 'object') return ['scenario is not an object'];
  if (def.schema !== 1) e(`schema must be 1 (got ${String(def.schema)})`);
  if (!def.id) e('id missing');
  if (!def.campaignId) e('campaignId missing');
  if (!def.id?.startsWith(def.campaignId + '.')) e(`id '${def.id}' should start with campaignId '${def.campaignId}.'`);
  const b = def.bbox;
  if (!b || !(b.west < b.east) || !(b.south < b.north)) { e('bbox invalid'); return errs; }
  const t0 = Date.parse(def.startDate), t1 = Date.parse(def.endDate);
  if (Number.isNaN(t0) || Number.isNaN(t1)) e('startDate/endDate must be ISO date-times');
  else if (t1 <= t0) e('endDate must be after startDate');
  if (!['short', 'standard', 'grand'].includes(def.scale)) e(`scale invalid: ${def.scale}`);
  if (!def.terrainFile || !def.infraFile) e('terrainFile/infraFile required');
  if (!Array.isArray(def.estimatedPlayMinutes) || def.estimatedPlayMinutes.length !== 2 || def.estimatedPlayMinutes[0] > def.estimatedPlayMinutes[1]) e('estimatedPlayMinutes must be [min,max]');

  // sources
  const sourceIds = new Set<string>();
  if (!Array.isArray(def.sources) || def.sources.length === 0) e('sources[] empty (mandatory)');
  for (const s of def.sources ?? []) {
    if (!s.id || !s.citation) e(`source '${s.id}' needs id and citation`);
    if (sourceIds.has(s.id)) e(`duplicate source id ${s.id}`);
    sourceIds.add(s.id);
  }

  // nations
  const nationIds = new Set<string>();
  for (const n of def.nations ?? []) {
    if (!NATIONS.includes(n.id)) e(`nation '${n.id}' is not a valid NationId`);
    if (nationIds.has(n.id)) e(`duplicate nation ${n.id}`);
    nationIds.add(n.id);
    if (!SIDES.includes(n.side)) e(`nation ${n.id} has invalid side`);
  }
  if (!def.playableNations?.length) e('no playableNations');
  for (const p of def.playableNations ?? []) {
    if (!nationIds.has(p.nation)) e(`playable nation ${p.nation} not in nations[]`);
    else if (!def.nations.find((n) => n.id === p.nation)?.playable) e(`playable nation ${p.nation} not flagged playable in nations[]`);
  }

  // locations
  const locIds = new Set<string>();
  for (const l of def.locations ?? []) {
    if (locIds.has(l.id)) e(`duplicate location id ${l.id}`);
    locIds.add(l.id);
    if (!isPos(l.pos)) e(`location ${l.id} has invalid pos`);
    else if (!inBBox(b, l.pos)) e(`location ${l.id} pos ${l.pos} outside bbox`);
    if (!NATIONS.includes(l.owner) || !NATIONS.includes(l.originalOwner)) e(`location ${l.id} has invalid owner nation`);
    if (l.value < 0 || l.value > 10) e(`location ${l.id} value out of 0..10`);
    if (sidecar && !sidecar.locations[l.id]?.sources?.length) e(`location ${l.id} has no sourceRef in sidecar`);
    for (const k of ['airliftTonsPerDay', 'throughputTonsPerDay', 'throughputTonsPerMonth'] as const) {
      const v = l[k];
      if (v !== undefined && !(Number.isFinite(v) && v > 0)) e(`location ${l.id} ${k} must be a positive number`);
    }
    if (l.besiegedShare !== undefined && !(l.besiegedShare >= 0 && l.besiegedShare <= 1)) e(`location ${l.id} besiegedShare must be within 0..1`);
    if (l.throughputTonsPerDay !== undefined && l.throughputTonsPerMonth !== undefined) e(`location ${l.id} sets both throughputTonsPerDay and throughputTonsPerMonth`);
  }

  // river/lake ice (opt-in; both From and Full required)
  const { iceFromHour: iF, iceFullHour: iU, iceThawHour: iT } = def;
  if (iF !== undefined || iU !== undefined || iT !== undefined) {
    if (iF === undefined || iU === undefined) e('ice fields need both iceFromHour and iceFullHour');
    else {
      if (!(iF >= 0) || !(iU >= iF)) e(`iceFromHour ${iF} must be >= 0 and <= iceFullHour ${iU}`);
      if (iT !== undefined && !(iT > iU)) e(`iceThawHour ${iT} must be after iceFullHour ${iU}`);
    }
  }


  // units
  const unitIds = new Set<string>();
  for (const u of def.units ?? []) {
    if (unitIds.has(u.id)) e(`duplicate unit id ${u.id}`);
    unitIds.add(u.id);
  }
  const checkUnit = (u: ScenarioDefinition['units'][number], where: string) => {
    if (!NATIONS.includes(u.nation)) e(`${where} ${u.id}: invalid nation ${u.nation}`);
    else if (!nationIds.has(u.nation)) e(`${where} ${u.id}: nation ${u.nation} not in nations[]`);
    if (!SIDES.includes(u.side)) e(`${where} ${u.id}: invalid side`);
    if (!UNIT_TYPES.includes(u.type)) e(`${where} ${u.id}: invalid type ${u.type}`);
    if (!isPos(u.pos)) e(`${where} ${u.id}: invalid pos`);
    else if (!inBBox(b, u.pos)) e(`${where} ${u.id}: pos ${u.pos} outside bbox`);
    if (u.homeLocation && !locIds.has(u.homeLocation)) e(`${where} ${u.id}: homeLocation ${u.homeLocation} unknown`);
    if (u.manpower > u.manpowerMax) e(`${where} ${u.id}: manpower exceeds max`);
  };
  for (const u of def.units ?? []) {
    checkUnit(u, 'unit');
    if (u.parentId && !unitIds.has(u.parentId)) e(`unit ${u.id}: parentId ${u.parentId} unknown`);
    if (sidecar && !sidecar.units[u.id]?.sources?.length) e(`unit ${u.id} has no sourceRef in sidecar`);
  }

  // reinforcements
  const reinfIds = new Set<string>();
  for (const r of def.reinforcements ?? []) {
    if (reinfIds.has(r.id)) e(`duplicate reinforcement id ${r.id}`);
    reinfIds.add(r.id);
    if (unitIds.has(r.unit.id)) e(`reinforcement ${r.id}: unit id ${r.unit.id} collides with starting unit`);
    unitIds.add(r.unit.id);
    checkUnit(r.unit, 'reinforcement unit');
    if (r.locationId && !locIds.has(r.locationId)) e(`reinforcement ${r.id}: location ${r.locationId} unknown`);
    if (r.pos && !inBBox(b, r.pos)) e(`reinforcement ${r.id}: pos outside bbox`);
    if (!r.locationId && !r.pos) e(`reinforcement ${r.id}: needs locationId or pos`);
    if (!(r.atMinutes >= 0) || (Number.isFinite(t0) && Number.isFinite(t1) && r.atMinutes > (t1 - t0) / 60000)) e(`reinforcement ${r.id}: atMinutes outside scenario span`);
  }

  // objectives
  const objIds = new Set<string>();
  for (const o of def.objectives ?? []) {
    if (objIds.has(o.id)) e(`duplicate objective id ${o.id}`);
    objIds.add(o.id);
    const c = o.condition;
    if ((c.kind === 'hold_location' || c.kind === 'capture_location') && !locIds.has(c.locationId)) e(`objective ${o.id}: location ${c.locationId} unknown`);
    if (c.kind === 'control_fraction' && (c.fraction <= 0 || c.fraction > 1)) e(`objective ${o.id}: fraction out of (0,1]`);
    if (!['primary', 'secondary', 'strategic'].includes(o.tier)) e(`objective ${o.id}: invalid tier`);
  }
  for (const p of def.playableNations ?? []) for (const id of p.objectiveIds) if (!objIds.has(id)) e(`playable ${p.nation}: objective ${id} unknown`);

  // supply sources, control, weather
  for (const [n, ids] of Object.entries(def.supplySources ?? {})) {
    if (!nationIds.has(n)) e(`supplySources: nation ${n} not in nations[]`);
    for (const id of ids) {
      const loc = def.locations.find((l) => l.id === id);
      if (!loc) e(`supplySources ${n}: location ${id} unknown`);
      else {
        const ownerSide = def.nations.find((x) => x.id === loc.owner)?.side;
        const nSide = def.nations.find((x) => x.id === n)?.side;
        if (loc.owner !== n && (!ownerSide || ownerSide !== nSide)) e(`supplySources ${n}: location ${id} is owned by ${loc.owner}, not the same side, at start`);
      }
    }
    const nat = def.nations.find((x) => x.id === n);
    if (nat && Object.values(nat.resources).some((v) => !(v > 0)) && nat.playable) e(`nation ${n}: playable nation has a zero resource pool`);
  }
  for (const [i, c] of (def.initialControl ?? []).entries()) {
    if (!NATIONS.includes(c.nation)) e(`initialControl[${i}]: invalid nation ${c.nation}`);
    if (!c.polygon || c.polygon.length < 3 || !c.polygon.every(isPos)) e(`initialControl[${i}]: polygon invalid`);
  }
  for (const w of def.weatherProfile ?? []) {
    if (w.month < 1 || w.month > 12) e(`weatherProfile month ${w.month} invalid`);
    const sum = Object.values(w.probs).reduce((a, x) => a + (x ?? 0), 0);
    if (Math.abs(sum - 1) > 0.01) e(`weatherProfile month ${w.month}: probabilities sum to ${sum.toFixed(2)}, expected 1`);
  }

  for (const [side, t] of Object.entries(def.victoryTiers ?? {})) {
    if (!SIDES.includes(side)) e(`victoryTiers: invalid side ${side}`);
    const v = [t.decisive, t.strategic, t.limited, t.stalemate];
    if (v.some((x) => !(x > 0 && x <= 1)) || !(v[0] >= v[1] && v[1] >= v[2] && v[2] >= v[3])) e(`victoryTiers ${side}: need 1 >= decisive >= strategic >= limited >= stalemate > 0`);
  }

  // sidecar cross-check
  if (sidecar) {
    for (const [kind, tbl] of [['units', sidecar.units], ['locations', sidecar.locations]] as const) {
      for (const [id, v] of Object.entries(tbl)) for (const s of v.sources) if (!sourceIds.has(s)) e(`sidecar ${kind} ${id}: unknown source id ${s}`);
    }
    for (const id of Object.keys(sidecar.units)) if (!unitIds.has(id)) e(`sidecar lists unknown unit ${id}`);
  }
  return errs;
}

/** Validate structured historical-event effects (mirrors EffectSpec in src/events/historical.ts) against a scenario. */
export function validateEventEffects(ev: { id: string; effects?: Record<string, unknown>[]; effectsNote?: string }, def: ScenarioDefinition): string[] {
  const errs: string[] = [];
  const err = (m: string) => errs.push(`event ${ev.id}: ${m}`);
  const locs = new Set((def.locations ?? []).map((l) => l.id));
  const nations = new Set((def.nations ?? []).map((n) => n.id as string));
  const unitIds = new Set<string>((def.units ?? []).map((u) => u.id));
  const UTYPES = ['infantry', 'armoured', 'mechanised', 'motorised', 'paratroop', 'artillery', 'antitank', 'recon', 'engineer', 'logistics', 'air_fighter', 'air_bomber', 'naval', 'carrier', 'hq'];
  const STATS = ['morale', 'organisation', 'fuel', 'ammo', 'supply', 'fatigue', 'entrenchment', 'experience', 'readiness'];
  const RES = ['manpower', 'fuel', 'ammo', 'equipment', 'supplyPoints'];
  const WEATHER = ['clear', 'cloud', 'rain', 'storm', 'snow', 'fog', 'mud', 'sandstorm'];
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const nat = (v: unknown) => typeof v === 'string' && nations.has(v);
  const loc = (v: unknown) => typeof v === 'string' && locs.has(v);
  const side = (v: unknown) => v === 'axis' || v === 'allies';
  const filter = (fx: Record<string, unknown>) => {
    if (fx.nation !== undefined && !nat(fx.nation)) err(`${fx.op} nation ${String(fx.nation)} not in scenario`);
    if (fx.side !== undefined && !side(fx.side)) err(`${fx.op} side invalid`);
    if (fx.unitTypes !== undefined && !(Array.isArray(fx.unitTypes) && fx.unitTypes.every((t) => UTYPES.includes(t as string)))) err(`${fx.op} unitTypes invalid`);
    if (fx.unitIds !== undefined && !(Array.isArray(fx.unitIds) && fx.unitIds.every((u) => unitIds.has(u as string)))) err(`${fx.op} unitIds contain an unknown unit`);
  };
  const list = ev.effects ?? [];
  if (!Array.isArray(list)) { err('effects must be an array'); return errs; }
  if (ev.effectsNote && list.length === 0) err('effectsNote present but no effects');
  if (list.length && !ev.effectsNote) err('effects present without an effectsNote');
  for (const fx of list) {
    switch (fx.op) {
      case 'resource': if (!nat(fx.nation) || !RES.includes(fx.key as string) || !num(fx.delta)) err('resource needs nation, key, delta'); break;
      case 'unit_stat': filter(fx); if (!STATS.includes(fx.stat as string) || !num(fx.delta)) err('unit_stat needs stat, delta'); break;
      case 'unit_manpower': filter(fx); if (!num(fx.fraction)) err('unit_manpower needs fraction'); break;
      case 'location_owner': if (!loc(fx.locationId) || !nat(fx.owner)) err('location_owner needs a known locationId and owner'); break;
      case 'location_damage': if (!loc(fx.locationId) || !num(fx.delta)) err('location_damage needs a known locationId and delta'); break;
      case 'weather': if (!WEATHER.includes(fx.kind as string)) err('weather needs a valid kind'); break;
      case 'reinforce': if (!nat(fx.nation)) err('reinforce needs nation'); if (fx.locationId !== undefined && !loc(fx.locationId)) err('reinforce locationId unknown'); break;
      case 'port_relief': if (!loc(fx.locationId)) err(`port_relief needs a locationId that exists in the scenario (got ${String(fx.locationId)})`); if (fx.on !== undefined && typeof fx.on !== 'boolean') err('port_relief on must be boolean'); break;
      case 'log': if (typeof fx.text !== 'string' || !fx.text) err('log needs text'); break;
      default: err(`unknown effect op ${String(fx.op)}`);
    }
  }
  return errs;
}
