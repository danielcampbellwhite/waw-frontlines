# North Africa - research pass and requirements (campaign-engineer, research only; no data built yet)

## Recommended Short scenario: Operation Crusader, 18 Nov 1941 - about 31 Dec 1941
Why Crusader rather than Gazala/Alamein: the best sourced at division/brigade level (full Wikipedia order of battle for both sides, a dated day-by-day
timeline), a clean objective set (relieve Tobruk, destroy the Afrika Korps, retake Cyrenaica), a fluid open-desert battle with a besieged fortress,
and a strong supply story for both sides. Gazala (26 May - 21 June 1942) is the follow-up candidate: corps/division list is sourced (N03) but the
Gazala-line box positions below brigade level and Tobruk's fall date are not. Candidate playable nations: GBR (Eighth Army), GER, ITA.
NationId gaps in `src/core/types.ts` (lead decision): no South Africa (1st/2nd SA Divisions, 6th SA Armoured Car Regt) and no Czechoslovakia;
AUS, NZL, IND, POL, FRA already exist. Proposal: add 'RSA' to NationId, or map South Africa to GBR with a note (weak).

## Sourced order of battle (Crusader, ground; N01)
Allied, Eighth Army (Cunningham, replaced by Ritchie 26 Nov): XXX Corps (Norrie): 7th Armoured Division (Gott: 4th, 7th, 22nd Armoured Bde; 7th Support Group),
1st South African Division (Brink: 1st, 5th SA Bde), 22nd Guards Bde. XIII Corps (Godwin-Austen): 2nd NZ Division (Freyberg: 4th, 5th, 6th NZ Bde), 4th Indian
Division (Messervy: 5th, 7th, 11th Indian Bde), 1st Army Tank Bde. Tobruk Fortress (Scobie): 70th Division (14th, 16th, 23rd Bde), Polish Carpathian Rifle Bde,
32nd Army Tank Bde, 4th AA Bde. Oasis Force (Reid): 29th Indian Bde, 6th SA Armoured Car Regt. Army Reserve: 2nd South African Division (3rd, 4th, 6th SA Bde).
Axis, Panzergruppe Afrika (Rommel; Supreme Commander Bastico): Deutsches Afrika Korps (Crüwell): 15th Panzer (Neumann-Silkow), 21st Panzer (v. Ravenstein), Afrika/90th Light
(Sümmermann); Italian 55th Savona Division; XX Corps (Gambara): 132nd Ariete (Balotta), 101st Trieste, RECAM; XXI Corps (Navarini): 17th Pavia, 25th Bologna,
27th Brescia, 102nd Trento. Strengths (N02): ~118,000 Allied / ~119,000 Axis; tanks 738 / 414-552; aircraft 724 (616 serviceable) / 536 (342 serviceable).
Air (N04 weak): RAF AHQ Western Desert at Maaten Bagush from 21 Oct 1941 with 253, 258, 261, 262, 270 Wings and listed squadrons (page table is dated "18 Nov 1941
to 19 May 1942", so Crusader-day positions unverified). NO sourced Axis air order of battle yet and no sourced airfield coordinates; Luftwaffe/Regia Aeronautica
formations must stay omitted until a source (Playfair vol. III, niehorster, Wikipedia "Fliegerführer Afrika") is fetched.
Gaps: commanders of Pavia/Bologna/Brescia/Trento; exact start positions (use approximate sector anchors, G03); Bardia/Sollum/Halfaya garrison units and sizes.

## Dated events (N02, all Wikipedia "Operation Crusader"; times to day only)
18 Nov offensive opens (storms grounded aircraft on both sides); 19 Nov Bir el Gubi (22nd Armd v Ariete), 7th Armd at Sidi Rezegh airfield; 20 Nov Gabr Saleh;
21 Nov Tobruk breakout towards Ed Duda; 22 Nov 21st Panzer retakes Sidi Rezegh; 23 Nov Totensonntag; 24 Nov Rommel's dash to the wire; 26 Nov Cunningham replaced by Ritchie;
27 Nov NZ link-up with Tobruk at Ed Duda; 1 Dec NZ withdraw from Belhamed; 6 Dec Rommel orders retreat (Neumann-Silkow mortally wounded); 7-8 Dec Axis occupy Gazala position;
8 Dec Bardia/Sollum/Halfaya ordered to hold; 13-16 Dec Gazala fighting, line evacuated 15/16 Dec; late Dec Axis hold Ajedabia-El Haseia line; fuel convoys to Derna/Benghazi by Italian warships.
(2 Jan 1942 Bardia falls: after the window.)

## Supply and ports (N05 Wikipedia "Siege of Tobruk"; N02)
- Tobruk port capacity about 1,500 long tons/day (little used for lack of shipping); 11 Apr-10 Dec 1941: 33,946 long tons of stores delivered, 34 ships sunk.
- Tripoli: four troopships or five cargo ships at once, about 45,000 long tons/month; Benghazi coastal shipping about 15,000 long tons; Tripoli-Benghazi 600 mi by the Via Balbia
  (the only paved road); road haul to the frontier up to 1,100 mi. A German motorised division needs 350 long tons/day; the Axis needed about 70,000 long tons/month; road transport
  consumed 30-50% of fuel delivered, truck unserviceability 35%.
- Axis fuel in Nov-Dec 1941 was the critical shortage (N02): Vichy sold about 3,600 long tons; Italian warships carried fuel to Libya in mid-December.
- Water: not sourced in the retrieved pages. Do NOT model water numerically until a source is found.

## Locations (coordinates to be written from gazetteer, flagged approximate +/-0.05 deg unless known)
Tobruk (32.076N, 23.961E sourced N05), El Adem, Ed Duda, Sidi Rezegh, Belhamed, Gabr Saleh, Bir el Gubi, Sidi Omar, Fort Capuzzo, Sollum, Halfaya Pass, Bardia, Gambut, Gazala,
Acroma, Mechili, Derna, Martuba, Tmimi, Benghazi, Agedabia, El Agheila, Marsa Brega, Tripoli, Fort Maddalena, Mersa Matruh, Sidi Barrani, Maaten Bagush, Alexandria, Cairo/Suez rail head.

## Terrain/infra request to map-engineer (bbox)
Crusader bbox: west 19.0E, east 28.5E, south 28.5N, north 33.0N (Benghazi/Agedabia to Mersa Matruh; Qattara depression edge at south-east is outside; Alexandria at 29.9E was
outside, so supply sources for GBR in Egypt are Mersa Matruh/Sidi Barrani or a railhead - alternatively widen east to 30.5E to include Alexandria).
Terrain classes needed beyond the existing 10 codes (map-engineer decides; existing Desert=7 is too coarse):
 - sand sea / soft sand (Great Sand Sea edge, very slow, wheeled vehicles bog), rocky/gravel desert (serviceable "hard going", the normal Libyan plateau), escarpment (Sidi Rezegh,
   Halfaya Pass, the Libyan escarpment: Hills/Mountains-like steep edge, passes only), wadis (dry riverbeds: modest movement penalty, cover), salt marsh/sabkha (Marsa Brega, Gulf of Sirte),
   Jebel Akhdar coastal highlands (Derna-Benghazi, Hills with Forest/Plains cells), Qattara Depression (impassable for the Alamein variant; relevant to a later campaign only).
 - If new codes are impossible, minimum mapping: rocky plateau = Plains, sand = Desert, escarpment/Jebel = Hills, depression = Mountains (impassable) - flag this as an approximation.
Infra: Via Balbia coast road (Tripoli-Sirte-Agedabia-Benghazi-Derna-Tobruk-Bardia-Sollum), the Trigh Capuzzo and Trigh el Abd desert tracks (historical, to verify), Sollum-Mersa Matruh coast road,
Western Desert railway (Alexandria-Mersa Matruh, railhead at Sidi Barrani/Capuzzo extension built 1940-41; verify), Libyan railway fragments (Benghazi-Barce-Soluch). Mark `historical:true` only where
sourced; the modern coast highway largely follows the Via Balbia route.
Boundaries: 1941 border Egypt/Libya (Italian Libya), no modern borders.

## Engine features that do not exist yet (for the lead; not data)
1. Supply by desert track and sea: logistics uses roads/rail within TRUCK_RANGE_KM 70 km and MAX_EFFECTIVE_KM 500 km. Crusader frontline sits 150-350 km from Tobruk-Benghazi-Tripoli road ends;
   sea supply is port-to-port without distance or interdiction. Need (a) off-road truck supply with a cost for tracks, (b) sea convoy distance and loss chance (Malta/Desert Air Force interdiction),
   (c) port throughput caps (Tobruk 1,500 t/day; Tripoli about 45,000 t/month; Benghazi about 15,000 t/month).
2. Fuel as the dominant logistic constraint: fuel burn by distance (road transport eating 30-50% of fuel), truck unserviceability. A fuel stock per unit exists; a per-movement burn and a per-ton
   nation fuel pool linked to convoys is needed for the Axis to be fuel-constrained as historically.
3. Desert water: not sourced; skip or treat as a flat supply tax in sand terrain (needs a source).
4. Terrain: Desert-specific classes above; wadi/escarpment pass chokes (combat/pathfinding modifiers, sim-engineer/map-engineer).
5. Besieged fortress: Tobruk perimeter fortifications (existing fortification-within-8km rule) and a 'besieged' supply state so a surrounded port keeps sea supply (ties to point 1).
6. NationId: 'RSA' (South Africa) missing; Czechoslovak battalion minor.
7. Air: carry-over from Fall of France (air supply free, no sortie economics) is a bigger problem here where air superiority swung the battle.
8. Fog/time: sandstorms/storms (Nov 17/18 storm grounded aircraft) - weather kinds sandstorm/dust (weatherProfile uses existing WeatherKind).
9. Victory conditions (draft): Allies decisive = Tobruk relieved + Cyrenaica to Agedabia; Axis decisive = Tobruk captured/ Eighth Army broken; stalemate otherwise; use control_fraction plus
   capture/hold objectives on Tobruk, Sidi Rezegh, Benghazi, Bardia/Sollum.

## Flagged weak sources
N04 (RAF organisation table undated to Crusader day) - weak; no Axis air source yet. N02/N03 Wikipedia timelines give days not hours; strengths vary by source ("citation needed" flags in the infobox).

## Representing the Axis sea supply line with current engine contracts (proposal; no numbers invented)
Problem: Tripoli (13.2E) is off a 19.0-28.5E bbox, so the Axis supply chain (Italy -> Tripoli/Benghazi by sea, then 600+ mi by the Via Balbia) is invisible, yet it was the decisive Axis constraint (N02, N05).
Contracts available today: nation `resources` pool + per-tick `income` (military/logistics draws unit supply from sources inside the map), `location` supplySources inside the bbox, and event `effects` ops
`resource` (delta to a nation pool), `reinforce`, `location_damage`, `unit_stat`. Sea supply is port-to-port with no distance (logistics.ts), so convoys cannot be simulated; only their delivered results can be.
Option A (recommended, no engine change, no map change): model the supply line as the nation's fuel/ammo INCOME plus dated, sourced convoy events.
 1. Set the Axis monthly delivered fuel/supply income as game-scale proportional to sourced port throughput: Tripoli about 45,000 long tons/month and Benghazi about 15,000 long tons/month (N05) versus the Axis need of about
    70,000 long tons/month (N05) => deliveries cover roughly 60,000/70,000 only before shipping losses; N02 says December fuel was the critical shortage. Encode the ratio, not the tonnage: pool income = need ratio x normal per-unit income, labelled G01.
 2. Dated `resource` effects only where a sourced event exists: N02 gives (a) November: five-ship convoy sunk and daylight road movement prevented by air attack => a dated negative fuel effect on the sourced date (needs the exact day: not in N02, so
    OMIT the date or use the month-level statement as flavour, not as a scripted effect); (b) Vichy sold about 3,600 long tons (positive, date not stated); (c) mid-December Italian warships carried fuel to Derna/Benghazi (positive, mid-Dec).
    Only (c) and (b) are directly restatable; each effect amount must be a game-scale conversion of the sourced tonnage (3,600 t -> a stated fraction of the Axis pool) and the sidecar must say so.
 3. Keep Benghazi and Derna as Axis supply sources (already in the draft); the Benghazi capture objective then removes the forward port, which the sim already handles (loss of source -> supply collapse).
 4. Do not model Malta interdiction as a script: N03 says Malta influenced convoy success, but no per-month loss data was retrieved. Flag as unmodelled.
Option B (needs map-engineer; modest): extend the bbox west to about 15.0E to include Sirte, El Agheila, Marsa Brega and Agedabia, adding the long desert haul (about 600 mi Tripoli-Benghazi is still off-map). Gains haul-distance logistics for the Via Balbia
    segment only and costs a much larger terrain grid with mostly empty desert. NOT recommended for Crusader: Tripoli (13.2E) would still be off-map; the sea convoys remain unrepresented. Extending to ~12.5E (Tripoli included) would triple the map width.
Option C (engine change, sim/military owners): port throughput caps, a sea-lane with distance and interdiction chance, and a per-movement fuel burn. This is the faithful model; list in the earlier engine-feature section (points 1-2).
Recommendation: Option A now (data only), tagged in the sidecar uncertain[] as an abstraction; revisit Option C for the Grand campaign.
Data to avoid: any invented per-convoy tonnage or sinking percentage; any Malta submarine/aircraft counts (not retrieved); the 13,000-ton Tripoli fuel stock mentioned for 1942 (N03) is outside the Crusader window.
