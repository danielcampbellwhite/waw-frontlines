# Campaign Data Guide

How to add a campaign to WORLD AT WAR: FRONTLINES. Owner: campaign-data agent. Code: `src/data/`.

## Files per scenario (`src/data/campaigns/`)
| File | Purpose |
|---|---|
| `<campaign>.<scale>.json` | `ScenarioDefinition` (schema v1, `src/core/types.ts`). `id` = `<campaignId>.<scale>` |
| `<campaign>.<scale>.sources.json` | **Sidecar**: per-unit/location/objective source ids (types.ts has no per-fact sourceRef), victory tiers, uncertain list |
| `<campaign>.events.json` | Historical event template data (dated, sourced) for the events engine |
| `_build/*.mjs` | Optional generator (Fall of France uses it: `node src/data/campaigns/_build/build_fall_of_france.mjs`). Edit the generator, not the JSON, when one exists |

## Steps
1. **Research first.** Add every source to `docs/HISTORICAL_SOURCES.md` with ID, citation, URL, and the facts depending on it. Unverifiable => omit, or mark approximate in `uncertain`.
2. Write the scenario: `bbox`, `terrainFile`/`infraFile` (names under `public/data/`, produced by the map pipeline; sub-bbox scenarios may reuse the parent terrain file - the terrain bbox must cover the scenario bbox), `nations`, `locations`, `units`, `reinforcements`, `objectives`, `supplySources`, `initialControl`, `weatherProfile`, `eventTemplateIds`, `sources`.
3. Every unit/location needs an entry in the sidecar with `sources: [ids]` that exist in `def.sources`. Positions inferred rather than sourced cite the position-policy source and set `positionApproximate`.
4. Numbers that are rounded or invented for balance (manpower, equipment points, resources, morale) must cite the game-scale abstraction source (G01). Never present them as historical strengths.
5. Register the JSON in `REGISTRY` in `src/data/index.ts` (import both JSON files).
6. Run `npx vitest run tests/data.validator.test.ts` - the validator must return no errors.

## Validator (`validateScenario(def, sidecar?)`)
Checks: schema v1; unique unit/location/objective/reinforcement/source ids; unit & location & reinforcement coordinates inside `bbox`; nations valid (`NationId`) and declared in `nations[]`; parentId/homeLocation/objective/supply/reinforcement location references resolve; playable nations flagged playable; objective ids referenced by playable nations exist; weather probabilities sum to 1; dates ordered; with sidecar: every unit and location has source refs and all ids resolve in `sources[]`.

## Event effects
`<campaign>.events.json` events may carry `effects` (src/events `EffectSpec`) plus an `effectsNote` stating which sourced fact they restate. `effectHints` stay free text. Effect `op`s: `resource`, `unit_stat`, `unit_manpower`, `location_owner`, `location_damage`, `weather`, `reinforce`, `log`, and `port_relief` (`{"op":"port_relief","locationId":"tobruk","on":true}`: marks a besieged port as relieved by sea so it keeps its besieged throughput share, 30% by default; `on:false` ends it; ignored if the location id is unknown). Further ops (Normandy): `{"op":"port_throughput","locationId":"mulberry_a","factor":0.1,"hours":72}` scales a port's throughput (0 wrecks it, 1 repairs, `hours` omitted = permanent); `{"op":"port_available","locationId":"mulberry_b","fromHour":300,"rampHours":24}` makes a location unusable until `fromHour` (campaign hours) then ramps it to full; `{"op":"weather","kind":"storm","intensity":0.9,"hours":72}` holds a weather kind for `hours` (alternatively `durationMinutes`; default 24 h), e.g. the Great Storm from 19 Jun 1944 (hour 312 from 6 Jun 00:00). Unknown locations are ignored at run time and rejected by the validator. Do not add effects that are balance inventions or that would script an outcome the player controls.

## Conventions
- `supplySources` locations must be owned at start by the nation or a nation on the same side (e.g. BEF base ports in France); cite the rationale in sources.
- Coordinates `[lon, lat]`. Time in minutes from `startDate`. 60 min per tick.
- Unit ids: `<nation>.<kind>.<number>` (`ger.pz.007`, `fra.di.055`). HQ units form the org tree via `parentId`.
- `initialControl` is painter's order (later wins); first entry is `NEUTRAL` over the whole bbox.
- Objectives are per `side`; `playableNations[].objectiveIds` picks the ones shown to each nation.
- Victory tiers live in `def.victoryTiers` (per side, fractions of that side's max objective points: decisive/strategic/limited/stalemate); ending = highest tier reached, else defeat. Fall of France uses 0.8/0.6/0.4/0.2 (game-scale). The sidecar holds sources only.
- Equipment keys used by Fall of France: `rifle, gun_arty, gun_at, tank_light, tank_medium, truck, armoured_car` (game-scale points; the Military catalog should map them).

## Planned campaigns
`src/data/planned.ts` holds skeleton metadata. They appear in `listScenarios()` with `status:'planned'`, `playable:false`, `statusLabel:'Coming in Phase 4'` and `loadScenario()` rejects them. To promote one, build its scenario, register it, and delete its `PLANNED_CAMPAIGNS` entry (its dates must then be verified and sourced).

## Loading
`loadScenario(id, loader?)` validates, then loads terrain/infra from `/data/<file>` with `fetch`; tests inject a `DataLoader`. Infra file may be an array or `{ lines: [...] }`.


## Battle of the Bulge (bulge.short)

Built by node src/data/campaigns/_build/build_bulge.mjs -> bulge.short.json, bulge.short.sources.json, bulge.events.json. Uses terrain_westeurope/infra_westeurope until a dedicated Ardennes grid exists (bbox is covered). Playable GER, USA, GBR. German fuel pool scaled to 40% (B06). Sidecar carries aiDoctrineHints and uncertain[]; air units deliberately omitted (no sourced formations).

## Operation Crusader (crusader.short)
Built by node src/data/campaigns/_build/build_crusader.mjs -> crusader.short.json, crusader.short.sources.json, crusader.events.json. bbox 19.0-30.5E, 28.5-33.0N; terrain_northafrica.json / infra_northafrica.json (Via Balbia pending: no Libyan roads in the infra file yet). Playable GBR, GER, ITA; RSA/NZL/IND/POL appear as unit nations. Axis fuel pool 40% scale (N02). Alexandria, Mersa Matruh, Sidi Barrani and Tobruk are British supply sources; Benghazi and Derna Axis (Tripoli off-map: see docs/NORTH_AFRICA_RESEARCH.md option A). No air units (unsourced). Sources N01, N02, N04, N05 plus G01-G04.

## Engine fields set by campaign data (ice, airlift, port throughput)
- `iceFromHour` / `iceFullHour` (optional `iceThawHour`): set only in stalingrad.short (168 / 504 hours, game-scale G01, flagged in uncertain[]; no thaw). Validator: both required together, From <= Full, Thaw > Full.
- `airliftTonsPerDay`: stalingrad gumrak = 136 (20% of the sourced 680 t/day, E03 says under 20% delivered, so an upper bound).
- `throughputTonsPerDay` / `throughputTonsPerMonth` (not both): crusader tobruk 1,500 t/day and benghazi 15,000 t/month (N05). `besiegedShare` left at the engine default.
- Only sourced values are set; unsourced ports/airfields carry no field.
