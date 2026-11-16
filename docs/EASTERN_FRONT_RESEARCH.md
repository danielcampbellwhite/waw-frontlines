# Eastern Front - research pass (campaign-engineer; research only, no data built)

Sources fetched (all Wikipedia, registered E01-E04 in HISTORICAL_SOURCES.md): Operation Uranus (E01), Battle of Stalingrad (E02), Operation Winter Storm (E03), Operation Barbarossa (E04).
Order-of-battle pages for Uranus and Barbarossa returned HTTP 404 under the guessed titles; the real OOB articles (e.g. "Order of battle for Operation Uranus" does not exist under that name) still need to be located (candidate sources: niehorster.org, Wikipedia
"Operation Little Saturn", "Operation Winter Storm" OOB section, Glantz "To the Gates of Stalingrad" / "Armageddon in Stalingrad" via secondary summaries).

## Sourcing quality (what was actually retrievable)
| | Barbarossa (Jun 1941) | Stalingrad: Uranus + Winter Storm (19 Nov 1942 - early Jan 1943) |
|---|---|---|
| Army-level OOB | Yes, as infobox lists (3 Army Groups; Northern/NW/Western/SW/Southern Fronts with army names). No strengths per army. | Yes at army level (Southwestern, Don, Stalingrad Fronts; 6th Army, 4th Pz Army, Romanian 3rd/4th Armies, Italian 8th, 1st Pz). Corps/division list NOT retrieved. |
| Dated timeline | Only phase dates (22 Jun-3 Jul; 3 Jul-5 Aug Smolensk; 19 Sep Kiev). Minsk/Bialystok pocket dates not on the retrieved text. | Good for 17 Nov-24 Nov (D-Day 19 Nov 07:20 bombardment, 08:50 attack; 20 Nov Stalingrad Front; 21 Nov Hitler "Fortress Stalingrad"; 22 Nov Kalach; 23 Nov link-up at Sovetsky ~16:00; 24 Nov outer ring ~320 km). Winter Storm 12-23 Dec, Little Saturn from 16 Dec, Tatsinskaya (undated), Manstein halts 23 Dec (E03). 8 Jan ultimatum and 31 Jan/2 Feb surrender: only 2 Feb retrieved. |
| Strengths | Conflicting (3.8M vs 2.6-2.9M; 3,350-3,795 vs 11,000 tanks; both blocks identically headed) | Conflicting but bounded: Soviet ~1.1M, 804-894 tanks, ~13,400 guns, 1,000-1,500 aircraft; Axis (6th + 4th Pz) 400,000, 732 aircraft (402 serviceable); Romanian 143,000-200,000, 134 tanks; encircled 250,000-300,000 with ~100 tanks (E01). |
| Supply facts | Rail gauge/rasputitsa NOT in retrieved text; only a general mention. | Airlift requirement 680 t/day (E01, E03); under 20% delivered in first half Dec (E01, E03); about 500 transports (E03); Tatsinskaya lost to Soviet raid (E03). Delivered tonnage per day, Pitomnik/Gumrak facts, Volga ice: NOT retrieved. |
| Geography/size | Enormous (Baltic to Black Sea, ~1,500 km front): needs several map regions, Standard/Grand only. | Compact: Don bend to the Volga, ~500 x 350 km; suitable for a Short scenario. |
| Fun/balance | Soviet player faces collapse; hard to make a fair Short. | Two clear phases (encirclement then relief/airlift); strong asymmetric play. |

## Recommendation: build Stalingrad Short = Operation Uranus (19 Nov 1942 - about 2 Jan 1943), playable SOV, GER, with ROM/ITA as AI-controlled satellites (ROM must be added to NationId; ITA exists; HUN not needed).
Reasons: compact map, sourced day-level timeline, a defined encirclement and relief attempt, a supply (airlift) mechanic the existing engine can approximate, and both sides have clear objectives. Barbarossa should wait for Standard/Grand and a larger map.
Window: start 19 Nov 1942 00:00; end about 2 Jan 1943 (Winter Storm 12-23 Dec; Little Saturn 16 Dec; 24 Dec Tatsinskaya). The later city fight (Jan 1943) and 2 Feb surrender stay out of the Short window (could be a "Stalingrad Standard" extension).

