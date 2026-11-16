# Known Issues (QA, Agent 7)

Prioritised defects found by independent testing. Repro refers to `tests/qa/*` unless stated. Severity: H = breaks play/integrity, M = visibly wrong or balance-breaking, L = polish.
Nothing in other agents' source was edited by QA.

## Re-test status (second QA pass, after sim/military/AI/campaign/UI fixes)

| Issue | Status |
|---|---|
| M3 fuel exhaustion does not halt | FIXED (empty tank halts fully, order stays active, resumes on refuel; movement.test) |
| L1 land unit on sea cell | FIXED / not reproducible (0 in 300 AI ticks) |
| L2 order into the sea accepted | FIXED (rejected: "Target is open water") |
| L5 box-select hint wrong | FIXED (hint now says Hold Shift and drag) |
| M1 report spam | PARTLY: reports still hit the 400 cap in 1500 AI ticks (400/400); the Aachen 1-hour stalemate spam is not re-measured individually. Open. |
| M2 German AI too weak | OPEN, but changed: AI-vs-AI over 5 seeds gives GER stalemate x4 / defeat x1 and FRA decisive victory x5; passive FRA is limited (4) / decisive (1), passive GBR decisive (5), passive GER always defeat. See ending distribution in TESTING_REPORT. |
| M4 Le Havre / Brest on sea cells | not re-checked; dataaudit still prints them. Open. |
| L3, L4, L6, L7, L8 | OPEN (L6 re-seen: Notifications tab says "No notifications yet" while Battle reports shows 11) |

### NEW M5. Air support swamps ground combat
- Repro: tests/qa/ai.test.ts "air support share" over the last 400 reports of a 1500-tick AI-vs-AI run: 223/400 reports cite aircraft, 109 of those attribute >=50% of that side's power to aircraft. Browser example (14 May, Aachen): "9e DIM attacked 6.Armee ... attackers 36.32 vs defenders 500.5 (ratio 0.07:1); attackers fielded 11460 men against 600; Defending aircraft added 99% of defender power": one 600-man HQ beat an 11,460-man division with 1563 attacker casualties against 2. See `supportPower` in src/sim/combat.ts (`massOf(air) * rate (7 for bombers) * ...`, no cap relative to ground power). Suggest capping air support at a fraction (e.g. 35%) of the supported side's ground power.

### NEW M6. German air does not cover the Schwerpunkt
- tests/qa/ai.test.ts "air coverage": tick 0, 0 German air groups within 120 km (AIR_SUPPORT_KM) of Sedan; the main contact sector (axis units within 25 km of allies, centre [7.7, 48.3] near Strasbourg) has 2 Axis vs 2 Allied groups; at tick 300 the main sector [6.0, 49.4] has 0 Axis vs 7 Allied groups. Totals: 27 Axis vs 51 Allied air groups. AI `redeployAir` is off until the sim honours air move orders, so German air stays on home airfields in Germany. Combined with M5 this heavily favours the Allies at the front.

### NEW L9. Dev server error overlay while art assets were in flight
- src/art/index.ts imported ./manifest.json before the file existed (Vite error overlay, page reloads failed). Resolved once manifest.json landed. Make sure `npm run build` is run before release.

### Doctrine coherence (src/ai/doctrine.ts vs doctrines.ts): OK
All fields used by doctrines.ts exist in AiDoctrine; every location id in armourObjectives/captureLocations/objectiveSchedule exists in the scenario; the 8 `fof.ev.*` hour comments equal the events.json `minutesFromStd` of those events; doctrines.ts is imported by src/ai/index.ts and `resolveDoctrine(GER)` returns armourObjectives[0] = sedan. Only GER has a doctrine registered (FRA/GBR use defaults).

## Medium

### M1. Battle-report spam: one-round battles regenerate every tick (src/sim/combat.ts)
- Repro: `longWorld()` standard, player GER, seed 99, step 4500 then 500 more ticks (probe used in longrun test). 192 new reports in 500 ticks; 104 are "Aachen stalemate", 84 "Aachen attacker_victory", all 41e DI vs 3.Pz, "over 1 hour", both sides at 0% ammo, defender morale 1%.
- Effect: `state.reports` hits its cap (400) and evicts all useful history; `state.log` fills with identical lines (log went 272 -> 476 in 500 ticks); save grows 684 KB -> 1014 KB; UI notification feed flooded. Reports claim "defenders were driven back" but nothing changes tick to tick (no retreat, same units fight again next tick).
- Suggested fix: merge repeated engagements between the same unit sets into one battle/report; suppress reports for exchanges with negligible casualties; make a "driven back" outcome actually move the loser or end the contact.

