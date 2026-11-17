/**
 * Built-in doctrines per scenario family. These are GAME PACING data, not historical claims: gates stop the AI from
 * finishing the campaign in days. Every gate is derived from a dated, cited event in
 * src/data/campaigns/fall_of_france.events.json (event ids in comments); hours are sim hours from 10 May 1940 00:00.
 */
import { registerAiDoctrine, type AiDoctrine } from './doctrine';

const H = 60;
const sched = (hours: number, ...ids: string[]): Record<string, number> => Object.fromEntries(ids.map((i) => [i, hours * H]));

/** Germany: Schwerpunkt at Sedan, exploitation to the Channel, then Dunkirk, then Fall Rot (Case Red). */
export const FALL_OF_FRANCE_GER: AiDoctrine = {
  posture: 'auto',
  // Fall Gelb: the whole army group is on the offensive from the first hour (the first think must not wait for a reaction delay)
  phases: [{ fromMinutes: 0, posture: 'attack' }, { fromMinutes: 900 * H, posture: 'auto' }],
  armour: 'breakthrough',
  reserveFraction: 0.15,
  aggressionBias: 0.3,
  maxOperations: 5,
  // Schwerpunkt sequence: Meuse crossing at Sedan, the Somme/Channel, the Dunkirk pocket, then Paris and the coast
  armourObjectives: ['sedan', 'abbeville', 'dunkirk', 'paris', 'cherbourg'],
  captureLocations: ['sedan', 'abbeville', 'brussels', 'rotterdam'],
  objectiveSchedule: {
    // fof.ev.channel (240 h): armour reaches the Channel -> Somme line open from ~7 days
    ...sched(168, 'abbeville', 'amiens', 'arras'),
    // fof.ev.belgium (432 h): Belgian coast / Lys
    ...sched(360, 'ghent', 'ostend'), ...sched(400, 'lille'),
    // fof.ev.dynamo_start (384 h): Calais falls
    ...sched(330, 'calais', 'boulogne'),
    // fof.ev.dynamo_end (600 h): Dunkirk perimeter taken
    ...sched(560, 'dunkirk'),
    // fof.ev.fall_rot (624 h): the offensive south of the Somme/Aisne
    ...sched(624, 'reims', 'metz', 'strasbourg', 'hackenberg', 'fermont', 'schoenenbourg'),
    // fof.ev.st_valery (792 h)
    ...sched(700, 'st_valery', 'le_havre', 'rouen'),
    // fof.ev.paris (840 h)
    ...sched(700, 'paris'), ...sched(840, 'orleans', 'tours', 'nantes', 'st_nazaire', 'brest'),
    // fof.ev.cherbourg (936 h)
    ...sched(880, 'cherbourg'),
  },
};

/**
 * Allied command in May 1940: the plan (Dyle/Breda variant) had the best mobile armies committed into Belgium and the Netherlands, the
 * Ardennes thrust was misread for days, and the French chain of command was slow (Series B divisions, telephone-bound HQs). These are
 * game-pacing levers on the AI (slower reaction, fewer orders per cycle, mobile forces fixed on the Belgian plan), not historical claims.
 */
export const FALL_OF_FRANCE_ALLIES: AiDoctrine = {
  posture: 'defend',
  reactionMinutes: 900,
  maxCommands: 10,
  reserveFraction: 0.3,
  maxOperations: 2,
};
/** The French army: the best mobile armies were fixed on the Belgian plan (Dyle line), so the Meuse sector was thin and late to react. */
export const FALL_OF_FRANCE_FRA: AiDoctrine = {
  ...FALL_OF_FRANCE_ALLIES,
  holdLocations: ['brussels', 'namur', 'liege', 'antwerp'],
  locationWeights: { brussels: 2, antwerp: 1.5, namur: 1.5 },
};
for (const n of ['GBR', 'BEL', 'NED'] as const) registerAiDoctrine('fall_of_france', n, FALL_OF_FRANCE_ALLIES);
registerAiDoctrine('fall_of_france', 'FRA', FALL_OF_FRANCE_FRA);
registerAiDoctrine('fall_of_france', 'GER', FALL_OF_FRANCE_GER);

/**
 * Ardennes (Bulge Short): hours from 16 Dec 1944 00:00. Gates are pacing derived from the campaign's cited timeline
 * (src/data/campaigns/bulge.short.sources.json, aiDoctrineHints; sources B02, B04, B05, B08).
 */
