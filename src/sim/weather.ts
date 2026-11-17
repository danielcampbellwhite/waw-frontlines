import type { GameState, ScenarioDefinition, WeatherKind, WeatherState } from '../core/types';
import type { SimContext } from './context';

/** 1..12 for the current sim date (from scenario start date + clock minutes). Pure arithmetic on a parsed constant. */
export function monthAt(scenario: ScenarioDefinition, minutes: number): number {
  const t = Date.parse(scenario.startDate) + minutes * 60_000;
  return new Date(t).getUTCMonth() + 1;
}
/** Hour of day 0..23 (UTC) at the current sim time. */
export function hourAt(scenario: ScenarioDefinition, minutes: number): number {
  const t = Date.parse(scenario.startDate) + minutes * 60_000;
  return new Date(t).getUTCHours();
}

const FALLBACK: Partial<Record<WeatherKind, number>> = { clear: 4, cloud: 3, rain: 2 };

function pick(items: [WeatherKind, number][], r: number): WeatherKind {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [k, w] of items) { if ((x -= w) <= 0) return k; }
  return items[items.length - 1][0];
}

export function rollWeather(scenario: ScenarioDefinition, minutes: number, prev: WeatherKind | undefined, ctx: Pick<SimContext, 'rand' | 'gauss'>): WeatherState {
  const prof = scenario.weatherProfile.find((p) => p.month === monthAt(scenario, minutes));
  const probs = prof?.probs && Object.keys(prof.probs).length ? prof.probs : FALLBACK;
  const wc = scenario.weatherControl;
  const items = (Object.entries(probs) as [WeatherKind, number][]).map(([k, w]): [WeatherKind, number] => [k, k === 'storm' && wc?.stormScale !== undefined ? w * wc.stormScale : w]).filter(([, w]) => w > 0);
  let kind = pick(items.length ? items : [['clear', 1]], ctx.rand());
  const temperatureC = (prof?.tempC ?? 12) + ctx.gauss() * 3;
  if (kind === 'rain' && temperatureC <= 0) kind = 'snow';
  else if (kind === 'snow' && temperatureC >= 3) kind = 'rain';
  // ground saturates after rain: if the profile admits mud, rain/storm is often followed by mud
  if ((prev === 'rain' || prev === 'storm') && (kind === 'clear' || kind === 'cloud') && (probs.mud ?? 0) > 0 && temperatureC > 1 && ctx.rand() < 0.45) kind = 'mud';
  if (wc?.suppress?.includes(kind)) kind = 'cloud';
  const intensity = Math.round((0.3 + 0.7 * ctx.rand()) * 100) / 100;
  const hours = 12 + Math.floor(ctx.rand() * 36);
  return { kind, intensity, temperatureC: Math.round(temperatureC * 10) / 10, nextChangeMinutes: minutes + hours * 60 };
}

export function updateWeather(state: GameState, ctx: SimContext): void {
  if (state.clock.minutes < state.weather.nextChangeMinutes) return;
  state.weather = rollWeather(ctx.scenario, state.clock.minutes, state.weather.kind, ctx);
}
