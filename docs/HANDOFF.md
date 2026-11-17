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

## Open items
1. Map: Normandy OSM rivers/roads/rail (Overpass failing; currently Natural Earth only); Ardennes/N. Africa roads/rail; Via Balbia.
2. Art: infantry-gets-gun-photo fix confirmation; USA/SOV/ROU/ITA/Commonwealth photo batches; Blenheim credit cleanup; unused-symbol tsc errors in src/art/index.ts.
3. Not started: Britain, Barbarossa, Italy, Pacific campaigns; Standard/Grand scales; naval/air-war systems; tutorial/tour (final polish); human playtest; audio never heard by a human.
4. Release: replace public OSM tile URL; decide whether to force historical outcomes (default: no).
5. Housekeeping: delete tests/military.tmpbis.test.ts (scratch); kill stray vite servers by PID (only this project's).
