/** Logistics events: fuel, convoys, depots, bridges, aid, breakdowns. */
import { haversineKm } from '../../core/geo';
import { adj, adjRes, clamp, isMobile, nearest, sideLocations, sideRes, sideUnits, spend } from '../helpers';
import type { EventTemplate } from '../types';

export const fuelShortage: EventTemplate = {
  id: 'evt_fuel_shortage', kind: 'dynamic', category: 'logistics', tone: 'adverse', target: 'any', cooldownMinutes: 72 * 60,
  title: 'Fuel shortage',
  body: 'Tanker convoys are late and depots are running dry. Armoured and motorised columns are being halted for want of petrol.',
  weight: (env) => {
    const f = sideRes(env, 'fuel');
    return (f < 250 ? 2.5 : f < 600 ? 1 : 0.35) * Math.max(0.3, env.state.settings.logisticsDifficulty);
  },
  condition: (env) => sideUnits(env.state, env.side, isMobile).length > 0,
  impact: (env) => { for (const u of sideUnits(env.state, env.side, isMobile)) adj(u, 'fuel', -12); },
  choices: [
    {
      id: 'draw_reserves', label: 'Draw on the fuel reserve', effectSummary: 'Spend up to 120 fuel: all mobile units regain 12 fuel.',
      available: (env) => sideRes(env, 'fuel') >= 40,
      apply: (env) => { const s = spend(env, 'fuel', 120); const k = clamp(s / 120, 0, 1); for (const u of sideUnits(env.state, env.side, isMobile)) adj(u, 'fuel', 12 * k); return `Reserve fuel issued (${Math.round(s)}).`; },
    },
    {
      id: 'requisition', label: 'Requisition civilian stocks', effectSummary: 'Gain 80 fuel for the nation, but infantry morale falls 3 from the local resentment.',
      apply: (env) => { adjRes(env.state, env.nation, 'fuel', 80); for (const u of sideUnits(env.state, env.side, (x) => !isMobile(x))) adj(u, 'morale', -3); return 'Civilian fuel requisitioned.'; },
    },
    { id: 'accept', label: 'Ration and wait', effectSummary: 'No cost. Mobile units stay low on fuel.', apply: () => undefined },
  ],
  defaultChoiceId: 'accept', aiChoiceId: 'draw_reserves',
};

export const convoyLoss: EventTemplate = {
  id: 'evt_convoy_loss', kind: 'dynamic', category: 'logistics', tone: 'adverse', target: 'any', cooldownMinutes: 60 * 60,
  title: 'Supply convoy ambushed',
  body: (_e, d) => `A supply convoy was caught on the road: ${d.lostSupply} supply points of stores and ${d.lostAmmo} ammunition were lost.`,
  weight: (env) => (sideRes(env, 'supplyPoints') > 80 ? 1.1 * Math.max(0.3, env.state.settings.logisticsDifficulty) : 0),
  prepare: (env) => {
    const sp = env.state.nations[env.nation]?.resources.supplyPoints ?? 0;
    const am = env.state.nations[env.nation]?.resources.ammo ?? 0;
    const k = 0.08 + env.rand() * 0.12;
    return { lostSupply: Math.round(sp * k), lostAmmo: Math.round(am * k * 0.6) };
  },
  impact: (env, d) => { adjRes(env.state, env.nation, 'supplyPoints', -(d.lostSupply as number)); adjRes(env.state, env.nation, 'ammo', -(d.lostAmmo as number)); },
  choices: [
    {
      id: 'escort', label: 'Mount escorts and recover stores', effectSummary: 'Spend 30 equipment to recover half of the lost stores; 3 nearby units gain 5 fatigue.',
      available: (env) => sideRes(env, 'equipment') >= 30,
      apply: (env, d) => {
        spend(env, 'equipment', 30);
        adjRes(env.state, env.nation, 'supplyPoints', Math.round((d.lostSupply as number) / 2));
        adjRes(env.state, env.nation, 'ammo', Math.round((d.lostAmmo as number) / 2));
        const anchor = sideUnits(env.state, env.side)[0];
        if (anchor) for (const u of nearest(anchor.pos, sideUnits(env.state, env.side), 3)) adj(u, 'fatigue', 5);
        return 'Half the lost stores recovered.';
      },
    },
    { id: 'write_off', label: 'Write off the loss', effectSummary: 'No further cost; the stores are gone.', apply: () => undefined },
  ],
  defaultChoiceId: 'write_off', aiChoiceId: 'write_off',
};