### Proposed bbox and map needs
bbox about 40.5E-46.5E, 47.0N-50.0N (covers Serafimovich bridgehead (about 42.7E 49.6N), Kletskaya, Kalach, Stalingrad (44.5E 48.7N), the Don bend, Surovikino, Tatsinskaya (41.2E 48.1N), Kotelnikovo (43.15E 47.63N), Myshkova River line).
Coordinates are gazetteer recollections (to be flagged +/-0.05 deg towns, +/-0.15 deg for named steppe features); none verified in this pass.
Terrain classes: open steppe (Plains), balkas/ravines (Hills-like), the Volga and Don as major-river barriers (flag 1) with FROZEN crossings after about late Nov (see ice below), the urban belt of Stalingrad (Urban; 40 km long along the west Volga bank), small forest strips (Forest), salt lakes/marsh in the Kalmyk steppe (Marsh), no Desert.
Infra: railways (Stalingrad-Kalach-Surovikino-Likhaya; the Stalingrad-Morozovsk line; Kotelnikovo spur), the Volga ferry crossings (Soviet 62nd Army lifeline), roads. All modern-based except where sourced (historical:false).

### Nations
SOV (playable), GER (playable), ROM (needs NationId; 3rd and 4th Romanian Armies), ITA (8th Army, for Little Saturn), plus NEUTRAL. Fronts as parent HQs; no Hungarian forces on the map.

### Sourced order of battle (E01-E03; army level only, divisions to be added once a corps/division source is found)
Soviet: Southwestern Front (Vatutin per general knowledge: NOT retrieved, omit commander) with 5th Tank Army, 21st Army, 1st Guards Army; Don Front with 24th, 65th, 66th Armies and 16th Air Army; Stalingrad Front (Yeremenko) with 28th, 51st, 57th, 62nd (Chuikov), 64th Armies; Soviet mechanised/tank corps named in E01: 26th Tank Corps, 4th Tank Corps, 4th Mechanized Corps, 13th Mechanized Corps; 2nd Guards Army and 1st/3rd Guards Armies for Winter Storm/Little Saturn (E03).
Axis: Army Group B (Weichs) with 6th Army (Paulus), 4th Panzer Army (Hoth), Romanian 3rd and 4th Armies, Italian 8th Army; Army Group Don (Manstein) formed late Nov (date not stated); German units named: 48th Panzer Corps, 22nd Panzer Division, 29th Panzergrenadier Division, 16th Panzergrenadier Division, 94th Infantry Division, 6th Panzer Division (Winter Storm), LVII Panzer Corps (E03), Romanian 1st Armoured Division, Romanian 6th Corps. 
Gaps: corps/division composition of the 6th Army pocket, Romanian divisions, strengths per formation (use a game-scale conversion from the army totals), Axis airfields.

### Sourced events (E01, E03)
17 Nov Uranus postponed to 19 Nov; 19 Nov 07:20 bombardment, 08:50 attack on 3rd Romanian Army (about 27,000 captured by 21st and 5th Tank Armies); 20 Nov Stalingrad Front attacks, 26th Tank Corps takes Perelazovsky; 21 Nov Hitler orders "Fortress Stalingrad"; 22 Nov Kalach falls, encirclement per page; 23 Nov link-up at Sovetsky (about 16:00); 24 Nov Stavka plans Operation Saturn about 10 Dec; 12 Dec Winter Storm begins (LVII Panzer Corps); 16 Dec Little Saturn begins; 19 Dec German 6th Panzer at Myshkova River; 23 Dec Manstein calls off Winter Storm; 24 Dec 4th Panzer Army in retreat; Tatsinskaya raid (date NOT stated).
Conflicts: E01 gives the link-up as late 22 Nov (lead) vs 23 Nov (body); encircled strength 290,000 vs 250,000-300,000; one Dec 13 date appears in a 22 Nov paragraph (likely error).

### Supply and victory (draft)
Axis: the 6th Army's pocket depends on air supply: requirement about 680 t/day (E01/E03), delivered under 20% in first half of December (E01). Represent via the encircled units' being cut off from sources plus a dated, sourced `resource` pool effect only for the airlift shortfall ratio (no invented tonnage); after Tatsinskaya's loss (date unknown) reduce further only if a date is found.
Soviet: Volga rail/ferry supply is not sourced; treat as normal source behind the Volga.
Victory: Soviet decisive = pocket sealed and held to the end plus relief force defeated; Axis decisive = relief achieved (Stalingrad link-up with 6th Army) or Soviet encirclement broken; use capture/hold objectives on Kalach, Stalingrad, Pitomnik, Kotelnikovo, Tatsinskaya, Surovikino.

