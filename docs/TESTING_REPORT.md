# Testing Report (QA / Integration, Agent 7)

All QA tests live in `tests/qa/` and run with `npx vitest run tests/qa` (slow ones: determinism ~6 min, longrun ~2 min, victory ~2 min, AI ~1 min). They run headless against `src/sim createEngine` with the real `fall_of_france.*` scenario JSON and the real `public/data` terrain/infra loaded from disk. `fake-indexeddb` was added as a devDependency for save tests. Source state tested: sim/military/ai/events at the time of writing (sim-engineer was still editing; `victory.ts` changed during the session and was re-run).

Shared helpers: `tests/qa/harness.ts` (world loader, whole-GameState invariant checker `checkInvariants`, `CJ` canonical JSON, `diffPaths`, `longWorld` = same scenario with end date pushed out and objectives removed so long runs are not cut short).

## Results summary

| Area | File | Tests | Result |
|---|---|---|---|
| Determinism | determinism.test.ts | 6 | pass |
| Save / load | saveload.test.ts | 8 | pass |
| Movement | movement.test.ts | 10 | 9 pass + 1 `it.fails` documenting L1 (sea-cell step) |
| Combat Monte-Carlo | combat.test.ts | 7 | pass (400 seeded battles) |
| AI vs AI | ai.test.ts | 10 | pass |
| Victory / objectives | victory.test.ts | 9 | pass |
| Long run | longrun.test.ts | 1 | pass |
| Data audit | dataaudit.test.ts | 22 (11 x 2 scenarios) | pass |

QA total 73 tests. Whole repo run (`npx vitest run`, 25 files, 273 tests, while 3 other processes were loading the CPU): 266 pass, 7 fail: 2 of mine (a too-strict assertion, since fixed, and the L1 test, now `it.fails`) and 5 of the sim-engineer's (`sim.combat.test.ts` x4 and the `sim.core.test.ts` 20 ms/tick 600-unit perf test). On immediate re-run in isolation those sim tests, mine and movement all passed (39 pass + 1 expected fail), so they were transient: src/sim was being edited and the perf test is load-sensitive. Re-run before release.

## 1. Determinism
- Same seed => byte-identical JSON after 1000 ticks, standard scale, AI on, fog on, for player = GER, FRA, GBR. PASS.
- Different seeds diverge (300 ticks). PASS.
- `step(150)` == 150 x `step(1)` == `advance(2000ms)` chunks at 1x == jittery `advance(250ms)` at 8x (replayed to same tick count). PASS.
- Subscriber callbacks, `getState`, `serialize`, `visibleUnits` calls mid-run do not perturb outcomes. PASS.

## 2. Save / load
- serialize -> FNV checksum -> JSON text -> parse -> `restoreEngine` -> continue 150 ticks == uninterrupted run (compared with canonical key-sorted JSON). PASS. Raw string equality FAILS because property insertion order differs after restore (issue L3, cosmetic).
- Restored engine keeps `disableAI`, speed and accumulator. PASS.
- IndexedDB (fake-indexeddb): save -> load; checksum stable across structured clone (state identical, even key order, to the live state); late-game state (400 ticks) too. PASS.
- Corruption: tampering a stored record => `loadGame` rejects with integrity error. Tampered `.tcsave` import rejected; non-save / invalid JSON rejected. Export/import round trip identical. Missing migration for old schema gives a clear error. Autosave rotation uses <= 3 slots. PASS.

## 3. Movement
- Infantry over 41.5 km plains: expected 11.9 h from `unitSpeedKmh`, actual 13 h (+9%, A* diagonal detours) PASS.
- Speed ordering recon (5 h) < armour (6 h) < infantry (19 h) over the same leg. PASS.
- Weather: armour 0.9 deg leg clear 6 h < rain 7 h < mud 12 h. Terrain: infantry plains 7 h < forest 9 h < mountains 16 h. Road: motorised 6 h off-road vs 2 h on road. PASS.
- Sea: moving into a Sea cell is accepted by `issue_order` (issue L2) but no route exists. Over 300 AI ticks one land unit stood on a coastal Sea cell for one tick (L1).
- Fuel: burns while moving; at 0 fuel armour slows 6.6 -> ~2 km/h but does not halt (M3).
- Supply cut: unit far from source ends with `supply` 20 and ammo not replenished (60) while the unit near the depot is 100/100; appears in `supply.cutOffUnits`. PASS.
- Adversarial orders: dead unit, unknown id, enemy-side unit (dispatch `as` the wrong side), empty unit list, NaN / off-map target: all rejected with a clear error, no state corruption. PASS.

