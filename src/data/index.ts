import type { CampaignScale, InfraLine, NationId, ScenarioDefinition, TerrainGrid } from '../core/types.ts';
import { PLANNED_CAMPAIGNS } from './planned.ts';
import { validateScenario, validateEventEffects, inBBox } from './validate.ts';
import type { ScenarioSidecar } from './validate.ts';
import fofStandard from './campaigns/fall_of_france.standard.json';
import fofStandardSrc from './campaigns/fall_of_france.standard.sources.json';
import fofShort from './campaigns/fall_of_france.short.json';
import fofShortSrc from './campaigns/fall_of_france.short.sources.json';
import fofEvents from './campaigns/fall_of_france.events.json';
import bulgeShort from './campaigns/bulge.short.json';
import bulgeShortSrc from './campaigns/bulge.short.sources.json';
import bulgeEvents from './campaigns/bulge.events.json';
import crusaderShort from './campaigns/crusader.short.json';
import crusaderShortSrc from './campaigns/crusader.short.sources.json';
import crusaderEvents from './campaigns/crusader.events.json';
import stalingradShort from './campaigns/stalingrad.short.json';
import stalingradShortSrc from './campaigns/stalingrad.short.sources.json';
import stalingradEvents from './campaigns/stalingrad.events.json';

export { validateScenario } from './validate.ts';
export type { ScenarioSidecar } from './validate.ts';
export { PLANNED_CAMPAIGNS } from './planned.ts';

export type ScenarioStatus = 'available' | 'planned';

/** Entry shown on the scenario-selection screen. `status:'planned'` must be rendered greyed out and NOT selectable. */
export interface ScenarioMeta {
  id: string;
  campaignId: string;
  title: string;
  scale: CampaignScale;
  startDate: string;
  endDate: string;
  estimatedPlayMinutes: [number, number];
  nations: NationId[];                   // playable nations
  status: ScenarioStatus;
  playable: boolean;                     // === (status === 'available')
  statusLabel: string;                   // e.g. 'Coming in Phase 4'
  complexity?: number;
  mapSize?: 'small' | 'medium' | 'large';
  blurb?: string;
}

export interface LoadedScenario { def: ScenarioDefinition; terrain: TerrainGrid; infra: InfraLine[] }
/** Fetches and parses a JSON file under /data/. Injected in node tests; default uses browser fetch. */
export type DataLoader = (file: string) => Promise<unknown>;

export interface HistoricalEventData {
  id: string; date: string; title: string; body: string; kind: 'historical'; pos?: [number, number]; side?: string;
  src: string[]; effectHints: string[]; minutesFromStd: number;
  /** Structured effects (src/events EffectSpec shape); only present where a direct restatement of a sourced fact. */
  effects?: Record<string, unknown>[]; effectsNote?: string;
}

const REGISTRY: { def: ScenarioDefinition; sidecar: ScenarioSidecar }[] = [
  { def: fofStandard as unknown as ScenarioDefinition, sidecar: fofStandardSrc as unknown as ScenarioSidecar },
  { def: fofShort as unknown as ScenarioDefinition, sidecar: fofShortSrc as unknown as ScenarioSidecar },
  { def: bulgeShort as unknown as ScenarioDefinition, sidecar: bulgeShortSrc as unknown as ScenarioSidecar },
  { def: crusaderShort as unknown as ScenarioDefinition, sidecar: crusaderShortSrc as unknown as ScenarioSidecar },
  { def: stalingradShort as unknown as ScenarioDefinition, sidecar: stalingradShortSrc as unknown as ScenarioSidecar },
];

