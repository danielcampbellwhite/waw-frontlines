/**
 * Equipment catalog & generic unit templates (game-balance values, NOT historical TO&E).
 * National / historical establishments come from scenario JSON; templates are only a fallback
 * for createUnitFromTemplate() and provide per-type behavioural parameters (fuel/ammo/speed/ratings).
 */
import type { UnitDomain, UnitType } from '../core/types';

export type EquipmentCategory = 'small_arms' | 'support_weapon' | 'gun' | 'armour' | 'vehicle' | 'aircraft' | 'ship';

export interface EquipmentDef {
  id: string;
  name: string;
  category: EquipmentCategory;
  /** Cost in the nation's `equipment` pool to replace one item. */
  poolCost: number;
  /** Weight of the item when computing the unit's equipment fill (readiness). */
  weight: number;
}

export const EQUIPMENT: Record<string, EquipmentDef> = {
  rifle: { id: 'rifle', name: 'Rifles / small arms', category: 'small_arms', poolCost: 0.02, weight: 1 },
  mg: { id: 'mg', name: 'Machine guns', category: 'support_weapon', poolCost: 0.2, weight: 3 },
  mortar: { id: 'mortar', name: 'Mortars', category: 'support_weapon', poolCost: 0.3, weight: 3 },
  gun_arty: { id: 'gun_arty', name: 'Artillery pieces', category: 'gun', poolCost: 2, weight: 8 },
  gun_at: { id: 'gun_at', name: 'Anti-tank guns', category: 'gun', poolCost: 1.5, weight: 6 },
  gun_aa: { id: 'gun_aa', name: 'Anti-aircraft guns', category: 'gun', poolCost: 1.5, weight: 5 },
  tank_light: { id: 'tank_light', name: 'Light tanks', category: 'armour', poolCost: 3, weight: 8 },
  tank_medium: { id: 'tank_medium', name: 'Medium tanks', category: 'armour', poolCost: 5, weight: 12 },
  tank_heavy: { id: 'tank_heavy', name: 'Heavy tanks', category: 'armour', poolCost: 8, weight: 16 },
  armoured_car: { id: 'armoured_car', name: 'Armoured cars', category: 'armour', poolCost: 2, weight: 5 },
  /** US spelling alias, kept so scenario data using either spelling resolves. */
  armored_car: { id: 'armored_car', name: 'Armoured cars', category: 'armour', poolCost: 2, weight: 5 },
  apc: { id: 'apc', name: 'Half-tracks / carriers', category: 'vehicle', poolCost: 2, weight: 4 },
  truck: { id: 'truck', name: 'Trucks', category: 'vehicle', poolCost: 1, weight: 2 },
  aircraft_fighter: { id: 'aircraft_fighter', name: 'Fighter aircraft', category: 'aircraft', poolCost: 4, weight: 10 },
  aircraft_bomber: { id: 'aircraft_bomber', name: 'Bomber aircraft', category: 'aircraft', poolCost: 6, weight: 14 },
  ship: { id: 'ship', name: 'Warships', category: 'ship', poolCost: 12, weight: 20 },
  ship_carrier: { id: 'ship_carrier', name: 'Aircraft carriers', category: 'ship', poolCost: 25, weight: 40 },
};

export function equipmentDef(id: string): EquipmentDef {
  return EQUIPMENT[id] ?? { id, name: id, category: 'vehicle', poolCost: 1, weight: 2 };
}

export type SpeedClass = 'foot' | 'horse' | 'motor' | 'tracked' | 'air' | 'sea';

/** Combat ratings 0..100 for a full-strength, fully supplied, generic formation. Used by sim/combat. */
export interface CombatRatings {
  softAttack: number;   // vs infantry / soft targets
  hardAttack: number;   // vs armour / fortifications
  defence: number;
  breakthrough: number; // ability to exploit/advance
  airAttack: number;    // ground-attack / bombing
  airDefence: number;   // anti-air / air superiority
  recon: number;        // detection strength
}

export interface UnitTemplate {
  id: string;
  type: UnitType;
  domain: UnitDomain;
  name: string;
  manpower: number;
  equipment: Record<string, number>;
  speedClass: SpeedClass;
  /** Rough speeds for ETA estimates only (km/h). sim/pathfinding.unitSpeedKmh is authoritative. */
  speedKmh: { road: number; offroad: number };
  usesFuel: boolean;
  /** % of a full tank burned per hour while moving / idle. */
  fuelUseMoving: number;
  fuelUseIdle: number;
  /** % of full ammo burned per hour in combat. */
  ammoUseCombat: number;
  /** Supply points drawn per tick from the network (idle); x1.5 in combat, x1.3 moving. */
  supplyDraw: number;
  /** Relative size in the nation's fuel/ammo pools. */
  poolWeight: number;
  ratings: CombatRatings;
  /** Entrenching rate multiplier. */
  entrenchRate: number;
  startExperience: number;
}