## 4. Combat (400 seeded battles, flat plains fixture, AI off)
Attacker win rates over 50 seeds each: parity 4%, 2x attacker 96%, 2x defender 0%, defender 90% entrenched 0%, defender on mountains 0% (plains 4%), armour v infantry 98%, same in mud 72%.
- Stronger side wins; entrenchment, terrain and mud matter in the right direction. PASS.
- 1004 claims in `BattleReport.reasons` (terrain, entrenchment %, weather, man counts, power ratio arithmetic) were cross-checked against the unit/battle state captured at battle start: 0 contradictions (not fabricated). PASS.
- Casualties (killed+wounded+captured) <= starting manpower for every unit in every report; no NaN, stats stay 0..100 after each battle (invariant checker). PASS.
- Invariant checker (`checkInvariants`: stats 0..100, manpower 0..max, equipment >= 0, finite numbers everywhere, battle unit refs resolve, control indices valid, reports have reasons) ran every 50 ticks in the 1500-tick AI run and the 5000-tick run: 0 violations.

## 5. AI (1500 ticks, all nations AI incl. GBR via external `aiThink`, fog on)
- Mean tick 30 ms (p50 19, p95 65, max 148); GBR think total 2.8 s. Avg 68 units moving per tick.
- Commands issued: 901 `issue_order`, 17 `create_operation` (111 distinct operations seen, max 13 active), 212 `set_posture`, 8 cancels. 296 battle reports, 18 locations and 2480/70400 cells changed hands, 245 distinct attack targets.
- Fog: 68 orders targeting a specific enemy unit checked: 0 targeted a unit never seen by that side; 96 attack-point orders: 0 landed on an unseen enemy unit.
- Idle: 0 combat units idle >500 ticks.
- But see M2: the AI is too passive to win the campaign for Germany.

## 6. Victory / objectives
- Forced capture (unit parked on Lille): territory flips, objective achieved, Ending `decisive_victory`, `result` set, sim frozen, commands rejected, `advance()` returns 0. PASS.
- Hold objective achieved at `untilMinutes`; time-up with nothing achieved gives `defeat` with finite score; control_fraction and destroy_units evaluate; player elimination gives `defeat`. PASS.
- `victoryTiers` honoured: same score 40/100 gives `decisive_victory` under lenient tiers and `defeat` under strict tiers. PASS (was ignored in an earlier revision of victory.ts; fixed by sim-engineer during the session).
- Real campaign to end date (standard, no player input): result present at tick 1104 for GER (defeat, 0/1100), FRA (decisive, 800/975) and GBR (decisive, 900/975); history entry written; sim frozen after. PASS.

## 7. Long run (5000 ticks, standard, GER, AI on, objectives removed)
- Mean tick 16-22 ms in steady state (first sample 48 ms, JIT warmup); 5000 ticks in 93-127 s.
- Heap 68-164 MB (no monotonic growth). `log` capped 1500 (reached 476), `reports` capped 400 (hit 238), `history` 81 and `events` 75 (uncapped, +15 per 1000 ticks each, L4), `aiState` ~25 KB flat, `special` 2 KB, `eventState` 11 KB.
- Save size 415 KB at start, 684 KB at 4500, 1014 KB at 5000 (jump due to report spam M1); well under IndexedDB limits.
- Late-state serialise -> restore -> +20 ticks identical (canonical). PASS.

## 8. Historical data audit (standard + short)
- `validateScenario(def, sidecar)` returns [] for both. No duplicate unit/location/reinforcement/objective ids. All 218 units start on land cells inside the terrain grid, stats in range, nation/side consistent, parent ids resolve, parents within 400 km. Every unit, location and objective has sidecar sources that resolve to `def.sources`, and every source id is in docs/HISTORICAL_SOURCES.md. Supply sources and objective locations exist.
- Flagged: `le_havre` and `brest` ports sit on Sea cells (M4). All unit positions are marked `positionApproximate`.
- 15 random units per scenario spot-checked (seed 1234; output printed by the test): e.g. 7. Panzer-Division under XV corps ~10 km from parent, 1re DLM / 3e DLC with S04, BEF 48th/42nd Divisions with S04/S12, Belgian VI Corps with S04/S05, IR Grossdeutschland with S01/S08; all plausible for sector and parent distance. Note: this is a consistency audit against the register; the facts themselves still need a print-source pass (the register already says so).

