/** Weather & environment events. */
import type { WeatherKind } from '../../core/types';
import { adj, adjManpower, isMobile, sideUnits, spend, sideRes } from '../helpers';
import type { EventTemplate } from '../types';

const setWeather = (state: import('../../core/types').GameState, kind: WeatherKind, intensity: number, hours: number, now: number) => {
  state.weather = { kind, intensity, temperatureC: state.weather.temperatureC, nextChangeMinutes: now + hours * 60 };
};

export const weatherDeterioration: EventTemplate = {
  id: 'evt_weather_deterioration', kind: 'dynamic', category: 'weather', tone: 'neutral', target: 'player',
  title: 'The weather turns', cooldownMinutes: 36 * 60,
  body: (env) => (env.state.weather.temperatureC <= 0
    ? 'A cold front moves in. Heavy snow is forecast across the theatre; movement and air support will suffer.'
    : 'Low cloud and driving rain sweep across the front. Roads will deteriorate and air operations will be curtailed.'),
  weight: (env) => (['clear', 'cloud'].includes(env.state.weather.kind) ? 1.2 : 0),
  impact: (env) => {
    const cold = env.state.weather.temperatureC <= 0;
    setWeather(env.state, cold ? 'snow' : 'rain', 0.55 + env.rand() * 0.35, 12 + Math.floor(env.rand() * 24), env.now);
    env.log(cold ? 'Snowfall begins; movement slowed.' : 'Heavy rain begins; movement slowed.', 'warn');
  },
};

export const rasputitsa: EventTemplate = {
  id: 'evt_mud_thaw', kind: 'dynamic', category: 'weather', tone: 'neutral', target: 'player', cooldownMinutes: 72 * 60,
  title: 'The roads dissolve into mud',
  body: 'Persistent rain on thawing ground has turned tracks into bogs. Wheeled and tracked columns are sinking to their axles.',
  weight: (env) => (env.state.weather.kind === 'rain' && env.state.weather.temperatureC > -2 && env.state.weather.temperatureC < 12 ? 1.5 : 0),
  impact: (env) => {
    setWeather(env.state, 'mud', 0.8, 36 + Math.floor(env.rand() * 36), env.now);
    for (const u of sideUnits(env.state, env.side, isMobile)) adj(u, 'fuel', -5);
    for (const u of sideUnits(env.state, env.enemySide, isMobile)) adj(u, 'fuel', -5);
    env.log('Mud halts motorised movement on both sides; mobile units burn extra fuel.', 'warn');
  },
};

export const frostbite: EventTemplate = {
  id: 'evt_hard_frost', kind: 'dynamic', category: 'weather', tone: 'adverse', target: 'any', cooldownMinutes: 96 * 60,
  title: 'Hard frost grips the line',
  body: 'Temperatures plunge. Sentries freeze at their posts, weapons jam and vehicles refuse to start.',
  weight: (env) => (env.state.weather.temperatureC <= -5 ? 2 : 0),
  impact: (env) => {
    for (const u of sideUnits(env.state, env.side)) { adj(u, 'fatigue', 6); adj(u, 'morale', -3); }
  },
  choices: [
    {
      id: 'winter_kit', label: 'Issue emergency winter clothing', effectSummary: 'Spend 40 equipment: all your land units recover 6 fatigue and 3 morale.',
      available: (env) => sideRes(env, 'equipment') >= 40,
      apply: (env) => { spend(env, 'equipment', 40); for (const u of sideUnits(env.state, env.side)) { adj(u, 'fatigue', -6); adj(u, 'morale', 3); } return 'Winter kit distributed.'; },
    },
    {
      id: 'endure', label: 'Endure the cold', effectSummary: 'No cost, but frostbite claims 1.5% of manpower and morale drops a further 3.',
      apply: (env) => { for (const u of sideUnits(env.state, env.side)) { adjManpower(u, -0.015); adj(u, 'morale', -3); } return 'Frostbite casualties mount.'; },
    },
  ],
  defaultChoiceId: 'endure', aiChoiceId: 'winter_kit',
};

export const diseaseOutbreak: EventTemplate = {
  id: 'evt_disease_outbreak', kind: 'random', category: 'logistics', tone: 'adverse', target: 'any', cooldownMinutes: 120 * 60,
  title: 'Sickness in the ranks',
  body: (_e, d) => `Dysentery and fever sweep through ${(d.names as string[]).join(' and ')}, filling field hospitals.`,
  weight: (env) => (env.state.weather.kind === 'rain' || env.state.weather.kind === 'mud' || env.state.weather.temperatureC > 28 ? 1.2 : 0.4),
  prepare: (env) => {
    const us = sideUnits(env.state, env.side).filter((u) => u.fatigue > 30 && u.manpower > 200).sort((a, b) => b.fatigue - a.fatigue).slice(0, 2);
    return us.length ? { unitIds: us.map((u) => u.id), names: us.map((u) => u.shortName), pos: us[0].pos } : null;
  },
  impact: (env, d) => { for (const id of d.unitIds as string[]) { const u = env.state.units[id]; adjManpower(u, -0.04); adj(u, 'fatigue', 8); adj(u, 'morale', -4); } },
  choices: [
    {
      id: 'quarantine', label: 'Quarantine and treat', effectSummary: 'Spend 20 equipment: the affected units are ordered to rest, recovering 20 fatigue and 2% manpower.',
      available: (env) => sideRes(env, 'equipment') >= 20,
      apply: (env, d) => {
        spend(env, 'equipment', 20);
        for (const id of d.unitIds as string[]) { const u = env.state.units[id]; adjManpower(u, 0.02); adj(u, 'fatigue', -20); u.posture = 'rest'; }
        return 'Field hospitals set up; units resting.';
      },
    },
    { id: 'push_on', label: 'Push on regardless', effectSummary: 'No cost. Units remain on duty and sickness drains a further 2% manpower.',
      apply: (env, d) => { for (const id of d.unitIds as string[]) adjManpower(env.state.units[id], -0.02); } },
  ],
  defaultChoiceId: 'push_on', aiChoiceId: 'quarantine',
};
