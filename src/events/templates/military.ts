/** Military / intelligence / political events. */
import { haversineKm } from '../../core/geo';
import type { Unit } from '../../core/types';
import {
  adj, adjManpower, adjRes, isAlive, isCombat, isMobile, nearest, nearestEnemy, pushAwayFrom, scheduleReinforcement,
  sideRes, sideUnits, spend,
} from '../helpers';
import type { EventTemplate } from '../types';

export const unexpectedCounterattack: EventTemplate = {
  id: 'evt_counterattack', kind: 'dynamic', category: 'combat', tone: 'adverse', target: 'any', cooldownMinutes: 24 * 60,
  title: (_e, d) => `Sudden counter-attack on ${d.name}`,
  body: (_e, d) => `${d.attacker} has struck ${d.name} out of the mist before it could dig in. The line is bending.`,
  weight: 1.1,
  prepare: (env) => {
    const cands: { u: Unit; e: Unit }[] = [];
    for (const u of sideUnits(env.state, env.side, (x) => isCombat(x) && x.entrenchment < 50)) {
      const ne = nearestEnemy(env.state, env.side, u.pos);
      if (ne && ne.km <= 25 && ne.unit.manpower > 150) cands.push({ u, e: ne.unit });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => (a.u.id < b.u.id ? -1 : 1));
    const c = cands[Math.min(cands.length - 1, Math.floor(env.rand() * cands.length))];
    return { unitId: c.u.id, attackerId: c.e.id, name: c.u.shortName, attacker: c.e.shortName, pos: c.u.pos };
  },
  impact: (env, d) => {
    const u = env.state.units[d.unitId as string], a = env.state.units[d.attackerId as string];
    adj(u, 'organisation', -15); adj(u, 'morale', -8); adjManpower(u, -0.03);
    if (a) { adj(a, 'ammo', -8); adj(a, 'organisation', -3); }
  },
  choices: [
    {
      id: 'commit_reserves', label: 'Commit the nearest reserves', effectSummary: 'The 2 nearest friendly units each use 8 ammo; the hit unit regains 10 organisation and digs in (+10 entrenchment).',
      apply: (env, d) => {
        const u = env.state.units[d.unitId as string];
        const others = sideUnits(env.state, env.side, (x) => x.id !== u.id && isCombat(x) && haversineKm(x.pos, u.pos) <= 60);
        for (const o of nearest(u.pos, others, 2)) adj(o, 'ammo', -8);
        adj(u, 'organisation', 10); adj(u, 'entrenchment', 10);
        return `${u.shortName} stabilised with reserves.`;
      },
    },
    {
      id: 'fall_back', label: 'Fall back to a shorter line', effectSummary: 'The unit withdraws 6 km, loses its entrenchment but recovers 5 organisation and is set to regroup.',
      apply: (env, d) => {
        const u = env.state.units[d.unitId as string], a = env.state.units[d.attackerId as string];
        if (a) pushAwayFrom(u, a.pos, 6);
        u.entrenchment = 0; adj(u, 'organisation', 5); u.posture = 'regroup';
        return `${u.shortName} fell back.`;
      },
    },
    {
      id: 'hold', label: 'Hold at all costs', effectSummary: 'The unit stays: +15 entrenchment but a further 2% manpower and 4 morale are lost.',
      apply: (env, d) => { const u = env.state.units[d.unitId as string]; adj(u, 'entrenchment', 15); adjManpower(u, -0.02); adj(u, 'morale', -4); u.posture = 'defend'; },
    },
  ],
  defaultChoiceId: 'hold', aiChoiceId: 'commit_reserves',
};