export const BULGE_GER: AiDoctrine = {
  posture: 'attack',
  fuelAware: true, // the German fuel pool is low and sourced as the decisive shortage (bulge.short.sources.json)
  armour: 'breakthrough',
  reserveFraction: 0.15,
  aggressionBias: 0.15,
  maxOperations: 5,
  locationWeights: { bastogne: 0.5, dinant: 2, namur: 1.5, huy: 1.5 },
  armourObjectives: ['stavelot', 'st_vith', 'houffalize', 'marche', 'dinant'], // Bastogne is left to the infantry: the panzers aim for the Meuse
  captureLocations: ['st_vith', 'bastogne', 'stavelot', 'houffalize', 'marche', 'dinant', 'namur', 'huy', 'liege'],
  objectiveSchedule: { ...sched(36, 'stavelot'), ...sched(120, 'st_vith', 'bastogne'), ...sched(150, 'houffalize'), ...sched(168, 'marche'), ...sched(192, 'dinant'), ...sched(240, 'huy'), ...sched(288, 'namur'), ...sched(400, 'liege') },
};

export const BULGE_ALLIES: AiDoctrine = {
  posture: 'defend',
  phases: [{ fromMinutes: 432 * H, posture: 'attack' }], // counter-offensive from 3 January 1945 (hour 432)
  holdLocations: ['bastogne', 'elsenborn', 'st_vith', 'dinant', 'namur', 'huy'], // Bastogne first: the 101st, 10th Armored and 4th Armored go there
  captureLocations: ['houffalize', 'st_vith'],
  locationWeights: { elsenborn: 2, bastogne: 2, dinant: 1.5, namur: 1.5, huy: 1.5 },
  armour: 'balanced',
  maxOperations: 4,
};

registerAiDoctrine('bulge', 'GER', BULGE_GER);
registerAiDoctrine('bulge', 'USA', BULGE_ALLIES);
registerAiDoctrine('bulge', 'GBR', BULGE_ALLIES);

/**
 * Operation Crusader (crusader.short): hours from 18 Nov 1941 00:00. Dated events from docs/NORTH_AFRICA_RESEARCH.md (N02):
 * 19-21 Nov Bir el Gubi / Sidi Rezegh, 21 Nov Tobruk breakout, 22-24 Nov Axis counter-thrust ("dash to the wire"),
 * 27 Nov NZ link-up at Ed Duda, 6 Dec Rommel orders the retreat, 15/16 Dec Gazala line evacuated. Gates are pacing, not claims.
 */
export const CRUSADER_ALLIES: AiDoctrine = {
  posture: 'attack',
  armour: 'breakthrough',
  reserveFraction: 0.2,
  maxOperations: 4,
  armourObjectives: ['sidi_rezegh', 'belhamed', 'sidi_omar', 'bardia', 'gazala', 'benghazi'],
  captureLocations: ['sidi_rezegh', 'belhamed', 'bardia', 'gazala', 'benghazi'],
  holdLocations: ['tobruk', 'el_adem', 'ed_duda'],
  locationWeights: { sidi_rezegh: 2, tobruk: 3 },
  objectiveSchedule: {
    ...sched(12, 'sidi_rezegh', 'bir_el_gubi'), ...sched(60, 'belhamed'), ...sched(48, 'sidi_omar', 'fort_capuzzo'),
    ...sched(300, 'halfaya', 'sollum'), ...sched(860, 'bardia'), // Bardia held out until 2 January 1942 (after the scenario)
    ...sched(560, 'gazala', 'acroma'), ...sched(620, 'derna'), ...sched(700, 'benghazi'),
  },
};

export const CRUSADER_GER: AiDoctrine = {
  posture: 'auto',
  fuelAware: true, // Axis fuel was the critical shortage in Nov-Dec 1941 (N02)
  // surprised on 18-21 Nov (defend), counter-thrust from 22 Nov, retreat ordered 6 Dec, hold the Agedabia line from late Dec
  phases: [{ fromMinutes: 0, posture: 'defend' }, { fromMinutes: 96 * H, posture: 'attack' }, { fromMinutes: 456 * H, posture: 'withdraw' }, { fromMinutes: 720 * H, posture: 'defend' }],
  armour: 'breakthrough',
  reserveFraction: 0.2,
  aggressionBias: 0.2,
  maxOperations: 4,
  armourObjectives: ['sidi_rezegh', 'sidi_omar', 'ed_duda', 'belhamed', 'el_adem', 'tobruk'], // Totensonntag (23 Nov) at Sidi Rezegh, then the dash to the wire (24-26 Nov)
  captureLocations: ['tobruk', 'sidi_rezegh', 'ed_duda'],
  holdLocations: ['benghazi', 'agedabia'],
  fallbackLocations: ['gazala', 'agedabia', 'el_agheila'],
  objectiveSchedule: { ...sched(96, 'sidi_rezegh', 'belhamed', 'ed_duda', 'el_adem'), ...sched(120, 'sidi_omar'), ...sched(200, 'tobruk') },
};

