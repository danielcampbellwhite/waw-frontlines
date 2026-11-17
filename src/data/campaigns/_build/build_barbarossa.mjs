// Generator for Barbarossa Short (22 Jun - 30 Sep 1941).
// Run: node src/data/campaigns/_build/build_barbarossa.mjs
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './barbarossa_sources.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..');
mkdirSync(OUT, { recursive: true });
const COORD = JSON.parse(readFileSync(join(HERE, 'barbarossa_coords.json'), 'utf8')); // R17 Wikipedia coordinates API results
const EPOCH = Date.parse('1941-06-22T00:00:00Z');
const END_ISO = '1941-09-30T00:00:00Z';
const mins = (iso) => Math.round((Date.parse(iso) - EPOCH) / 60000);
const TICKS = mins(END_ISO) / 60;
const BBOX = { west: 18, south: 46, east: 42, north: 60.5 };
const inBox = ([lon, lat]) => lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;
const C = (name) => { const c = COORD[name]; if (!c) throw new Error('no coordinate for ' + name); return c; };

// [id, name, kind, coordKey, owner, value, extra]. Coordinates: Wikipedia coordinates API (R17), nudged to land if the audit asks.
const HUB = { rampHours: 240 }; // capture-activated Axis forward hub: game-scale stand-in for rail-gauge conversion (G06)
const LOC = [
  ['brest', 'Brest and Brest Fortress', 'fortress', 'Brest, Belarus', 'SOV', 8, { ...HUB, supplyCapacity: 30 }, ['R17', 'R10']],
  ['minsk', 'Minsk', 'city', 'Minsk', 'SOV', 10, HUB, ['R17', 'R04']],
  ['smolensk', 'Smolensk', 'city', 'Smolensk', 'SOV', 10, HUB, ['R17', 'R05']],
  ['kiev', 'Kiev', 'city', 'Kyiv', 'SOV', 10, HUB, ['R17', 'R07']],
  ['riga', 'Riga', 'city', 'Riga', 'SOV', 8, HUB, ['R17', 'R08']],
  ['vilnius', 'Vilnius', 'city', 'Vilnius', 'SOV', 6, HUB, ['R17', 'R01']],
  ['kaunas', 'Kaunas', 'city', 'Kaunas', 'SOV', 6, HUB, ['R17', 'R08']],
  ['grodno', 'Grodno', 'town', 'Grodno', 'SOV', 4, null, ['R17', 'R01']],
  ['bialystok', 'Bialystok', 'city', 'Białystok', 'SOV', 5, null, ['R17', 'R04']],
  ['lvov', 'Lvov', 'city', 'Lviv', 'SOV', 8, HUB, ['R17', 'R11']],
  ['rovno', 'Rovno', 'town', 'Rivne', 'SOV', 4, null, ['R17', 'R11']],
  ['dubno', 'Dubno', 'town', 'Dubno', 'SOV', 3, null, ['R17', 'R11']],
  ['lutsk', 'Lutsk', 'town', 'Lutsk', 'SOV', 3, null, ['R17', 'R11']],
  ['kovel', 'Kovel', 'town', 'Kovel', 'SOV', 3, null, ['R17', 'R14']],
  ['zhitomir', 'Zhitomir', 'town', 'Zhytomyr', 'SOV', 4, null, ['R17', 'R07']],
  ['berdichev', 'Berdichev', 'town', 'Berdychiv', 'SOV', 3, null, ['R17', 'R06']],
  ['uman', 'Uman', 'town', 'Uman', 'SOV', 4, null, ['R17', 'R06']],
  ['belaya_tserkov', 'Belaya Tserkov', 'town', 'Bila Tserkva', 'SOV', 3, null, ['R17', 'R06']],
  ['vitebsk', 'Vitebsk', 'city', 'Vitebsk', 'SOV', 5, null, ['R17', 'R05']],
  ['mogilev', 'Mogilev', 'city', 'Mahilyow', 'SOV', 5, null, ['R17', 'R05']],
  ['borisov', 'Borisov', 'town', 'Barysaw', 'SOV', 3, null, ['R17', 'R01']],
  ['bobruisk', 'Bobruisk', 'town', 'Bobruisk', 'SOV', 4, null, ['R17', 'R01']],
  ['orsha', 'Orsha', 'town', 'Orsha', 'SOV', 4, null, ['R17', 'R05']],
  ['gomel', 'Gomel', 'city', 'Gomel', 'SOV', 5, null, ['R17', 'R05']],
  ['polotsk', 'Polotsk', 'town', 'Polotsk', 'SOV', 3, null, ['R17', 'R05']],
  ['daugavpils', 'Daugavpils', 'town', 'Daugavpils', 'SOV', 4, null, ['R17', 'R03']],
  ['siauliai', 'Siauliai', 'town', 'Šiauliai', 'SOV', 3, null, ['R17', 'R08']],
  ['raseiniai', 'Raseiniai', 'town', 'Raseiniai', 'SOV', 2, null, ['R17', 'R16']],
  ['pskov', 'Pskov', 'city', 'Pskov', 'SOV', 5, HUB, ['R17', 'R09']],
  ['novgorod', 'Novgorod', 'city', 'Veliky Novgorod', 'SOV', 5, null, ['R17', 'R09']],
  ['luga', 'Luga', 'town', 'Luga, Leningrad Oblast', 'SOV', 3, null, ['R17', 'R09']],
  ['narva', 'Narva', 'town', 'Narva', 'SOV', 3, null, ['R17', 'R09']],
  ['kingisepp', 'Kingisepp', 'town', 'Kingisepp', 'SOV', 3, null, ['R17', 'R09']],
  ['tallinn', 'Tallinn', 'city', 'Tallinn', 'SOV', 5, null, ['R17', 'R08']],
  ['shlisselburg', 'Shlisselburg', 'town', 'Shlisselburg', 'SOV', 3, null, ['R17', 'R09']],
  ['leningrad', 'Leningrad', 'city', 'Saint Petersburg', 'SOV', 10, { supplyCapacity: 60 }, ['R17', 'R09']],
  ['velikiye_luki', 'Velikiye Luki', 'town', 'Velikiye Luki', 'SOV', 3, null, ['R17', 'R05']],
  ['chernigov', 'Chernigov', 'town', 'Chernihiv', 'SOV', 4, null, ['R17', 'R07']],
  ['moscow', 'Moscow', 'city', 'Moscow', 'SOV', 10, { supplyCapacity: 80 }, ['R17', 'R01']],
  ['kharkov', 'Kharkov', 'city', 'Kharkiv', 'SOV', 8, null, ['R17', 'R01']],
  ['warsaw', 'Warsaw', 'city', 'Warsaw', 'GER', 8, null, ['R17', 'G04']],
  ['lublin', 'Lublin', 'city', 'Lublin', 'GER', 5, null, ['R17', 'G04']],
  ['zamosc', 'Zamosc', 'town', 'Zamość', 'GER', 3, null, ['R17', 'G04']],
  ['koenigsberg', 'Koenigsberg', 'city', 'Kaliningrad', 'GER', 8, null, ['R17', 'G04']],
  ['tilsit', 'Tilsit', 'town', 'Sovetsk, Kaliningrad Oblast', 'GER', 3, null, ['R17', 'G04']],
];
const locations = LOC.map(([id, name, kind, key, owner, value, extra]) => ({ id, name, kind, pos: C(key), owner, originalOwner: owner, value,
  supplyCapacity: kind === 'city' ? 40 : kind === 'fortress' ? 30 : 20, ...(extra ?? {}) }));
