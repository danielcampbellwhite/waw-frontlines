# WORLD AT WAR: FRONTLINES — Technical Architecture (v1, Team Lead)

Stack: React 19 + TypeScript (strict, `erasableSyntaxOnly` → no enums/namespaces) + Vite + MapLibre GL JS + custom
deterministic simulation + IndexedDB (`idb`) + Web Audio + Vitest. Targets browser; later Tauri/Electron packaging.

## Golden rules
1. **Contracts live in `src/core/types.ts`.** Changing it needs lead approval. State is plain JSON.
2. **Coordinates are WGS84 `[lon, lat]`; distances km (haversine, `src/core/geo.ts`).** No pixel maths in sim.
3. **Sim is headless.** `src/sim`, `src/military`, `src/ai`, `src/events` must never import React/MapLibre/DOM.
4. **Determinism.** All randomness via `src/core/rng.ts` using `state.rng`. Never `Math.random`/`Date.now` in sim.
   Fixed tick = `TICK_MINUTES` (60). Real time only decides *how many ticks* run (`engine.advance`).
5. **One mutation path.** UI and AI both call `engine.dispatch(Command)`. UI never writes state.
6. **Data-driven campaigns.** `ScenarioDefinition` JSON in `src/data/campaigns/`; campaign-specific mechanics are
   plug-in modules registered by id in `ScenarioDefinition.specialSystems` (`src/sim/special/`).
7. **Historical integrity.** Every unit/location/date in scenario JSON traces to `sources[]` and
   `docs/HISTORICAL_SOURCES.md`. Unknown ⇒ omit or mark `"unverified"`, never invent.