export const depotAirRaid: EventTemplate = {
  id: 'evt_depot_raid', kind: 'dynamic', category: 'logistics', tone: 'adverse', target: 'any', cooldownMinutes: 48 * 60,
  title: (_e, d) => `Air raid on ${d.name}`,
  body: (_e, d) => `Bombers have hit the ${d.kind} at ${d.name}. Stores are burning and capacity is reduced.`,
  weight: 0.9,
  prepare: (env) => {
    const ls = sideLocations(env.state, env.side, ['depot', 'port', 'airfield']).filter((l) => (l.damaged ?? 0) < 70);
    if (!ls.length) return null;
    const l = ls[Math.min(ls.length - 1, Math.floor(env.rand() * ls.length))];
    return { locationId: l.id, name: l.name, kind: l.kind, pos: l.pos };
  },
  impact: (env, d) => {
    const l = env.state.locations[d.locationId as string];
    l.damaged = clamp((l.damaged ?? 0) + 30 + Math.round(env.rand() * 20));
    if (l.supplyCapacity) l.supplyCapacity = Math.round(l.supplyCapacity * 0.8);
    adjRes(env.state, env.nation, 'supplyPoints', -20);
  },
  choices: [
    {
      id: 'repair', label: 'Emergency repair crews', effectSummary: 'Spend 40 equipment: infrastructure damage reduced by 25.',
      available: (env) => sideRes(env, 'equipment') >= 40,
      apply: (env, d) => { spend(env, 'equipment', 40); const l = env.state.locations[d.locationId as string]; l.damaged = clamp((l.damaged ?? 0) - 25); return `${l.name} partially restored.`; },
    },
    {
      id: 'disperse', label: 'Disperse the stocks', effectSummary: 'Lose a further 15 supply points to pilferage but the site is not rebuilt.',
      apply: (env) => { adjRes(env.state, env.nation, 'supplyPoints', -15); },
    },
  ],
  defaultChoiceId: 'disperse', aiChoiceId: 'repair',
};

export const bridgeDestroyed: EventTemplate = {
  id: 'evt_bridge_destroyed', kind: 'dynamic', category: 'logistics', tone: 'adverse', target: 'any', cooldownMinutes: 48 * 60,
  title: (_e, d) => `${d.name} bridge destroyed`,
  body: (_e, d) => `${d.name} bridge has been blown or bombed. Traffic is backing up on both approaches.`,
  weight: 0.8,
  prepare: (env) => {
    const bs = sideLocations(env.state, env.side, ['bridge']).filter((l) => (l.damaged ?? 0) < 50);
    if (!bs.length) return null;
    // favour bridges closest to the enemy
    const scored = bs.map((b) => ({ b, d: Math.min(...sideUnits(env.state, env.enemySide).map((u) => haversineKm(u.pos, b.pos)), 9999) })).sort((a, c) => a.d - c.d);
    const b = scored[0].b;
    return { locationId: b.id, name: b.name, pos: b.pos };
  },
  impact: (env, d) => { const b = env.state.locations[d.locationId as string]; b.damaged = clamp(Math.max(b.damaged ?? 0, 80)); },
  choices: [
    {
      id: 'rebuild', label: 'Engineers rebuild the span', effectSummary: 'Spend 60 equipment: damage reduced to 35.',
      available: (env) => sideRes(env, 'equipment') >= 60,
      apply: (env, d) => { spend(env, 'equipment', 60); env.state.locations[d.locationId as string].damaged = 35; return 'Bridge repaired.'; },
    },
    {
      id: 'ford', label: 'Improvise a ford and ferry', effectSummary: 'No cost: damage reduced to 55, but the 3 nearest units gain 10 fatigue.',
      apply: (env, d) => {
        const b = env.state.locations[d.locationId as string]; b.damaged = 55;
        for (const u of nearest(b.pos, sideUnits(env.state, env.side), 3)) adj(u, 'fatigue', 10);
      },
    },
  ],
  defaultChoiceId: 'ford', aiChoiceId: 'rebuild',
};