export const CRUSADER_ITA: AiDoctrine = {
  posture: 'defend',
  fuelAware: true,
  armour: 'balanced',
  reserveFraction: 0.25,
  maxOperations: 3,
  holdLocations: ['bardia', 'sollum', 'halfaya', 'sidi_omar', 'fort_capuzzo', 'gazala', 'benghazi', 'agedabia'],
  fallbackLocations: ['gazala', 'agedabia', 'el_agheila'],
  phases: [{ fromMinutes: 456 * H, posture: 'withdraw' }, { fromMinutes: 720 * H, posture: 'defend' }],
};

for (const n of ['GBR', 'NZL', 'IND', 'RSA', 'POL', 'AUS'] as const) registerAiDoctrine('crusader', n, CRUSADER_ALLIES);
registerAiDoctrine('crusader', 'GER', CRUSADER_GER);
registerAiDoctrine('crusader', 'ITA', CRUSADER_ITA);

/**
 * Stalingrad Short (stalingrad.short): hours from 19 Nov 1942 00:00. Dated events from docs/EASTERN_FRONT_RESEARCH.md (E01-E03):
 * Uranus opens 19 Nov, Kalach 22 Nov, link-up at Sovetsky 23 Nov (about hour 92), Winter Storm 12-23 Dec (hour 552-), Little Saturn
 * from 16 Dec (hour 696), Tatsinskaya raid 24 Dec. The gates are pacing, not claims.
 */
export const STALINGRAD_SOV: AiDoctrine = {
  posture: 'attack',
  armour: 'breakthrough',
  reserveFraction: 0.15,
  aggressionBias: 0.15,
  maxOperations: 5,
  // Uranus: the northern pincer (5th Tank / 21st Army) and the southern one (51st / 57th Army) both aim at Kalach
  // the whole mobile force is one group: both pincers meet at Kalach / Marinovka (Sovetsky), sealing 6th Army
  axisSize: 10,
  armourObjectives: ['kalach', 'marinovka', 'vertyachy', 'surovikino', 'tatsinskaya', 'morozovsk'],
  captureLocations: ['kletskaya', 'perelazovsky', 'kalach', 'marinovka', 'vertyachy', 'surovikino', 'tatsinskaya', 'morozovsk'],
  holdLocations: ['beketovka', 'kotluban', 'serafimovich'], // the ring and the Volga lifeline must hold
  locationWeights: { kalach: 3, marinovka: 2 },
  objectiveSchedule: {
    ...sched(0, 'kletskaya', 'perelazovsky', 'kalach', 'marinovka', 'vertyachy'),
    // Little Saturn from 16 Dec (hour 696)
    ...sched(660, 'surovikino', 'morozovsk', 'tatsinskaya', 'bokovskaya', 'oblivskaya'),
    // the city is reduced after the window (Operation Ring, January); do not rush the pocket
    ...sched(900, 'stalingrad', 'mamayev_kurgan', 'gumrak'),
  },
};

export const STALINGRAD_GER: AiDoctrine = {
  posture: 'auto',
  // pocket and Army Group B defend; the relief attack (Winter Storm) opens on 12 Dec (hour 552) and is spent by about 23 Dec (hour 770)
  phases: [{ fromMinutes: 0, posture: 'defend' }, { fromMinutes: 552 * H, posture: 'attack' }, { fromMinutes: 770 * H, posture: 'defend' }],
  armour: 'breakthrough',
  reserveFraction: 0.15,
  maxOperations: 4,
  fuelAware: true,
  pocketLocations: ['stalingrad', 'mamayev_kurgan', 'gumrak', 'marinovka', 'vertyachy'],
  armourObjectives: ['beketovka'],
  captureLocations: ['beketovka', 'kotluban'],
  holdLocations: ['stalingrad', 'gumrak', 'kotelnikovo', 'tatsinskaya', 'surovikino'],
  fallbackLocations: ['tatsinskaya', 'morozovsk', 'kotelnikovo'],
  objectiveSchedule: { ...sched(552, 'beketovka', 'kotluban') },
};