## 9. Browser (Playwright, Vite dev server on port 5180, server PID killed afterwards)
- Flow Main menu -> New campaign -> Fall of France Standard -> Germany -> Briefing -> Begin works; HUD, OOB (120 formations), map, panels render. Screenshots at 1366x768 and 1920x1080 reviewed (layout fine, no overlap).
- Selected a unit from the OOB, pressed M and clicked the map: Move order created ("queued", then "ETA 4h", "issued 15h ago"), unit moved at x4. Shift-drag box select selected 9 units; A + click issued attack orders. Empty-selection keys (m, a, Delete, h, e, Escape, Ctrl+A) and orders with no selection give the toast "Select one of your own units first." with no errors.
- 60 rapid speed/pause toggles: no errors; measured 50 fps for 8 s at x8 (headless), longest frame 265 ms.
- Event modals (historical, dynamic, random) appeared, paused the clock while open, applied the chosen option and appear in the Events log. Battle reports tab (with "Why it happened" reasons, casualties table, org changes), Events log, Campaign history tabs render.
- F5 quick save at 13 May 05:00, page reload, Continue: clock, formation count and men under arms identical (1,214,280 / 119). Save/Load modal -> Load while the sim was running at x4: loaded to the saved time and kept running, no console errors.
- Console: no page errors from the game on port 5180; only `favicon.ico` 404. (The shared browser also held messages from another agent's server on port 5199 about glyph URL / worker, not reproduced here.)
- UI issues: L5, L6, L7.

## NOT verified
- Real-print historical accuracy of unit positions/strengths (only internal consistency and source-id coverage).
- Air/sea/paratroop/special-system mechanics (no module registered in Fall of France).
- Attack-order and defensive-line/operation-creation dialogs through the UI beyond the basics; supply-network and fog overlays visually; audio.
- Mobile/touch, Safari/Firefox, 4K, WebGL-less fallback; real-GPU frame rate (headless Chromium only).
- Behaviour of `dispatch` with `as` equal to opposing side for event resolution (only unit orders tested adversarially).
- Short scenario in the browser and 3 full campaigns with human-like play; player-defence performance of the AI against active human opponents.


---
# Second pass (after fixes)

Full `npx vitest run`: 37 files, 331 tests: 326 pass, 3 skipped, 2 fail. The 2 failures (`sim.core` 600-unit tick under 20 ms, `sim.real` 300 ticks under 60 ms) measured 83 ms while 3 vitest workers ran in parallel (716 s total); both pass in isolation (11/11). They are load-sensitive timing tests. QA tests now: 85 (adds tickperf 1, balance 2, AI +3).

## Per-tick time (quiet machine)
- tests/qa/tickperf.test.ts, GBR player (GER/FRA/BEL/NED AI), 1100 ticks: mean ms per 100-tick bucket 24 13 13 12 12 12 12 12 11 11 12; worst single tick 399 ms.
- AI-vs-AI 1500 ticks (all nations, GBR via external aiThink): mean 14.4 ms, p50 9.6, p95 31.1, max 362 ms. No late-run growth to 45 ms was observed in this configuration. Under CPU contention (full suite) the same test measured mean 79 ms, p95 202, max 1077, which is the figure to ignore.
- Rare single-tick spikes of 360-400 ms occur (probably route-planning bursts or GC): they would show as a visible hitch at 1x.

## Determinism / early end
determinism.test.ts now handles an early campaign end: it asserts byte equality of the final state, equal `result`, and `clock.minutes == result.endedAt` (or N ticks if no result). Run: GER and GBR ran all 1000 ticks without a result; FRA ended at tick 960 (limited_victory, 550) identically on both seeds-equal runs.

## Ending distribution (5 seeds each, Standard, up to 1500 ticks; campaign ends tick 1104 or earlier)
Passive player (AI controls all others): GER defeat x5 (score 0). FRA: limited_victory x4 (550 pts, campaign ended early around tick 920-1040 when Paris fell), decisive_victory x1. GBR: decisive_victory x5 (900-975 pts).
AI-vs-AI (player's nation also driven by aiThink): GER viewpoint stalemate x4 (400/400/250/250), defeat x1 (175). FRA viewpoint decisive_victory x5 (900-975).
Reading: even with the German AI playing, the Allies win decisively; Germany never achieves strategic or decisive results. Causes: M5 (air support swamps ground power) and M6 (German air parked in Germany). Scores for GER top out around 400 of 1100 points.

## Combat Monte-Carlo (re-run)
Attacker win rates: parity 4%, 2x attacker 94%, 2x defender 0%, entrenched 0%, mountains 0%, plains 4%, tanks v infantry 96%, in mud 40% (was 72%). 1037 `reasons` claims cross-checked, 0 contradictions.

## AI (re-run, quiet)
Fog: 224 target-unit orders, 0 violations; 903 attack-point orders, 7 (0.8%) landed on an unseen enemy. 758 distinct attack targets, 48 locations changed hands, 4225 cells flipped, reports 400 (cap). Idle check now excludes air groups: 0 idle ground units. Air support share and air coverage tests added (M5, M6).

## Browser pass 2 (Playwright, port 5181; my server PID killed; shared browser was taken over by another session mid-run so I used my own tab)
- New campaign flow, Begin: OK, 157 formations (130 land + 27 air groups), art fallback thumbnails in the OOB and unit photos where present, stack markers with counts (e.g. 14, 15, 58, 21).
- Stack-click selects the whole stack (14 units); Shift+drag box select (45 units); move order (M + click) and attack (A + click) accepted; empty-selection toast OK.
- F5 quick save, page reload, Continue: clock, men under arms (1,286,391), formations (157), battles in progress, OOB count identical before/after.
- fps at x8: 46.9 (longest frame 499 ms) on idle machine; 1 fps while a 4-worker vitest run was saturating the CPU (not representative).
- Event modals (Intelligence breakthrough, others) appear, pause the clock, apply the choice. Battle reports tab shows list + detail (reasons, consequences). Sound: Settings has Master/Music/Effects/Ambience sliders and a mute checkbox which toggles.
- Console: no game errors; only Vite overlay while src/art/manifest.json was missing (L9).
- Screenshots at 1366x768 and 1920x1080 reviewed: layout OK; at 1920 the event modal is centred over a blurred UI.
- Not exercised this pass: save slot via modal (done in pass 1), Load while running (pass 1), defensive-line and operations dialogs.

# Third pass (air cap/sorties, military economy, Bulge on Ardennes terrain, AI opening, new march rates, 60 photos) - 2026-11-16

## Suite
`npx vitest run --no-file-parallelism --disableConsoleIntercept`: 44 files (43 ran, 1 skipped), 390 tests: 385 pass, 4 skipped, **1 fail** (1062 s).
- FAIL `tests/data.validator.test.ts` "lists available and planned entries": expects `crusader.short` to be playable but `listScenarios()` does not return it as playable (crusader files are being added; owner: campaign-engineer).
- Previously failing military.economy tests, and the load-sensitive timing tests, all pass now.
- `tsc -p tsconfig.app.json --noEmit`: clean. `tsc -p tests/tsconfig.json --noEmit`: 2 errors, both unused variables in owners' tests (`tests/ai.campaign.test.ts(17)` `s2`, `tests/sim.capture.test.ts(18)` `cap`).
- tests/qa (all 11 files, incl. new bulge.test.ts): 79/79 pass (run just before the full run).

## Ending distributions (5 seeds 11,22,33,44,55)
Fall of France Standard, passive: GER defeat x5 (score 0, expected for a player who never moves); FRA limited_victory x5 (550 pts, ends tick 847-960; Paris fails); GBR decisive_victory x5 (900-975).
Fall of France Standard, AI vs AI: GER (AI) stalemate x5 (250 pts); FRA (AI) decisive_victory x5. Allies still win decisively when both sides are AI (balance M2 stays open).
Bulge Short, passive: GER defeat x5 (100 pts, runs to tick 960); USA defeat x5 (ends tick 369-423, 0 pts); GBR defeat x5 (ends tick 257-394).
Bulge Short, AI vs AI: GER limited_victory x4, decisive x1; USA defeat x5; GBR defeat x5. The German AI wins every seed, the opposite of history (new issue B1). Passive Allies collapse in about 15-17 days, plausible, but an active AI US/GBR should hold.

## Performance
Per-100-tick mean (Fall of France): 26 then 12-13 ms; worst single tick 364 ms. AI-vs-AI 1500 ticks: mean 36 ms, p50 24, p95 78, max 346 (higher than the 14 ms of the last pass; the suite ran with other agents active, so treat as an upper bound, but worth a recheck).
Long run (5000 ticks): history grows 23/1000 ticks, events 16/1000, save 256 KB/1000 ticks (L4 still open, no cap); battle reports saturate near 373.
Combat Monte-Carlo (400 battles): attacker at 1:1 wins 0%, 1.5:1 48%, 2:1 95%, 3:1 100%; strong vs weak 100% / weak vs strong 0%. Defender advantage is strong at parity.

## Browser pass 4 (Playwright, own tab, port 5183, server PID killed)
Verified for **Bulge (GER)**: menu -> New campaign shows both campaigns -> nation list (GER/USA/GBR) -> briefing -> game loads in ~7 s with no console errors. Real Ardennes terrain visible; zoomed out to the full area and in to street level (Houffalize) without errors; HQ markers (tent/flag) and stack-count markers and photo cards render at start zoom; event modals appear and pause the clock; both event options work; Battle reports tab lists battles with casualties and reasons; save button while running at x8 and Continue/Load game after reload restore the game (20 Dec 21:00); Mute-all toggle works; fps about 118 idle, 87 at x8 on Fall of France.
Verified for **Fall of France**: menu to game flow, loads and runs, fps 87 at x8, no page errors.
Not verified: unit-by-unit photo vs illustration comparison at every zoom for Bulge (only the opening view), sound by zoom (cannot hear), defensive-line/operations dialogs, Bulge as USA/GBR in the browser, 1920x1080.

# Crusader (crusader.short) coverage - 2026-11-16
New `tests/qa/crusader.test.ts` (nations GER/GBR/ITA) plus crusader.short added to `dataaudit.test.ts`; 57/57 pass (no data fallbacks, real terrain_northafrica, end tick 1056, 34 units, 0 reinforcements). Determinism, save/load (IndexedDB), invariants over the full passive campaign, movement, combat sanity: pass.
Ending distributions (5 seeds): passive GER defeat x4 / stalemate x1; passive GBR defeat x4 / stalemate x1 (two runs end early at tick 502 and 595); passive ITA defeat x5. AI vs AI: GER stalemate x2 / defeat x3; GBR strategic_victory x3 / defeat x2; ITA defeat x4 / stalemate x1. This is the most balanced campaign so far.
Data spot-check (N01-N05 cited in HISTORICAL_SOURCES.md; I could only check names, places and plausibility, not the source pages): Tobruk, El Adem, Sidi Rezegh, Bir el Gubi, Benghazi, Alexandria, Mersa Matruh coordinates are right; Ariete near Bir el Gubi, 70th Div and Polish brigade in Tobruk, Savona at Halfaya/Sollum, Pavia/Bologna/Brescia on the Tobruk perimeter are plausible. Doubtful: Oasis Force (29 Ind Bde, 6 SA ACR) placed at 30.86N 25.23E, open desert, not at an oasis (Giarabub/Jalo).
Browser (port 5184, PID killed): new-campaign list shows Crusader and Stalingrad (Stalingrad is now also playable); nation select GBR/GER/ITA; briefing and game start with no console errors; desert terrain and sea/land tints render; zoomed out to the whole theatre and in to street level; POL, IND, RSA chips have distinct colours; NZ Division panel shows a photo and caption; event modal appears and pauses the clock; quick save, reload and Continue restore; fps about 160 idle. Not verified: GER/ITA in the browser, Via Balbia (not in infra yet), sound, 1920x1080, Stalingrad (not asked).

# Stalingrad (stalingrad.short) coverage - 2026-11-16
New `tests/qa/stalingrad.test.ts` (SOV, GER) plus stalingrad.short in `dataaudit.test.ts`: 66 pass, 1 FAIL. Determinism, save/load, invariants, movement, combat sanity pass; terrain_stalingrad, no fallbacks; 167 units, 5 reinforcements, nations SOV/GER/ROU/ITA; ends tick 1056.
**FAIL (data)**: the scenario has no `iceFromHour`/`iceFullHour`, so ice never forms and the Volga is never crossable on ice. The ice engine (`src/sim/ice.ts`) is untested against real data until campaign adds them.
**Airlift is not active**: no location has `airliftTonsPerDay` and there are no German air groups (0 airframes), so `airliftFraction` is 0.00 for every cut-off unit in 700 passive ticks. In a GER passive run the pocket first forms at about day 12 (history: 23 Nov, day 4-5), 5-11 of 21-23 land units are cut off, their supply swings 0-77 (hits 0 on days 22-24, recovers to 35 by day 28), fuel stays about 100, total German manpower falls only 248k to 217k and then recovers to 241k. So the pocket is neither starved nor airlifted; it just isn't degenerate-dead or free.
Ending distributions (5 seeds): passive SOV stalemate x5 (300 pts); passive GER stalemate x2 / limited_victory x3 (a passive German army scores a limited victory, so the Soviet side is not forced to win); AI vs AI: SOV limited_victory x4 / stalemate x1; GER stalemate x5. Soviet AI never reaches decisive; German AI never wins.
OOB spot-check vs E01-E06 (names only): GER 4th Panzer / 6th Army corps and divisions (XLVIII Pz, IV/VIII/XI/LI AK, 14/16/24 Pz, 3/29/60 mot), Romanian 3rd and 4th Army corps (RO I, II, IV, V, VI, VII) and single Italian 8th Army entry are consistent with E06 as far as I can tell; Hungarian units are absent (2nd Hungarian Army was outside the map area, so no HUN chip). Reinforcements (LVII Pz, 6 Pz, 23 Pz) arrive day 23, which fits Winter Storm.
Browser (port 5185, PID killed): Crusader as GER and ITA loads with correct OOB and chips, no console errors. Stalingrad as GER at 1920x1080: select, briefing, game load, layout fine, fps about 160, GER/ROU/ITA chips distinct, Arriving reinforcements list shows 3 units at 23d, no console errors. Still not verified: Stalingrad SOV in browser, ice crossing in the UI, sound.
Via Balbia: now present in infra_northafrica.json as 'Via Balbia (schematic)' (not tested for routing speed).

# Sweep after the victory early-end rule change - 2026-11-16
Suite (--no-file-parallelism, 1413 s): 56 files, 501 tests: 493 pass, 4 skipped, **4 fail + 1 file error**, all in owners' areas: `tests/events.test.ts` port_relief (expected undefined to be true); `tests/military.logistics.test.ts` x3 encirclement and forward trickle (a continuous ring left supply 81.3 instead of -1; ring with gap; trickle); `tests/ai.probest.test.ts` (file not found: stale scratch test, no longer on disk). tsc app and tests: both clean. tests/qa: all pass.
Ending distributions, 5 seeds each (ending of the player's nation; AI mode = AI drives that nation against the AI opponent):
| Campaign | Nation | Passive | AI vs AI |
|---|---|---|---|
| Fall of France | GER | defeat x5 | stalemate x5 |
| Fall of France | FRA | limited x5 | decisive x5 |
| Fall of France | GBR | decisive x5 | - |
| Bulge | GER | defeat x5 | defeat x1, stalemate x4 |
| Bulge | USA | defeat x5 | defeat x5 |
| Bulge | GBR | defeat x4, stalemate x1 | defeat x3, stalemate x1, strategic x1 |
| Crusader | GER | stalemate x4, defeat x1 | strategic x4, limited x1 |
| Crusader | GBR | defeat x5 | defeat x4, stalemate x1 |
| Crusader | ITA | stalemate x2, defeat x3 | limited x4, defeat x1 |
| Stalingrad | SOV | defeat x5 | strategic x2, limited x3 |
| Stalingrad | GER | defeat x4, stalemate x1 | defeat x3, stalemate x2 |
Changes vs last sweep: Bulge AI vs AI is no longer a German win (GER stalemate x4 / defeat x1; USA AI still loses 5/5; US player AI is the weak side). Crusader AI vs AI now favours the Axis (GER strategic x4, ITA limited x4, GBR defeat x4; history was a British win). Stalingrad AI vs AI is Soviet-favoured as in history (SOV 5/5 wins, GER never above stalemate). Passive players now play to the end (Stalingrad SOV/GER passive end in defeat instead of stopping early).
Stalingrad data check: ice fields now present (iceFromHour 168, iceFullHour 504); ice level every 100 ticks 0, 0.1, 0.4, 0.7, 1, 1, ... (works). Gumrak has airliftTonsPerDay 136, yet in a GER passive run airliftFraction is still 0.00 for every cut-off unit (no German air groups, 0 airframes); pocket supply falls to 0 by day 16 and the cut-off set shrinks to 0 by day 22 as the encirclement breaks up.
Performance: tick 13-14 ms, rising to 24-30 ms in the last 400 ticks of the long run; worst single tick 460 ms; AI-vs-AI mean 14.7 ms, p95 33 ms.
Browser: Stalingrad SOV on port 5186: game loads, events (frost, breakdowns, intelligence) fire and modals work, no page errors (only AudioContext-before-gesture warnings); by 9 Dec the Soviet side shows 51 units cut off and 1 encircled while passive. Ice is not visible on the map and the UI has no ice indicator, so frozen crossings cannot be seen. Offline basemap (map harness, base=offline): hillshade renders on Western Europe and North Africa at high zoom, no blank tiles; North Africa with OSM base no longer blank (relief texture shows), so the Crusader blank-tile item is fixed. Settings text still says "All sound is generated live; nothing is sampled or licensed", which conflicts with the credits.
Not verified: event side-gating (ai-events has not landed it); ice visuals in the UI (none exist); audio by ear.

# Event side-gating and historical events in the QA harness - 2026-11-16
**Harness gap found and fixed:** all earlier QA runs (determinism, distributions) started the engine without registering the campaign's historical events; the real app does (`src/app/App.tsx` registerEvents). `tests/qa/harness.ts` `mkEngine` now registers them exactly like the app, so all distributions below include historical events. Earlier distribution tables in this report were measured without them.
New `tests/qa/eventgating.test.ts`: 4 campaigns, every nation, 3 seeds, 700 ticks: no event of another side is shown to the player (random/dynamic) and no "Allied shipment/war material" for an Axis player or "Axis shipment/homeland" text for an Allied player. Passes. Browser: Crusader as GER to 20 Dec, 8 modals (sickness, convoy ambush, counter-attack on Trieste, opportunity at Sollum, intelligence, breakdowns in Ariete, air raid on Benghazi): none is Allied-worded.
**Defect (reported to ai-events):** `src/events/fromData.ts` does not forward `effects` from the campaign JSON, so the "Tobruk relieved" port_relief effect never runs: log shows "Tobruk relieved" at 216 h but `milSpecial(state).portRelief` stays empty through hour 260. The Crusader distributions below therefore do NOT include port relief yet.
Distributions with historical events (5 seeds; passive / AI vs AI):
| Campaign | Nation | Passive | AI vs AI |
|---|---|---|---|
| Fall of France | GER | defeat x5 | defeat x2, stalemate x3 |
| Fall of France | FRA | limited x5 | decisive x5 |
| Fall of France | GBR | decisive x5 | - |
| Bulge | GER | defeat x5 | stalemate x2, defeat x1, limited x2 |
| Bulge | USA | defeat x5 | defeat x4, limited x1 |
| Bulge | GBR | defeat x4, stalemate x1 | defeat x4, limited x1 |
| Crusader | GER | defeat x2, stalemate x3 | stalemate x4, defeat x1 |
| Crusader | GBR | defeat x5 | limited x4, strategic x1 |
| Crusader | ITA | stalemate x4, defeat x1 | limited x1, stalemate x4 |
| Stalingrad | SOV | defeat x5 | strategic x2, limited x2, stalemate x1 |
| Stalingrad | GER | stalemate x3, defeat x2 | stalemate x3, defeat x2 |
Crusader AI vs AI is now historical (British wins x5) and Bulge is no longer Axis-dominated; Fall of France Allied AI still wins decisively 5/5. Not yet re-swept after military-engineer's encirclement/airlift fixes (tests/qa passes 151 of 155 only because the 4 failures were my over-strict gating test, since fixed; one run also hit a transient `updateSupply` TypeError while military edits were in flight, gone on re-run). tests/qa tick time: 14.9 ms mean in AI-vs-AI, worst tick 464 ms.

# Clean sweep after the retreat fix and ring-based encirclement - 2026-11-16 (game renamed World at War: Frontlines)
(`src/military/orders.ts` now exempts `retreating` at lines 170/210/525/530; sim-engineer's `special.sim.retreating` guard is also in.)
Suite (--no-file-parallelism, 798 s): 58 files, 532 tests: 526 pass, 4 skipped, **2 fail**; tsc app and tests clean.
- FAIL `tests/ai.campaign.test.ts` "German AI vs a passive France ... historically plausible pace": 575 points, expected at least 600 (the M2 regression band; ring detection and working retreats shifted FoF balance by about 75 points). Owner ai-events/military.
- FAIL `tests/sim.combat.test.ts` "a pocket that is still supplied holds out far longer than one that is not": the test body contains a leftover debug throw (`DBG dry 12 fed 12`) and the numbers show dry 12, fed 12, i.e. no difference between a supplied and an unsupplied pocket. Owner sim-engineer: either the debug line is the failure and the assertion would pass, or supply no longer matters for how long a pocket holds.
Distribution deltas vs the previous table (5 seeds, passive / AI vs AI):
- FoF GBR passive decisive x5 -> decisive x2, strategic x1, limited x2; FoF FRA AI decisive x5 -> decisive x3, limited x2; FoF GER unchanged (defeat x5 passive; defeat x2 / stalemate x3 AI).
- Bulge passive: GER, USA unchanged (defeat x5); GBR defeat x4 + stalemate x1 -> stalemate x2, limited x2, decisive x1. Bulge AI vs AI: GER stalemate x3, limited x1, defeat x1; USA defeat x2, stalemate x1, limited x1, decisive x1 (was defeat x4); GBR stalemate x1, limited x2, decisive x1, strategic x1 (was defeat x4). Allied sides now hold the Bulge; Germany never wins decisively.
- Crusader passive: GER stalemate x4 + defeat x1; GBR stalemate x4 + limited x1 (was defeat x5); ITA defeat x2 + stalemate x3. AI vs AI: GER stalemate x3 + defeat x2; GBR limited x3 + strategic x2; ITA stalemate x5.
- Stalingrad passive: SOV defeat x5 (unchanged); GER limited x1, defeat x1, stalemate x3. AI vs AI: SOV limited x3, decisive x1, strategic x1; GER stalemate x4, limited x1.
Stalingrad pocket (GER passive): it now forms at day 4 (3 of 21 cut off) and day 6 (13 of 21), as in history, then shrinks to 2-4 units by day 20 with supply 0-51; airlift fraction is still 0.00 (no German air groups, 0 airframes). Soviet side: 12 of 96 land units are cut off from hour 24 to hour 480 and never recover (down from 51 on 9 Dec before the ring change), so a fixed group of Soviet units sits outside supply: check which.
Report cap and merging: after 5000 AI-vs-AI ticks there are 71 battle reports (was 373-400 at the cap), history 100, events 95, log 819. The report spam issue (M1) no longer shows up. Growth per 1000 ticks: history 19, events 18, save size 101 KB (was 256 KB).
Performance: per-100-tick mean 8-9 ms (was 13-14), worst single tick 82 ms (was 460 ms), AI-vs-AI mean 10.1 ms, p95 17.6 ms, max 86 ms; the 5000-tick run takes 30 s.
Review of sim-engineer's test changes: (1) `duel()` now takes the worst manpower point instead of the final one: reasonable, since the supply module refills units, and it only makes casualty claims easier to check; (2) the report accounting assertion is `lost >= 0.8 * actual` (and `<= actual + 1`): this tolerates up to 20% of real casualties being missing from reports, which is looser than an exact tie-out; I recommend tightening to 0.95 now that the merged-summary bug is fixed; (3) reasons tests step up to 90 ticks until a report exists: fine, but they no longer fail if the report is late, so keep an upper bound; (4) `tests/sim.capture.test.ts` armour with no fuel: "crawls under 6 km in 5 ticks" replaces a full halt; justified by the fuel trickle, and my independent `tests/qa/movement.test.ts` still asserts a full halt with no supply (passes). I found nothing that hides a defect, apart from the looser accounting threshold.
Browser (rename check, port 5183, killed): tab title "World at War: Frontlines"; menu heading "WORLD AT WAR FRONTLINES" lays out well at 1366x768, 1920x1080 and 420x800 (no horizontal overflow); Credits text uses the new name and lists CC0 audio plus photo credits; IndexedDB `theatre-command` and the `theatre-command.ui-settings.v1` key are unchanged, the old autosaves and quicksave are still listed under Load game and Continue loads a Fall of France save correctly. One photo credit (Bristol Blenheim Mk I, Ad Meskens) contains the whole scraped Wikimedia licence boilerplate instead of a short credit line.

# Final re-sweep (port relief, airlift fields, retreat fix, ring encirclement) - 2026-11-16
Suite (--no-file-parallelism, 801 s): 528 tests pass, 4 skipped, 0 failed; 1 file error: `tests/ai.pc.test.ts` (scratch test file that no longer exists on disk, same kind as ai.probest earlier). tsc app and tests: clean. The two failures of the previous sweep (ai.campaign M2 band, sim.combat pocket test) pass now.
Crusader port relief: repro now shows `portRelief` {} at hour 215 and {"tobruk":true} at hour 230 (fromData forwards effects). Crusader distributions below include it.
Distributions (5 seeds, passive / AI vs AI):
| Campaign | Nation | Passive | AI vs AI |
|---|---|---|---|
| Fall of France | GER | defeat x5 | stalemate x2, defeat x2, limited x1 |
| Fall of France | FRA | limited x5 | decisive x3, limited x2 |
| Fall of France | GBR | limited x5 | - |
| Bulge | GER | defeat x5 | stalemate x3, strategic x1, defeat x1 |
| Bulge | USA | defeat x3, stalemate x1, limited x1 | limited x4, defeat x1 |
| Bulge | GBR | strategic x2, defeat x1, stalemate x1, limited x1 | decisive x2, stalemate x2, defeat x1 |
| Crusader | GER | stalemate x4, defeat x1 | stalemate x3, defeat x2 |
| Crusader | GBR | stalemate x4, limited x1 | limited x4, strategic x1 |
| Crusader | ITA | stalemate x3, defeat x2 | stalemate x5 |
| Stalingrad | SOV | defeat x5 | limited x3, strategic x2 |
| Stalingrad | GER | stalemate x3, defeat x2 | stalemate x2, defeat x2, limited x1 |
Readout: FoF passive GBR is now limited x5 (decisive earlier: a passive British army is no longer enough for a decisive win); Bulge USA AI now holds (limited x4) and Allies are no longer overrun by passive play 5/5; Crusader AI vs AI is British-leaning as in history; Stalingrad AI vs AI is Soviet-leaning (SOV never loses).
Stalingrad airlift: Pitomnik and Gumrak have airliftTonsPerDay 68 each. In a passive German run Soviet forces capture Pitomnik by about hour 96 (owner SOV, damaged 68), so airlift fraction stays 0.00; when I force both fields to GER/undamaged at hour 168 the 10 cut-off units within 40 km get a fraction of 0.04-0.12 (supply of those units stays 2-5, a few reach 25-66 on rotation): the mechanism works and delivers well under 20% of need, as in E03. Pocket forms on day 4 (3 of 21 cut off) and day 6 (14 of 21). Soviet side: 12 of 96 land units remain cut off from hour 24 to hour 480 (ids sov.rd.g15, rd.91, rd.126, rd.302, rd.169, rd.422, sov.mc.4, mc.13, cc.4, tb.254, tb.90, tb.235), so they are a fixed group with no supply path.
Report cap and merging: 112 battle reports after 5000 AI-vs-AI ticks (earlier 71 in the previous sweep, 373-400 at the cap before the fix), history 101, events 92, log 1150, save about 142 KB per 1000 ticks growth. Tick cost: 7-9 ms per tick (14 ms in the first 100), worst single tick 83 ms; AI-vs-AI mean 9.8 ms, p95 17.1, max 84.7; the 5000-tick run takes 34 s.
Browser (rename, port 5183) result stands from the previous entry: tab title "World at War: Frontlines", menu fits at 1366x768, 1920x1080 and 420x800, Credits use the new name, Settings open and the mute toggle works, old autosaves and the quicksave still list under Load game and Continue restores them (IndexedDB 'theatre-command' and the settings key unchanged).
Test-expectation review (sim-engineer): unchanged from the previous entry; the only item I would still tighten is the report accounting threshold (`>= 0.8 * actual`, recommend 0.95).

# Start-supply test (2026-11-16)
New `tests/qa/startsupply.test.ts`: for 5 scenarios and every player nation, idle player, at most 2 land units per side (HQs excluded) cut off at ticks 1, 2 and 24; plus Stalingrad SOV idle seeds 1 and 3 = 0 cut off at h2/24/100. 14 of 15 pass. Stalingrad is fixed (0/0/0 both seeds). fall_of_france.short as GER fails: 7 of 24 axis units are cut off at tick 24 (see KNOWN_ISSUES SS1).