const R = (softAttack: number, hardAttack: number, defence: number, breakthrough: number, airAttack: number, airDefence: number, recon: number): CombatRatings =>
  ({ softAttack, hardAttack, defence, breakthrough, airAttack, airDefence, recon });

const T = (t: UnitTemplate): UnitTemplate => t;

export const UNIT_TEMPLATES: Record<string, UnitTemplate> = {
  infantry: T({
    id: 'infantry', type: 'infantry', domain: 'land', name: 'Infantry Division', manpower: 12000,
    equipment: { rifle: 10000, mg: 300, mortar: 60, gun_arty: 36, gun_at: 48, truck: 150 },
    speedClass: 'foot', speedKmh: { road: 5, offroad: 2.5 }, usesFuel: false, fuelUseMoving: 0, fuelUseIdle: 0,
    ammoUseCombat: 4, supplyDraw: 2, poolWeight: 0.5, ratings: R(40, 20, 45, 15, 0, 5, 10), entrenchRate: 1, startExperience: 30,
  }),
  armoured: T({
    id: 'armoured', type: 'armoured', domain: 'land', name: 'Armoured Division', manpower: 11000,
    equipment: { rifle: 6000, tank_medium: 150, tank_light: 60, apc: 200, gun_arty: 24, gun_at: 30, truck: 800 },
    speedClass: 'tracked', speedKmh: { road: 28, offroad: 12 }, usesFuel: true, fuelUseMoving: 3.5, fuelUseIdle: 0,
    ammoUseCombat: 5, supplyDraw: 4, poolWeight: 1.2, ratings: R(45, 55, 30, 60, 0, 8, 15), entrenchRate: 0.5, startExperience: 30,
  }),
  mechanised: T({
    id: 'mechanised', type: 'mechanised', domain: 'land', name: 'Mechanised Division', manpower: 12000,
    equipment: { rifle: 7500, tank_medium: 60, apc: 300, mg: 300, mortar: 60, gun_arty: 36, gun_at: 40, truck: 600 },
    speedClass: 'tracked', speedKmh: { road: 26, offroad: 11 }, usesFuel: true, fuelUseMoving: 3, fuelUseIdle: 0,
    ammoUseCombat: 4.5, supplyDraw: 3.5, poolWeight: 1, ratings: R(45, 40, 38, 45, 0, 8, 12), entrenchRate: 0.7, startExperience: 30,
  }),
  motorised: T({
    id: 'motorised', type: 'motorised', domain: 'land', name: 'Motorised Division', manpower: 11000,
    equipment: { rifle: 8000, mg: 250, mortar: 54, gun_arty: 24, gun_at: 40, truck: 1500 },
    speedClass: 'motor', speedKmh: { road: 30, offroad: 8 }, usesFuel: true, fuelUseMoving: 2.5, fuelUseIdle: 0,
    ammoUseCombat: 4, supplyDraw: 3, poolWeight: 0.8, ratings: R(38, 22, 38, 30, 0, 5, 10), entrenchRate: 0.9, startExperience: 30,
  }),
  paratroop: T({
    id: 'paratroop', type: 'paratroop', domain: 'land', name: 'Airborne Division', manpower: 8000,
    equipment: { rifle: 6500, mg: 240, mortar: 40, gun_at: 18, gun_arty: 12 },
    speedClass: 'foot', speedKmh: { road: 5, offroad: 3 }, usesFuel: false, fuelUseMoving: 0, fuelUseIdle: 0,
    ammoUseCombat: 5, supplyDraw: 2, poolWeight: 0.4, ratings: R(42, 12, 38, 20, 0, 5, 12), entrenchRate: 1.1, startExperience: 45,
  }),
  artillery: T({
    id: 'artillery', type: 'artillery', domain: 'land', name: 'Artillery Brigade', manpower: 3500,
    equipment: { rifle: 1500, gun_arty: 96, truck: 400 },
    speedClass: 'motor', speedKmh: { road: 20, offroad: 4 }, usesFuel: false, fuelUseMoving: 0, fuelUseIdle: 0,
    ammoUseCombat: 9, supplyDraw: 3, poolWeight: 0.6, ratings: R(70, 35, 12, 5, 0, 3, 8), entrenchRate: 0.8, startExperience: 30,
  }),
  antitank: T({
    id: 'antitank', type: 'antitank', domain: 'land', name: 'Anti-Tank Battalion', manpower: 2500,
    equipment: { rifle: 1500, gun_at: 72, truck: 200 },
    speedClass: 'motor', speedKmh: { road: 20, offroad: 4 }, usesFuel: false, fuelUseMoving: 0, fuelUseIdle: 0,
    ammoUseCombat: 5, supplyDraw: 1.5, poolWeight: 0.3, ratings: R(10, 60, 30, 5, 0, 3, 6), entrenchRate: 1.2, startExperience: 30,
  }),
  recon: T({
    id: 'recon', type: 'recon', domain: 'land', name: 'Reconnaissance Battalion', manpower: 1500,
    equipment: { rifle: 800, armoured_car: 40, truck: 80 },
    speedClass: 'motor', speedKmh: { road: 40, offroad: 14 }, usesFuel: true, fuelUseMoving: 3, fuelUseIdle: 0,
    ammoUseCombat: 2, supplyDraw: 1, poolWeight: 0.2, ratings: R(15, 8, 12, 25, 0, 2, 60), entrenchRate: 0.6, startExperience: 35,
  }),
  engineer: T({
    id: 'engineer', type: 'engineer', domain: 'land', name: 'Engineer Battalion', manpower: 2500,
    equipment: { rifle: 1800, mg: 40, truck: 150 },
    speedClass: 'motor', speedKmh: { road: 20, offroad: 4 }, usesFuel: false, fuelUseMoving: 0, fuelUseIdle: 0,
    ammoUseCombat: 3, supplyDraw: 1.5, poolWeight: 0.3, ratings: R(15, 8, 22, 5, 0, 2, 8), entrenchRate: 2, startExperience: 30,
  }),
  logistics: T({
    id: 'logistics', type: 'logistics', domain: 'land', name: 'Supply Column', manpower: 2000,
    equipment: { rifle: 600, truck: 700 },
    speedClass: 'motor', speedKmh: { road: 30, offroad: 8 }, usesFuel: true, fuelUseMoving: 1.5, fuelUseIdle: 0,
    ammoUseCombat: 1, supplyDraw: 1, poolWeight: 0.2, ratings: R(2, 0, 5, 0, 0, 0, 2), entrenchRate: 0.5, startExperience: 20,
  }),
  hq: T({
    id: 'hq', type: 'hq', domain: 'land', name: 'Headquarters', manpower: 600,
    equipment: { rifle: 300, truck: 60 },
    speedClass: 'motor', speedKmh: { road: 30, offroad: 8 }, usesFuel: false, fuelUseMoving: 0, fuelUseIdle: 0,
    ammoUseCombat: 1, supplyDraw: 0.5, poolWeight: 0.1, ratings: R(2, 0, 8, 0, 0, 2, 10), entrenchRate: 0.8, startExperience: 30,
  }),
  air_fighter: T({
    id: 'air_fighter', type: 'air_fighter', domain: 'air', name: 'Fighter Wing', manpower: 800,
    equipment: { aircraft_fighter: 60, truck: 40 },
    speedClass: 'air', speedKmh: { road: 400, offroad: 400 }, usesFuel: true, fuelUseMoving: 6, fuelUseIdle: 0,
    ammoUseCombat: 8, supplyDraw: 4, poolWeight: 0.8, ratings: R(5, 3, 10, 0, 25, 70, 30), entrenchRate: 0, startExperience: 35,
  }),
  air_bomber: T({
    id: 'air_bomber', type: 'air_bomber', domain: 'air', name: 'Bomber Wing', manpower: 1000,
    equipment: { aircraft_bomber: 40, truck: 40 },
    speedClass: 'air', speedKmh: { road: 330, offroad: 330 }, usesFuel: true, fuelUseMoving: 5, fuelUseIdle: 0,
    ammoUseCombat: 10, supplyDraw: 5, poolWeight: 1, ratings: R(10, 5, 5, 0, 70, 15, 15), entrenchRate: 0, startExperience: 35,
  }),
  naval: T({
    id: 'naval', type: 'naval', domain: 'sea', name: 'Naval Task Force', manpower: 3000,
    equipment: { ship: 12 },
    speedClass: 'sea', speedKmh: { road: 30, offroad: 30 }, usesFuel: true, fuelUseMoving: 1, fuelUseIdle: 0.05,
    ammoUseCombat: 6, supplyDraw: 4, poolWeight: 1, ratings: R(40, 40, 40, 10, 5, 30, 20), entrenchRate: 0, startExperience: 35,
  }),
  carrier: T({
    id: 'carrier', type: 'carrier', domain: 'sea', name: 'Carrier Task Force', manpower: 4000,
    equipment: { ship_carrier: 1, ship: 6, aircraft_fighter: 30, aircraft_bomber: 30 },
    speedClass: 'sea', speedKmh: { road: 30, offroad: 30 }, usesFuel: true, fuelUseMoving: 1.2, fuelUseIdle: 0.05,
    ammoUseCombat: 6, supplyDraw: 6, poolWeight: 1.5, ratings: R(20, 20, 30, 10, 50, 40, 30), entrenchRate: 0, startExperience: 35,
  }),
};

export function getTemplate(idOrType: string): UnitTemplate | undefined {
  return UNIT_TEMPLATES[idOrType];
}

export function templateForType(type: UnitType): UnitTemplate {
  return UNIT_TEMPLATES[type];
}

/** Types that cannot attack/capture (non-combat). */
export const NON_COMBAT_TYPES: ReadonlySet<UnitType> = new Set<UnitType>(['logistics', 'hq']);