## Engine features that do not exist yet / need decisions
1. Encirclement and surrounded supply: units cut off from sources lose supply; air supply as a limited, rule-based flow (airlift tonnage cap) instead of free air support.
2. Winter, snow, frozen rivers: crossing cost on Volga/Don should drop when frozen (weather kind 'snow' exists; river ice is not modelled); rasputitsa mud ('mud' weather exists) matters for Barbarossa, not Uranus.
3. Rail gauge change (Barbarossa) and supply-distance scale: logistics MAX_EFFECTIVE_KM 500 and TRUCK_RANGE 70; Barbarossa's depth of hundreds of km needs rail capacity and gauge handling.
4. Partisans (Barbarossa later phases): no mechanic; skip for Uranus.
5. Soviet reinforcement waves (reserve armies; 2nd Guards Army arrives for Winter Storm): reinforcements exist but need sourced dates.
6. Fortified cities (Stalingrad Urban, Leningrad, Sevastopol): fortification data and urban combat modifiers exist; check city-size scaling.
7. NationId 'ROM' (Romania) missing; Hungary only if the scenario widens north.
8. Large AI front: AI doctrine for encirclement operations.
9. Map-engineer: new terrain region (Don/Volga bbox above), Volga/Don major rivers with ice flag option, rail network, Stalingrad urban footprint.

## Barbarossa (not recommended first)
Bbox would span 20-40E, 45-60N or more; sourced army-level OOB exists (E04 infobox) but retrieved text lacks division data, pocket dates and supply facts; strengths conflict heavily; needs rail-gauge and mud mechanics. A Short slice such as Bialystok-Minsk (22 Jun - 3 Jul 1941) is possible later but its Soviet OOB below army level is unretrieved.

## Weak/missing flags
E01-E04: Wikipedia, text truncated at 100,000 characters per fetch (later sections unread); infobox column ambiguity; no airfield positions; no per-month supply tonnage. Do not use any gazetteer coordinate in this note without re-checking.

## Update: Stalingrad Short build status (campaign-engineer)
Generator: src/data/campaigns/_build/build_stalingrad.mjs (+ stalingrad_sources.mjs, sources E01-E03, E05-E08 and G01-G04; E04 stays Barbarossa). Output currently in src/data/campaigns/_draft/ (not registered, not audited) until terrain_stalingrad.json / infra_stalingrad.json exist (requested from map-engineer: bbox 40.5-46.5E, 47.0-50.0N).
Content: 167 units, 5 reinforcements, 19 locations, 14 objectives, 13 events; playable SOV and GER; ROU and ITA are AI-side nations. Soviet: fronts, armies, rifle divisions, tank/mechanised/cavalry corps, independent tank/rifle/naval brigades (E05, corps level and below). German 6th Army corps/divisions and Romanian Third/Fourth Armies corps/divisions (E06; presence on 19 Nov of individual German divisions is NOT confirmed by E06). Italian 8th Army: one army-level element; Fliegerkorps VIII, JG 3 and 9th Flak Division omitted (no airfields).
Link-up conflict (22 vs 23 Nov): both recorded as events (sg.ev.kalach, sg.ev.linkup); 23 Nov is used as the closure.
Coordinates: Wikipedia API (E07) or OSM Nominatim (E08) only; places with no coordinate found (Pitomnik, Sovetsky, Nizhne-Chirskaya, Chernyshkovskaya) were left out.

### Engine gaps: blockers vs data-representable
Not blockers (the scenario runs on today's engine; each is a fidelity loss):
1. Encirclement supply: units cut off from every owned supply source starve through the normal logistics rule (sources and road/rail reach), which approximates a pocket. The airlift is NOT a flow: the pocket gets nothing, which is harsher than history (under 20% of 680 t/day got in). Data stand-in: German fuel/supply pool at 50% scale (G01), Tatsinskaya and Morozovsk as sources. Better: an 'airlift' supply action (see below).
2. Frozen rivers: the Don and Volga major-river flag stays on all winter; Soviet 51st/57th Army and the German retreat used ice. Data cannot represent it. Needs a river-crossing rule that waives the flag when weather is snow/cold, or a month-based flag.
3. Soviet reserve waves: reinforcements are data-representable (3 are dated by E03); no engine change needed.
4. Rail gauge / depth of supply: not relevant to this compact map.
5. Partisans: not needed.
Likely blockers for a good result (decisions for lead):
A. Air supply flow: a capped, per-day tonnage that delivers supply points to an encircled group (needs a Luftwaffe airfield link, weather and interdiction). Without it the German side cannot do what the real campaign did. This is the single most important gap; classify as important but not blocking a first build.
B. AI doctrine for encirclement (ai-events-engineer): relief attack by LVII Panzer Corps from the south; Soviet ring maintenance; Soviet AI should not rush the city.
C. Map: Volga as a lifeline: the Soviet 62nd Army in Stalingrad receives supply across the Volga (E02 says the defenders were pressed into narrow Volga strips); a 'ferry' or river-source supply rule would be needed, or a Soviet supply source on the west bank. For now Soviet sources are Serafimovich and Kotluban only.