const srcOfLoc = Object.fromEntries(LOC.map((l) => [l[0], l[7]]));

// Anchors (G03) [lon, lat]
const A = {
  // German start areas
  E_PRUS_N: [21.55, 55.3], E_PRUS_C: [22.55, 54.55], SUWALKI: [22.85, 54.1], NAREW_N: [22.4, 53.6], BUG_N: [22.7, 52.55], TERESPOL: [23.2, 52.1], BREST_W: [23.35, 52.1],
  LUBLIN_E: [23.15, 51.25], HRUB: [23.1, 50.65], SAN: [22.45, 50.15], ROMANIA: [27.2, 47.3],
  AGN_HQ: [21.6, 54.3], AGC_HQ: [22.2, 52.7], AGS_HQ: [22.3, 51.15],
  // Soviet start areas
  SIAULIAI: [23.3, 55.9], RASEINIAI: [23.2, 55.45], KAUNAS: [24.0, 54.85], GRODNO: [23.8, 53.7], BIALYSTOK: [23.3, 53.15], KOBRYN: [24.4, 52.25], MINSK_HQ: [27.5, 53.85],
  KOVEL: [24.7, 51.2], LVOV: [24.0, 49.85], STRYI: [24.0, 49.3], STANISLAV: [24.9, 48.75], BRODY: [25.0, 50.1], RIVNE_W: [25.8, 50.5], KIEV_HQ: [30.45, 50.4], RIGA_HQ: [24.1, 56.9],
  LENINGRAD: [30.3, 59.85], BREST_FORT: [23.66, 52.13],
  // Soviet arrivals
  VLUKI: [30.5, 56.25], LEPEL: [28.7, 54.85], GOMEL_A: [30.9, 52.45], VITEBSK_A: [30.2, 55.15], SMOLENSK_A: [32.0, 54.75],
};
const U = [];
const add = (id, name, sh, nation, type, anc, srcs, o = {}) => U.push({ id, name, sh, nation, type, anc, srcs, o });
const G = (id, name, sh, type, anc, srcs, o = {}) => add(id, name, sh, 'GER', type, anc, srcs, o);
const S = (id, name, sh, type, anc, srcs, o = {}) => add(id, name, sh, 'SOV', type, anc, srcs, { exp: 30, morale: 58, ent: 10, ...o });