export const commandDisruption: EventTemplate = {
  id: 'evt_command_disruption', kind: 'dynamic', category: 'command', tone: 'adverse', target: 'any', cooldownMinutes: 60 * 60,
  title: (_e, d) => `${d.hq} loses contact with its units`,
  body: (_e, d) => `Signals have failed and the staff of ${d.hq} cannot reach its subordinates. Formations are acting without orders.`,
  weight: (env) => (sideUnits(env.state, env.side, (u) => u.type === 'hq').length ? 0.8 : 0),
  prepare: (env) => {
    const hqs = sideUnits(env.state, env.side, (u) => u.type === 'hq').sort((a, b) => (a.id < b.id ? -1 : 1));
    const hq = hqs[Math.min(hqs.length - 1, Math.floor(env.rand() * hqs.length))];
    if (!hq) return null;
    let subs = sideUnits(env.state, env.side, (u) => u.parentId === hq.id && isCombat(u));
    if (!subs.length) subs = nearest(hq.pos, sideUnits(env.state, env.side, (u) => isCombat(u) && haversineKm(u.pos, hq.pos) <= 80), 4);
    if (!subs.length) return null;
    return { hqId: hq.id, hq: hq.shortName, subIds: subs.map((u) => u.id), pos: hq.pos };
  },
  impact: (env, d) => { for (const id of d.subIds as string[]) adj(env.state.units[id], 'organisation', -8); adj(env.state.units[d.hqId as string], 'organisation', -5); },
  choices: [
    {
      id: 'couriers', label: 'Send despatch riders', effectSummary: 'Spend 20 supply points: subordinates regain 5 organisation.',
      available: (env) => sideRes(env, 'supplyPoints') >= 20,
      apply: (env, d) => { spend(env, 'supplyPoints', 20); for (const id of d.subIds as string[]) adj(env.state.units[id], 'organisation', 5); },
    },
    {
      id: 'delegate', label: 'Let subordinates use initiative', effectSummary: 'No cost: subordinates gain 3 morale and 1 experience.',
      apply: (env, d) => { for (const id of d.subIds as string[]) { const u = env.state.units[id]; adj(u, 'morale', 3); adj(u, 'experience', 1); } },
    },
    {
      id: 'move_hq', label: 'Displace the headquarters forward', effectSummary: 'The HQ loses 10 organisation but subordinates regain 8.',
      apply: (env, d) => { adj(env.state.units[d.hqId as string], 'organisation', -10); for (const id of d.subIds as string[]) adj(env.state.units[id], 'organisation', 8); },
    },
  ],
  defaultChoiceId: 'delegate', aiChoiceId: 'couriers',
};

export const moraleCrisis: EventTemplate = {
  id: 'evt_morale_crisis', kind: 'dynamic', category: 'command', tone: 'adverse', target: 'any', cooldownMinutes: 48 * 60,
  title: 'Exhausted troops near breaking point',
  body: (_e, d) => `${(d.names as string[]).join(', ')} are worn out and shaken. Desertions and refusals to advance are being reported.`,
  weight: (env) => (sideUnits(env.state, env.side, (u) => isCombat(u) && u.morale < 40 && u.fatigue > 55).length ? 2 : 0),
  prepare: (env) => {
    const us = sideUnits(env.state, env.side, (u) => isCombat(u) && u.morale < 40 && u.fatigue > 55).sort((a, b) => a.morale - b.morale).slice(0, 3);
    return us.length ? { unitIds: us.map((u) => u.id), names: us.map((u) => u.shortName), pos: us[0].pos } : null;
  },
  choices: [
    {
      id: 'rest', label: 'Pull them out of the line', effectSummary: 'The units rest: fatigue -25, morale +10, posture set to rest.',
      apply: (env, d) => { for (const id of d.unitIds as string[]) { const u = env.state.units[id]; adj(u, 'fatigue', -25); adj(u, 'morale', 10); u.posture = 'rest'; } },
    },
    {
      id: 'rally', label: 'Rally them with officers and rations', effectSummary: 'Morale +6 but fatigue +5; they stay in the line.',
      apply: (env, d) => { for (const id of d.unitIds as string[]) { const u = env.state.units[id]; adj(u, 'morale', 6); adj(u, 'fatigue', 5); } },
    },
    {
      id: 'ignore', label: 'Take no action', effectSummary: 'Morale falls a further 4.',
      apply: (env, d) => { for (const id of d.unitIds as string[]) adj(env.state.units[id], 'morale', -4); },
    },
  ],
  defaultChoiceId: 'ignore', aiChoiceId: 'rest',
};

