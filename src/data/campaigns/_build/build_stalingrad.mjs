// Generator for Stalingrad Short (Operation Uranus, 19 Nov 1942 - 2 Jan 1943).
// Run: node src/data/campaigns/_build/build_stalingrad.mjs   (writes to OUT_DIR below)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './stalingrad_sources.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', process.env.SG_OUT ?? '');
mkdirSync(OUT, { recursive: true });
const EPOCH = Date.parse('1942-11-19T00:00:00Z');
const END_ISO = '1943-01-02T00:00:00Z';
const mins = (iso) => Math.round((Date.parse(iso) - EPOCH) / 60000);
const TICKS = mins(END_ISO) / 60;
const BBOX = { west: 40.5, south: 47.0, east: 46.5, north: 50.0 };
const TERRAIN_FILE = 'terrain_stalingrad.json', INFRA_FILE = 'infra_stalingrad.json';
const inBox = ([lon, lat]) => lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;

// [id, name, kind, lon, lat, owner, originalOwner, value, srcs]. Coordinates: E07 (Wikipedia) or E08 (Nominatim); see sources.
const LOC = [
  ['stalingrad', 'Stalingrad', 'city', 44.515, 48.709, 'GER', 'GER', 10, ['E07', 'E02']],
  ['mamayev_kurgan', 'Mamayev Kurgan', 'fortress', 44.537, 48.743, 'GER', 'GER', 4, ['E07']],
  ['pitomnik', 'Pitomnik (airfield)', 'airfield', 44.25, 48.7425, 'GER', 'GER', 4, ['E10']],
  ['svetly_yar', 'Svetly Yar', 'town', 44.785, 48.477, 'SOV', 'SOV', 2, ['E08']],
  ['tinguta', 'Tinguta (hamlet)', 'town', 44.271, 48.285, 'SOV', 'SOV', 2, ['E08']],
  ['gumrak', 'Gumrak (airfield)', 'airfield', 44.347, 48.782, 'GER', 'GER', 4, ['E07']],
  ['krasnoslobodsk', 'Krasnoslobodsk (Volga east bank)', 'town', 44.567, 48.7, 'SOV', 'SOV', 2, ['E09']],
  ['beketovka', 'Beketovka (approximate)', 'town', 44.363, 48.563, 'SOV', 'SOV', 3, ['E08']],
  ['kalach', 'Kalach-na-Donu', 'town', 43.517, 48.70, 'GER', 'GER', 7, ['E07', 'E01']],
  ['marinovka', 'Marinovka', 'town', 43.832, 48.692, 'GER', 'GER', 2, ['E08']],
  ['vertyachy', 'Vertyachy', 'town', 43.911, 48.945, 'GER', 'GER', 2, ['E08']],
  ['kotluban', 'Kotluban', 'town', 44.231, 49.020, 'SOV', 'SOV', 3, ['E08']],
  ['kletskaya', 'Kletskaya', 'town', 43.062, 49.315, 'ROU', 'ROU', 5, ['E07']],
  ['serafimovich', 'Serafimovich', 'town', 42.733, 49.583, 'SOV', 'SOV', 5, ['E08']],
  ['perelazovsky', 'Perelazovsky', 'town', 42.574, 49.143, 'ROU', 'ROU', 3, ['E08', 'E01']],
  ['bokovskaya', 'Bokovskaya', 'town', 41.834, 49.222, 'ROU', 'ROU', 3, ['E07']],
  ['surovikino', 'Surovikino', 'town', 42.85, 48.60, 'GER', 'GER', 4, ['E07']],
  ['oblivskaya', 'Oblivskaya', 'town', 42.494, 48.537, 'GER', 'GER', 3, ['E07']],
  ['morozovsk', 'Morozovsk', 'town', 41.833, 48.367, 'GER', 'GER', 5, ['E07', 'E03']],
  ['tatsinskaya', 'Tatsinskaya (airfield)', 'airfield', 41.281, 48.194, 'GER', 'GER', 5, ['E08', 'E03']],
  ['kotelnikovo', 'Kotelnikovo', 'town', 43.15, 47.633, 'ROU', 'ROU', 5, ['E07']],
  ['verkhnekumsky', 'Verkhnekumsky', 'town', 43.439, 48.09, 'ROU', 'ROU', 3, ['E08', 'E03']],
  ['abganerovo', 'Abganerovo', 'town', 44.111, 48.136, 'ROU', 'ROU', 3, ['E08']],
];
const LOCOWN = Object.fromEntries(LOC.map((l) => [l[0], l]));

