/**
 * Per-tick unit statistics: fuel/ammo burn and resupply, fatigue, organisation, morale, experience,
 * entrenchment, replacements from nation pools, readiness derivation. One call = one tick (60 min).
 */
import { haversineKm } from '../core/geo';
import type { GameState, Location, Unit } from '../core/types';
import { equipmentDef, templateForType } from './catalog';
import { clamp, isAlive, milSpecial, type MilitaryContext } from './context';
import { AIRLIFT_REFILL_SHARE, isCutOff } from './logistics';

export const FUEL_REFILL_PER_TICK = 15;
/** Fuel delivered per tick to a unit that keeps moving (trucks keep pace, so far less than when halted). */
export const FUEL_REFILL_MOVING_PER_TICK = 6;
export const AMMO_REFILL_PER_TICK = 10;
/**
 * Ammunition: sim/combat already burns ~1.4% (artillery 3%) per battle round; catalog ammoUseCombat is the unit-type
 * share on top, scaled down so a division's basic load lasts about a day of continuous fighting and, with
 * resupply delivered in the line (AMMO_REFILL_COMBAT_PER_TICK), a supplied attack can run for 3+ days.
 */
export const AMMO_BURN_SCALE = 0.4;
export const AMMO_REFILL_COMBAT_PER_TICK = 3.5;
/** Aircraft are serviced slowly at serviceable friendly airfields only (rates are % per tick before supply/condition scaling). */
export const AIR_FUEL_REFILL_PER_TICK = 5;
export const AIR_AMMO_REFILL_PER_TICK = 4;
export const AIR_POOL_COST_MULT = 2;
export const AIRFIELD_RANGE_KM = 10;
/** One replacement aircraft per this many ticks per unit (staggered by unit), drawn from the nation equipment pool. */
export const AIRCRAFT_REPLACEMENT_TICKS = 6;
/** Pool points consumed per 1% of tank/magazine per unit of template.poolWeight. */
export const POOL_COST_PER_PCT = 0.2;
export const REPLACEMENT_MIN_SUPPLY = 40;
export const MANPOWER_REPL_RATE = 0.015;     // of manpowerMax per tick
export const EQUIPMENT_REPL_RATE = 0.03;     // of deficit per tick (min 1)

export function strengthFraction(u: Unit): number {
  return u.manpowerMax > 0 ? clamp(u.manpower / u.manpowerMax, 0, 1) : 1;
}

/** Weighted fraction of authorised equipment held (1 if no establishment). */
export function equipmentFraction(u: Unit): number {
  let have = 0, want = 0;
  for (const [k, auth] of Object.entries(u.equipment.authorised)) {
    if (!(auth > 0)) continue;
    const w = equipmentDef(k).weight;
    want += w * auth;
    have += w * Math.min(auth, u.equipment.held[k] ?? 0);
  }
  return want > 0 ? have / want : 1;
}

export function computeReadiness(u: Unit): number {
  const tpl = templateForType(u.type);
  const str = strengthFraction(u), eq = equipmentFraction(u);
  const supplyComposite = tpl.usesFuel
    ? 0.5 * u.supply + 0.25 * u.fuel + 0.25 * u.ammo
    : 0.65 * u.supply + 0.35 * u.ammo;
  let r = 100 * (0.3 * str + 0.2 * eq + 0.15 * (u.organisation / 100) + 0.15 * (supplyComposite / 100) + 0.1 * (1 - u.fatigue / 100) + 0.1 * (u.morale / 100));
  if (tpl.usesFuel && u.fuel < 10) r *= 0.6;
  if (u.ammo < 10) r *= 0.6;
  return clamp(r);
}

/** Multiplier (0..1) combat code should apply for this unit's condition (readiness, ammo, fuel). */
export function combatEffectiveness(u: Unit): number {
  let e = u.readiness / 100;
  if (u.ammo <= 0) e *= 0.25; else if (u.ammo < 15) e *= 0.6;
  if (templateForType(u.type).usesFuel && u.fuel <= 0 && u.moveStatus !== 'stationary') e *= 0.5;
  return clamp(e, 0, 1);
}

function inCombat(u: Unit): boolean {
  return !!u.inBattle || u.combatStatus === 'attacking' || u.combatStatus === 'defending';
}

function airfieldCondition(fields: Location[], u: Unit): number {
  let best = 0;
  for (const f of fields) {
    if (Math.abs(f.pos[1] - u.pos[1]) > 0.12 || Math.abs(f.pos[0] - u.pos[0]) > 0.25) continue;
    if (haversineKm(f.pos, u.pos) > AIRFIELD_RANGE_KM) continue;
    best = Math.max(best, 1 - (f.damaged ?? 0) / 100);
  }
  return best;
}

function strHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function updateUnitStats(state: GameState, ctx: MilitaryContext): void {
  const fieldsBySide: Record<string, Location[]> = { allies: [], axis: [] };
  for (const l of Object.values(state.locations)) {
    if (l.kind !== 'airfield' || (l.damaged ?? 0) >= 80) continue;
    const sd = state.nations[l.owner]?.side;
    if (sd === 'allies' || sd === 'axis') fieldsBySide[sd].push(l);
  }
  const tickIndex = Math.floor(state.clock.minutes / 60);
  const airlift = milSpecial(state).airlift;
  const wk = state.weather.kind;
  const harsh = wk === 'mud' || wk === 'snow' || wk === 'storm' ? 1.25 : 1;
  for (const u of Object.values(state.units)) {
    if (!isAlive(u)) continue;
    const tpl = templateForType(u.type);
    const nation = state.nations[u.nation];
    const cut = isCutOff(state, u.id);
    const lift = cut ? (airlift[u.id] ?? 0) : 0;
    const fighting = inCombat(u);
    const moving = u.moveStatus === 'moving' || u.moveStatus === 'retreating';
    const stationary = !moving;
    const strength = strengthFraction(u);
    const logHere = u.side === state.playerSide;

    // ── fuel & ammo burn
    const fuelBefore = u.fuel, ammoBefore = u.ammo;
    if (tpl.usesFuel) {
      const burn = moving ? tpl.fuelUseMoving * harsh : tpl.fuelUseIdle;
      u.fuel = clamp(u.fuel - burn);
    } else u.fuel = 100;
    if (fighting) u.ammo = clamp(u.ammo - tpl.ammoUseCombat * AMMO_BURN_SCALE * (0.5 + 0.5 * strength));

    // ── resupply from pools (needs a supply connection)
    if (((!cut && u.supply >= 20) || lift > 0) && nation) {
      const f = cut ? lift * AIRLIFT_REFILL_SHARE : u.supply / 100;
      const air = u.domain === 'air';
      const cond = air ? airfieldCondition(fieldsBySide[u.side] ?? [], u) : 1;
      const costMult = air ? AIR_POOL_COST_MULT : 1;
      if (tpl.usesFuel && u.fuel < 100 && cond > 0 && (!air || stationary)) {
        const rate = air ? AIR_FUEL_REFILL_PER_TICK * cond : stationary ? FUEL_REFILL_PER_TICK : FUEL_REFILL_MOVING_PER_TICK;
        const unit = tpl.poolWeight * POOL_COST_PER_PCT * costMult;
        let add = Math.min(100 - u.fuel, rate * f);
        if (add * unit > nation.resources.fuel) add = nation.resources.fuel / unit;
        if (add > 0) { u.fuel = clamp(u.fuel + add); nation.resources.fuel = Math.max(0, nation.resources.fuel - add * unit); }
      }
      if ((!fighting || !air) && u.ammo < 100 && cond > 0) {
        const rate = air ? AIR_AMMO_REFILL_PER_TICK * cond : fighting ? AMMO_REFILL_COMBAT_PER_TICK : AMMO_REFILL_PER_TICK;
        const unit = tpl.poolWeight * POOL_COST_PER_PCT * costMult;
        // the line gets a minimum delivery share even at low supply levels (>= 20), so ammo doesn't collapse at the front
        let add = Math.min(100 - u.ammo, rate * (air || cut ? f : 0.4 + 0.6 * f));
        if (add * unit > nation.resources.ammo) add = nation.resources.ammo / unit;
        if (add > 0) { u.ammo = clamp(u.ammo + add); nation.resources.ammo = Math.max(0, nation.resources.ammo - add * unit); }
      }
    }

    // ── fuel exhaustion halts movement
    if (tpl.usesFuel && u.fuel <= 0 && moving) {
      u.moveStatus = 'stationary';
      u.route = undefined;
      u.routeEtaMinutes = undefined;
    }
    if (logHere) {
      if (tpl.usesFuel && fuelBefore > 0 && u.fuel <= 0) ctx.log({ category: 'supply', severity: 'warn', text: `${u.shortName} is out of fuel`, pos: u.pos, unitId: u.id });
      if (ammoBefore > 0 && u.ammo <= 0) ctx.log({ category: 'supply', severity: 'warn', text: `${u.shortName} is out of ammunition`, pos: u.pos, unitId: u.id });
    }

    // ── replacements (manpower & equipment) when supplied and quiet
    if (nation && !cut && u.supply >= REPLACEMENT_MIN_SUPPLY && !fighting && stationary && u.combatStatus !== 'routed') {
      const f = u.supply / 100;
      if (u.manpower < u.manpowerMax && nation.resources.manpower > 0) {
        const rate = MANPOWER_REPL_RATE * (u.posture === 'rest' ? 2 : 1) * f;
        const n = Math.min(u.manpowerMax - u.manpower, Math.ceil(u.manpowerMax * rate), Math.floor(nation.resources.manpower));
        if (n > 0) {
          // fresh drafts dilute experience slightly
          u.experience = clamp(u.experience * (1 - 0.2 * (n / Math.max(1, u.manpower + n))));
          u.manpower += n; nation.resources.manpower = Math.max(0, nation.resources.manpower - n);
        }
      }
      for (const [k, auth] of Object.entries(u.equipment.authorised)) {
        const held = u.equipment.held[k] ?? 0;
        if (held >= auth) continue;
        const def = equipmentDef(k);
        const cost = def.poolCost;
        if (def.category === 'aircraft' && (tickIndex + strHash(u.id)) % AIRCRAFT_REPLACEMENT_TICKS !== 0) continue;
        if (def.category === 'aircraft' && airfieldCondition(fieldsBySide[u.side] ?? [], u) <= 0) continue;
        let n = Math.min(auth - held, Math.max(1, Math.ceil((auth - held) * EQUIPMENT_REPL_RATE * f)));
        if (def.category === 'aircraft') n = 1;
        n = Math.min(n, Math.floor(nation.resources.equipment / cost));
        if (n > 0) { u.equipment.held[k] = held + n; nation.resources.equipment = Math.max(0, nation.resources.equipment - n * cost); }
      }
    }

    // ── fatigue
    let dF: number;
    if (fighting) dF = 3;
    else if (moving) dF = (tpl.speedClass === 'foot' ? 2.5 : 1.5) + (u.moveStatus === 'retreating' ? 1 : 0);
    else if (u.posture === 'rest' || u.posture === 'regroup') dF = -5;
    else if (u.posture === 'entrench') dF = -0.5;
    else dF = -1.5;
    if (u.supply < 20) dF += 0.5;
    u.fatigue = clamp(u.fatigue + dF);

    // ── organisation
    const basis = 0.5 * strength + 0.5 * equipmentFraction(u);
    let orgCap = 40 + 60 * basis;
    if (cut) orgCap *= 0.8;
    if (u.fatigue > 70) orgCap *= 0.9;
    if (u.organisation > orgCap) u.organisation = Math.max(orgCap, u.organisation - 2);
    else if (!fighting) {
      const rate = u.posture === 'regroup' ? 5 : u.posture === 'rest' ? 3 : moving ? 0.5 : 2;
      u.organisation = Math.min(orgCap, u.organisation + rate * (cut ? 0.5 : 1));
    }
    u.organisation = clamp(u.organisation);

    // ── morale
    const moraleTarget = clamp(45 + u.experience * 0.25 + (u.supply - 50) * 0.3 + (u.organisation - 50) * 0.1 + (u.entrenchment > 50 ? 5 : 0));
    let dM = 0;
    if (u.encircled || u.combatStatus === 'encircled') dM = -3;
    else if (cut) dM = lift >= 0.5 ? -1 : -2;
    else if (u.morale < moraleTarget) dM = fighting ? 0 : u.posture === 'rest' ? 2 : 1;
    else if (u.morale > moraleTarget) dM = -1;
    u.morale = clamp(u.morale + dM);

    // ── experience
    if (fighting) u.experience = clamp(u.experience + 0.15 * (1 - u.experience / 150));
    else if (u.posture === 'rest' || moving) u.experience = clamp(u.experience + 0.01);

    // ── entrenchment (land only)
    if (u.domain === 'land') {
      if (moving || u.posture === 'attack') u.entrenchment = clamp(u.entrenchment - 8);
      else if (u.posture === 'entrench') u.entrenchment = clamp(u.entrenchment + 4 * tpl.entrenchRate);
      else if (u.posture === 'defend') u.entrenchment = Math.max(u.entrenchment, Math.min(60, u.entrenchment + 1.5 * tpl.entrenchRate));
      else if (u.posture === 'hold') u.entrenchment = Math.max(u.entrenchment, clamp(u.entrenchment + 0.5 * tpl.entrenchRate, 0, 30));
      else if (u.posture === 'recon') u.entrenchment = clamp(u.entrenchment - 2);
    } else u.entrenchment = 0;

    // ── readiness
    u.readiness = computeReadiness(u);
  }
}