export const STALINGRAD_AXIS_ALLIES: AiDoctrine = {
  posture: 'defend',
  armour: 'balanced',
  reserveFraction: 0.2,
  maxOperations: 3,
  holdLocations: ['kletskaya', 'perelazovsky', 'bokovskaya', 'kotelnikovo', 'abganerovo', 'verkhnekumsky'],
  fallbackLocations: ['morozovsk', 'oblivskaya', 'kotelnikovo'],
};

registerAiDoctrine('stalingrad', 'SOV', STALINGRAD_SOV);
registerAiDoctrine('stalingrad', 'GER', STALINGRAD_GER);
registerAiDoctrine('stalingrad', 'ROU', STALINGRAD_AXIS_ALLIES);
registerAiDoctrine('stalingrad', 'ITA', STALINGRAD_AXIS_ALLIES);

/**
 * Normandy (hours from 6 June 1944 00:00 unless the scenario start says otherwise). SCAFFOLD: location ids are not filled yet
 * (waiting for campaign-engineer's ids); the phase table and release rules are structural and data-overridable through
 * state.special.aiDoctrine. Landings are scheduled arrivals in the data, so the AI only moves units inland from the beaches.
 */
const NORMANDY_COBRA_H = 49 * 24; // Operation Cobra, 25 July 1944 (D+49): to be confirmed against the campaign sources file

export const NORMANDY_ALLIES: AiDoctrine = {
  posture: 'attack',
  // lodgement (join the beaches up, take Bayeux/Isigny/Carentan), consolidation behind the bocage, Charnwood/Goodwood at Caen, then Cobra
  phases: [{ fromMinutes: 0, posture: 'attack' }],
  armour: 'balanced',
  reserveFraction: 0.2,
  aggressionBias: 0.1,
  maxOperations: 5,
  ratioToAttack: 1.8, // Allied firepower, air supremacy and naval gunfire carry attacks the bare force ratio would not
  holdLocations: [], // no garrison draft on the beaches: the army must go inland (the Mulberry is held by the beachhead itself)
  captureLocations: ['bayeux', 'isigny', 'carentan', 'carpiquet', 'cherbourg', 'saint_lo', 'caen', 'avranches'],
  locationWeights: { cherbourg: 3, carentan: 1.5 }, // VII Corps' Cotentin drive is the first operational priority after the lodgement
  // historical pacing (campaign start 6 Jun 00:00): Bayeux 7 Jun, Isigny 9 Jun, Carentan 12 Jun, Cherbourg 26 Jun (h480),
  // Carpiquet/Caen 4-21 Jul (h700-1100), St-Lo 18 Jul (h1000), Avranches 31 Jul (Cobra, D+49 h1176)
  objectiveSchedule: { ...sched(0, 'bayeux'), ...sched(48, 'isigny'), ...sched(96, 'carentan'), ...sched(240, 'cherbourg'), ...sched(1000, 'carpiquet'), ...sched(1060, 'caen'), ...sched(1150, 'saint_lo'), ...sched(NORMANDY_COBRA_H + 24, 'avranches') },
  armourObjectives: ['cherbourg', 'caen', 'avranches'],
};

export const NORMANDY_GER: AiDoctrine = {
  posture: 'defend',
  armour: 'reserve', // panzers are the counter-attack reserve, not a breakthrough force
  reserveFraction: 0.3,
  maxOperations: 4,
  // bocage defence in depth around the key towns; sticky garrisons keep units on them
  holdLocations: ['caen', 'cherbourg', 'saint_lo', 'carentan', 'bayeux', 'avranches'],
  locationWeights: { caen: 2.5, cherbourg: 2, carentan: 1.5, saint_lo: 1.5 },
  // the panzer reserve is held back until OKW releases it (12th SS Hitlerjugend 7 Jun, Panzer Lehr 8 Jun): data-overridable
  reserveReleases: [
    { match: '12ss', fromMinutes: 24 * H },
    { match: '12. ss', fromMinutes: 24 * H },
    { match: 'hitlerjugend', fromMinutes: 24 * H },
    { match: 'panzer lehr', fromMinutes: 48 * H },
    { match: 'panzer-lehr', fromMinutes: 48 * H },
  ],
};

