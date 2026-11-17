# HANDOFF - updated 2026-11-17

Project: WORLD AT WAR: FRONTLINES - see CLAUDE.md, docs/TECHNICAL_ARCHITECTURE.md. Git: snapshots on master (see `git log`).

## What works
Five campaigns playable end to end (Fall of France, Ardennes/Bulge, Crusader, Stalingrad, Normandy; Short scale, FoF also Standard):
main menu -> campaign -> nation -> briefing -> game, real engine, real map, orders, supply/fuel, combat + reports, fog, AI, events, saves (IndexedDB), audio, photo/illustrated icons.
Run: `npm run dev` (http://localhost:5173), tests `npx vitest run --no-file-parallelism`, `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tests --noEmit`.

## Team (Claude sub-agents, names for SendMessage)
map-engineer, sim-engineer, military-engineer, ai-events-engineer, campaign-engineer, ui-engineer, qa-engineer, art-engineer. Brief them from CLAUDE.md + architecture doc.

## Normandy specifics (new)
- Scenario flags (ScenarioDefinition): `seaSupply` (coastal ports/depots are supply sources; territory.ts calls military.isSeaSupplied), `weatherControl {stormScale}` (random storms off; Great Storm is scripted), `captureBlockKm` (6.5, opt-in; default 4 km).
- Measure Normandy with AI_TICKS=1400 (runs to h1320; hold objectives score only at the end).
- Known balance issues: docs/KNOWN_ISSUES.md ("Normandy AI balance", Axis bimodal; Elsenborn 3/5 variance; FoF seed 4).
- Measure balance on a FROZEN COPY of the repo, never the live tree (shared tree changes under probes). Never remove a tuned mechanic without re-running dependent probes.

## Campaign data (campaign-engineer)
- Scenario data is generated: `node src/data/campaigns/_build/build_<id>.mjs` writes `<id>.short.json`, `<id>.short.sources.json` and `<campaign>.events.json` (do not hand-edit the JSON; edit the generator and its `<id>_sources.mjs` register). Scenarios: fall_of_france (Standard and Short), bulge, crusader, stalingrad, normandy, barbarossa. After a rebuild run `node scripts/data/audit.mjs`, `npx vitest run tests/data tests/qa/startsupply.test.ts tests/qa/dataaudit.test.ts` and `npx tsc -p tsconfig.app.json --noEmit`.
- Rules: every fact traces to a source id in docs/HISTORICAL_SOURCES.md; game-scale values are labelled G01; unsourced or approximate items go in the sidecar `uncertain[]`. Research notes: docs/NORTH_AFRICA_RESEARCH.md, EASTERN_FRONT_RESEARCH.md, NORMANDY_RESEARCH.md, BARBAROSSA_RESEARCH.md. Field guide: docs/CAMPAIGN_DATA_GUIDE.md.
- Barbarossa (22 Jun-30 Sep 1941, 2,400 ticks, GER and SOV): army and panzer-group level units, all strengths game-scale. Axis forward hubs are capture-activated supply sources with rampHours 240 (G06); the validator allows an enemy-owned source only with rampHours. Coordinates come from the Wikipedia API (barbarossa_coords.json). Known gaps: no gauge concept in the engine (captured Soviet rail counts as usable), Narew and Berezina missing from terrain, Romanian/Finnish forces, Southern Front, air and naval units not modelled, Soviet reserve arrival dates approximate, Pskov date discrepancy (8 vs 10 Jul) kept open.
- Normandy: English embarkation ports are in-bbox supply sources; beaches/Mulberries are not sources; `seaSupply`, `captureBlockKm` 6.5 and `weatherControl` stormScale 0 are set.

## Open items
1. Map: Normandy OSM rivers/roads/rail (Overpass failing; currently Natural Earth only); Ardennes/N. Africa roads/rail; Via Balbia.
2. Art: infantry-gets-gun-photo fix confirmation; USA/SOV/ROU/ITA/Commonwealth photo batches; Blenheim credit cleanup; unused-symbol tsc errors in src/art/index.ts.
3. Not started: Britain, Italy, Pacific campaigns; Standard/Grand scales; naval/air-war systems; tutorial/tour (final polish); human playtest; audio never heard by a human.
4. Release: public OSM tile URL and Google Fonts are GONE (self-contained basemap, local fonts); decide whether to force historical outcomes (default: no).
5. Housekeeping: delete tests/military.tmpbis.test.ts (scratch); kill stray vite servers by PID (only this project's).

## Sim: opening surprise
Optional `openingSurprise` scenario field (see TECHNICAL_ARCHITECTURE.md "Opening surprise"); campaign-engineer sets it per scenario (e.g. Barbarossa victimNations ['SOV']). Tests: tests/sim.combat.test.ts.
