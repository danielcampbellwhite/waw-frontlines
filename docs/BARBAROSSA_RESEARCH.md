# Barbarossa research (Operation Barbarossa, 22 June to 30 September 1941)

Status: research only, no scenario data yet. Written by campaign-engineer. Every fact below was read from the Wikipedia article named in its source id (register R01-R16 in docs/HISTORICAL_SOURCES.md). Where an article's order-of-battle tables did not extract, only prose figures are used and the gap is listed under "Not retrieved".

## Agreed scope (team-lead, plan approved)

- Start 22 June 1941 00:00 (the invasion began that Sunday with a massive ground and air assault; R01). End 30 September 1941, the day before Typhoon began (R01 gives Typhoon as 30 September 1941). About 100 days, about 2,300 hourly ticks. Fall back to 31 August only if sim-engineer's tick-perf test says 2,300 ticks is too heavy.
- Playable: Germany and the Soviet Union. Romania (Third and Fourth Armies, R03) and Finland are not playable; their formations are included only if a source gives a position and a date, and flagged.
- Excluded: Odessa/Southern Front, Crimea, Army Norway/Murmansk, Baltic Fleet, Soviet and Axis naval units (not retrieved).
- Map bbox proposed 18-42E, 46-60.5N, cell 0.05 deg (map-engineer to confirm).
- No new types.ts fields. Rail-gauge stretch and surprise are modelled with existing fields (see "Modelling plan").

## Sources (rows to be added to HISTORICAL_SOURCES.md as R01-R16)

| id | article | used for |
|---|---|---|
| R01 | Operation Barbarossa | overall forces, dates, Luftwaffe air superiority, mud/rasputitsa, Kiev 19 Sep, Typhoon 30 Sep |
| R02 | Operation Barbarossa order of battle | front/army-group names and commanders (tables did not extract) |
| R03 | Army Group North / Centre / South | army and panzer group assignment per army group, objectives |
| R04 | Battle of Bialystok-Minsk | Army Group Centre strength, Western Front strength, dates 22 Jun-9 Jul, Minsk 28 Jun |
| R05 | Battle of Smolensk (1941) | 10 Jul-10 Sep, Soviet reserve armies, pocket closed 5 Aug, Stalin Line |
| R06 | Battle of Uman | 15 Jul-8 Aug, 6th and 12th Armies encircled, 1st Panzer Group corps |
| R07 | Battle of Kiev (1941) | 7 Jul-26 Sep, encirclement 16 Sep, 452,700 trapped |
| R08 | Baltic Operation | Northwestern Front, 8th/11th/27th Armies, 22 Jun-9 Jul |
| R09 | Siege of Leningrad | Luga line, Shlisselburg 7-8 Sep, Pskov/Novgorod |
| R10 | Siege of the Brest Fortress | garrison about 9,000; 45th ID about 17,000; fighting 22-30 Jun |
| R11 | Battle of Brody (1941) | 23-30 Jun, 1st Panzer Group III and XLVIII Corps vs five mechanised corps |
| R12 | Panzer Group 1 / 2 / 3 | composition and commanders; Panzer Group 1: 5 panzer + 4 motorised divisions, 799 tanks |
| R13 | Soviet Western Front | 22 Jun dispositions |
| R14 | Southwestern Front (Soviet Union) | 5th, 6th, 12th, 26th Armies on the frontier; 16th and 19th in reserve |
| R15 | Stalin Line | fortified districts, unfinished Molotov Line |
| R16 | Battle of Raseiniai | 23-27 Jun, 4th Panzer Group vs 3rd and 12th Mechanised Corps |

## Axis side (R01, R03, R12)