// --- Axis start (22 Jun, positions G03 approximate; strengths game-scale G01)
G('ger.agn.hq', 'Army Group North HQ (Leeb)', 'HG Nord', 'hq', 'AGN_HQ', ['R02', 'R03']);
G('ger.agc.hq', 'Army Group Centre HQ (Bock)', 'HG Mitte', 'hq', 'AGC_HQ', ['R02', 'R03', 'R04']);
G('ger.ags.hq', 'Army Group South HQ (Rundstedt)', 'HG Sued', 'hq', 'AGS_HQ', ['R02', 'R03']);
// Infantry armies are split into a forward and a follow-on element (game-scale split, G01); panzer groups into their sourced spearhead divisions plus a remainder element.
const half = (id, name, sh, anc, srcs) => { G(id + 'f', name + ' (forward corps)', sh + ' fwd', 'infantry', anc, srcs, { mp: 18000 }); G(id + 'b', name + ' (follow-on corps)', sh + ' fol', 'infantry', anc, srcs, { mp: 12000 }); };
half('ger.18a', '18th Army', '18.A', 'E_PRUS_N', ['R03', 'R08']);
half('ger.16a', '16th Army', '16.A', 'SUWALKI', ['R03', 'R08']);
half('ger.9a', '9th Army', '9.A', 'NAREW_N', ['R03', 'R04']);
half('ger.4a', '4th Army', '4.A', 'BUG_N', ['R03', 'R04']);
half('ger.6a', '6th Army', '6.A', 'LUBLIN_E', ['R03', 'R06']);
half('ger.17a', '17th Army', '17.A', 'SAN', ['R03', 'R06']);
G('ger.45id', '45th Infantry Division', '45.ID', 'infantry', 'BREST_W', ['R10'], { mp: 17000, exact: true });
// 4th Panzer Group (Hoepner): only the 20th Motorised Division is named (R09); two further elements are game-scale remainders
G('ger.4pg.20mot', '20th Motorised Division (4th Panzer Group)', '20.Mot', 'armoured', 'E_PRUS_C', ['R03', 'R09'], { mp: 12000, tanks: 160 });
G('ger.4pg.a', '4th Panzer Group - panzer corps A (corps not retrieved)', '4.PzGr A', 'armoured', 'E_PRUS_C', ['R03', 'R08', 'R16'], { mp: 12000, tanks: 200 });
G('ger.4pg.b', '4th Panzer Group - panzer corps B (corps not retrieved)', '4.PzGr B', 'armoured', 'E_PRUS_C', ['R03', 'R08', 'R16'], { mp: 12000, tanks: 200 });
// 3rd Panzer Group (Hoth): 7th and 20th Panzer Divisions named in R05
G('ger.3pg.7pz', '7th Panzer Division (3rd Panzer Group)', '7.PzD', 'armoured', 'NAREW_N', ['R04', 'R05', 'R12'], { mp: 12000, tanks: 200 });
G('ger.3pg.20pz', '20th Panzer Division (3rd Panzer Group)', '20.PzD', 'armoured', 'NAREW_N', ['R04', 'R05', 'R12'], { mp: 12000, tanks: 200 });
G('ger.3pg.r', '3rd Panzer Group - remaining formations (corps not retrieved)', '3.PzGr rem', 'armoured', 'NAREW_N', ['R03', 'R04', 'R12'], { mp: 12000, tanks: 160 });
// 2nd Panzer Group (Guderian): 29th Motorised, 17th and 10th Panzer Divisions named in R05
G('ger.2pg.29mot', '29th Motorised Division (2nd Panzer Group)', '29.Mot', 'armoured', 'TERESPOL', ['R04', 'R05', 'R12'], { mp: 12000, tanks: 120 });
G('ger.2pg.17pz', '17th Panzer Division (2nd Panzer Group)', '17.PzD', 'armoured', 'TERESPOL', ['R04', 'R05', 'R12'], { mp: 12000, tanks: 200 });
G('ger.2pg.10pz', '10th Panzer Division (2nd Panzer Group)', '10.PzD', 'armoured', 'TERESPOL', ['R04', 'R05', 'R12'], { mp: 12000, tanks: 200 });
G('ger.2pg.r', '2nd Panzer Group - remaining formations (XXIV Panzer Corps and others)', '2.PzGr rem', 'armoured', 'TERESPOL', ['R03', 'R04', 'R12'], { mp: 12000, tanks: 160 });
// 1st Panzer Group (Kleist): III, XIV and XLVIII Corps, 5 panzer + 4 motorised divisions, 799 tanks (R12); 9th, 11th, 16th Panzer named in R06
G('ger.1pg.9pz', '9th Panzer Division (1st Panzer Group)', '9.PzD', 'armoured', 'HRUB', ['R06', 'R12'], { mp: 12000, tanks: 200 });
G('ger.1pg.11pz', '11th Panzer Division (1st Panzer Group)', '11.PzD', 'armoured', 'HRUB', ['R06', 'R12'], { mp: 12000, tanks: 200 });
G('ger.1pg.16pz', '16th Panzer Division (1st Panzer Group)', '16.PzD', 'armoured', 'HRUB', ['R06', 'R12'], { mp: 12000, tanks: 200 });
G('ger.1pg.r', '1st Panzer Group - remaining formations (III, XIV, XLVIII Corps)', '1.PzGr rem', 'armoured', 'HRUB', ['R06', 'R11', 'R12'], { mp: 12000, tanks: 199 });

// --- Soviet start (22 Jun). Surprise: low readiness/organisation (G01).
S('sov.nwf.hq', 'Northwestern Front HQ (Kuznetsov)', 'NWF HQ', 'hq', 'RIGA_HQ', ['R02', 'R08']);
S('sov.8a', '8th Army (Sobennikov)', '8th A', 'infantry', 'SIAULIAI', ['R08'], { mp: 25000 });
S('sov.11a', '11th Army (Morozov)', '11th A', 'infantry', 'KAUNAS', ['R08'], { mp: 25000 });
S('sov.3mc', '3rd Mechanised Corps', '3 MC', 'armoured', 'RASEINIAI', ['R16'], { mp: 12000, tanks: 400 });
S('sov.12mc', '12th Mechanised Corps', '12 MC', 'armoured', 'SIAULIAI', ['R16'], { mp: 12000, tanks: 400 });
S('sov.wf.hq', 'Western Front HQ (Pavlov)', 'WF HQ', 'hq', 'MINSK_HQ', ['R02', 'R04', 'R13']);
S('sov.3a', '3rd Army', '3rd A', 'infantry', 'GRODNO', ['R04', 'R13'], { mp: 25000 });
S('sov.10a', '10th Army', '10th A', 'infantry', 'BIALYSTOK', ['R04', 'R13'], { mp: 25000 });
S('sov.4a', '4th Army', '4th A', 'infantry', 'KOBRYN', ['R04', 'R13'], { mp: 25000 });
S('sov.13a', '13th Army (HQ only)', '13th A', 'hq', 'MINSK_HQ', ['R04'], { mp: 600 });
S('sov.6mc', '6th Mechanised Corps', '6 MC', 'armoured', 'BIALYSTOK', ['R01'], { mp: 12000, tanks: 400 });
S('sov.11mc', '11th Mechanised Corps', '11 MC', 'armoured', 'GRODNO', ['R01'], { mp: 12000, tanks: 400 });
S('sov.6cav', '6th Cavalry Corps', '6 Cav C', 'recon', 'GRODNO', ['R01'], { mp: 8000 });
S('sov.brestgar', 'Brest Fortress garrison (6th and 42nd Rifle Division elements, NKVD)', 'Brest Gar', 'infantry', 'BREST_FORT', ['R10'], { mp: 9000, exact: true, ent: 60, morale: 65 });
S('sov.swf.hq', 'Southwestern Front HQ (Kirponos)', 'SWF HQ', 'hq', 'KIEV_HQ', ['R02', 'R14']);
S('sov.5a', '5th Army', '5th A', 'infantry', 'KOVEL', ['R14'], { mp: 25000 });
S('sov.6a', '6th Army', '6th A', 'infantry', 'LVOV', ['R06', 'R14'], { mp: 25000 });
S('sov.26a', '26th Army', '26th A', 'infantry', 'STRYI', ['R14'], { mp: 25000 });
S('sov.12a', '12th Army', '12th A', 'infantry', 'STANISLAV', ['R06', 'R14'], { mp: 25000 });
S('sov.22mc', '22nd Mechanised Corps', '22 MC', 'armoured', 'RIVNE_W', ['R01', 'R06'], { mp: 12000, tanks: 400 });
S('sov.15mc', '15th Mechanised Corps', '15 MC', 'armoured', 'BRODY', ['R01', 'R11'], { mp: 12000, tanks: 400 });
S('sov.nf', 'Northern Front forces (Popov) - placeholder, composition not retrieved', 'North Fr', 'infantry', 'LENINGRAD', ['R02'], { mp: 20000, ent: 25 });

