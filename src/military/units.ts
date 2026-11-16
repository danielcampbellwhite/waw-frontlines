import type { Unit } from '../core/types';
import { getTemplate, templateForType } from './catalog';

/**
 * Build a full-strength Unit from a catalog template. `templateId` may be a template id or a UnitType.
 * Overrides are shallow-merged last; if only `manpower` / `equipment.held` are overridden the
 * authorised establishment stays at template strength (so the unit is under-strength and will be
 * reinforced from pools).
 */
export function createUnitFromTemplate(templateId: string, overrides: Partial<Unit> = {}): Unit {
  const tpl = getTemplate(templateId) ?? (overrides.type ? templateForType(overrides.type) : undefined);
  if (!tpl) throw new Error(`Unknown unit template: ${templateId}`);
  const id = overrides.id ?? `${tpl.id}_unit`;
  const authorised = { ...tpl.equipment };
  const base: Unit = {
    id,
    name: overrides.name ?? tpl.name,
    shortName: overrides.shortName ?? overrides.name ?? tpl.name,
    nation: 'NEUTRAL',
    side: 'neutral',
    type: tpl.type,
    domain: tpl.domain,
    pos: [0, 0],
    manpower: tpl.manpower,
    manpowerMax: tpl.manpower,
    equipment: { held: { ...authorised }, authorised },
    organisation: 100,
    morale: 75,
    experience: tpl.startExperience,
    fuel: 100,
    ammo: 100,
    supply: 100,
    fatigue: 0,
    readiness: 100,
    entrenchment: 0,
    moveStatus: 'stationary',
    combatStatus: 'idle',
    posture: 'hold',
    orders: [],
    kills: 0,
  };
  const u: Unit = { ...base, ...overrides, id };
  if (overrides.equipment) {
    u.equipment = {
      held: { ...overrides.equipment.held },
      authorised: { ...(overrides.equipment.authorised ?? authorised) },
    };
  }
  if (overrides.manpower !== undefined && overrides.manpowerMax === undefined) u.manpowerMax = Math.max(tpl.manpower, overrides.manpower);
  u.orders = overrides.orders ? overrides.orders.map(o => ({ ...o })) : [];
  return u;
}