export const intelligenceBreakthrough: EventTemplate = {
  id: 'evt_intel_breakthrough', kind: 'random', category: 'intelligence', tone: 'favourable', target: 'any', cooldownMinutes: 96 * 60,
  title: 'Intelligence breakthrough',
  body: 'Intercepted signals and a captured staff officer reveal enemy dispositions along the front.',
  weight: 0.6,
  prepare: (env) => {
    const mine = sideUnits(env.state, env.side);
    const foes = sideUnits(env.state, env.enemySide);
    if (!mine.length || !foes.length) return null;
    const c = mine[0].pos;
    const ids = nearest(c, foes, 8).map((u) => u.id);
    return { enemyIds: ids, pos: env.state.units[ids[0]].pos };
  },
  choices: [
    {
      id: 'distribute', label: 'Pass it to all front-line commanders', effectSummary: 'Reveals the positions of up to 8 enemy formations.',
      apply: (env, d) => { for (const id of d.enemyIds as string[]) reveal(env, id); return 'Enemy dispositions revealed.'; },
    },
    {
      id: 'targeted', label: 'Act on it locally', effectSummary: 'Reveals 3 formations; friendly units within 40 km of them gain 4 morale and 5 ammo (forewarned).',
      apply: (env, d) => {
        const ids = (d.enemyIds as string[]).slice(0, 3);
        for (const id of ids) {
          reveal(env, id);
          const e = env.state.units[id];
          for (const u of sideUnits(env.state, env.side, (x) => haversineKm(x.pos, e.pos) <= 40)) { adj(u, 'morale', 4); adj(u, 'ammo', 5); }
        }
      },
    },
  ],
  defaultChoiceId: 'distribute', aiChoiceId: 'distribute',
};

function reveal(env: import('../types').EventEnv, id: string): void {
  const e = env.state.units[id];
  if (!e || !isAlive(e)) return;
  e.lastSeenBy = { ...(e.lastSeenBy ?? {}), [env.side]: { pos: [e.pos[0], e.pos[1]], minutes: env.now } };
}

export const enemyReinforcements: EventTemplate = {
  id: 'evt_enemy_reinforcements', kind: 'dynamic', category: 'combat', tone: 'favourable', target: 'enemy', cooldownMinutes: 72 * 60,
  title: 'Enemy reinforcements', body: '', opponentReport: 'Intelligence reports a fresh enemy formation moving up to the front.',
  weight: (env) => 0.9 * Math.max(0, env.state.settings.reinforcementAvailability),
  impact: (env) => { scheduleReinforcement(env, env.nation, { types: ['infantry', 'motorised', 'armoured'], delayMinutes: 360 + Math.floor(env.rand() * 720), strength: 0.7, label: 'Fresh formation' }); },
  condition: (env) => Object.values(env.state.units).some((u) => u.nation === env.nation && u.domain === 'land' && isCombat(u)),
};

export const strategicReserve: EventTemplate = {
  id: 'evt_strategic_reserve', kind: 'random', category: 'command', tone: 'favourable', target: 'any', cooldownMinutes: 120 * 60,
  title: 'Strategic reserve released',
  body: 'The high command has released a formation from the strategic reserve and asks what you need most.',
  weight: (env) => 0.6 * Math.max(0, env.state.settings.reinforcementAvailability),
  condition: (env) => Object.values(env.state.units).some((u) => u.nation === env.nation && u.domain === 'land' && isCombat(u)),
  choices: [
    {
      id: 'infantry', label: 'Infantry division', effectSummary: 'Spend 100 manpower: an infantry formation arrives at a rear depot in about 12 hours.',
      available: (env) => sideRes(env, 'manpower') >= 100,
      apply: (env) => { spend(env, 'manpower', 100); const a = scheduleReinforcement(env, env.nation, { types: ['infantry'], delayMinutes: 720, strength: 0.8, label: 'Reserve' }); return a ? 'Reserve infantry en route.' : 'No suitable formation to raise.'; },
    },
    {
      id: 'armour', label: 'Armoured group', effectSummary: 'Spend 100 fuel: an armoured formation arrives at a rear depot in about 18 hours.',
      available: (env) => sideRes(env, 'fuel') >= 100 && Object.values(env.state.units).some((u) => u.nation === env.nation && (u.type === 'armoured' || u.type === 'mechanised')),
      apply: (env) => { spend(env, 'fuel', 100); const a = scheduleReinforcement(env, env.nation, { types: ['armoured', 'mechanised'], delayMinutes: 1080, strength: 0.7, label: 'Reserve armour' }); return a ? 'Reserve armour en route.' : 'No suitable formation to raise.'; },
    },
    { id: 'decline', label: 'Decline for now', effectSummary: 'Nothing happens.', apply: () => undefined },
  ],
  defaultChoiceId: 'decline', aiChoiceId: 'infantry',
};