- Total: 153 divisions for Barbarossa (104 infantry, 19 panzer, 15 motorised in three army groups, nine security, four in Finland, two OKH reserve), 3.8 million Axis personnel, 3,350-3,795 tanks, 2,770-4,389 aircraft, about 600,000 motor vehicles and 625,000-700,000 horses (R01).
- Army Group North (Leeb): 18th Army, 4th Panzer Group (Hoepner), 16th Army, Luftflotte 1. Objective Leningrad via the Baltic states. Boundary with Centre: Daugavpils-Kholm (R03).
- Army Group Centre (Bock): 4th and 9th Armies, 2nd Panzer Group (Guderian), 3rd Panzer Group (Hoth), Luftflotte 2. The two armies fielded 33 divisions and the panzer groups nine panzer, six motorised and one cavalry division (R04). Axis Brest-Minsk-Smolensk-Moscow.
- Army Group South (Rundstedt): 1st Panzer Group (Kleist), 6th, 17th and 11th Armies, Luftflotte 4 (R03 names Luftflotte 1 for AG South, which is likely an article error; Luftflotte 4 is not in the retrieved text, so it is not used), Romanian Third and Fourth Armies (R03). Only the northern section attacked on 22 June; the 11th Army and Romanians joined on 2 July (R01).
- Luftwaffe air supremacy over the battlefields of all three army groups by the end of the first week; by 5 July it had lost 491 aircraft with 316 damaged, about 70 percent of start strength (R01).
- 2nd Panzer Group crossed the Bug on 22 June and bypassed Brest; 3rd Panzer Group bypassed most of the Soviet 3rd Army and pressed toward Vilnius (R01).
- Brest Fortress: garrison about 9,000 (6th and 42nd Rifle Divisions elements, NKVD, border guards); the 45th Infantry Division about 17,000 attacked; about 4,000-5,000 captured by 24 June; fighting continued to about 30 June (R10).

## Soviet side (R01, R04, R08, R13, R14)

- First strategic echelon: 171 divisions, 2.6-2.9 million men on 22 June; second echelon 57 divisions still mobilising (R01).
- Fronts on 22 June: Northern (Popov), Northwestern (Kuznetsov; 8th, 11th, later 27th Armies), Western (Pavlov; 3rd, 4th, 10th Armies on the frontier, 13th Army an HQ only), Southwestern (Kirponos; 5th, 6th, 26th, 12th Armies frontier; 16th and 19th in reserve), Southern (Tyulenev) (R02, R04, R08, R14).
- Western Front: 25 rifle and cavalry, 13 tank, 7 motorised divisions (R04).
- Tank totals: about 23,000 tanks available, 14,700 combat-ready, about 11,000 in the western districts (Kirshin, quoted in R01); aircraft about 19,533 total, 7,133-9,100 in the five western districts (R01).
- Surprise: Stalin did not order a mobilisation despite intelligence; Soviet forces were largely caught unprepared (R01). The Luftwaffe destroyed the Western Front air force on the ground (R01, R04).
- Pavlov relieved 30 June and executed 22 July (R01).
- Stalin Line: fortified districts along the old border, guns largely removed; Molotov Line along the new border unfinished (R15).

## Timeline (R01, R03-R11)

| date | event | source |
|---|---|---|
| 22 Jun | invasion; Brest fortress attacked; air raids on frontier airfields | R01, R10 |
| 23-27 Jun | Raseiniai (4th Panzer Group vs 3rd/12th Mech Corps) | R16 |
| 23-30 Jun | Brody-Dubno-Lutsk tank battle | R11 |
| 24-25 Jun | Western Front counterstroke toward Grodno fails | R01 |
| 27 Jun | 2nd and 3rd Panzer Groups meet near Minsk | R04 |
| 28 Jun | Minsk captured | R04 |
| 29 Jun | Luga line construction begins | R09 |
| 30 Jun | encirclement of four Soviet armies by Centre complete; Pavlov relieved | R04, R01 |
| 2 Jul | AG North attacks Stalin Line with 4th Panzer Group; AG South joined by 11th Army and Romanians; rainstorm slows Centre for six days | R01 |
| 6 Jul | Soviet 5th and 7th Mechanised Corps counter-attack near Lepiel (7th Panzer) | R05 |
| 8 Jul | Pskov taken (R01); R09 gives 10 Jul for Ostrov and Pskov | R01, R09 |
| 9 Jul | Bialystok-Minsk pockets destroyed | R04 |
| 10 Jul | Smolensk battle begins; Guderian crosses the Dnieper | R05 |
| 15 Jul | Uman battle begins; 29th Mot reaches Smolensk by 13-15 Jul | R06, R05 |
| 5 Aug | Smolensk encirclement ends; 309,000 prisoners reported | R05 |
| 8 Aug | Uman pocket destroyed | R06 |
| 8 Aug-end Aug | 4th Panzer Group breakthrough, within 48 km of Leningrad by end of August | R01 |
| 16 Aug | Novgorod reached; 17 Aug Kingisepp and Narva | R09 |
| 7-8 Sep | Shlisselburg, Leningrad cut off by land | R09 |
| 10 Sep | Smolensk battle ends | R05 |
| 16 Sep | Kiev encirclement achieved; 19 Sep Kiev captured | R01 |
| 26 Sep | Kiev battle ends, 452,700 trapped | R07 |
| 30 Sep | Typhoon begins | R01 |

