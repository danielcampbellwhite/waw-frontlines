# Roadmap
- [x] Phase 0 Foundation: contracts, architecture, data pipeline, tooling
- [~] Phase 1 Playable foundation: Fall of France, orders, real-time clock, combat, AI, front lines, victory. Integrated and running; QA in progress.
- [ ] Phase 2 Strategic simulation: deeper logistics tuning, weather/event polish, battle reports, better AI/fog (much is already in the slice; needs balance + QA)
- [ ] Phase 3 Campaign system: save/load UI polish, objective/briefing polish, scale variants
- [ ] Phase 4 Campaign expansion: Britain, N. Africa, Barbarossa, Stalingrad, Italy, Normandy, Bulge, Pacific (each needs researched OOB, terrain/bbox data, special systems). Currently listed as locked.
- [ ] Phase 5 Advanced gameplay: air/naval warfare, special systems modules, commander specialisations
- [ ] Phase 6 Audio/presentation: procedural audio exists; refine
- [ ] Phase 7 Release testing, perf, browser matrix, desktop packaging

## Requested by product owner: onboarding tutorial / tour (final polish phase)
Build once UI and campaign set are stable (the tour anchors to real UI elements):
- First-run guided tour overlay on the real UI (map, select unit, move order, pause/speed, supply/fuel, battle report, save), each step waits for the player to act; skippable, "don't show again", re-openable from Help.
- Small tutorial scenario (real geography, sourced data) so the tour is played, not read.
- Quick-reference panel (orders, supply, fog of war, symbols/colours).
Owner: ui-engineer (+ campaign-engineer for the scenario, qa-engineer for the pass). Estimate 1-2 h.