### M2. German AI never achieves campaign objectives against a passive France
- Repro: `victory.test.ts` "real campaign runs to its end date": player FRA with no orders, standard scenario: 1104 ticks -> Decisive Victory for France (5/7 objectives, Paris held). Only Sedan fell. A passive GBR also gets a Decisive Victory (6/7).
- Effect: historical Fall Rot / Paris never happens with the AI; balance/difficulty ratings (FRA = 5/5 "difficult") are inverted in practice. (AI-vs-AI over 1500 ticks: only 18 locations changed hands, 2480 of 70400 cells.)
- Owner: AI/Events + Campaign (tuning), not a crash.

### M3. Fuel exhaustion does not halt armour (src/sim/pathfinding.ts `unitSpeedKmh`, src/military/stats.ts)
- Repro: `movement.test.ts` "fuel burns while moving": armoured, fuel 8, 40 ticks east. Per-tick distance 6.6 km -> 2.1 km at fuel 0, and it keeps creeping at ~1.8 km/h indefinitely. Comment in stats.ts says "fuel exhaustion halts movement"; brief says halts. Currently it is a 80% speed penalty.
- Decide: either true halt (speed 0 for wheeled/tracked when fuel <= 0 and not on supply) or update docs.

### M4. Allied objective "Hold Le Havre" can never fail (data/sim)
- `le_havre` and `brest` have positions that fall on Sea cells of `terrain_westeurope.json` (dataaudit test prints them). Territory anchoring skips sea cells, so ownership can never change: o.all.le_havre is always achieved (+50 pts) regardless of play, and Germany could never capture those ports. Fix: nudge port positions one cell inland or let `engine` anchor to the nearest land cell.

## Low

### L1. Land units can step onto coastal Sea cells (src/sim/movement.ts `advanceAlong`)
- Repro: movement.test.ts "no land unit ever ends a tick on a sea cell" (AI on, GER, seed 3): `bel.c.cav` ends tick 41 at [2.434, 51.052] on a Sea cell (recon order). Cause: speed is sampled at the substep midpoint, the destination cell can be sea; straight lines between waypoint cell centres cut coast corners. Self-corrects next tick; 1 occurrence in 300 ticks x 218 units.

### L2. Order to a sea target is accepted
- `issue_order` move to [-3.2, 49.0] (Sea) returns `ok: true`; `findRoute` returns null so the order later fails silently ("no route to target"). Reject up front (or surface in UI) for land units.

### L3. Restored engine produces differently-ordered JSON than the uninterrupted run
- After `restoreEngine`, per-unit property insertion order differs after a couple of ticks (e.g. `units['bel.c.cav']`). Values are identical (canonical/sorted-key comparison matches over 150+ ticks), so no gameplay effect, but byte-equality of a re-saved state vs original is not guaranteed. Checksums are unaffected because they are computed once at save time and IndexedDB structured clone preserves order (tested). Do not use raw `JSON.stringify` equality to compare saves.

### L4. `state.history` and `state.events` grow without a cap
- Rate ~15 entries per 1000 ticks each (5000-tick run: history 81, events 75). Harmless for the 46-day campaigns; Grand-scale (years) campaigns will be fine too (<20k entries at 50k ticks) but add a cap for hygiene. `log` (1500) and `reports` (400) are capped correctly.

### L5. UI: hint text says "Drag on the map to box-select" but box select requires Shift+drag (src/map/TacticalMap.tsx:321)
- Plain drag pans the map. Fix the hint in `RightPanel.tsx:39` or make plain drag on empty ground select.

### L6. UI: notification badge count vs empty Notifications tab
- After a few ticks the top-bar bell showed 3 (later 10) while the Notifications tab said "No notifications yet" until later. (Browser, 1366x768, speed x4.) Likely tab not subscribed until first open; verify.

### L7. UI/report text polish
- "Retreated: 51e DI, 51e DI." duplicates the same unit; "Equipment lost: 7 rifle, 4 gun_arty, 3 gun_at" shows raw ids in the consequences list but pretty names in the table; a defender victory reports "17 map cells changed hands" without saying to whom.
- Save/Load modal does not pause the simulation (clock advanced while it was open). Event modals do pause.
- `GET /favicon.ico` 404 (index.html references `/favicon.svg`).

### L8. German supply-point pool reaches 0 within ~2 game days
- UI shows SUPPLY 0 (+5) from 12 May for the player (GER) with no player spending; resource pool is consumed by unit resupply. Check intended economy (starts 600, +5/tick).

## Observations (not defects)
- Attacker at strict parity wins only ~4% of battles (defender bonus plus attacker approach penalties); 2:1 wins 96%. Intended? Consider if the AI can ever succeed with parity-force attacks.
- All 218 start positions are flagged `positionApproximate: true` (honest, but nothing is surveyed). Sources register has to be QA'd against print sources (as already noted in HISTORICAL_SOURCES.md).
- A dynamic event ("Opportunity at Sedan") appeared in the Events log as "Decision: Stay on plan" without QA seeing its modal; could not verify whether it auto-resolves.