## Weather and supply (R01, R12)

- Early July rainstorm slowed Centre's panzers for six days (R01); the rasputitsa (mud season) slowed the 2nd Panzer Group to a few km a day (R12); the October mud is after the scenario end. Within the scenario, a mud event is limited to early July (sourced) and September rain is not sourced.
- Logistics: Bock concluded after four weeks that difficulties were due to logistics; operations were slowed for resupply; all three army groups had 179,500 casualties by 2 August with 47,000 replacements (R01). Poor roads let panzers outrun infantry (R01).
- Rail-gauge conversion is not in the retrieved text (not retrieved): the supply-stretch mechanism will be a game-scale rail-hub availability ramp (G01), flagged as such.

## Modelling plan (existing fields only)

- Units at army / panzer-group level (about 35 starting units plus reinforcements), game-scale manpower and equipment (G01), with sourced aggregates cited (153 divisions, 799 tanks in Panzer Group 1, 25+13+7 divisions on the Western Front, 9,000 in Brest, about 17,000 for the 45th ID).
- Surprise: frontier Soviet units start with lowered readiness and organisation (game-scale, flagged); Soviet air strength reduced at start (sourced as destroyed on the ground; amount game-scale).
- Luftwaffe: `airSupremacy` for allies is the existing field and expresses "slows the other side's road movement near my land units"; for the Axis, side 'axis' with `fromMinutes` 0 and `toMinutes` about 7 days (sourced end of first week) then none. Radius and multiplier game-scale.
- Axis rail hubs (Brest, Minsk, Smolensk, Vilnius, Riga) as supply sources with `availableFromHour` and `rampHours` (game-scale); Soviet sources: Leningrad, Moscow-direction depots (not on map), Kiev, Kharkov (if in bbox), flagged.
- Reinforcement waves: Soviet second-echelon armies named in R05 (16th, 19th, 20th, 21st, 22nd) with sourced "arriving" status (not dates; dates only where R05 gives them), Stavka reserve; others omitted and flagged.
- Objectives (capture/hold, originalOwner = starting owner): Brest, Minsk, Smolensk, Kiev, Riga, Pskov, Novgorod, Leningrad approaches (Shlisselburg), Vitebsk, Mogilev, Zhitomir, Berdichev.

## Not retrieved (will be flagged, not invented)

- Division-level order of battle (tables did not extract); individual corps positions on 22 June; Luftwaffe and VVS unit-level orders; Romanian and Finnish positions; Soviet second-echelon arrival dates; rail-gauge conversion dates; airfield coordinates.
- Pocket-closure dates for Bialystok (about 30 June) are given as article ranges; individual army destruction dates are not.

## Requests

- map-engineer: region `barbarossa`, bbox 18-42E / 46-60.5N, 0.05 deg; rivers (Bug, Neman, Dvina, Berezina, Dnieper, Desna, Luga, Neva), Pripyat marshes, Valdai/Smolensk uplands, roads and rail (Brest-Minsk-Smolensk, Warsaw-Brest, Kaunas-Riga, Lvov-Kiev); anchor Brest, Minsk, Smolensk, Kiev, Riga, Pskov, Leningrad, Vilnius, Kaunas, Vitebsk, Mogilev as land/Urban.
- sim-engineer: tick-perf check at about 2,300 ticks and about 80-100 units on a 480 x 290 grid.
- ai-events-engineer: German panzer-group encirclement doctrine; Soviet counter-attack timing (6 Jul Lepiel, 23 Jun Brody and Raseiniai); Soviet defence in depth along the Dvina-Dnieper.