// Anchors (G03) [lon, lat]
const A = {
  GER_HQ: [42.3, 48.3], GUM: [44.32, 48.77], PZG6: [44.0, 48.75], A6_HQ: [44.1, 48.8], IV: [44.35, 48.45], VIII: [43.3, 48.88], XI: [43.8, 48.95], XIV: [44.2, 48.88], LI: [44.4, 48.7],
  PZ48: [42.8, 49.0], A4P: [44.2, 47.95], ROU3: [42.3, 49.1], R3_1: [41.8, 49.1], R3_2: [42.1, 49.15], R3_4: [42.5, 49.0], R3_5: [42.7, 49.2], R4: [44.0, 47.8], R4_6: [44.3, 48.1], R4_7: [43.6, 47.7],
  ITA8: [40.8, 49.7],
  SW_HQ: [42.5, 49.85], DON_HQ: [43.9, 49.5], ST_HQ: [44.7, 48.2],
  A1G: [41.6, 49.55], A5T: [42.65, 49.55], A21: [43.05, 49.45], A24: [44.15, 49.25], A65: [43.95, 49.3], A66: [44.45, 49.1],
  A62: [44.45, 48.72], A64: [44.35, 48.35], A57: [44.55, 48.22], A51: [44.65, 47.95], A28: [45.4, 47.4],
};
const U = [];
const add = (id, name, sh, nation, type, parent, anc, srcs, o = {}) => U.push({ id, name, sh, nation, type, parent, anc, srcs, o });
const S = (id, name, sh, type, parent, anc, o = {}) => add(id, name, sh, 'SOV', type, parent, anc, ['E05'], o);
const G = (id, name, sh, type, parent, anc, o = {}) => add(id, name, sh, 'GER', type, parent, anc, ['E06'], o);
const R = (id, name, sh, type, parent, anc, o = {}) => add(id, name, sh, 'ROU', type, parent, anc, ['E06'], o);
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`;
const rifleDivs = (army, anc, list) => list.forEach((x) => { const g = typeof x === 'string'; const n = g ? Number(x.replace('g', '')) : x; S(`sov.rd.${g ? 'g' : ''}${n}`, `${ord(n)}${g ? ' Guards' : ''} Rifle Division`, `${n}${g ? 'G' : ''} RD`, 'infantry', army, anc); });
const brigades = (army, anc, kind, list, type = 'infantry', mp = 3000) => list.forEach((n) => S(`sov.${kind}.${n}`, `${ord(n)} ${kind === 'rb' ? 'Rifle' : kind === 'tb' ? 'Tank' : 'Naval Rifle'} Brigade`, `${n} ${kind.toUpperCase()}`, type, army, anc, { mp }));
const corps = (id, name, sh, type, army, anc, mp) => S(id, name, sh, type, army, anc, { mp });

// --- Soviet (E05)
S('sov.f.sw', 'Southwestern Front (Vatutin)', 'SW Front', 'hq', null, 'SW_HQ');
S('sov.f.don', 'Don Front (Rokossovsky)', 'Don Front', 'hq', null, 'DON_HQ');
S('sov.f.st', 'Stalingrad Front (Yeryomenko)', 'Stalin. Front', 'hq', null, 'ST_HQ');
// Southwestern Front
S('sov.a.1g', '1st Guards Army (Lelyushenko)', '1G Army', 'hq', 'sov.f.sw', 'A1G');
rifleDivs('sov.a.1g', 'A1G', [1, 153, 197, 203, 266, 278]);
corps('sov.mc.1g', '1st Guards Mechanized Corps (Russiyanov)', '1G MC', 'mechanised', 'sov.a.1g', 'A1G', 9000);
S('sov.a.5t', '5th Tank Army (Romanenko)', '5TA', 'hq', 'sov.f.sw', 'A5T');
rifleDivs('sov.a.5t', 'A5T', ['14g', '47g', '50g', 119, 159, 346]);
corps('sov.tc.1', '1st Tank Corps (Butkov)', '1 TC', 'armoured', 'sov.a.5t', 'A5T', 7000);
corps('sov.tc.26', '26th Tank Corps (Rodin)', '26 TC', 'armoured', 'sov.a.5t', 'A5T', 7000);
corps('sov.cc.8', '8th Cavalry Corps (Borisov)', '8 CC', 'infantry', 'sov.a.5t', 'A5T', 8000);
S('sov.a.21', '21st Army (Chistyakov)', '21 Army', 'hq', 'sov.f.sw', 'A21');
rifleDivs('sov.a.21', 'A21', [63, 76, 96, 277, 293, 333]);
corps('sov.tc.4', '4th Tank Corps (Kravchenko)', '4 TC', 'armoured', 'sov.a.21', 'A21', 7000);
corps('sov.cc.3g', '3rd Guards Cavalry Corps (Pliyev)', '3G CC', 'infantry', 'sov.a.21', 'A21', 8000);
// Don Front
S('sov.a.24', '24th Army (Galanin)', '24 Army', 'hq', 'sov.f.don', 'A24');
rifleDivs('sov.a.24', 'A24', [49, 84, 120, 173, 214, 233, 260, 273, 298]);
corps('sov.tc.16', '16th Tank Corps (Maslov)', '16 TC', 'armoured', 'sov.a.24', 'A24', 7000);
S('sov.a.65', '65th Army (Batov)', '65 Army', 'hq', 'sov.f.don', 'A65');
rifleDivs('sov.a.65', 'A65', ['4g', '27g', '40g', 23, 24, 252, 258, 304, 321]);
brigades('sov.a.65', 'A65', 'tb', [91, 121], 'armoured', 1500);
S('sov.a.66', '66th Army (Zhadov)', '66 Army', 'hq', 'sov.f.don', 'A66');
rifleDivs('sov.a.66', 'A66', [64, 99, 116, 226, 299, 343]);
brigades('sov.a.66', 'A66', 'tb', [58], 'armoured', 1500);
// Stalingrad Front
S('sov.a.62', '62nd Army (Chuikov)', '62 Army', 'hq', 'sov.f.st', 'A62');
rifleDivs('sov.a.62', 'A62', ['13g', '37g', '39g', 45, 95, 112, 138, 193, 308]);
brigades('sov.a.62', 'A62', 'rb', [42, 92, 115, 124, 149, 160], 'infantry', 3000);
brigades('sov.a.62', 'A62', 'tb', [84], 'armoured', 1500);
S('sov.a.64', '64th Army (Shumilov)', '64 Army', 'hq', 'sov.f.st', 'A64');
rifleDivs('sov.a.64', 'A64', ['36g', 29, 38, 157, 204]);
brigades('sov.a.64', 'A64', 'rb', [93, 96, 97], 'infantry', 3000);
brigades('sov.a.64', 'A64', 'nb', [66, 154], 'infantry', 3000);
brigades('sov.a.64', 'A64', 'tb', [13, 56], 'armoured', 1500);
S('sov.a.51', '51st Army (Trufanov)', '51 Army', 'hq', 'sov.f.st', 'A51');
rifleDivs('sov.a.51', 'A51', ['15g', 91, 126, 302]);
corps('sov.mc.4', '4th Mechanized Corps (Volsky)', '4 MC', 'mechanised', 'sov.a.51', 'A51', 9000);
corps('sov.cc.4', '4th Cavalry Corps (Shapkin)', '4 CC', 'infantry', 'sov.a.51', 'A51', 8000);
brigades('sov.a.51', 'A51', 'tb', [254], 'armoured', 1500);
S('sov.a.57', '57th Army (Tolbukhin)', '57 Army', 'hq', 'sov.f.st', 'A57');
rifleDivs('sov.a.57', 'A57', [169, 422]);
corps('sov.mc.13', '13th Mechanized Corps (Tanaschishin)', '13 MC', 'mechanised', 'sov.a.57', 'A57', 9000);
brigades('sov.a.57', 'A57', 'tb', [90, 235], 'armoured', 1500);
S('sov.a.28', '28th Army (Gerasimenko)', '28 Army', 'hq', 'sov.f.st', 'A28');
rifleDivs('sov.a.28', 'A28', ['34g', 248]);
brigades('sov.a.28', 'A28', 'tb', [], 'armoured', 1500);
S('sov.tb.g6', '6th Guards Tank Brigade', '6G TB', 'armoured', 'sov.a.28', 'A28', { mp: 1500 });
S('sov.rd.300', '300th Rifle Division (Stalingrad Front)', '300 RD', 'infantry', 'sov.f.st', 'A62');
// --- Axis: German 6th Army (E06; division lists span Sep 1942-Feb 1943, presence on 19 Nov unconfirmed by E06)
G('ger.abB', 'Army Group B (Weichs)', 'AGp B', 'hq', null, 'GER_HQ', { srcs: ['E02'] });
G('ger.a6', '6th Army (Paulus)', '6.Armee', 'hq', 'ger.abB', 'A6_HQ');
G('ger.c.IV', 'IV Army Corps (Jaenecke)', 'IV.AK', 'hq', 'ger.a6', 'IV');
for (const [n, nm, mot] of [[29, '29th Motorized Infantry Division (Leyser)', true], [297, '297th Infantry Division', false], [371, '371st Infantry Division', false]]) G(`ger.d.${n}`, nm, `${n}.${mot ? 'ID(mot)' : 'ID'}`, mot ? 'motorised' : 'infantry', 'ger.c.IV', 'IV');
G('ger.c.VIII', 'VIII Army Corps (Heitz)', 'VIII.AK', 'hq', 'ger.a6', 'VIII');
for (const [n, nm] of [[76, '76th Infantry Division (Rodenburg)'], [113, '113th Infantry Division (Sixt von Armin)']]) G(`ger.d.${n}`, nm, `${n}.ID`, 'infantry', 'ger.c.VIII', 'VIII');
G('ger.c.XI', 'XI Army Corps (Strecker)', 'XI.AK', 'hq', 'ger.a6', 'XI');
for (const [n, nm] of [[44, '44th Infantry Division (Deboi)'], [376, '376th Infantry Division (v. Daniels)'], [384, '384th Infantry Division (v. Gablenz)']]) G(`ger.d.${n}`, nm, `${n}.ID`, 'infantry', 'ger.c.XI', 'XI');
G('ger.c.XIV', 'XIV Panzer Corps (Hube)', 'XIV.PzK', 'hq', 'ger.a6', 'XIV');
G('ger.d.3', '3rd Motorized Infantry Division (Schlömer)', '3.ID(mot)', 'motorised', 'ger.c.XIV', 'XIV');
G('ger.d.60', '60th Motorized Infantry Division (v. Arenstorff)', '60.ID(mot)', 'motorised', 'ger.c.XIV', 'GUM');
G('ger.d.16pz', '16th Panzer Division (Angern)', '16.PzD', 'armoured', 'ger.c.XIV', 'XIV');
G('ger.c.LI', 'LI Army Corps (v. Seydlitz-Kurzbach)', 'LI.AK', 'hq', 'ger.a6', 'LI');
for (const [n, nm] of [[71, '71st Infantry Division (v. Hartmann)'], [79, '79th Infantry Division (Graf v. Schwerin)'], [94, '94th Infantry Division (Pfeiffer)'], [295, '295th Infantry Division (Korfes)'], [305, '305th Infantry Division (Steinmetz)'], [389, '389th Infantry Division (Magnus)']]) G(`ger.d.${n}`, nm, `${n}.ID`, 'infantry', 'ger.c.LI', 'LI');
G('ger.d.100j', '100th Jäger Division (Sanne)', '100.JgD', 'infantry', 'ger.c.LI', 'LI');
G('ger.d.14pz', '14th Panzer Division', '14.PzD', 'armoured', 'ger.c.LI', 'LI');
G('ger.d.24pz', '24th Panzer Division (v. Lenski)', '24.PzD', 'armoured', 'ger.c.LI', 'LI');
// 4th Panzer Army / XLVIII Panzer Corps (E01: 48th Panzer Corps, 22nd Panzer; E06: 4th Panzer Army, Romanian 6th Corps)
G('ger.a4p', '4th Panzer Army (Hoth)', '4.PzArmee', 'hq', 'ger.abB', 'A4P', { srcs: ['E02', 'E03'] });
G('ger.c.XLVIII', 'XLVIII Panzer Corps', 'XLVIII.PzK', 'hq', 'ger.a4p', 'PZ48', { srcs: ['E01', 'E03'] });
G('ger.d.22pz', '22nd Panzer Division', '22.PzD', 'armoured', 'ger.c.XLVIII', 'PZ48', { srcs: ['E01'] });
// --- Romanian Third Army (E06)
R('rou.a3', 'Romanian Third Army (Dumitrescu)', 'RO 3rd Army', 'hq', null, 'ROU3');
const RC = (id, nm, sh, parent, anc, divs) => { R(id, nm, sh, 'hq', parent, anc); for (const [n, d, typ] of divs) R(`rou.d.${n}${typ === 'cav' ? 'c' : typ === 'arm' ? 'a' : ''}`, `${ord(n)} ${typ === 'cav' ? 'Cavalry' : typ === 'arm' ? 'Armoured' : 'Infantry'} Division${d ? ` (${d})` : ''}`, `RO ${n}${typ === 'cav' ? 'c' : typ === 'arm' ? 'a' : ''}`, typ === 'arm' ? 'armoured' : 'infantry', id, anc, typ === 'arm' ? { mp: 6000 } : {}); };
RC('rou.c.1', 'Romanian 1st Corps (T. Ionescu)', 'RO I C', 'rou.a3', 'R3_1', [[7, 'Trestioreanu'], [11, 'Nedelea']]);
RC('rou.c.2', 'Romanian 2nd Corps (Dăscălescu)', 'RO II C', 'rou.a3', 'R3_2', [[9, 'Panaitiu'], [14, 'Stavrescu'], [7, 'Munteanu', 'cav']]);
RC('rou.c.4', 'Romanian 4th Corps (Sănătescu)', 'RO IV C', 'rou.a3', 'R3_4', [[13, 'G. Ionescu'], [15, 'Sion'], [1, 'Brătescu', 'cav']]);
RC('rou.c.5', 'Romanian 5th Corps (Son)', 'RO V C', 'rou.a3', 'R3_5', [[5, 'Mazarini'], [6, 'Lascăr']]);
R('rou.d.1a', 'Romanian 1st Armoured Division (Radu)', 'RO 1 Armd', 'armoured', 'rou.a3', 'PZ48', { mp: 6000 });
// --- Romanian Fourth Army (E06)
R('rou.a4', 'Romanian Fourth Army (Constantinescu-Claps)', 'RO 4th Army', 'hq', null, 'R4');
RC('rou.c.6', 'Romanian 6th Corps (Dragalina)', 'RO VI C', 'rou.a4', 'R4_6', [[1, 'Mihăescu'], [2, 'Tudose'], [18, 'Băldescu'], [20, 'Tătăranu']]);
RC('rou.c.7', 'Romanian 7th Corps (Mitrănescu)', 'RO VII C', 'rou.a4', 'R4_7', [[4, 'Alinescu'], [5, 'Popescu', 'cav'], [8, 'Korne', 'cav']]);
add('ita.a8', 'Italian 8th Army (army-level element only; corps/divisions not retrieved)', 'IT 8th Army', 'ITA', 'infantry', null, 'ITA8', ['E03'], { mp: 20000 });

const T = {
  hq: { mp: 600, eq: { rifle: 600 } }, infantry: { mp: 10000, eq: { rifle: 100, mg: 30, gun_arty: 40, gun_at: 20 } },
  motorised: { mp: 12000, eq: { rifle: 80, gun_arty: 40, truck: 60 } },
  mechanised: { mp: 10000, eq: { tank_light: 40, rifle: 50, gun_arty: 24 } },
  armoured: { mp: 12000, eq: { tank_medium: 100, tank_light: 20, gun_arty: 24, truck: 60 } },
};
const NAT = { SOV: ['allies', 45, 76], GER: ['axis', 60, 80], ROU: ['axis', 35, 62], ITA: ['axis', 35, 62] };
const spread = (a, k) => [Math.round((a[0] + ((k % 5) - 2) * 0.05) * 1000) / 1000, Math.round((a[1] + (Math.floor(k / 5) % 4 - 1.5) * 0.04) * 1000) / 1000];
const cnt = {};
const mk = (r, pos, extra = {}) => {
  const t = T[r.type], [side, exp, morale] = NAT[r.nation], max = r.o.mp ?? (r.nation === 'GER' && r.type === 'infantry' ? 12000 : t.mp), held = { ...t.eq };
  return { id: r.id, name: r.name, shortName: r.sh, nation: r.nation, side, type: r.type, domain: 'land', ...(r.parent ? { parentId: r.parent } : {}), pos,
    manpower: max, manpowerMax: max, equipment: { held, authorised: { ...held } }, organisation: 90, morale, experience: r.o.exp ?? exp, fuel: 100, ammo: 100, supply: 100, fatigue: 5, readiness: 90,
    entrenchment: r.nation === 'SOV' ? 10 : 20, moveStatus: 'stationary', combatStatus: 'idle', posture: r.nation === 'SOV' ? 'defend' : 'hold', orders: [], kills: 0, ...extra };
};
const units = U.map((r) => { const k = (cnt[r.anc] = (cnt[r.anc] ?? -1) + 1); return mk(r, spread(A[r.anc], k)); });
// Reinforcements (E03): arrival times day-level; arrival points approximate (jump-off and arrival areas not named in E03)
const REI = [
  ['sov.a.3g', '3rd Guards Army (Little Saturn)', '3G Army', 'SOV', 'infantry', '1942-12-16T00:00:00Z', [41.1, 49.85], { mp: 14000 }, 'E03', 'Little Saturn launched 16 Dec by 1st and 3rd Guards Armies (E03); 3rd Guards Army start position not retrieved.'],
  ['sov.a.2g', '2nd Guards Army (3 Guards Rifle Corps)', '2G Army', 'SOV', 'infantry', '1942-12-15T00:00:00Z', [45.3, 48.0], { mp: 14000 }, 'E03', 'Transfer authorised 13 Dec, ready 15 Dec (E03); date it entered combat and its arrival area are not retrieved.'],
  ['ger.c.LVII', 'LVII Panzer Corps (Kirchner)', 'LVII.PzK', 'GER', 'hq', '1942-12-12T00:00:00Z', [43.15, 47.62], {}, 'E03', 'Drive began 12 Dec (E03); jump-off point not named in the text read (Kotelnikovo is the proposed assembly point).'],
  ['ger.d.6pz', '6th Panzer Division', '6.PzD', 'GER', 'armoured', '1942-12-12T00:00:00Z', [43.17, 47.64], {}, 'E03', 'Transferred from Western Europe, complete (E03); the page says it unloaded at Morozovsk (undated); jump-off area approximate.'],
  ['ger.d.23pz', '23rd Panzer Division', '23.PzD', 'GER', 'armoured', '1942-12-12T00:00:00Z', [43.13, 47.64], {}, 'E03', 'Took part in the 12 Dec drive (E03); jump-off area approximate.'],
];
const reinforcements = REI.map(([id, name, sh, nation, type, iso, pos, o, , ]) => ({ id: `reinf.${id}`, atMinutes: mins(iso), pos: [...pos], unit: (() => { const u = mk({ id, name, sh, nation, type, parent: null, o }, [...pos]); u.organisation = 80; u.fatigue = 10; u.entrenchment = 0; return u; })() }));
const reinSrc = Object.fromEntries(REI.map((r) => [`reinf.${r[0]}`, { sources: [r[8], 'G03'], approximate: true, note: r[9] }]));

const NATIONS = (() => {
  const all = [...units, ...reinforcements.map((r) => r.unit)];
  const mpOf = (n) => all.filter((x) => x.nation === n).reduce((a, x) => a + x.manpowerMax, 0), c = (n) => all.filter((x) => x.nation === n).length;
  const pool = (n, fs = 1) => ({ resources: { manpower: Math.max(2000, Math.round(mpOf(n) * 0.15)), fuel: Math.max(1500, Math.round(c(n) * 40 * fs)), ammo: Math.max(1500, c(n) * 50), equipment: Math.max(1500, c(n) * 100), supplyPoints: 600 },
    income: { manpower: Math.max(2, Math.ceil(mpOf(n) * 0.3 / TICKS)), fuel: Math.max(1, Math.ceil(c(n) * 0.15 * fs)), ammo: Math.max(2, Math.ceil(c(n) * 0.2)), equipment: Math.max(2, Math.ceil(c(n) * 0.4)), supplyPoints: 5 } });
  return [['SOV', 'allies', 'Soviet Union', true, 1], ['GER', 'axis', 'Germany', true, 0.5], ['ROU', 'axis', 'Romania', false, 0.5], ['ITA', 'axis', 'Italy', false, 0.5]]
    .map(([id, side, name, playable, fs]) => ({ id, side, name, playable, ...pool(id, fs), reinforcements: [] }));
})();
const END = mins(END_ISO);
const ob = (id, tier, side, title, description, condition, points) => ({ id, tier, side, title, description, condition, points, status: 'pending' });
const OBJ = [
  ob('o.sov.kalach', 'primary', 'allies', 'Close the ring at Kalach', 'Capture Kalach-na-Donu; the 26th and 4th Tank Corps linked up at Sovetsky on 23 Nov (E01).', { kind: 'capture_location', locationId: 'kalach' }, 250),
  ob('o.sov.surovikino', 'secondary', 'allies', 'Push the outer ring: Surovikino', 'Take Surovikino on the Chir railway.', { kind: 'capture_location', locationId: 'surovikino' }, 100),
  ob('o.sov.kletskaya', 'secondary', 'allies', 'Break the Romanian Third Army: Kletskaya', 'Take Kletskaya on the Don.', { kind: 'capture_location', locationId: 'kletskaya' }, 100),
  ob('o.sov.tatsinskaya', 'secondary', 'allies', 'Take the airlift base: Tatsinskaya', 'Capture Tatsinskaya airfield (lost to a Soviet raid, E03).', { kind: 'capture_location', locationId: 'tatsinskaya' }, 150),
  ob('o.sov.morozovsk', 'secondary', 'allies', 'Take Morozovsk', 'Capture Morozovsk, the German rail railhead for the relief force (E03).', { kind: 'capture_location', locationId: 'morozovsk' }, 100),
  ob('o.sov.deny_relief', 'primary', 'allies', 'Stop the relief short of the city', 'Hold Beketovka until 24 Dec, when Winter Storm collapsed (E03). Beketovka position is approximate.', { kind: 'hold_location', locationId: 'beketovka', untilMinutes: mins('1942-12-24T00:00:00Z') }, 200),
  ob('o.sov.stalingrad', 'strategic', 'allies', 'Stretch goal: Stalingrad', 'Clear the city (the 6th Army surrendered 2 Feb 1943, E02; beyond this scenario window).', { kind: 'capture_location', locationId: 'stalingrad' }, 300),
  ob('o.ger.hold_stalingrad', 'primary', 'axis', 'Hold Stalingrad', 'Keep the city (E01: Hitler ordered an all-round defence, "Fortress Stalingrad").', { kind: 'hold_location', locationId: 'stalingrad', untilMinutes: END }, 250),
  ob('o.ger.hold_gumrak', 'secondary', 'axis', 'Keep the Gumrak airfield', 'Keep the airlift landing ground at Gumrak.', { kind: 'hold_location', locationId: 'gumrak', untilMinutes: END }, 100),
  ob('o.ger.beketovka', 'primary', 'axis', 'Relief breakthrough: Beketovka', 'Capture Beketovka south of the city, linking the relief force with the 6th Army (Winter Storm, E03).', { kind: 'capture_location', locationId: 'beketovka' }, 250),
  ob('o.ger.tatsinskaya', 'secondary', 'axis', 'Hold the Tatsinskaya airlift base', 'Keep Tatsinskaya (E03).', { kind: 'hold_location', locationId: 'tatsinskaya', untilMinutes: END }, 120),
  ob('o.ger.kotelnikovo', 'secondary', 'axis', 'Hold Kotelnikovo', 'Hold the relief force base area.', { kind: 'hold_location', locationId: 'kotelnikovo', untilMinutes: END }, 100),
  ob('o.ger.kotluban', 'secondary', 'axis', 'Break the Don Front north of the city: Kotluban', 'Capture Kotluban, Soviet-held at the start.', { kind: 'capture_location', locationId: 'kotluban' }, 100),
  ob('o.ger.surovikino', 'secondary', 'axis', 'Hold Surovikino', 'Keep the outer ring from closing on the Chir railway.', { kind: 'hold_location', locationId: 'surovikino', untilMinutes: END }, 100),
];
const O = (s) => OBJ.filter((o) => o.side === s).map((o) => o.id);
const WEATHER = [
  { month: 11, probs: { snow: 0.3, cloud: 0.3, fog: 0.15, clear: 0.2, mud: 0.05 }, tempC: -4 },
  { month: 12, probs: { snow: 0.4, cloud: 0.25, clear: 0.25, fog: 0.1 }, tempC: -14 },
  { month: 1, probs: { snow: 0.4, cloud: 0.2, clear: 0.3, fog: 0.1 }, tempC: -16 },
];
const bb = [[40.5, 47.0], [46.5, 47.0], [46.5, 50.0], [40.5, 50.0]];
const CTRL = [
  { nation: 'GER', polygon: bb },
  { nation: 'SOV', polygon: [[40.5, 50.0], [46.5, 50.0], [46.5, 47.0], [45.5, 47.0], [44.8, 48.0], [44.65, 48.7], [44.75, 49.0], [44.3, 49.05], [43.6, 49.1], [43.06, 49.35], [42.7, 49.5], [41.8, 49.5], [40.5, 49.7]] },
  { nation: 'SOV', polygon: [[44.6, 48.6], [44.7, 48.6], [44.7, 48.8], [44.6, 48.8]] },
];
const EVENTS = [
  { id: 'sg.ev.uranus', date: '1942-11-19T07:20:00Z', title: 'Operation Uranus begins', body: 'An 80-minute artillery bombardment opens at 07:20 Moscow time, aimed mainly at the non-German Axis units; at 08:50 the 21st, 65th and 5th Tank Armies attack the Romanian Third Army. The Romanian rout begins by the end of the day and about 27,000 Romanians are captured.', pos: [42.7, 49.55], src: ['E01'], effectHints: [] },
  { id: 'sg.ev.stfront', date: '1942-11-20T00:00:00Z', title: 'The Stalingrad Front attacks', body: 'The Stalingrad Front (Yeryomenko) attacks from the south; the 51st Army hits the Romanian 6th Corps and the 57th Army joins. The 26th Tank Corps takes Perelazovsky.', pos: [44.0, 48.0], src: ['E01'], effectHints: [] },
  { id: 'sg.ev.fortress', date: '1942-11-21T00:00:00Z', title: '"Fortress Stalingrad"', body: 'Paulus is told Soviet forces are less than 40 km from his headquarters. Hitler orders an all-round defensive position and designates "Fortress Stalingrad", rejecting a breakout.', pos: [44.5, 48.7], side: 'axis', src: ['E01'], effectHints: [] },
  { id: 'sg.ev.kalach', date: '1942-11-22T00:00:00Z', title: 'Kalach falls', body: 'Soviet forces cross the Don and Kalach falls by mid-morning; the 26th and 4th Tank Corps link up with the 4th Mechanized Corps. The page describes the encirclement as completed this day (see the link-up on 23 Nov).', pos: [43.52, 48.7], src: ['E01'], effectHints: [] },
  { id: 'sg.ev.linkup', date: '1942-11-23T16:00:00Z', title: 'The ring closes at Sovetsky', body: 'Around 16:00 near Sovetsky the 4th Mechanized Corps (Stalingrad Front) and the 4th Tank Corps (Southwestern Front) link up. Between 23 and 24 November Hitler decides to hold and resupply by air. Sources disagree: the lead of the page says late on 22 Nov at Kalach, the body gives 23 Nov; this scenario uses 23 Nov, the more detailed account.', pos: [43.6, 48.55], src: ['E01'], effectHints: [] },
  { id: 'sg.ev.saturn_plan', date: '1942-11-24T00:00:00Z', title: 'Stavka plans Operation Saturn', body: 'The outer encirclement is about 320 km long, with about 16 km between the inner and outer rings; Stavka plans Operation Saturn for about 10 December.', src: ['E01'], effectHints: [] },
  { id: 'sg.ev.winter_storm', date: '1942-12-12T00:00:00Z', title: 'Operation Winter Storm', body: 'LVII Panzer Corps of the 4th Panzer Army begins the relief drive towards the 6th Army. The Luftwaffe airlift, with about 500 transports, delivers less than 20% of the 680 tonnes a day the pocket needs.', pos: [43.15, 47.63], side: 'axis', src: ['E01', 'E03'], effectHints: [] },
  { id: 'sg.ev.kumsky', date: '1942-12-13T00:00:00Z', title: 'Verkhnekumsky and the 2nd Guards Army', body: 'The 6th Panzer Division contacts the 5th Tank Army and a three-day armoured battle opens at Verkhnekumsky; Stalin authorises the transfer of the 2nd Guards Army (about 90,000 men).', pos: [43.44, 48.09], src: ['E03'], effectHints: [] },
  { id: 'sg.ev.little_saturn', date: '1942-12-16T00:00:00Z', title: 'Operation Little Saturn', body: 'The 1st and 3rd Guards Armies, with the 6th Army, launch Little Saturn, which partly overruns the Italian 8th Army by 18 December and threatens the Army Group Don flank.', pos: [41.1, 49.7], src: ['E03'], effectHints: [] },
  { id: 'sg.ev.mech_rename', date: '1942-12-18T00:00:00Z', title: '4th Mechanized Corps becomes 3rd Guards', body: 'The 4th Mechanized Corps, down to barely 100 operable tanks, is renamed the 3rd Guards Mechanized Corps and withdrawn to refit.', pos: [43.44, 48.09], side: 'allies', src: ['E03'], effectHints: [] },
  { id: 'sg.ev.myshkova', date: '1942-12-19T00:00:00Z', title: 'The Myshkova River', body: 'The 6th Panzer Division crosses the Myshkova; LVII Panzer Corps is within 48 km of the southern edge of the 6th Army front.', pos: [43.8, 48.0], side: 'axis', src: ['E03'], effectHints: [] },
  { id: 'sg.ev.halted', date: '1942-12-23T00:00:00Z', title: 'Manstein calls off Winter Storm', body: 'Manstein calls off the assault and orders the 6th Panzer Division to redeploy to the Chir; the 4th Panzer Army is in full retreat by 24 December.', pos: [43.8, 48.0], src: ['E03'], effectHints: [] },
  { id: 'sg.ev.tatsinskaya', date: '1942-12-24T00:00:00Z', title: 'Tatsinskaya airfield lost', body: 'A Soviet raid destroys the Tatsinskaya airfield and several dozen aircraft; the 6th Army runs out of food. The date of 24 December is approximate: E03 gives no date in the text read.', pos: [41.28, 48.19], side: 'axis', src: ['E03'], effectHints: [] },
];
const locations = LOC.map(([id, name, kind, lon, lat, owner, orig, value]) => ({ id, name, kind, pos: [lon, lat], owner, originalOwner: orig, value, ...(['city', 'airfield', 'port'].includes(kind) ? { supplyCapacity: kind === 'city' ? 40 : 20 } : {}), ...(id === 'gumrak' || id === 'pitomnik' ? { airliftTonsPerDay: 68 } : {}) })); // 136 = 20% of the 680 t/day requirement (E03: under 20% delivered), an upper bound
const supplySources = { SOV: ['serafimovich', 'kotluban', 'krasnoslobodsk', 'beketovka', 'svetly_yar', 'tinguta'], GER: ['morozovsk', 'tatsinskaya', 'bokovskaya'].filter((x) => LOCOWN[x][5] === 'GER'), ROU: ['kotelnikovo'], ITA: [] };
supplySources.GER = ['morozovsk', 'tatsinskaya'];
supplySources.ROU = ['kotelnikovo', 'bokovskaya'];
delete supplySources.ITA;
const def = {
  schema: 1, id: 'stalingrad.short', campaignId: 'stalingrad', title: 'Stalingrad: Operation Uranus (19 Nov 1942 - 2 Jan 1943)', scale: 'short', startDate: '1942-11-19T00:00:00Z', endDate: END_ISO,
  bbox: BBOX, estimatedPlayMinutes: [90, 180], mapSize: 'large', complexity: 4,
  briefing: { historical: 'On 19 November 1942 the Red Army launched Operation Uranus against the Romanian armies guarding the flanks of the German 6th Army at Stalingrad. The Southwestern, Don and Stalingrad Fronts closed the ring around the city on 23 November; Hitler ordered the pocket held and supplied by air, the Luftwaffe delivered less than 20 percent of the 680 tonnes a day required, and Manstein\'s Winter Storm relief attempt of 12-23 December failed (E01, E03).',
    situation: 'The Soviets must close and hold the ring, defeat the Romanian armies and stop the German relief. The Germans must hold Stalingrad and the airfields, keep the supply line open and relieve the pocket; their fuel and air supply are scarce. Start positions are approximate sector anchors; Italian 8th Army corps and divisions are not included (not retrieved).' },
  playableNations: [{ nation: 'SOV', difficultyRating: 3, summary: 'Three fronts: encircle the 6th Army and stop the relief.', objectiveIds: O('allies') },
    { nation: 'GER', difficultyRating: 5, summary: 'Hold the pocket and break the ring with scarce fuel and a failing airlift.', objectiveIds: O('axis') }],
  nations: NATIONS, locations, units, reinforcements, objectives: OBJ, terrainFile: TERRAIN_FILE, infraFile: INFRA_FILE,
  iceFromHour: 168, iceFullHour: 504, supplySources, initialControl: CTRL, weatherProfile: WEATHER, eventTemplateIds: EVENTS.map((x) => x.id), specialSystems: [],
  victoryTiers: { axis: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 }, allies: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 } },
  sources: SOURCES.map(({ id, citation, url }) => ({ id, citation, ...(url ? { url } : {}) })),
};
const uncertain = [
  { item: 'Order-of-battle depth', note: 'Soviet side is at corps/division/brigade level (E05, as of 19 Nov 1942). German 6th Army and Romanian armies are at corps/division level (E06), but E06 spans Sep 1942-Feb 1943: presence on 19 Nov of each German division is not confirmed by it. 4th Panzer Army: only the XLVIII Panzer Corps, 22nd Panzer and Romanian 1st Armoured (E01) are included; its other formations, the 11th Panzer, 17th Panzer, Army Detachment Hollidt and the 15th Luftwaffe Field Division are omitted (no arrival dates). Italian 8th Army: one army-level element only (corps/divisions not retrieved). Hungarian 2nd Army omitted.' },
  { item: 'Omitted Soviet sub-units', note: 'Fortified regions, anti-tank rifle battalions, armoured-car battalions, armoured trains, air armies, the Volga Flotilla and the Stalingrad air-defence corps are listed in E05 but omitted (positions and sizes unknown; no air or naval model).' },
  { item: 'All start positions', note: 'Approximate sector anchors (G03); not from any positional source. Soviet bridgeheads, the Stalingrad pocket sectors and the Romanian Don front are inferred from the place names in E01/E02/E05.' },
  { item: 'Air units', note: 'OMITTED: no sourced Luftwaffe or Soviet airfield order of battle and the airlift is an abstraction (see pool note).' },
  { item: 'Airlift / supply', note: 'E03: requirement 680 t/day, under 20% delivered, about 500 transports. No delivered tonnage per day, no Pitomnik data, no Volga ferry data. Modelled only by a German fuel/supply pool at 50% scale (G01) and by Tatsinskaya/Morozovsk as the only German supply sources; the pocket is cut off from them by terrain/enemy control, not by an airlift flow (engine gap, see docs/EASTERN_FRONT_RESEARCH.md).' },
  { item: 'River ice (iceFromHour 168, iceFullHour 504)', note: 'GAME-SCALE (G01), not sourced: ice begins on day 7 (26 Nov) and is load-bearing on day 21 (10 Dec). No thaw (iceThawHour unset) because the scenario ends in January. Needs a sourced Volga/Don freeze date to replace it.' },
  { item: 'Gumrak and Pitomnik airliftTonsPerDay 68 each', note: 'Upper bound derived from E03 (under 20% of 680 t/day delivered); the real delivered daily tonnage and the Pitomnik field are not in the sources read. Other airfields have no airlift field (unsourced).' },
  { item: 'Soviet Volga-bank supply source (krasnoslobodsk)', note: 'Position from E09 (Wikipedia coordinates). Beketovka is also a Soviet supply source (game-scale). Their role as a Soviet supply source is GAME-SCALE (G01), added so the Stalingrad Front mechanised corps are not cut from supply; no ferry, tonnage or crossing facts are sourced (E02 only says the defenders were pressed against the Volga).' },
  { item: 'Rivers', note: 'Terrain/infra rebuilt by map-engineer with OSM rivers (Chir, Myshkova, Don, Volga, etc.); river-flag cells make the Chir a real obstacle as in Dec 1942, so movement and probe results changed from earlier runs.' },
  { item: 'Gumrak/Pitomnik garrison and airlift split', note: 'The 60th Motorized Infantry Division (sourced OOB, E06) is anchored at Gumrak so the field is not empty at start; its position is approximate (G03) and no source places it there. Pitomnik position is from E10. Airlift cap 136 t/day (20% of 680, E03 bound) is split 68/68 between Gumrak and Pitomnik, a game-scale split.' },
  { item: 'Southern Soviet supply points (svetly_yar, tinguta)', note: 'Positions from OSM Nominatim (E08). Their role as Soviet supply sources is GAME-SCALE (G01): the southern Stalingrad Front start area was otherwise 100+ km from any source. No railhead or depot facts are sourced.' },
  { item: 'Stalingrad Front 51st/57th Army start positions', note: 'Moved north (to about 47.95N and 48.22N) from an earlier 47.4-47.95N placement that left 12 units more than 70 km from any Soviet supply source (permanently cut off). No source gives these positions; the new ones sit within about 20-50 km of the Tinguta/Svetly Yar supply points. Approximate (G03).' },
  { item: 'Link-up date conflict', note: 'E01 lead: ring closed late 22 Nov at Kalach; body: Kalach captured 22 Nov, link-up at Sovetsky about 16:00 on 23 Nov. Both are recorded as events (sg.ev.kalach, sg.ev.linkup); 23 Nov is used as the closure (more detailed).' },
  { item: 'Reinforcements', note: '2nd Guards Army (ready 15 Dec), 3rd Guards Army (Little Saturn 16 Dec), LVII Panzer Corps with 6th and 23rd Panzer (12 Dec): dates from E03; arrival points are approximate; 6th Panzer is said to have unloaded at Morozovsk but is placed at the proposed Kotelnikovo jump-off.' },
  { item: 'Locations', note: 'Coordinates from Wikipedia (E07) or OSM Nominatim (E08); Beketovka is the OSM aerodrome object (approximate); Pitomnik, Sovetsky, Nizhne-Chirskaya and Chernyshkovskaya omitted (no coordinate found). Gumrak uses the Volgograd airport position (modern).' },
  { item: 'Tatsinskaya date', note: '24 Dec used for the airfield loss; E03 gives no date in the text read.' },
  { item: 'Weather', note: 'Qualitative only (E02: temperatures tens of degrees below freezing); probabilities and temperatures are game-scale (G01). Volga/Don ice is not modelled.' },
  { item: 'Nation resources / strengths / morale', note: 'Game-scale (G01). Romanian morale/experience set low and Soviet 45/76; E01 supports only the qualitative statements (bombardment aimed at non-German units; Romanian rout).' },
];
const sidecar = { scenarioId: def.id, note: 'Per-fact source references.',
  units: Object.fromEntries(units.map((x, i) => [x.id, { sources: [...new Set([...U[i].srcs, ...(U[i].o.srcs ?? []), 'G01', 'G03'])], positionApproximate: true }])),
  locations: Object.fromEntries(LOC.map((l) => [l[0], { sources: [...new Set([...l[8], 'G02'])] }])),
  reinforcements: reinSrc, nations: Object.fromEntries(NATIONS.map((n) => [n.id, { sources: ['G01'], gameScale: true }])),
  objectives: Object.fromEntries(OBJ.map((o) => [o.id, { sources: ['E01', 'G01'] }])), uncertain };
writeFileSync(join(OUT, 'stalingrad.short.json'), JSON.stringify(def, null, 1) + '\n');
writeFileSync(join(OUT, 'stalingrad.short.sources.json'), JSON.stringify(sidecar, null, 1) + '\n');
writeFileSync(join(OUT, 'stalingrad.events.json'), JSON.stringify({ campaignId: 'stalingrad', note: 'Historical event template data. Sources resolve against scenario sources[].', events: EVENTS.map((x) => ({ ...x, kind: 'historical', minutesFromStd: mins(x.date) })) }, null, 1) + '\n');
for (const x of [...units, ...locations, ...reinforcements.map((r) => r.unit)]) if (!inBox(x.pos)) console.error('OUT OF BBOX', x.id, x.pos);
console.log('units', units.length, 'reinforcements', reinforcements.length, 'locations', locations.length);