export function listScenarios(): ScenarioMeta[] {
  const live: ScenarioMeta[] = REGISTRY.map(({ def }) => ({
    id: def.id, campaignId: def.campaignId, title: def.title, scale: def.scale, startDate: def.startDate, endDate: def.endDate,
    estimatedPlayMinutes: def.estimatedPlayMinutes, nations: def.playableNations.map((p) => p.nation),
    status: 'available', playable: true, statusLabel: 'Available', complexity: def.complexity, mapSize: def.mapSize,
    blurb: def.briefing.situation,
  }));
  const planned: ScenarioMeta[] = PLANNED_CAMPAIGNS.map((c) => ({
    id: c.id, campaignId: c.campaignId, title: c.title, scale: c.scale, startDate: c.startDate, endDate: c.endDate,
    estimatedPlayMinutes: c.estimatedPlayMinutes, nations: c.nations, status: 'planned', playable: false,
    statusLabel: 'Coming in Phase 4', blurb: c.blurb,
  }));
  return [...live, ...planned];
}

export function getScenarioDefinition(id: string): ScenarioDefinition | undefined {
  return REGISTRY.find((r) => r.def.id === id)?.def;
}
export function getScenarioSidecar(id: string): ScenarioSidecar | undefined {
  return REGISTRY.find((r) => r.def.id === id)?.sidecar;
}
/** Historical event template data for a campaign (consumed by the events engine). */
export function getHistoricalEvents(campaignId: string, scenarioId?: string): HistoricalEventData[] {
  const all = allHistoricalEvents(campaignId);
  const def = scenarioId ? getScenarioDefinition(scenarioId) : undefined;
  if (!def) return all;
  // Keep only events whose structured effects are valid in this scenario (nations/locations must exist). Events with no effects stay as narrative.
  return all.filter((ev) => validateEventEffects(ev, def).length === 0);
}

function allHistoricalEvents(campaignId: string): HistoricalEventData[] {
  if (campaignId === 'fall_of_france') return fofEvents.events as unknown as HistoricalEventData[];
  if (campaignId === 'bulge') return bulgeEvents.events as unknown as HistoricalEventData[];
  if (campaignId === 'crusader') return crusaderEvents.events as unknown as HistoricalEventData[];
  if (campaignId === 'stalingrad') return stalingradEvents.events as unknown as HistoricalEventData[];
  return [];
}

const browserLoader: DataLoader = async (file) => {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  const res = await fetch(`${base}data/${file}`.replace('//data', '/data'));
  if (!res.ok) throw new Error(`Failed to load /data/${file}: HTTP ${res.status}`);
  return res.json();
};

/**
 * Load a scenario plus its terrain & infra. Rejects for unknown or planned (not yet available) ids and for
 * scenarios that fail validation. In the browser terrain/infra come from /data via fetch; tests inject `loader`.
 */
export async function loadScenario(id: string, loader: DataLoader = browserLoader): Promise<LoadedScenario> {
  if (PLANNED_CAMPAIGNS.some((c) => c.id === id)) throw new Error(`Scenario '${id}' is planned (Coming in Phase 4) and cannot be loaded`);
  const entry = REGISTRY.find((r) => r.def.id === id);
  if (!entry) throw new Error(`Unknown scenario '${id}'`);
  const errors = validateScenario(entry.def, entry.sidecar);
  if (errors.length) throw new Error(`Scenario '${id}' failed validation:\n${errors.join('\n')}`);
  const [terrain, infraRaw] = await Promise.all([loader(entry.def.terrainFile), loader(entry.def.infraFile)]);
  const t = terrain as TerrainGrid;
  if (!t?.bbox || !Array.isArray(t.cells) || t.cells.length !== t.cols * t.rows) throw new Error(`Terrain file ${entry.def.terrainFile} malformed`);
  const b = entry.def.bbox;
  if (!inBBox(t.bbox, [b.west, b.south]) || !inBBox(t.bbox, [b.east, b.north])) throw new Error(`Terrain bbox does not cover scenario bbox for '${id}'`);
  const infra = Array.isArray(infraRaw) ? (infraRaw as InfraLine[]) : ((infraRaw as { lines?: InfraLine[] })?.lines ?? null);
  if (!infra) throw new Error(`Infra file ${entry.def.infraFile} malformed (expected array or {lines:[]})`);
  return { def: structuredClone(entry.def), terrain: t, infra };
}