# Third pass additions (2026-11-16)

- **B1 (Medium, balance, ai-events)**: Bulge AI-vs-AI always favours Germany (limited x4, decisive x1 over 5 seeds; USA and GBR defeat x5). Allied AI doctrine for the Bulge does not hold. Repro: tests/qa/bulge.test.ts ending distribution.
- **B2 (Medium, tests, campaign)**: `tests/data.validator.test.ts` "lists available and planned entries" fails: `crusader.short` is not reported playable.
- **B3 (Low, campaign)**: Bulge event text: "Allied shipment arrives" shown to the German player; "Germany forces captured Bullingen from Belgium" - starting owner of US-held Ardennes towns is Belgium, should be United States.
- **B4 (Low, ui)**: one unreproduced page error `GameContext missing` after F5 (quick save) then immediate reload and Continue. Three later attempts did not repeat it.
- **B5 (Low, ui/save)**: the Autosave slot still shows Empty after 4 in-game days at x8.
- **B6 (Low, tests)**: 2 tsc errors in owners' tests (unused `s2` in tests/ai.campaign.test.ts:17, unused `cap` in tests/sim.capture.test.ts:18).
- **M2 (still open)**: Fall of France AI-vs-AI: Allies decisive x5, German stalemate x5.
- **M1/L4**: report and history growth unchanged (reports cap about 373-400, history and events uncapped).
- **L8 (resolved)**: military.economy tests pass in this run.
- **Perf note**: AI-vs-AI mean 36 ms/tick this run (14 ms last pass); load was not controlled, recheck on a quiet machine.

# Crusader additions (2026-11-16)
- **C1 (Low, map/ui)**: at maximum zoom in the open desert the base map is a blank flat tile (no features); consider capping zoom or adding terrain texture.
- **C2 (Low, ui)**: order-of-battle groups Carpathian (POL), 29 Ind Bde (IND) and 6 SA ACR (RSA) under their own nation headers while 2 NZ Div, 4 Ind Div and 1/2 SA Div sit under the UK tree. Inconsistent grouping.
- **C3 (Low, campaign)**: Oasis Force position (29 Ind Bde, 6 SA ACR) is open desert at 30.86N 25.23E; verify against N01/N02.
- **C4 (Low, campaign)**: Via Balbia not in infra yet (known); Axis sea supply via pool income.
- **C5 (Low, balance)**: passive GBR can end by collapse at tick ~500-600; acceptable for a passive player, no action needed unless AI Allies show the same.

# Stalingrad additions (2026-11-16)
- **S1 (Medium, campaign)**: stalingrad.short has no `iceFromHour`/`iceFullHour`; Volga and Don never freeze (QA test fails until added).
- **S2 (Medium, campaign/military)**: no airlift: no location has `airliftTonsPerDay` and no German air groups exist, so the Stalingrad pocket gets 0 airlift. Add Pitomnik/Gumrak airfields with airliftTonsPerDay (E03: 680 t needed, under 20% delivered).
- **S3 (Low, balance)**: passive GER scores limited_victory in 3 of 5 seeds; Soviet AI never reaches decisive, and in a passive German run the pocket forms about day 12 instead of day 4-5.
- **S4 (Low, ui)**: large unit stacks near Stalingrad city ("24") cluster heavily at default zoom.
- **C4 resolved in data**: Via Balbia (schematic) is in infra_northafrica.json; **C1 still open** (blank desert tile at max zoom, not re-checked).

# Sweep additions after early-end rule change (2026-11-16)
- **S1 resolved** (ice fields in data and level rises 0 to 1). **C1 resolved** (desert relief shows at max zoom).
- **S2 partly open (Medium, military/campaign)**: Gumrak has airliftTonsPerDay 136 but airliftFraction stays 0.00 for every cut-off German unit; probably no German air groups or the field is not owned/in range. Pocket supply drops to 0 by day 16.
- **X1 (Medium, balance, ai-events)**: Crusader AI vs AI favours the Axis (GER strategic x4, ITA limited x4, GBR defeat x4); history favoured Eighth Army.
- **X2 (Low, balance)**: Bulge US AI loses 5/5 in AI vs AI; Fall of France Allied AI still wins decisively 5/5 (M2); passive Soviet player at Stalingrad ends in defeat (acceptable).
- **X3 (Low, sim/military)**: Soviet side shows 51 units cut off and 1 encircled on 9 Dec while passive at Stalingrad; check whether the supply sources (serafimovich, kotluban) reach the Don bridgehead.
- **X4 (Low, ui)**: no visual or indicator for ice or frozen crossings.
- **X5 (Low, ui)**: Settings text "All sound is generated live; nothing is sampled or licensed" contradicts the credits (CC0 samples).
- **X6 (tests, owners)**: failing owner tests: tests/events.test.ts port_relief; tests/military.logistics.test.ts encirclement x3 (ring leaves supply 81.3, expected cut); tests/ai.probest.test.ts is a missing file.
- Late-game tick time rises to 24-30 ms in a 5000-tick run (was 12-13): minor.