// --- Reinforcements: [id, iso, anchor, name, type, nation, shortName, srcs, opts]
const REI = [
  ['ger.11a', '1941-07-02T00:00:00Z', 'ROMANIA', '11th Army (with Romanian forces)', 'infantry', 'GER', '11.A', ['R01', 'R03'], { mp: 25000 }],
  ['sov.22a', '1941-06-28T12:00:00Z', 'VLUKI', '22nd Army (Stavka reserve)', 'infantry', 'SOV', '22nd A', ['R05'], { mp: 25000 }],
  ['sov.20a', '1941-06-28T12:00:00Z', 'LEPEL', '20th Army (Stavka reserve)', 'infantry', 'SOV', '20th A', ['R05'], { mp: 25000 }],
  ['sov.5mc', '1941-06-28T12:00:00Z', 'LEPEL', '5th Mechanised Corps (20th Army)', 'armoured', 'SOV', '5 MC', ['R01', 'R05'], { mp: 12000, tanks: 500 }],
  ['sov.7mc', '1941-06-28T12:00:00Z', 'LEPEL', '7th Mechanised Corps (20th Army)', 'armoured', 'SOV', '7 MC', ['R01', 'R05'], { mp: 12000, tanks: 500 }],
  ['sov.21a', '1941-06-28T12:00:00Z', 'GOMEL_A', '21st Army (Stavka reserve)', 'infantry', 'SOV', '21st A', ['R05'], { mp: 25000 }],
  ['sov.19a', '1941-07-05T12:00:00Z', 'VITEBSK_A', '19th Army (forming at Vitebsk)', 'infantry', 'SOV', '19th A', ['R05'], { mp: 25000 }],
  ['sov.16a', '1941-07-08T12:00:00Z', 'SMOLENSK_A', '16th Army (arriving at Smolensk)', 'infantry', 'SOV', '16th A', ['R05', 'R14'], { mp: 25000 }],
];

const T = {
  hq: { mp: 600, eq: { rifle: 600 } },
  infantry: { mp: 25000, eq: { rifle: 250, gun_arty: 120, gun_at: 60 } },
  armoured: { mp: 15000, eq: { tank_medium: 400, gun_arty: 40, truck: 100 } },
  recon: { mp: 8000, eq: { rifle: 80, armoured_car: 60 } },
};
const NAT = { GER: ['axis', 60, 76], SOV: ['allies', 30, 62] };
const spread = (a, k) => [Math.round((a[0] + ((k % 4) - 1.5) * 0.06) * 1000) / 1000, Math.round((a[1] + (Math.floor(k / 4) % 3 - 1) * 0.04) * 1000) / 1000];
const cnt = {};
const mk = (r, pos) => {
  const t = T[r.type], [side, exp, morale] = NAT[r.nation], max = r.o.mp ?? t.mp, held = { ...t.eq };
  if (r.o.tanks && held.tank_medium) held.tank_medium = r.o.tanks;
  const sov = r.nation === 'SOV';
  return { id: r.id, name: r.name, shortName: r.sh, nation: r.nation, side, type: r.type, domain: 'land',
    pos, manpower: max, manpowerMax: max, equipment: { held, authorised: { ...held } }, organisation: sov && r.start ? 40 : 90, morale: r.o.morale ?? morale, experience: r.o.exp ?? exp,
    fuel: sov && r.start ? 60 : 100, ammo: sov && r.start ? 60 : 100, supply: sov && r.start ? 70 : 100, fatigue: 5, readiness: sov && r.start ? 30 : 90, entrenchment: r.o.ent ?? (sov ? 10 : 0), moveStatus: 'stationary', combatStatus: 'idle',
    posture: r.nation === 'GER' ? 'hold' : 'defend', orders: [], kills: 0 };
};
const units = U.map((r) => { const k = (cnt[r.anc] = (cnt[r.anc] ?? -1) + 1); return mk({ ...r, start: true }, r.o.exact ? [...A[r.anc]] : spread(A[r.anc], k)); });
const rcnt = {};
const reinforcements = REI.map(([id, iso, anc, name, type, nation, sh, , o]) => {
  const k = (rcnt[anc] = (rcnt[anc] ?? -1) + 1);
  const pos = spread(A[anc], k);
  const u = mk({ id, name, sh, nation, type, o }, pos);
  u.organisation = 80; u.fatigue = 10; u.entrenchment = 0;
  return { id: `reinf.${id}`, atMinutes: mins(iso), pos, unit: u };
});
const reinSrc = Object.fromEntries(REI.map((r) => [`reinf.${r[0]}`, { sources: [...r[7], 'G03'], approximate: true }]));