for (const n of ['USA', 'GBR', 'CAN', 'POL', 'FRA'] as const) registerAiDoctrine('normandy', n, NORMANDY_ALLIES);
registerAiDoctrine('normandy', 'GER', NORMANDY_GER);

/**
 * Barbarossa (hours from 22 June 1941 00:00; scenario barbarossa.short, 2,400 ticks to 30 Sep 1941). Pacing dates are the campaign's cited
 * dates (campaign-engineer, docs/BARBAROSSA_RESEARCH.md / normandy-style sources sidecar): Minsk 28 Jun, Pskov 8-10 Jul, Smolensk battle 10 Jul-10 Sep
 * (pocket closed 5 Aug), Uman pocket destroyed 8 Aug, Novgorod 16 Aug, Kingisepp/Narva 17 Aug, Shlisselburg 7-8 Sep, Kiev encircled 16 Sep, taken 19 Sep.
 * Three army-group axes, each an armoured group with its own objective list (doctrine.armourGroups). No fog cheating: objectives come from the doctrine.
 */
const D = 24;
export const BARBAROSSA_AXIS: AiDoctrine = {
  posture: 'attack',
  armour: 'breakthrough', // deep armoured thrusts; the infantry armies follow and take the towns
  encirclement: true,
  fuelAware: true, // the panzer groups outrun their supply
  ratioToAttack: 0.5, // 1941: concentrated, well-led formations attacked at parity or worse and won by manoeuvre
  reserveFraction: 0.15,
  aggressionBias: 0.15,
  maxOperations: 8,
  armourGroups: [
    { name: 'north', size: 5, objectives: ['siauliai', 'daugavpils', 'pskov', 'luga', 'novgorod', 'shlisselburg'] }, // 4th Panzer Group
    { name: 'centre', size: 8, objectives: ['bialystok', 'minsk', 'vitebsk', 'smolensk'] }, // 2nd and 3rd Panzer Groups
    { name: 'south', size: 6, objectives: ['lutsk', 'rovno', 'zhitomir', 'uman', 'kiev'] }, // 1st Panzer Group
  ],
  captureLocations: ['brest', 'minsk', 'smolensk', 'kiev', 'riga', 'pskov', 'novgorod', 'shlisselburg', 'leningrad'],
  objectiveSchedule: {
    ...sched(0, 'brest'), ...sched(5 * D, 'minsk'), // Minsk 28 Jun
    ...sched(16 * D, 'pskov'), // Pskov 8 Jul
    ...sched(18 * D, 'smolensk'), // the Smolensk battle opens 10 Jul
    ...sched(45 * D, 'uman'), // Uman pocket destroyed 8 Aug
    ...sched(54 * D, 'novgorod', 'luga'), ...sched(55 * D, 'kingisepp', 'narva'), // Novgorod 16 Aug, Kingisepp/Narva 17 Aug
    ...sched(76 * D, 'shlisselburg'), // Shlisselburg 7-8 Sep
    ...sched(86 * D, 'kiev'), // Kiev encircled 16 Sep, taken 19 Sep
    ...sched(120 * D, 'leningrad', 'moscow'), // never reached in the scenario window
  },
};

export const BARBAROSSA_SOVIET: AiDoctrine = {
  posture: 'defend',
  // frontier defence under surprise: a slow first reaction, then counter-attacks when the ratio allows
  reactionMinutes: 360,
  counterattackFromMinutes: 72 * 60, // no counter-attacks for the first 72 h (surprise); then defend / delay / counter-attack
  armour: 'balanced',
  reserveFraction: 0.3,
  maxOperations: 4,
  encirclement: false,
  holdLocations: ['minsk', 'smolensk', 'kiev', 'leningrad', 'moscow', 'vitebsk', 'pskov', 'novgorod'],
  locationWeights: { minsk: 2, smolensk: 2, kiev: 2, leningrad: 3, moscow: 3 },
  // delay lines: the Dvina-Dnieper line and the Luga line
  fallbackLocations: ['vitebsk', 'polotsk', 'orsha', 'mogilev', 'borisov', 'luga', 'novgorod', 'narva', 'kingisepp', 'pskov'],
};

registerAiDoctrine('barbarossa', 'GER', BARBAROSSA_AXIS);
registerAiDoctrine('barbarossa', 'ROU', BARBAROSSA_AXIS);
registerAiDoctrine('barbarossa', 'HUN', BARBAROSSA_AXIS);
registerAiDoctrine('barbarossa', 'SOV', BARBAROSSA_SOVIET);
