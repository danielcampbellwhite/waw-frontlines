// Generator for Operation Crusader (short) -> src/data/campaigns/crusader.short.json (+ .sources.json, .events.json).
// Run: node src/data/campaigns/_build/build_crusader.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './crusader_sources.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(OUT, { recursive: true });
const EPOCH = Date.parse('1941-11-18T00:00:00Z');
const END_ISO = '1942-01-01T00:00:00Z';
const mins = (iso) => Math.round((Date.parse(iso) - EPOCH) / 60000);
const TICKS = mins(END_ISO) / 60;
const BBOX = { west: 19.0, south: 28.5, east: 30.5, north: 33.0 };
const TERRAIN_FILE = 'terrain_northafrica.json', INFRA_FILE = 'infra_northafrica.json'; 
const inBox = ([lon, lat]) => lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;

// [id, name, kind, lon, lat, owner, originalOwner, value, srcs]  (G02; desert features +/-0.15 deg)
const LOC = [
  ['tobruk', 'Tobruk', 'port', 23.96, 32.08, 'GBR', 'GBR', 10, ['N05']],
  ['tobruk_perimeter', 'Tobruk perimeter (Italian-built strongpoints and anti-tank ditch)', 'fortress', 23.97, 32.05, 'GBR', 'GBR', 4, ['N05']],
  ['el_adem', 'El Adem', 'airfield', 23.88, 31.85, 'GBR', 'GBR', 3, ['N02', 'G02']],
  ['ed_duda', 'Ed Duda', 'town', 23.99, 32.00, 'GBR', 'GBR', 4, ['N02', 'G02']],
  ['sidi_rezegh', 'Sidi Rezegh', 'airfield', 24.05, 31.93, 'ITA', 'ITA', 6, ['N02', 'G02']],
  ['belhamed', 'Belhamed', 'town', 24.08, 31.99, 'ITA', 'ITA', 3, ['N02', 'G02']],
  ['bir_el_gubi', 'Bir el Gubi', 'town', 23.95, 31.40, 'ITA', 'ITA', 3, ['N02', 'G02']],
  ['gabr_saleh', 'Gabr Saleh', 'town', 24.90, 31.40, 'NEUTRAL', 'ITA', 3, ['N02', 'G02']],
  ['sidi_omar', 'Sidi Omar', 'town', 25.07, 31.53, 'ITA', 'ITA', 3, ['N02', 'G02']],
  ['fort_capuzzo', 'Fort Capuzzo', 'fortress', 25.05, 31.60, 'ITA', 'ITA', 4, ['N02', 'G02']],
  ['sollum', 'Sollum', 'port', 25.17, 31.52, 'ITA', 'ITA', 3, ['N02', 'G02']],
  ['halfaya', 'Halfaya Pass', 'fortress', 25.20, 31.52, 'ITA', 'ITA', 4, ['N02', 'G02']],
  ['bardia', 'Bardia', 'port', 25.10, 31.72, 'ITA', 'ITA', 5, ['N02', 'G02']],
  ['gambut', 'Gambut', 'airfield', 24.55, 31.95, 'ITA', 'ITA', 3, ['N02', 'G02']],
  ['acroma', 'Acroma', 'town', 23.77, 32.05, 'ITA', 'ITA', 2, ['N05', 'G02']],
  ['gazala', 'Gazala', 'town', 23.20, 32.17, 'ITA', 'ITA', 4, ['N02', 'G02']],
  ['derna', 'Derna', 'port', 22.65, 32.72, 'ITA', 'ITA', 4, ['N02', 'G02']],
  ['benghazi', 'Benghazi', 'port', 20.07, 32.12, 'ITA', 'ITA', 8, ['N02', 'N05']],
  ['agedabia', 'Agedabia', 'town', 20.23, 30.76, 'ITA', 'ITA', 4, ['N02', 'G02']],
  ['el_agheila', 'El Agheila', 'town', 19.20, 30.26, 'ITA', 'ITA', 4, ['N02', 'G02']],
  ['sidi_barrani', 'Sidi Barrani', 'town', 25.92, 31.60, 'GBR', 'GBR', 3, ['G02']],
  ['mersa_matruh', 'Mersa Matruh', 'port', 27.23, 31.35, 'GBR', 'GBR', 6, ['N02', 'G02']],
  ['alexandria', 'Alexandria', 'port', 29.92, 31.20, 'GBR', 'GBR', 8, ['G02']],
  ['maaten_bagush', 'Maaten Bagush (AHQ Western Desert)', 'airfield', 27.0, 31.43, 'GBR', 'GBR', 3, ['N04', 'G02']],
];
// Anchors (G03). Allied start in Egypt near the frontier; Axis around Tobruk/Bardia.
const A = {
  EIGHTH_HQ: [26.2, 31.45], XXX: [25.35, 31.15], XXX_B: [25.4, 31.25], XIII: [25.5, 31.5], RES: [26.5, 31.5], OASIS: [24.52, 29.74],
  TOB: [23.96, 32.04], TOB_E: [24.0, 32.02],
  PG: [24.3, 32.0], DAK_15: [24.7, 31.95], DAK_21: [24.2, 31.88], ARIETE: [23.95, 31.42], TRIESTE: [23.9, 31.6], SAVONA: [25.17, 31.58], BARDIA: [25.1, 31.75],
  XXI: [23.8, 32.0], PAVIA: [23.5, 31.95], BOLOGNA: [23.8, 31.95], BRESCIA: [24.0, 31.97], TRENTO: [24.1, 32.0],
};
const U = [];
const e = (id, name, sh, nation, type, parent, anc, srcs, opts = {}) => U.push({ id, name, sh, nation, type, parent, anc, srcs, opts });
// Allied (N01)
e('gbr.army8', 'Eighth Army (Cunningham)', '8th Army', 'GBR', 'hq', null, 'EIGHTH_HQ', ['N01']);
e('gbr.c.XXX', 'XXX Corps (Norrie)', 'XXX Corps', 'GBR', 'hq', 'gbr.army8', 'XXX', ['N01']);
e('gbr.7ad', '7th Armoured Division (Gott)', '7th Armd', 'GBR', 'armoured', 'gbr.c.XXX', 'XXX', ['N01'], { mp: 12000 });
e('gbr.4ab', '4th Armoured Brigade', '4 Armd Bde', 'GBR', 'armoured', 'gbr.7ad', 'XXX', ['N01', 'N02'], { mp: 3500 });
e('gbr.7ab', '7th Armoured Brigade', '7 Armd Bde', 'GBR', 'armoured', 'gbr.7ad', 'XXX', ['N01', 'N02'], { mp: 3500 });
e('gbr.22ab', '22nd Armoured Brigade', '22 Armd Bde', 'GBR', 'armoured', 'gbr.7ad', 'XXX', ['N01', 'N02'], { mp: 3500 });
e('gbr.7sg', '7th Support Group', '7 Sup Gp', 'GBR', 'motorised', 'gbr.7ad', 'XXX', ['N01'], { mp: 3000 });
e('rsa.1div', '1st South African Division (Brink)', '1 SA Div', 'RSA', 'infantry', 'gbr.c.XXX', 'XXX_B', ['N01']);
e('gbr.22gb', '22nd Guards Brigade', '22 Gds Bde', 'GBR', 'infantry', 'gbr.c.XXX', 'XXX_B', ['N01'], { mp: 3500 });
e('gbr.c.XIII', 'XIII Corps (Godwin-Austen)', 'XIII Corps', 'GBR', 'hq', 'gbr.army8', 'XIII', ['N01']);
e('nzl.2div', '2nd New Zealand Division (Freyberg)', '2 NZ Div', 'NZL', 'infantry', 'gbr.c.XIII', 'XIII', ['N01'], { exp: 60 });
e('ind.4div', '4th Indian Infantry Division (Messervy)', '4 Ind Div', 'IND', 'infantry', 'gbr.c.XIII', 'XIII', ['N01']);
e('gbr.1atb', '1st Army Tank Brigade', '1 ATB', 'GBR', 'armoured', 'gbr.c.XIII', 'XIII', ['N01'], { mp: 3000 });
e('gbr.70div', '70th Infantry Division (Scobie) - Tobruk', '70 Div', 'GBR', 'infantry', null, 'TOB', ['N01', 'N05'], { ent: 70, pos: 'entrench' });
e('pol.carp', 'Polish Independent Carpathian Rifle Brigade - Tobruk', 'Carpathian', 'POL', 'infantry', null, 'TOB', ['N01', 'N05'], { mp: 5000, ent: 70, pos: 'entrench' });
e('gbr.32atb', '32nd Army Tank Brigade - Tobruk', '32 ATB', 'GBR', 'armoured', null, 'TOB_E', ['N01', 'N05'], { mp: 3000, ent: 70, pos: 'entrench' });
e('gbr.4aa', '4th Anti-Aircraft Brigade - Tobruk', '4 AA Bde', 'GBR', 'infantry', null, 'TOB', ['N01'], { mp: 2500, ent: 70, pos: 'entrench' });
e('ind.29bde', '29th Indian Infantry Brigade (Oasis Force)', '29 Ind Bde', 'IND', 'infantry', null, 'OASIS', ['N01'], { mp: 3500 });
e('rsa.6arm', '6th South African Armoured Car Regiment (Oasis Force)', '6 SA ACR', 'RSA', 'recon', null, 'OASIS', ['N01'], { mp: 1000 });
e('rsa.2div', '2nd South African Division (de Villiers) - Army Reserve', '2 SA Div', 'RSA', 'infantry', 'gbr.army8', 'RES', ['N01']);
// Axis (N01)
e('ger.pga', 'Panzergruppe Afrika (Rommel)', 'PzGr Afrika', 'GER', 'hq', null, 'PG', ['N01']);
e('ger.dak', 'Deutsches Afrika Korps (Crüwell)', 'DAK', 'GER', 'hq', 'ger.pga', 'PG', ['N01']);
e('ger.15pz', '15. Panzer-Division (Neumann-Silkow)', '15.PzD', 'GER', 'armoured', 'ger.dak', 'DAK_15', ['N01', 'N02'], { mp: 12000 });
e('ger.21pz', '21. Panzer-Division (v. Ravenstein)', '21.PzD', 'GER', 'armoured', 'ger.dak', 'DAK_21', ['N01', 'N02'], { mp: 12000 });
e('ger.90lt', 'Division z.b.V. Afrika / 90. leichte Afrika-Division (Sümmermann)', '90.leDiv', 'GER', 'motorised', 'ger.dak', 'BARDIA', ['N01'], { mp: 9000 });
e('ita.55sav', '55a Divisione fanteria "Savona" (de Giorgis)', 'Savona', 'ITA', 'infantry', 'ger.pga', 'SAVONA', ['N01']);
e('ita.c.XX', "XX Corpo d'Armata (Gambara)", 'XX CA', 'ITA', 'hq', 'ger.pga', 'ARIETE', ['N01']);
e('ita.132ar', '132a Divisione corazzata "Ariete" (Balotta)', 'Ariete', 'ITA', 'armoured', 'ita.c.XX', 'ARIETE', ['N01', 'N02'], { mp: 8000, exp: 45 });
e('ita.101tri', '101a Divisione motorizzata "Trieste"', 'Trieste', 'ITA', 'motorised', 'ita.c.XX', 'TRIESTE', ['N01'], { mp: 9000 });
e('ita.c.XXI', "XXI Corpo d'Armata (Navarini)", 'XXI CA', 'ITA', 'hq', 'ger.pga', 'XXI', ['N01']);
e('ita.17pav', '17a Divisione fanteria "Pavia"', 'Pavia', 'ITA', 'infantry', 'ita.c.XXI', 'PAVIA', ['N01', 'N05']);
e('ita.25bol', '25a Divisione fanteria "Bologna"', 'Bologna', 'ITA', 'infantry', 'ita.c.XXI', 'BOLOGNA', ['N01', 'N05']);
e('ita.27bre', '27a Divisione fanteria "Brescia"', 'Brescia', 'ITA', 'infantry', 'ita.c.XXI', 'BRESCIA', ['N01', 'N05']);
e('ita.102tre', '102a Divisione motorizzata "Trento"', 'Trento', 'ITA', 'motorised', 'ita.c.XXI', 'TRENTO', ['N01', 'N05'], { mp: 9000 });