const NATIONS = (() => {
  const all = [...units, ...reinforcements.map((r) => r.unit)];
  const mpOf = (n) => all.filter((x) => x.nation === n).reduce((a, x) => a + x.manpowerMax, 0), c = (n) => all.filter((x) => x.nation === n).length;
  const pool = (n, fs = 1) => ({ resources: { manpower: Math.max(2000, Math.round(mpOf(n) * 0.15)), fuel: Math.max(1500, Math.round(c(n) * 40 * fs)), ammo: Math.max(1500, c(n) * 50), equipment: Math.max(1500, c(n) * 100), supplyPoints: 600 },
    income: { manpower: Math.max(2, Math.ceil(mpOf(n) * 0.3 / TICKS)), fuel: Math.max(1, Math.ceil(c(n) * 0.15 * fs)), ammo: Math.max(2, Math.ceil(c(n) * 0.2)), equipment: Math.max(2, Math.ceil(c(n) * 0.4)), supplyPoints: 5 } });
  return [['GER', 'axis', 'Germany (with allies, G04)', true, 3], ['SOV', 'allies', 'Soviet Union', true, 1]].map(([id, side, name, playable, fs]) => ({ id, side, name, playable, ...pool(id, fs), reinforcements: [] }));
})();
const END = mins(END_ISO);
const ob = (id, tier, side, title, description, condition, points) => ({ id, tier, side, title, description, condition, points, status: 'pending' });
const cap = (id, tier, title, desc, locationId, points) => ob(`o.ger.${id}`, tier, 'axis', title, desc, { kind: 'capture_location', locationId }, points);
const hold = (id, tier, title, desc, locationId, points) => ob(`o.sov.${id}`, tier, 'allies', title, desc, { kind: 'hold_location', locationId, untilMinutes: END }, points);
const OBJ = [
  cap('brest', 'secondary', 'Take Brest Fortress', 'The 45th Infantry Division was to take the fortress on the first day; it took about a week (R10).', 'brest', 80),
  cap('minsk', 'primary', 'Take Minsk', 'Minsk fell on 28 June (R04).', 'minsk', 250),
  cap('smolensk', 'primary', 'Take Smolensk', 'Smolensk is the road to Moscow; the battle ran 10 July to 10 September (R05).', 'smolensk', 250),
  cap('kiev', 'primary', 'Take Kiev', 'Kiev was captured on 19 September (R01).', 'kiev', 250),
  cap('riga', 'secondary', 'Take Riga', 'Army Group North objective in the Baltic states (R03).', 'riga', 100),
  cap('pskov', 'secondary', 'Take Pskov', 'Pskov was reached by 4th Panzer Group (8 July in R01, 10 July in R09).', 'pskov', 100),
  cap('novgorod', 'secondary', 'Take Novgorod', 'Novgorod was reached by 16 August (R09).', 'novgorod', 100),
  cap('leningrad', 'strategic', 'Take Leningrad', 'Army Group North strategic goal; Leningrad was cut off by land on 7-8 September but not taken (R03, R09).', 'leningrad', 300),
  cap('shlisselburg', 'secondary', 'Cut Leningrad by land at Shlisselburg', 'Shlisselburg was seized on 7 September (R09).', 'shlisselburg', 100),
  cap('vitebsk', 'secondary', 'Take Vitebsk', 'Vitebsk and Polotsk fell during the Smolensk operations (R05).', 'vitebsk', 80),
  cap('mogilev', 'secondary', 'Take Mogilev', 'Guderian passed Mogilev by 13 July (R05).', 'mogilev', 80),
  cap('zhitomir', 'secondary', 'Take Zhitomir', 'On the Army Group South axis to Kiev (R06, R07).', 'zhitomir', 60),
  cap('uman', 'secondary', 'Take Uman', 'The Uman pocket was destroyed by 8 August (R06).', 'uman', 60),
  hold('minsk', 'primary', 'Hold Minsk', 'Keep Minsk out of German hands (it fell on 28 June, R04).', 'minsk', 250),
  hold('smolensk', 'primary', 'Hold Smolensk', 'Keep Smolensk (battle 10 July-10 September, R05).', 'smolensk', 250),
  hold('kiev', 'primary', 'Hold Kiev', 'Keep Kiev (fell 19 September, R01).', 'kiev', 250),
  hold('leningrad', 'primary', 'Hold Leningrad', 'Leningrad was not taken (R09).', 'leningrad', 300),
  hold('moscow', 'strategic', 'Hold Moscow', 'Keep the capital (Typhoon begins 30 September, R01).', 'moscow', 300),
  hold('brest', 'secondary', 'Hold Brest Fortress', 'The garrison held for about a week (R10).', 'brest', 80),
  hold('riga', 'secondary', 'Hold Riga', 'Delay Army Group North in the Baltic states (R08).', 'riga', 100),
  hold('pskov', 'secondary', 'Hold Pskov', 'Keep the Luga/Pskov approaches (R09).', 'pskov', 100),
  hold('novgorod', 'secondary', 'Hold Novgorod', 'Keep Novgorod on the Leningrad approach (R09).', 'novgorod', 100),
  hold('vitebsk', 'secondary', 'Hold Vitebsk', 'Keep the Dvina line (R05).', 'vitebsk', 80),
  hold('uman', 'secondary', 'Hold Uman', 'Keep the 6th and 12th Armies out of the Uman pocket (R06).', 'uman', 60),
];
const O = (s) => OBJ.filter((o) => o.side === s).map((o) => o.id);
const WEATHER = [
  { month: 6, probs: { clear: 0.45, cloud: 0.3, rain: 0.2, fog: 0.05 }, tempC: 18 },
  { month: 7, probs: { clear: 0.4, cloud: 0.3, rain: 0.25, fog: 0.05 }, tempC: 20 },
  { month: 8, probs: { clear: 0.4, cloud: 0.3, rain: 0.25, fog: 0.05 }, tempC: 19 },
  { month: 9, probs: { clear: 0.3, cloud: 0.3, rain: 0.3, fog: 0.1 }, tempC: 13 },
];
const GER_POLY = [[18, 46], [28.4, 46], [27.9, 47.0], [27.0, 47.9], [26.6, 48.25], [24.6, 48.2], [23.0, 48.6], [22.55, 49.1], [22.77, 49.8], [23.55, 50.4], [23.7, 51.0], [23.6, 52.1], [22.8, 52.7], [22.3, 53.3], [22.8, 53.9], [22.8, 54.45], [22.8, 55.05], [21.4, 55.6], [21.0, 55.8], [18, 55.8]];
const CTRL = [{ nation: 'SOV', polygon: [[18, 46], [42, 46], [42, 60.5], [18, 60.5]] }, { nation: 'GER', polygon: GER_POLY }];
const EV = (id, iso, title, body, src, pos, extra = {}) => ({ id: `bb.ev.${id}`, date: iso, title, body, ...(pos ? { pos } : {}), src, effectHints: [], ...extra });
const EVENTS = [
  EV('invasion', '1941-06-22T00:00:00Z', 'The invasion begins', 'On Sunday 22 June 1941 more than 3.8 million Axis troops attack along a 2,900 km front after a massive ground and air assault; Soviet forces are largely caught unprepared (R01). Exact hour of the first attacks is not retrieved.', ['R01'], [23.3, 52.4]),
  EV('airfields', '1941-06-22T01:00:00Z', 'The Western Front air force is destroyed on the ground', 'In the opening hours the Luftwaffe destroys the Western Front air force on the ground and, with Abwehr-supported fifth columns, paralyses its communications; the 4th Army headquarters is cut off (R01, R04).', ['R01', 'R04'], [23.5, 52.8], { side: 'axis' }),
  EV('brest', '1941-06-22T04:00:00Z', 'Brest Fortress', 'The 45th Infantry Division attacks the fortress after a 29-minute bombardment; about 9,000 defenders hold out; by 24 June 4,000-5,000 Soviet soldiers are captured and fighting continues to about 30 June (R10).', ['R10'], [23.66, 52.13]),
  EV('brody', '1941-06-23T00:00:00Z', 'Tank battle at Brody-Dubno-Lutsk', 'From 23 to 30 June the 1st Panzer Group fights five Soviet mechanised corps in the Dubno-Lutsk-Brody triangle (R11).', ['R11'], [25.2, 50.3]),
  EV('raseiniai', '1941-06-23T12:00:00Z', 'Battle of Raseiniai', 'The 4th Panzer Group fights the Soviet 3rd and 12th Mechanised Corps near Raseiniai from 23 to 27 June, destroying most of the Northwestern Front armour (R16).', ['R16'], [23.12, 55.37]),
  EV('grodno', '1941-06-24T00:00:00Z', 'Counterstrike toward Grodno', 'On 24-25 June the 6th and 11th Mechanised Corps and the 6th Cavalry Corps counter-attack toward Grodno on Pavlov order and fail (R01).', ['R01'], [23.83, 53.67], { side: 'allies' }),
  EV('minsk_link', '1941-06-27T00:00:00Z', 'Panzer groups meet east of Minsk', 'The 2nd and 3rd Panzer Groups meet near Minsk on 27 June and take the city the next day, closing two pockets around Bialystok and west of Minsk (R04).', ['R04'], [27.56, 53.9], { side: 'axis' }),
  EV('minsk', '1941-06-28T00:00:00Z', 'Minsk falls', 'Minsk is captured on 28 June (R04).', ['R04'], [27.56, 53.9], { side: 'axis' }),
  EV('luga', '1941-06-29T00:00:00Z', 'Luga defence line begun', 'Construction of the Luga defence fortifications begins on 29 June together with the evacuation of children and women (R09).', ['R09'], [29.85, 58.74], { side: 'allies' }),
  EV('pavlov', '1941-06-30T00:00:00Z', 'Pavlov relieved', 'Stalin relieves Pavlov on 30 June; he is tried and executed on 22 July; the Western Front is destroyed in about 18 days (R01, R04).', ['R01', 'R04'], null, { side: 'allies' }),
  EV('rain', '1941-07-02T00:00:00Z', 'Early July rainstorms slow the panzers', 'On 2 July and through the next six days a rainstorm typical of Belarusian summers slows Army Group Centre panzers while Soviet defences stiffen (R01). Army Group North attacks the Stalin Line on 2 July with the 4th Panzer Group, and Army Group South is joined by the 11th Army and Romanian forces (R01).', ['R01'], [28.5, 54.0],
    { effects: [{ op: 'weather', kind: 'rain', intensity: 0.8, hours: 144 }], effectsNote: 'Restates R01: a rainstorm from 2 July for six days (hours 144) slows the Army Group Centre panzers.' }),
  EV('lepiel', '1941-07-06T00:00:00Z', 'Soviet mechanised counter-attack near Lepiel', 'On 6 July the Soviet 5th and 7th Mechanised Corps (20th Army) counter-attack the German 7th Panzer Division and are virtually wiped out (R05); R01 gives the force as the V and VII Mechanised Corps in a five-day battle with 832 of about 2,000 tanks lost, a discrepancy kept open.', ['R01', 'R05'], [28.7, 54.85], { side: 'allies' }),
  EV('pskov8', '1941-07-08T00:00:00Z', 'Pskov reached (8 July per R01)', 'R01 gives 8 July for the capture of Pskov by the 4th Panzer Group; R09 gives 10 July for the capture of Ostrov and Pskov. Both dates are kept; this event uses the earlier one.', ['R01', 'R09'], [28.33, 57.82], { side: 'axis' }),
  EV('smolensk', '1941-07-10T00:00:00Z', 'Smolensk battle begins', 'On 10 July the 2nd Panzer Group crosses the Dnieper; by 13 July it passes Mogilev and the 29th Motorised Division is within 18 km of Smolensk (R05).', ['R05'], [32.04, 54.78]),
  EV('uman', '1941-07-15T00:00:00Z', 'Battle of Uman begins', 'From 15 July Army Group South moves to encircle the Soviet 6th and 12th Armies near Uman (R06).', ['R06'], [30.22, 48.75]),
  EV('logistics', '1941-07-20T00:00:00Z', 'German logistics strain', 'Four weeks into the campaign Bock concludes that difficulties are due to logistics; operations are slowed for resupply; by 2 August all three army groups have 179,500 casualties and 47,000 replacements (R01). The date within July is approximate.', ['R01'], null, { side: 'axis' }),
  EV('smolensk_pocket', '1941-08-05T00:00:00Z', 'Smolensk encirclement ends', 'The encirclement battle near Smolensk ends on 5 August; Bock reports 309,000 prisoners (R05).', ['R05'], [32.04, 54.78]),
  EV('uman_pocket', '1941-08-08T00:00:00Z', 'Uman pocket destroyed', 'The Soviet 6th and 12th Armies are annihilated by 8 August (R06).', ['R06'], [30.22, 48.75], { side: 'axis' }),
  EV('novgorod', '1941-08-16T00:00:00Z', 'Novgorod reached', 'The 4th Panzer Group reaches Novgorod by 16 August and Leeb takes Kingisepp and Narva on 17 August (R09); by the end of August it is within 48 km of Leningrad (R01).', ['R01', 'R09'], [31.27, 58.55], { side: 'axis' }),
  EV('shlisselburg', '1941-09-07T00:00:00Z', 'Leningrad cut off by land', 'On 7 September the German 20th Motorised Division seizes Shlisselburg; the road to the city is severed on 8 September (R09).', ['R09'], [31.04, 59.95], { side: 'axis' }),
  EV('kiev_ring', '1941-09-16T00:00:00Z', 'Kiev encirclement closed', 'Half of Army Group Centre swings south behind Kiev while Army Group South moves north; the encirclement is achieved on 16 September and Kiev is captured on 19 September (R01); the battle ends 26 September with 452,700 trapped (R07).', ['R01', 'R07'], [30.52, 50.45], { side: 'axis' }),
  EV('typhoon', '1941-09-30T00:00:00Z', 'Operation Typhoon begins', 'Operation Typhoon, the German drive on Moscow, begins on 30 September (R01).', ['R01'], [34.0, 54.5], { side: 'axis' }),
];
const airSupremacy = [{ side: 'axis', radiusKm: 80, speedMul: 0.7, fromMinutes: 0, toMinutes: 7 * 1440 }];
const ENG = ['warsaw', 'lublin', 'zamosc', 'koenigsberg', 'tilsit', 'brest', 'minsk', 'smolensk', 'vilnius', 'kaunas', 'riga', 'lvov', 'pskov', 'kiev'];
const supplySources = { GER: ENG, SOV: ['minsk', 'lvov', 'kiev', 'riga', 'vilnius', 'kaunas', 'leningrad', 'smolensk', 'moscow', 'kharkov', 'gomel', 'vitebsk', 'novgorod', 'pskov', 'rovno', 'tallinn'] };
const def = {
  schema: 1, id: 'barbarossa.short', campaignId: 'barbarossa', title: 'Barbarossa: the first hundred days (22 Jun - 30 Sep 1941)', scale: 'short', startDate: '1941-06-22T00:00:00Z', endDate: END_ISO,
  bbox: BBOX, estimatedPlayMinutes: [180, 360], mapSize: 'large', complexity: 5,
  briefing: { historical: 'On 22 June 1941 more than 3.8 million Axis troops invaded the Soviet Union along a 2,900 km front. Army Group North drove through the Baltic states toward Leningrad, Army Group Centre took Brest, Minsk and Smolensk, and Army Group South destroyed Soviet armies at Uman and Kiev. Typhoon, the drive on Moscow, began on 30 September (R01).',
    situation: 'The Germans must destroy the frontier armies and take the key cities before the logistics, distance and weather wear the offensive down; the Soviets must trade space for time, hold the Dvina-Dnieper and Luga lines and keep Leningrad, Kiev and Moscow. Armies and panzer groups are the units; strengths are game-scale and every start position is approximate. Romanian and Finnish forces, the Southern Front, air and naval forces are not modelled (not retrieved).' },
  playableNations: [
    { nation: 'GER', difficultyRating: 3, summary: 'Encircle the frontier armies and take Minsk, Smolensk, Kiev and the approaches to Leningrad.', objectiveIds: O('axis') },
    { nation: 'SOV', difficultyRating: 5, summary: 'Survive the surprise, trade space for time and hold Leningrad, Kiev and Moscow.', objectiveIds: O('allies') }],
  nations: NATIONS, locations, units, reinforcements, objectives: OBJ, terrainFile: 'terrain_barbarossa.json', infraFile: 'infra_barbarossa.json',
  supplySources, initialControl: CTRL, weatherProfile: WEATHER, eventTemplateIds: EVENTS.map((x) => x.id), specialSystems: [],
  airSupremacy, openingSurprise: { victimNations: ['SOV'], untilHour: 360, defenceMultiplier: 0.3 },
  victoryTiers: { axis: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 }, allies: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 } },
  sources: SOURCES.map(({ id, citation, url }) => ({ id, citation, ...(url ? { url } : {}) })),
};
const uncertain = [
  { item: 'Secondary sources only', note: 'Every R-source is a Wikipedia article (secondary). Where the articles cite books they are: Glantz, Colossus Reborn (2005); Krivosheev, Soviet Casualties and Combat Losses in the Twentieth Century (1997); Bishop, The Military Atlas of World War II (2005) (cited by R08). Primary sources (war diaries, Boevoi sostav) are cited by the articles but were not consulted.' },
  { item: 'Order-of-battle depth', note: 'Army level (each infantry army is split into a forward and a follow-on element, game-scale) and, for the panzer groups, the divisions named in R05, R06 and R09 plus a remainder element per group (corps not retrieved); other division tables did not extract. Strengths are game-scale (G01); sourced aggregates (153 divisions, 799 tanks in Panzer Group 1, Western Front 25+13+7 divisions, Brest garrison 9,000, 45th ID 17,000) anchor them. The 799 tanks of Panzer Group 1 are split across its four elements as 200+200+200+199 (the split is game-scale, the total is sourced) and entered as medium tanks without a light/medium split (not retrieved); all other tank counts are game-scale.' },
  { item: 'Omitted formations', note: 'Romanian Third and Fourth Armies and Finnish forces (positions and dates not retrieved), the Southern Front, 27th Army (arrival date not given in R08), Soviet second-echelon armies beyond those in R05, Axis security divisions, corps within armies, Luftwaffe and VVS units, naval forces. The Northern Front entry (Leningrad) is a placeholder: R02 gives only the front and its commander.' },
  { item: 'All start and arrival positions', note: 'Approximate sector anchors (G03); no source gives army coordinates. German start areas are inferred from the named border towns (Suwalki, Brest-Terespol, the Bug and San), Soviet start areas from the named frontier towns and fronts (R04, R08, R13, R14).' },
  { item: 'Soviet reserve arrival dates', note: 'R05 names the 20th, 21st, 22nd (Stavka reserve), 19th (forming at Vitebsk) and 16th (arriving at Smolensk) Armies in place by about 10 July but gives no dates. 20th, 21st, 22nd are set to 28 June 12:00 (so the 20th Army and its 5th and 7th Mechanised Corps are in place for the 6 July Lepiel battle), 19th to 5 July and 16th to 8 July: all approximate. The 5th and 7th Mechanised Corps are attached to the 20th Army arrival.' },
  { item: 'Lepiel battle discrepancy', note: 'R05 says 5th and 7th Mechanised Corps with about 1,500 tanks; R01 says V and VII Mechanised Corps, 832 of 2,000 tanks lost in five days. The scenario enters tank counts as game-scale and keeps the discrepancy in the event text.' },
  { item: 'Pskov capture date', note: 'R01 gives 8 July, R09 gives 10 July for Ostrov and Pskov. Both are recorded; the event uses 8 July and the objective text names both. Not silently resolved.' },
  { item: 'Opening surprise field', note: 'openingSurprise {victimNations SOV, untilHour 360, defenceMultiplier 0.3} multiplies Soviet combat strength by 1-(1-0.3)*(1-h/360), fading to 1 at hour 360 (game-scale, G01): the sourced rationale is that Stalin did not order mobilisation despite intelligence and Soviet forces were largely caught unprepared, the Western Front air force was destroyed on the ground and its communications cut (R01, R04); the multiplier, the 360 h duration and the linear fade are not sourced. ' },
  { item: 'Surprise', note: 'Frontier Soviet units start with readiness 30, organisation 40 and partial fuel/ammo (60) and supply (70) (game-scale, G01) as the abstraction of strategic surprise (R01); the engine has no surprise rule. The Western Front air force destroyed on the ground is not modelled as aircraft (no air units).' },
  { item: 'German fuel pool', note: 'The German fuel stock and income are scaled x3 against the formula used elsewhere (game-scale, G01): with the default scale German spearheads ran out of fuel (average 21 at hour 300) and stalled. The sources describe logistics strain (R01) but give no fuel figures.' },
  { item: 'Axis air superiority window', note: 'airSupremacy for the Axis runs the first 7 days (R01: air supremacy by the end of the first week), radius 80 km and speed multiplier 0.7 are game-scale; it ends at day 7 because R01 says the Luftwaffe could not extend its dominance over the whole country.' },
  { item: 'Rail-gauge supply stretch', note: 'Not in the retrieved text. Brest, Minsk, Smolensk, Vilnius, Kaunas, Riga, Lvov, Pskov and Kiev are Soviet-owned at start and listed as German capture-activated supply sources with rampHours 240 (game-scale, G06): they supply the Germans only after capture and ramp from 10% to full over 240 h. German home sources are Warsaw, Lublin, Zamosc, Koenigsberg and Tilsit. The engine has no gauge concept, so captured Soviet rail still counts as usable rail for the Axis (too generous; KNOWN_ISSUES).' },
  { item: 'Soviet supply sources', note: 'Soviet-owned cities listed as sources (Minsk, Lvov, Kiev, Riga, Vilnius, Kaunas, Leningrad, Smolensk, Moscow, Kharkov, Gomel, Vitebsk, Novgorod, Pskov, Rovno, Tallinn) lose their status when captured; capacities are game-scale defaults (G01).' },
  { item: 'Terrain gaps', note: 'The Narew and Berezina rivers are missing from the terrain (map-engineer fetch pending); the Pripyat marsh is a documented proxy; borders are modern. Do not rely on those rivers for defence modifiers.' },
  { item: 'initialControl', note: 'A coarse German polygon (Poland, East Prussia and the Romanian frontier area, including allied territory, G04) over a Soviet default; the Soviet-held Bialystok salient is east of the polygon edge. No source gives exact lines.' },
  { item: 'Start time', note: 'The scenario starts 22 June 00:00 UTC; the hour of the first attacks is not retrieved.' },
  { item: 'Objective values and tiers', note: 'Game-scale (G01). Hold objectives credit only at the end date. Leningrad, Kiev and Moscow are strategic holds for the Soviets; Leningrad is a strategic German capture although it was never taken.' },
  { item: 'Weather', note: 'Qualitative profile (game-scale). Sourced: the 2 July six-day rainstorm (R01); the autumn rasputitsa is after the scenario end except as a September rain bias.' },
];
const sidecar = { scenarioId: def.id, note: 'Per-fact source references. All R-sources are Wikipedia (secondary).',
  units: Object.fromEntries(units.map((x, i) => [x.id, { sources: [...new Set([...U[i].srcs, 'G01', 'G03'])], positionApproximate: true }])),
  locations: Object.fromEntries(LOC.map((l) => [l[0], { sources: [...new Set([...srcOfLoc[l[0]], 'G02'])] }])),
  reinforcements: reinSrc, nations: Object.fromEntries(NATIONS.map((n) => [n.id, { sources: ['G01'], gameScale: true }])),
  objectives: Object.fromEntries(OBJ.map((o) => [o.id, { sources: ['R01', 'G01'] }])), uncertain };
writeFileSync(join(OUT, 'barbarossa.short.json'), JSON.stringify(def, null, 1) + '\n');
writeFileSync(join(OUT, 'barbarossa.short.sources.json'), JSON.stringify(sidecar, null, 1) + '\n');
writeFileSync(join(OUT, 'barbarossa.events.json'), JSON.stringify({ campaignId: 'barbarossa', note: 'Historical event template data. Sources resolve against scenario sources[].', events: EVENTS.map((x) => ({ ...x, kind: 'historical', minutesFromStd: mins(x.date) })) }, null, 1) + '\n');
for (const x of [...units, ...locations, ...reinforcements.map((r) => r.unit)]) if (!inBox(x.pos)) console.error('OUT OF BBOX', x.id, x.pos);
console.log('units', units.length, 'reinforcements', reinforcements.length, 'locations', locations.length, 'events', EVENTS.length, 'ticks', TICKS);
