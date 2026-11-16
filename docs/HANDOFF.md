# HANDOFF - paused 2026-11-16 (user left work; resume at home)

Project: WORLD AT WAR: FRONTLINES - see CLAUDE.md, docs/TECHNICAL_ARCHITECTURE.md. Repo has NOT been committed to git (git init done, no commits).

## What works (Phase 1 vertical slice, Fall of France Standard + Short)
Main menu -> campaign select -> nation select -> briefing -> game, real engine, real OSM/Natural Earth map, orders, supply/fuel,
combat + reports, fog, AI, events, saves (IndexedDB), procedural + CC0 sampled audio, illustrated icons, stack clustering.
Run: `npm run dev` (http://localhost:5173), tests `npx vitest run` (use `--no-file-parallelism` for timing tests), `npx tsc -p tsconfig.app.json --noEmit`.

## Team (Claude sub-agents, names for SendMessage)
map-engineer, sim-engineer, military-engineer, ai-events-engineer, campaign-engineer, ui-engineer, qa-engineer, art-engineer.
Agents may need re-spawning in a new session (brief them from CLAUDE.md + architecture doc; ownership table is in the architecture doc).

## Open items / next steps
1. REAL PHOTOS (art-engineer): ~22 photos processed in public/art/units; src/art/manifest.json was an empty stub `[]` (lead-created) until art-engineer overwrote it;
   docs/IMAGE_CREDITS.md + src/art/credits.json needed. Then map-engineer + ui-engineer re-check photo markers/panel with REAL files (only tested with placeholders), and show credits in the Credits screen.
2. Balance: passive France gives Germany ~650-750 pts; Paris fell hour 864-1043 of 1100 (target ~day 36 = hour ~864); AI-as-France 250-500 axis; re-measure all three outcomes after redeployAir is enabled (ai-events-engineer).
3. Air: 78 air groups in Standard (sources weak: S19 forum post); air support is free (no sortie fuel/ammo drain); AI doesn't task air unless doctrine.redeployAir. Proper air warfare = Phase 5.
4. QA: full re-run + browser pass were in progress; tests/qa/ai 'no unit idle 500+ ticks' should exclude air units; perf tests are load-sensitive. See docs/TESTING_REPORT.md, docs/KNOWN_ISSUES.md.
5. Known limits: terrain forest/marsh approximations; roads/rail modern (historical:false); modern borders; sea supply link ignores distance; ports forced to land cells at terrain build (re-run `node scripts/data/build.mjs` + `scripts/data/audit.mjs` when scenario coordinates change).
6. Audio: stand-ins for tank/truck/artillery/MG; aircraft audio dropped; not yet listened to by a human (SFX hard on/off at zoom>=7 and in viewport).
7. Decisions for the user: force any player-controllable historical outcomes (Paris/Sedan/Cherbourg)? (default: no, left to play). Replace OSM public tile URL for production.
8. Phases 2-7 not started beyond the above: other 8 campaigns are listed as locked/planned; Grand campaigns, naval/air warfare, packaging.
9. Housekeeping: stray vite servers (ports 5199 etc.) may remain from agents; kill by PID, only ones whose command line is this project's vite.