export const resistanceActivity: EventTemplate = {
  id: 'evt_resistance', kind: 'dynamic', category: 'politics', tone: 'adverse', target: 'any', cooldownMinutes: 72 * 60,
  title: (_e, d) => `Resistance strikes near ${d.name}`,
  body: (_e, d) => `Saboteurs have cut lines and raided stores around ${d.name}. Rear-area security is stretched.`,
  weight: 0.8,
  prepare: (env) => {
    const ls = Object.values(env.state.locations).filter((l) => env.state.nations[l.owner]?.side === env.side && env.state.nations[l.originalOwner]
      && env.state.nations[l.originalOwner].side !== env.side && (l.damaged ?? 0) < 80).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!ls.length) return null;
    const l = ls[Math.min(ls.length - 1, Math.floor(env.rand() * ls.length))];
    return { locationId: l.id, name: l.name, pos: l.pos };
  },
  impact: (env, d) => {
    const l = env.state.locations[d.locationId as string];
    l.damaged = Math.min(100, (l.damaged ?? 0) + 20);
    adjRes(env.state, env.nation, 'supplyPoints', -8);
    for (const u of sideUnits(env.state, env.side, (x) => haversineKm(x.pos, l.pos) <= 40)) adj(u, 'supply', -8);
  },
  choices: [
    {
      id: 'sweep', label: 'Security sweep', effectSummary: 'The 2 nearest infantry units gain 10 fatigue; infrastructure damage reduced by 15.',
      apply: (env, d) => {
        const l = env.state.locations[d.locationId as string];
        l.damaged = Math.max(0, (l.damaged ?? 0) - 15);
        for (const u of nearest(l.pos, sideUnits(env.state, env.side, (x) => x.type === 'infantry'), 2)) adj(u, 'fatigue', 10);
      },
    },
    { id: 'ignore', label: 'Accept the disruption', effectSummary: 'No cost; damage stands.', apply: () => undefined },
  ],
  defaultChoiceId: 'ignore', aiChoiceId: 'sweep',
};

export const strategicOpportunity: EventTemplate = {
  id: 'evt_strategic_opportunity', kind: 'dynamic', category: 'intelligence', tone: 'favourable', target: 'any', cooldownMinutes: 48 * 60,
  title: (_e, d) => `Opportunity at ${d.name}`,
  body: (_e, d) => `Reconnaissance finds ${d.name} thinly held. A prompt thrust could take it before the enemy reacts.`,
  weight: 1.0,
  prepare: (env) => {
    const foes = sideUnits(env.state, env.enemySide);
    const mine = sideUnits(env.state, env.side, (u) => isCombat(u));
    let best: { id: string; name: string; pos: [number, number]; v: number } | null = null;
    for (const l of Object.values(env.state.locations)) {
      if (env.state.nations[l.owner]?.side !== env.enemySide || l.value < 3) continue;
      const garrison = foes.filter((u) => haversineKm(u.pos, l.pos) <= 25).reduce((s, u) => s + u.manpower / Math.max(1, u.manpowerMax), 0);
      if (garrison > 1.0) continue;
      if (!mine.some((u) => haversineKm(u.pos, l.pos) <= 150)) continue;
      if (!best || l.value > best.v) best = { id: l.id, name: l.name, pos: l.pos, v: l.value };
    }
    return best ? { locationId: best.id, name: best.name, pos: best.pos } : null;
  },
  choices: [
    {
      id: 'exploit', label: 'Strike now', effectSummary: 'The 3 nearest combat units within 150 km are readied: +20 fuel, +15 ammo, +8 morale, posture set to attack.',
      apply: (env, d) => {
        const pos = d.pos as [number, number];
        const pool = sideUnits(env.state, env.side, (u) => isCombat(u) && haversineKm(u.pos, pos) <= 150);
        const mobile = pool.filter(isMobile);
        for (const u of nearest(pos, mobile.length >= 3 ? mobile : pool, 3)) { adj(u, 'fuel', 20); adj(u, 'ammo', 15); adj(u, 'morale', 8); u.posture = 'attack'; }
        return `Forces readied against ${d.name}.`;
      },
    },
    { id: 'ignore', label: 'Stay on plan', effectSummary: 'Nothing changes.', apply: () => undefined },
  ],
  defaultChoiceId: 'ignore', aiChoiceId: 'exploit',
};