# Side-gating pass (2026-11-16)
- **E1 (Medium, ai-events)**: `src/events/fromData.ts` drops `effects` from historical event JSON, so Crusader "Tobruk relieved" never sets port relief (repro in TESTING_REPORT).
- **E2 resolved**: events are side-gated; German player no longer sees "Allied shipment arrives".
- **X1 resolved**: Crusader AI vs AI now British-favoured as in history once historical events are registered (previous table lacked them).
- **Process note**: QA harness historical-event registration was missing until now (fixed in tests/qa/harness.ts).
- Pending: re-sweep after military encirclement/airlift fixes (X6 failing logistics tests, S2 airlift).

# After retreat fix and ring encirclement (2026-11-16)
- **M1 resolved**: reports stay at 71 after 5000 AI-vs-AI ticks. **X6 resolved** (logistics, events tests pass); **E1** fix reported by ai-events (not yet re-measured end to end).
- **R1 (Medium, ai-events/military)**: `tests/ai.campaign.test.ts` M2 regression fails at 575 points (needs 600) after ring detection and retreats.
- **R2 (Medium, sim)**: `tests/sim.combat.test.ts` pocket-holds-longer test fails with a leftover `DBG dry 12 fed 12` throw; the figures show no difference between a supplied and an unsupplied pocket.
- **R3 (Low, military/campaign)**: 12 of 96 Soviet land units at Stalingrad stay 'cut off' for the whole campaign (hour 24 to 480).
- **R4 (Low, art)**: the Blenheim (Ad Meskens) photo credit contains the whole Wikimedia licence boilerplate; shorten it.
- **R5 (Low, tests)**: sim.combat accounting threshold `>= 0.8 * actual` is loose; tighten to 0.95.
- **S2 still open**: Stalingrad airlift fraction 0.00 (no German air groups). **S3**: pocket now forms on day 4 as in history.

# Final re-sweep (2026-11-16)
- **R1, R2 resolved** (ai.campaign M2 band and sim.combat pocket tests pass). **E1 resolved** (Tobruk port relief applies). **S2 resolved in the engine**: airlift delivers 4-12% of need when a German field is held; in passive play Pitomnik falls by hour 96, which is expected.
- **R3 still open (Low, military/campaign)**: 12 Soviet land units stay cut off for the whole Stalingrad campaign: sov.rd.g15, rd.91, rd.126, rd.302, rd.169, rd.422, sov.mc.4, mc.13, cc.4, tb.254, tb.90, tb.235.
- **R4 (art) and R5 (tests)** still open. **Stale files**: tests/ai.pc.test.ts shows as a file error (missing on disk); delete or restore it.
- Balance still open: FoF Allied AI wins 3 decisive and 2 limited of 5 (M2 narrower); Stalingrad Soviet AI never loses.

# R3 re-verified on current code (2026-11-16)
- **R3 narrowed (Low, campaign)**: reproduces only when the player is SOV and idle (seed 1 and seed 3: 12/96 Soviet land units cut off at h24, 12 at h100, 11-12 at h300 and h480). When Germany is the player (Soviets AI-driven, seed 1) the count is 0, 0, 3, 2, matching ai-events' numbers. The same 12 units are cut off at their start positions: sov.rd.g15, rd.91, rd.126, rd.302, rd.169, rd.422, sov.mc.4, mc.13, cc.4, sov.tb.254, tb.90, tb.235. They are unsupplied from the first tick (start positions beyond a supply path, or on the far side of a river at game start), so a human Soviet player starts with 12 units cut off. Not a fixed group when the AI moves them.

# Start-supply check (2026-11-16)
- **R3 resolved**: Stalingrad as SOV idle (seeds 1 and 3): 0 Soviet land units cut off at h2, h24 and h100 (the 28th Army included).
- **SS1 (Medium, campaign)**: fall_of_france.short as GER idle: 7 of 24 axis land units cut off at tick 24 (ger.id.008, ger.id.028, ger.id.033, ger.pz.003, ger.pz.004, ger.pz.005, ger.pz.007), 0 at ticks 1 and 2 (the ring/debounce needs a few supply updates to show). fall_of_france.standard, Bulge, Crusader and Stalingrad start with at most 2 cut off per side for every nation. New test tests/qa/startsupply.test.ts fails for this one case until the short scenario's panzer start positions or supply sources are fixed.
