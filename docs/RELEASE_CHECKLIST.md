# Release checklist - WORLD AT WAR: FRONTLINES

Run on a quiet frozen copy of the tree (copy without node_modules, junction node_modules) so no agent edits land mid-run.

## 1. Automated gates (all must be green)
- [ ] `npx tsc -p tsconfig.app.json --noEmit` - 0 errors
- [ ] `npx tsc -p tests/tsconfig.json --noEmit` - 0 errors
- [ ] `npx vitest run --no-file-parallelism` - 0 failures (timing tests are load-sensitive; run when the machine is idle). Note: `tests/ui.components.test.ts` fails in a frozen copy only if node_modules is a junction (vite fs deny); run it in the live tree.
- [ ] `npm run build` succeeds; note bundle size
- [ ] No stray scratch tests (`tests/**/tmp*.test.ts`, `*.tmp*.test.ts`, `ai.probest`, `ai.pc`) and no leftover vite servers

## 2. Determinism and save/load
- [ ] tests/qa/determinism, aidet (AI-vs-AI hashes stable), saveload pass
- [ ] Sim code has no DOM, Math.random, Date.now (grep src/sim src/military src/ai src/events)

## 3. Browser E2E (every playable campaign)
Script: `tests/qa/e2e/release.e2e.mjs` (Playwright). Start `npx vite --port <free port> --strictPort`, then
`BASE_URL=http://localhost:<port>/ node tests/qa/e2e/release.e2e.mjs` (`ONLY=<name>` limits to one campaign; `PW=<path to playwright/index.mjs>` if the default path is absent).
Per campaign it checks: menu -> campaign -> nation -> briefing -> begin (tour skipped) -> 1 game day at 8x -> save -> export -> autosave slots listed -> import -> reload -> main menu Load -> date matches the save -> zero console errors.
- [ ] All playable campaigns pass (see docs/TESTING_REPORT.md for the last run)
- [ ] Manual: audio on/off at zoom, units readable at strategic and tactical zoom, settings persist, credits screen shows photo credits (docs/IMAGE_CREDITS.md)
- [ ] Manual: human playtest of Barbarossa as GERMANY vs the Soviet AI (can the player reach Minsk/Smolensk by bypassing, pocketing and pacing fuel?) and as SOVIET vs the German AI; record outcome and pace vs KNOWN_ISSUES "Barbarossa AI balance"
- [ ] Manual: one human playthrough of each other campaign (first 2 game days) with sound on; note anything unreadable, unfair or broken

## 4. Balance and campaign sanity (tests/qa balance suites)
- [ ] Every campaign x playable nation x 5 seeds, passive and AI-vs-AI: every run ends (no 'none'), no zero-score anomalies
- [ ] Record the distributions in docs/TESTING_REPORT.md and any one-sided outcomes in docs/KNOWN_ISSUES.md
- [ ] dataaudit passes for every scenario (coordinates on correct terrain, supply sources, objectives resolve)

## 5. Content and licensing
- [ ] docs/HISTORICAL_SOURCES.md cites every scenario's data; nothing invented
- [ ] docs/IMAGE_CREDITS.md and src/art/credits.json complete (no boilerplate credits); audio licences CC0/checked
- [ ] Replace the public OSM tile URL for production hosting (tile usage policy)
- [ ] Locked/planned campaigns clearly marked and not startable

## 6. Performance
- [ ] tickperf: per-100-tick mean under budget, worst single tick < 150 ms
- [ ] Browser: no long freezes at 8x on the largest campaign (Barbarossa)

## 7. Hand-off
- [ ] docs/KNOWN_ISSUES.md reviewed (open severities), docs/HANDOFF.md current
- [ ] git commit only after all boxes above are ticked
