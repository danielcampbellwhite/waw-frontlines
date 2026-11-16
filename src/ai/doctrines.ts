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
  fuelAware: true,
  reserveFraction: 0.1,
  aggressionBias: 0.15,
  axisSize: 10,
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