export const foreignAid: EventTemplate = {
  id: 'evt_aid_shipment', kind: 'random', category: 'politics', tone: 'favourable', target: 'any', cooldownMinutes: 200 * 60,
  // Text is written from the receiving side's point of view: never an "Allied" shipment for the Axis.
  title: (env) => env.side === 'axis' ? 'Supply convoy arrives from the homeland' : 'Allied shipment arrives',
  body: (env) => env.side === 'axis'
    ? 'A consignment of war material from the home front has reached the depots and the high command must decide where it is most needed.'
    : 'A consignment of Allied war material has reached the depots and the high command must decide where it is most needed.',
  weight: 0.45,
  prepare: (env) => ({ scale: Math.round((0.8 + env.rand() * 0.4) * 100) / 100 }),
  choices: [
    { id: 'fuel', label: 'Fuel and lubricants', effectSummary: 'Gain about 150 fuel.', apply: (env, d) => { adjRes(env.state, env.nation, 'fuel', Math.round(150 * (d.scale as number))); } },
    { id: 'ammo', label: 'Ammunition', effectSummary: 'Gain about 150 ammunition.', apply: (env, d) => { adjRes(env.state, env.nation, 'ammo', Math.round(150 * (d.scale as number))); } },
    { id: 'equipment', label: 'Vehicles and heavy weapons', effectSummary: 'Gain about 100 equipment.', apply: (env, d) => { adjRes(env.state, env.nation, 'equipment', Math.round(100 * (d.scale as number))); } },
  ],
  defaultChoiceId: 'ammo', aiChoiceId: 'fuel',
};

export const equipmentBreakdown: EventTemplate = {
  id: 'evt_breakdowns', kind: 'random', category: 'logistics', tone: 'adverse', target: 'any', cooldownMinutes: 36 * 60,
  title: (_e, d) => `Mass breakdowns in ${d.name}`,
  body: (_e, d) => `After days on the move, ${d.name} reports a wave of mechanical failures; ${d.lostTotal} vehicles are stranded.`,
  weight: (env) => sideUnits(env.state, env.side, (u) => u.type === 'armoured' || u.type === 'mechanised').length > 0 ? 1.0 : 0,
  prepare: (env) => {
    const cands = sideUnits(env.state, env.side, (u) => (u.type === 'armoured' || u.type === 'mechanised') && u.fuel < 95).sort((a, b) => b.fatigue - a.fatigue || (a.id < b.id ? -1 : 1));
    const pool = cands.length ? cands : sideUnits(env.state, env.side, (u) => u.type === 'armoured' || u.type === 'mechanised');
    const u = pool[Math.min(pool.length - 1, Math.floor(env.rand() * Math.min(3, pool.length)))];
    if (!u) return null;
    const lost: Record<string, number> = {};
    let total = 0;
    for (const k of Object.keys(u.equipment.held)) {
      if (!/tank|armou?r|vehicle|truck|half|gun_sp|carrier/i.test(k)) continue;
      const n = Math.round(u.equipment.held[k] * (0.08 + env.rand() * 0.1));
      if (n > 0) { lost[k] = n; total += n; }
    }
    return { unitId: u.id, name: u.shortName, lost, lostTotal: total, pos: u.pos };
  },
  impact: (env, d) => {
    const u = env.state.units[d.unitId as string];
    for (const [k, n] of Object.entries(d.lost as Record<string, number>)) u.equipment.held[k] = Math.max(0, u.equipment.held[k] - n);
    adj(u, 'fuel', -5); adj(u, 'organisation', -6);
  },
  choices: [
    {
      id: 'field_repairs', label: 'Field workshops', effectSummary: 'Spend 40 equipment: 60% of the stranded vehicles are recovered; the unit gains 8 fatigue.',
      available: (env) => sideRes(env, 'equipment') >= 40,
      apply: (env, d) => {
        spend(env, 'equipment', 40);
        const u = env.state.units[d.unitId as string];
        for (const [k, n] of Object.entries(d.lost as Record<string, number>)) u.equipment.held[k] += Math.round(n * 0.6);
        adj(u, 'fatigue', 8); return 'Repair crews return vehicles to service.';
      },
    },
    {
      id: 'cannibalise', label: 'Cannibalise wrecks', effectSummary: 'No cost: 30% recovered, but organisation falls a further 5.',
      apply: (env, d) => {
        const u = env.state.units[d.unitId as string];
        for (const [k, n] of Object.entries(d.lost as Record<string, number>)) u.equipment.held[k] += Math.round(n * 0.3);
        adj(u, 'organisation', -5);
      },
    },
    { id: 'press_on', label: 'Leave them and press on', effectSummary: 'No cost; the vehicles are abandoned.', apply: () => undefined },
  ],
  defaultChoiceId: 'press_on', aiChoiceId: 'field_repairs',
};