const T = {
  hq: { mp: 600, eq: { rifle: 600 } }, infantry: { mp: 13000, eq: { rifle: 100, gun_arty: 50, gun_at: 30 } },
  motorised: { mp: 12000, eq: { rifle: 80, gun_arty: 40, truck: 60 } },
  armoured: { mp: 12000, eq: { tank_medium: 100, tank_light: 30, gun_arty: 24, truck: 60 } },
  recon: { mp: 3000, eq: { rifle: 40, armoured_car: 30 } },
};
const NAT = { GBR: ['allies', 55, 76], NZL: ['allies', 60, 82], IND: ['allies', 50, 76], RSA: ['allies', 45, 74], POL: ['allies', 50, 85], GER: ['axis', 60, 80], ITA: ['axis', 40, 68] };
const spread = (a, k) => [Math.round((a[0] + ((k % 4) - 1.5) * 0.05) * 1000) / 1000, Math.round((a[1] + (Math.floor(k / 4) % 3 - 1) * 0.04) * 1000) / 1000];
const cnt = {};
const units = U.map((r) => {
  const k = (cnt[r.anc] = (cnt[r.anc] ?? -1) + 1);
  const t = T[r.type], [side, exp, morale] = NAT[r.nation], max = r.opts.mp ?? t.mp, held = { ...t.eq };
  return { id: r.id, name: r.name, shortName: r.sh, nation: r.nation, side, type: r.type, domain: 'land', ...(r.parent ? { parentId: r.parent } : {}), pos: spread(A[r.anc], k),
    manpower: max, manpowerMax: max, equipment: { held, authorised: { ...held } }, organisation: 90, morale, experience: r.opts.exp ?? exp, fuel: 100, ammo: 100, supply: 100, fatigue: 5, readiness: 90,
    entrenchment: r.opts.ent ?? (side === 'axis' ? 10 : 0), moveStatus: 'stationary', combatStatus: 'idle', posture: r.opts.pos ?? (side === 'axis' ? 'defend' : 'hold'), orders: [], kills: 0 };
});
const NATIONS = (() => {
  const mpOf = (n) => units.filter((x) => x.nation === n).reduce((a, x) => a + x.manpowerMax, 0), c = (n) => units.filter((x) => x.nation === n).length;
  const pool = (n, fs = 1) => ({ resources: { manpower: Math.max(2000, Math.round(mpOf(n) * 0.15)), fuel: Math.max(1500, Math.round(c(n) * 40 * fs)), ammo: Math.max(1500, c(n) * 50), equipment: Math.max(1500, c(n) * 100), supplyPoints: 600 },
    income: { manpower: Math.max(2, Math.ceil(mpOf(n) * 0.3 / TICKS)), fuel: Math.max(1, Math.ceil(c(n) * 0.15 * fs)), ammo: Math.max(2, Math.ceil(c(n) * 0.2)), equipment: Math.max(2, Math.ceil(c(n) * 0.4)), supplyPoints: 5 } });
  return [['GBR', 'allies', 'United Kingdom', true, 1], ['NZL', 'allies', 'New Zealand', false, 1], ['IND', 'allies', 'India', false, 1], ['RSA', 'allies', 'South Africa', false, 1], ['POL', 'allies', 'Poland', false, 1],
    ['GER', 'axis', 'Germany', true, 0.4], ['ITA', 'axis', 'Italy', true, 0.4]].map(([id, side, name, playable, fs]) => ({ id, side, name, playable, ...pool(id, fs), reinforcements: [] }));
})();
const END = mins(END_ISO);
const ob = (id, tier, side, title, description, condition, points) => ({ id, tier, side, title, description, condition, points, status: 'pending' });
const OBJ = [
  ob('o.ger.tobruk', 'primary', 'axis', 'Take Tobruk', 'Capture Tobruk and end the relief attempt.', { kind: 'capture_location', locationId: 'tobruk' }, 250),
  ob('o.ger.hold_gazala', 'secondary', 'axis', 'Hold the Gazala position', 'Hold Gazala to the end (Axis occupied it 7-8 Dec, N02).', { kind: 'hold_location', locationId: 'gazala', untilMinutes: END }, 100),
  ob('o.ger.hold_benghazi', 'primary', 'axis', 'Keep Benghazi', 'Keep Benghazi, the forward port.', { kind: 'hold_location', locationId: 'benghazi', untilMinutes: END }, 150),
  ob('o.ger.hold_bardia', 'secondary', 'axis', 'Hold Bardia and the frontier', 'Bardia, Sollum and Halfaya were ordered held (8 Dec, N02).', { kind: 'hold_location', locationId: 'bardia', untilMinutes: END }, 80),
  ob('o.ger.rezegh', 'secondary', 'axis', 'Secure Sidi Rezegh', 'Hold the Sidi Rezegh escarpment (retaken by 21st Panzer 22 Nov, N02).', { kind: 'hold_location', locationId: 'sidi_rezegh', untilMinutes: END }, 100),
  ob('o.ger.matruh', 'strategic', 'axis', 'Stretch goal: Mersa Matruh', 'Capture Mersa Matruh, the Eighth Army base.', { kind: 'capture_location', locationId: 'mersa_matruh' }, 250),
  ob('o.all.tobruk', 'primary', 'allies', 'Relieve Tobruk', 'Link up with the garrison and hold Tobruk (27 Nov, N02).', { kind: 'hold_location', locationId: 'tobruk', untilMinutes: END }, 250),
  ob('o.all.rezegh', 'primary', 'allies', 'Take Sidi Rezegh', 'Capture the Sidi Rezegh airfield and escarpment.', { kind: 'capture_location', locationId: 'sidi_rezegh' }, 150),
  ob('o.all.bardia', 'secondary', 'allies', 'Take Bardia', 'Capture the Bardia fortified port.', { kind: 'capture_location', locationId: 'bardia' }, 100),
  ob('o.all.gazala', 'secondary', 'allies', 'Take Gazala', 'Capture the Gazala position (reached by the Axis 8 Dec, N02).', { kind: 'capture_location', locationId: 'gazala' }, 120),
  ob('o.all.benghazi', 'strategic', 'allies', 'Retake Cyrenaica: Benghazi', 'Capture Benghazi.', { kind: 'capture_location', locationId: 'benghazi' }, 250),
];
const O = (s) => OBJ.filter((o) => o.side === s).map((o) => o.id);
const WEATHER = [{ month: 11, probs: { clear: 0.7, cloud: 0.15, sandstorm: 0.1, rain: 0.05 }, tempC: 20 }, { month: 12, probs: { clear: 0.6, cloud: 0.2, rain: 0.1, sandstorm: 0.1 }, tempC: 16 }];
const bb = [[19.0, 28.5], [30.5, 28.5], [30.5, 33.0], [19.0, 33.0]];
const CTRL = [
  { nation: 'ITA', polygon: bb },
  { nation: 'GBR', polygon: [[25.15, 28.5], [30.5, 28.5], [30.5, 33.0], [25.15, 33.0]] },
  { nation: 'GBR', polygon: [[23.8, 31.95], [24.1, 31.95], [24.1, 32.15], [23.8, 32.15]] },
];
const EVENTS = [
  { id: 'cru.ev.start', date: '1941-11-18T00:00:00Z', title: 'Operation Crusader opens', body: 'Eighth Army advances west from Mersa Matruh and crosses into Libya near Fort Maddalena. Storms the night before ground aircraft on both sides.', pos: [25.0, 31.2], src: ['N02'], effects: [{ op: 'weather', kind: 'storm', intensity: 0.6, durationMinutes: 720 }], effectsNote: 'Restates N02: storms on 17/18 Nov grounded aircraft on both sides; duration game-scale.', effectHints: [] },
  { id: 'cru.ev.gubi', date: '1941-11-19T00:00:00Z', title: 'Bir el Gubi and Sidi Rezegh', body: '22nd Armoured Brigade fights the Ariete Division at Bir el Gubi; 7th Armoured Brigade reaches Sidi Rezegh airfield.', pos: [23.95, 31.4], src: ['N02'], effectHints: [] },
  { id: 'cru.ev.tobruk_breakout', date: '1941-11-21T00:00:00Z', title: 'Tobruk breakout', body: 'The 70th Division breaks out towards Ed Duda while heavy fighting begins around Sidi Rezegh.', pos: [23.99, 32.0], src: ['N02'], effectHints: [] },
  { id: 'cru.ev.totensonntag', date: '1941-11-23T00:00:00Z', title: 'Totensonntag', body: '15th Panzer overruns the 5th South African Brigade near Sidi Rezegh; both sides lose heavily.', pos: [24.05, 31.93], src: ['N02'], effectHints: [] },
  { id: 'cru.ev.wire', date: '1941-11-24T00:00:00Z', title: "Rommel's dash to the wire", body: 'Rommel takes direct command of the Afrika Korps and Ariete and drives towards the Egyptian frontier to cut off the British.', pos: [25.0, 31.5], side: 'axis', src: ['N02'], effectHints: [] },
  { id: 'cru.ev.ritchie', date: '1941-11-26T00:00:00Z', title: 'Cunningham replaced by Ritchie', body: 'Lt-Gen Neil Ritchie takes over Eighth Army.', src: ['N02'], effectHints: [] },
  { id: 'cru.ev.relief', date: '1941-11-27T00:00:00Z', title: 'Tobruk relieved', body: 'The New Zealand Division links up with the Tobruk garrison near Ed Duda, but Rommel turns the Afrika Korps back towards Tobruk.', pos: [23.99, 32.0], src: ['N02', 'N05'], effectHints: [], effects: [{ op: 'port_relief', locationId: 'tobruk' }], effectsNote: 'Restates N02 (link-up with the garrison, 27 Nov) and N05 (Tobruk supplied by sea during the siege): the besieged port keeps its throughput share from the link-up. besiegedShare is the engine default (game-scale).' },
  { id: 'cru.ev.retreat', date: '1941-12-06T00:00:00Z', title: 'Rommel orders the retreat', body: 'Rommel orders a retreat west; Neumann-Silkow is mortally wounded. The Axis occupy the Gazala positions by 8 December.', pos: [23.2, 32.17], side: 'axis', src: ['N02'], effectHints: [] },
  { id: 'cru.ev.hold', date: '1941-12-08T00:00:00Z', title: 'Bardia, Sollum and Halfaya ordered to hold', body: 'Axis garrisons on the frontier are ordered to hold as long as possible.', pos: [25.10, 31.72], side: 'axis', src: ['N02'], effectHints: [] },
  { id: 'cru.ev.gazala', date: '1941-12-13T00:00:00Z', title: 'Fighting at the Gazala line', body: 'Eighth Army attacks the Gazala line; on 15/16 December Rommel orders it evacuated.', pos: [23.2, 32.17], src: ['N02'], effectHints: [] },
  { id: 'cru.ev.convoys', date: '1941-12-16T00:00:00Z', title: 'Italian warships carry fuel to Libya', body: 'Fuel is carried to Derna and Benghazi by Italian warships; the Luftwaffe is limited to about one sortie per day.', pos: [20.07, 32.12], side: 'axis', src: ['N02'], effectHints: [] },
  { id: 'cru.ev.ajedabia', date: '1941-12-25T00:00:00Z', title: 'Axis hold Ajedabia-El Haseia', body: 'The Axis hold a line between Ajedabia and El Haseia for about ten days after the retreat.', pos: [20.23, 30.76], side: 'axis', src: ['N02'], effectHints: [] },
];
const PORT_EXTRA = { tobruk: { throughputTonsPerDay: 1500 }, benghazi: { throughputTonsPerMonth: 15000 } }; // N05 sourced capacities; besiegedShare left at engine default (game-scale)
const locations = LOC.map(([id, name, kind, lon, lat, owner, orig, value]) => ({ id, name, kind, pos: [lon, lat], owner, originalOwner: orig, value, ...(['port', 'airfield'].includes(kind) ? { supplyCapacity: kind === 'port' ? 40 : 20 } : {}), ...(PORT_EXTRA[id] ?? {}) }));
const def = {
  schema: 1, id: 'crusader.short', campaignId: 'crusader', title: 'Operation Crusader (18 Nov 1941 - 1 Jan 1942)', scale: 'short', startDate: '1941-11-18T00:00:00Z', endDate: END_ISO,
  bbox: BBOX, estimatedPlayMinutes: [60, 150], mapSize: 'large', complexity: 4,
  briefing: { historical: "On 18 November 1941 the British Eighth Army launched Operation Crusader to relieve the besieged fortress of Tobruk and retake Cyrenaica from Panzergruppe Afrika (N02). Tank battles around Sidi Rezegh, Rommel's dash to the wire and a severe Axis fuel shortage ended with the Axis retreat to El Agheila by late December.",
    situation: 'The Allies must break the Axis ring around Tobruk and destroy the Afrika Korps; the Axis must hold the Tobruk siege, protect the frontier garrisons and their thin, fuel-starved supply line. Start positions are approximate sector anchors.' },
  playableNations: [{ nation: 'GBR', difficultyRating: 3, summary: 'Eighth Army: relieve Tobruk and drive the Axis out of Cyrenaica.', objectiveIds: O('allies') },
    { nation: 'GER', difficultyRating: 4, summary: 'Afrika Korps: win the armoured battle with scarce fuel and capture Tobruk.', objectiveIds: O('axis') },
    { nation: 'ITA', difficultyRating: 4, summary: 'Italian infantry and armour: hold the siege lines and the frontier.', objectiveIds: O('axis') }],
  nations: NATIONS, locations, units, reinforcements: [], objectives: OBJ, terrainFile: TERRAIN_FILE, infraFile: INFRA_FILE,
  supplySources: { GBR: ['alexandria', 'mersa_matruh', 'sidi_barrani', 'tobruk'], GER: ['benghazi', 'derna'], ITA: ['benghazi', 'derna'] },
  initialControl: CTRL, weatherProfile: WEATHER, eventTemplateIds: EVENTS.map((x) => x.id), specialSystems: [],
  victoryTiers: { axis: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 }, allies: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 } },
  sources: SOURCES.map(({ id, citation, url }) => ({ id, citation, ...(url ? { url } : {}) })),
};
const uncertain = [
  { item: 'DRAFT', note: 'Not registered in src/data/index.ts and not audited: terrain/infra files (terrain_northafrica.json/infra_northafrica.json are placeholder names) do not exist yet.' },
  { item: 'Unit start positions', note: 'Approximate anchors (G03). Only Ariete at Bir el Gubi (19 Nov) and the Tobruk garrison are source-anchored.' },
  { item: 'Axis air and Allied air', note: 'OMITTED: no sourced Axis air order of battle or Crusader-day airfields; RAF wing table (N04) is undated to Crusader.' },
  { item: 'Italian divisional commanders', note: 'Pavia, Bologna, Brescia, Trento and Trieste commanders not in N01; names omitted.' },
  { item: 'Bardia/Sollum/Halfaya garrisons', note: 'Not sourced (N05 gap); Savona at Sollum/Halfaya and 90th Light at Bardia are approximate placements only.' },
  { item: 'Reinforcements', note: 'None: no sourced arrival dates.' },
  { item: 'Oasis Force position', note: 'Placed at Jaghbub/Jarabub (24.52E 29.74N, Wikipedia coordinates API) because the sourced deception plan used a Jarabub axis (N02); the Oasis Force location itself is not stated in N01/N02, so approximate.' },
  { item: 'Port throughput caps', note: 'Tobruk 1,500 long tons/day and Benghazi about 15,000 long tons (read as per month) are from N05; besiegedShare is the engine default (game-scale). Tripoli is off-map.' },
  { item: 'Water', note: 'Not modelled (unsourced).' },
  { item: 'Tobruk start control', note: 'initialControl around Tobruk is a coarse rectangle, not the real perimeter (N05: about 48 km long).' },
  { item: 'Nation resources / strengths / morale', note: 'Game-scale (G01). Axis fuel pool at 40% scale for the sourced fuel shortage (N02).' },
];
const sidecar = { scenarioId: def.id, note: 'Per-fact source references.',
  units: Object.fromEntries(units.map((x, i) => [x.id, { sources: [...new Set([...U[i].srcs, 'G01', 'G03'])], positionApproximate: true }])),
  locations: Object.fromEntries(LOC.map((l) => [l[0], { sources: [...new Set([...l[8], 'G02'])] }])),
  reinforcements: {}, nations: Object.fromEntries(NATIONS.map((n) => [n.id, { sources: ['G01'], gameScale: true }])),
  objectives: Object.fromEntries(OBJ.map((o) => [o.id, { sources: ['N02', 'G01'] }])), uncertain };
writeFileSync(join(OUT, 'crusader.short.json'), JSON.stringify(def, null, 1) + '\n');
writeFileSync(join(OUT, 'crusader.short.sources.json'), JSON.stringify(sidecar, null, 1) + '\n');
writeFileSync(join(OUT, 'crusader.events.json'), JSON.stringify({ campaignId: 'crusader', note: 'Historical event template data. Sources resolve against scenario sources[].', events: EVENTS.map((x) => ({ ...x, kind: 'historical', minutesFromStd: mins(x.date) })) }, null, 1) + '\n');
for (const x of [...units, ...locations]) if (!inBox(x.pos)) console.error('OUT OF BBOX', x.id);
console.log('draft units', units.length, 'locations', locations.length);