## Module ownership (agents edit ONLY their directories)
| Dir | Owner | Purpose |
|---|---|---|
| `src/core/`, `src/main.tsx`, `src/app/`, `src/save/`, docs/*.md (shared) | Lead | contracts, app shell/integration, save/load |
| `src/map/`, `scripts/data/`, `public/data/` | Agent 1 Map | data pipeline (Natural Earth, elevation), terrain grid, MapLibre layers |
| `src/sim/` (engine, clock, movement, combat, weather, territory, fog, special/) | Agent 2 Sim | `createEngine()` |
| `src/military/` | Agent 3 Military | catalog, orders processor, supply/logistics, reinforcements, org/recovery |
| `src/ai/`, `src/events/` | Agent 4 AI/Events | enemy AI, event engine + templates |
| `src/data/` | Agent 5 Campaign | scenarios, validators, sources |
| `src/ui/`, `src/audio/` | Agent 6 UI/Audio | all React UI, Web Audio |
| `tests/`, `docs/TESTING_REPORT.md`, `KNOWN_ISSUES.md` | Agent 7 QA | independent integration tests |

## Tick pipeline (`src/sim/engine.ts`, one tick = 60 sim-min), in order
1. `military.processReinforcements`  2. `events.update` (fire due events, apply effects)  3. weather update (every 6 ticks)
4. `ai.think` per AI nation (every N ticks, uses `dispatch` only)  5. `military.processOrders` (activate/queue/complete)
6. movement (`sim/movement`)  7. combat detection + resolution (`sim/combat`)  8. `military.updateSupply` (every 3 ticks)
9. `military.updateUnitStats` (fuel/ammo/fatigue/org recovery)  10. territory update (`sim/territory`)
11. fog-of-war update  12. objectives/victory check  13. notify subscribers.

## Cross-module function contracts (signatures are binding)
```ts
// src/sim/engine.ts
export function createEngine(scenario: ScenarioDefinition, terrain: TerrainGrid, infra: InfraLine[],
  opts: { playerNation: NationId; settings: GameSettings; seed: number }): Engine;
export function restoreEngine(saved: GameState, scenario: ScenarioDefinition, terrain: TerrainGrid, infra: InfraLine[]): Engine;

// src/sim/pathfinding.ts  (Sim owns; Military/AI/UI call it for ETA preview)
export function findRoute(terrain: TerrainGrid, infra: InfraLine[], unit: Unit, to: LonLat, state: GameState): { path: LonLat[]; km: number; etaMinutes: number } | null;
export function unitSpeedKmh(unit: Unit, terrain: Terrain, weather: WeatherKind, onRoad: boolean): number;

// src/military/index.ts  (Military owns; sim calls)
export function applyCommand(state: GameState, cmd: Command, as: SideId | 'any'): CommandResult;
export function processOrders(state: GameState, ctx: SimContext): void;
export function processReinforcements(state: GameState): void;
export function updateSupply(state: GameState, ctx: SimContext): void;
export function updateUnitStats(state: GameState, ctx: SimContext): void;
export function createUnitFromTemplate(templateId: string, overrides: Partial<Unit>): Unit;
// Military logistics read/event hooks (src/military/index.ts). Reads are pure (never mutate state); writes are for events.
export function portCapacity(state: GameState, locationId: string): PortStatus | null;   // { tonsPerDay, usedTodayTons, remainingTonsToday, operational, availability, besieged }; null if not a port
export function operationalPorts(state: GameState, side: SideId): PortStatus[];          // operational ports of a side, sorted by location id
export function setPortRelief(state: GameState, locationId: string, relieved: boolean): void;                     // besieged port relieved by sea
export function setLocationThroughputFactor(state: GameState, locationId: string, factor: number, hours?: number): void; // storm damage / repair (factor 1 clears)
export function setLocationAvailableFrom(state: GameState, locationId: string, fromHour: number, rampHours?: number): void; // temporary ports (Mulberry), ramp-up
// Location data fields read by logistics: airliftTonsPerDay, throughputTonsPerDay/Month, besiegedShare, availableFromHour, rampHours

// src/ai/index.ts (AI owns)
export function aiThink(state: Readonly<GameState>, nation: NationId, ctx: SimContext): Command[];   // pure: returns commands
// src/events/index.ts (Events owns)
export function updateEvents(state: GameState, ctx: SimContext): void;
export function applyEventChoice(state: GameState, eventId: string, choiceId: string): CommandResult;

// src/data/index.ts (Campaign owns)
export function listScenarios(): ScenarioMeta[];  export function loadScenario(id: string): Promise<{def: ScenarioDefinition; terrain: TerrainGrid; infra: InfraLine[]}>;
export function validateScenario(def: ScenarioDefinition): string[];  // list of errors

// SimContext (defined in src/sim/context.ts by Sim agent)
interface SimContext { terrain: TerrainGrid; infra: InfraLine[]; scenario: ScenarioDefinition; rand(): number; gauss(): number; log(e: Omit<LogEntry,'t'>): void }
```
`aiThink` is pure with respect to state (returns Commands; the engine dispatches them with `as = nation's side`).
AI must read state through `engine.visibleUnits`-equivalent fog filtering (`src/sim/fog.ts: visibleTo(state, side)`).

## Map ↔ Sim rendering contract
Map reads `Readonly<GameState>` + `TerrainGrid` each frame (rAF-throttled, change-detected via `clock.minutes`).
Units rendered as a MapLibre GeoJSON symbol layer (NATO-style canvas-generated icons). Front line = marching-squares
contour of `ControlGrid.owner` smoothed (Chaikin) — computed in `src/map/frontline.ts` (pure fn: ControlGrid → LonLat[][]).
Terrain grid is generated offline by `scripts/data/*` from Natural Earth + public DEM into `public/data/*.json`.

## Save/load (`src/save/`)
IndexedDB db `theatre-command`, stores `saves` (key slot id) and `meta`. Record = `{ id, name, savedAt, summary, schema, checksum, state: GameState }`.
Checksum = FNV-1a over JSON. Autosave every N sim-hours + on `visibilitychange`/`beforeunload`. Export/import as `.tcsave` JSON.
Migrations: `migrations[fromVersion](state) → state` chain keyed on `schema`.

## Critical risks
1. Real terrain data volume → mitigated by coarse raster (0.05–0.1°) clipped per scenario, loaded lazily.
2. Pathfinding cost with many units → grid A* with cached routes, per-tick budget.
3. Sim/UI coupling → state read-only for UI, `dispatch` only.
4. Historical data accuracy → source register, validator, QA audit, never invent.
5. Scope: Phase-gated; vertical slice (Fall of France) before other campaigns.
6. Large saves → JSON of ControlGrid compacted (run-length), units only.
