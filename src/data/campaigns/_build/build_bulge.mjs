// Generator for src/data/campaigns/bulge.short.json (+ .sources.json, .events.json).
// Run:  node src/data/campaigns/_build/build_bulge.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './bulge_sources.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EPOCH = Date.parse('1944-12-16T00:00:00Z');
const END_ISO = '1945-01-25T00:00:00Z';
const mins = (iso) => Math.round((Date.parse(iso) - EPOCH) / 60000);
const TICKS = mins(END_ISO) / 60;
const BBOX = { west: 4.5, south: 49.5, east: 7.5, north: 51.0 };
const inBox = ([lon, lat]) => lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;

// ───────── Locations [id, name, kind, lon, lat, owner, originalOwner, value, srcs] (G02) ─────────
const LOC = [
  ['bastogne', 'Bastogne', 'town', 5.72, 50.00, 'USA', 'USA', 9, ['B05', 'B07']],
  ['st_vith', 'St. Vith', 'town', 6.13, 50.28, 'USA', 'USA', 7, ['B04', 'B08']],
  ['malmedy', 'Malmedy', 'town', 6.03, 50.42, 'USA', 'USA', 5, ['B02', 'B04']],
  ['stavelot', 'Stavelot', 'town', 5.93, 50.39, 'USA', 'USA', 5, ['B02']],
  ['trois_ponts', 'Trois-Ponts', 'bridge', 5.87, 50.37, 'USA', 'USA', 4, ['B02']],
  ['stoumont', 'Stoumont', 'town', 5.80, 50.40, 'USA', 'USA', 3, ['B02']],
  ['la_gleize', 'La Gleize', 'town', 5.90, 50.40, 'USA', 'USA', 3, ['B02']],
  ['houffalize', 'Houffalize', 'town', 5.79, 50.13, 'USA', 'USA', 4, ['B02']],
  ['la_roche', 'La Roche-en-Ardenne', 'town', 5.58, 50.18, 'USA', 'USA', 3, ['B04']],
  ['vielsalm', 'Vielsalm', 'town', 5.92, 50.28, 'USA', 'USA', 3, ['B04']],
  ['marche', 'Marche-en-Famenne', 'town', 5.34, 50.23, 'USA', 'USA', 4, ['G02']],
  ['noville', 'Noville', 'town', 5.77, 50.08, 'USA', 'USA', 2, ['B05', 'B07']],
  ['longvilly', 'Longvilly', 'town', 5.80, 50.02, 'USA', 'USA', 2, ['B05']],
  ['assenois', 'Assenois', 'town', 5.68, 49.90, 'USA', 'USA', 2, ['B05']],
  ['elsenborn', 'Elsenborn Ridge', 'fortress', 6.22, 50.46, 'USA', 'USA', 8, ['B02', 'B03']],
  ['krinkelt_rocherath', 'Krinkelt-Rocherath', 'town', 6.20, 50.43, 'USA', 'USA', 4, ['B03']],
  ['bullingen', 'Büllingen', 'town', 6.26, 50.41, 'USA', 'USA', 3, ['B03']],
  ['lanzerath', 'Lanzerath', 'town', 6.22, 50.37, 'USA', 'USA', 3, ['B03']],
  ['hofen', 'Höfen', 'town', 6.22, 50.56, 'GER', 'GER', 3, ['B03']],
  ['monschau', 'Monschau', 'town', 6.24, 50.55, 'USA', 'GER', 4, ['B03']],
  ['spa', 'Spa', 'town', 5.87, 50.49, 'USA', 'USA', 3, ['G02']],
  ['verviers', 'Verviers', 'town', 5.86, 50.59, 'USA', 'USA', 4, ['G02']],
  ['eupen', 'Eupen', 'town', 6.03, 50.63, 'USA', 'USA', 3, ['G02']],
  ['liege', 'Liège', 'city', 5.57, 50.63, 'USA', 'USA', 9, ['B02', 'B11']],
  ['huy', 'Huy (Meuse bridges)', 'bridge', 5.24, 50.52, 'GBR', 'GBR', 5, ['B11']],
  ['namur', 'Namur (Meuse bridges)', 'bridge', 4.87, 50.47, 'GBR', 'GBR', 7, ['B02', 'B11']],
  ['dinant', 'Dinant (Meuse bridges)', 'bridge', 4.91, 50.26, 'GBR', 'GBR', 7, ['B02', 'B11']],
  ['givet', 'Givet (Meuse bridges)', 'bridge', 4.83, 50.14, 'FRA', 'FRA', 5, ['B02']],
  ['foy_notre_dame', 'Foy-Notre-Dame', 'town', 5.02, 50.22, 'USA', 'USA', 4, ['B02']],
  ['arlon', 'Arlon', 'town', 5.82, 49.68, 'USA', 'USA', 3, ['G02']],
  ['clervaux', 'Clervaux', 'town', 6.03, 50.05, 'USA', 'NEUTRAL', 4, ['B05']],
  ['wiltz', 'Wiltz', 'town', 5.93, 49.97, 'USA', 'NEUTRAL', 3, ['B05']],
  ['diekirch', 'Diekirch', 'town', 6.17, 49.87, 'USA', 'NEUTRAL', 2, ['G02']],
  ['echternach', 'Echternach', 'town', 6.42, 49.81, 'USA', 'NEUTRAL', 3, ['G02']],
  ['luxembourg_city', 'Luxembourg City', 'city', 6.13, 49.61, 'USA', 'NEUTRAL', 7, ['G02']],
  ['pruem', 'Prüm', 'town', 6.42, 50.21, 'GER', 'GER', 3, ['G02']],
  ['schleiden', 'Schleiden', 'town', 6.47, 50.53, 'GER', 'GER', 2, ['G02']],
  ['bitburg', 'Bitburg', 'town', 6.53, 49.97, 'GER', 'GER', 3, ['G02']],
  ['trier', 'Trier', 'city', 6.64, 49.76, 'GER', 'GER', 5, ['G02']],
  ['euskirchen', 'Euskirchen', 'town', 6.79, 50.66, 'GER', 'GER', 4, ['G02']],
  ['maastricht', 'Maastricht', 'city', 5.69, 50.85, 'NED', 'NED', 4, ['G02']],
  ['af_sint_truiden', 'Sint-Truiden airfield (A-92)', 'airfield', 5.20, 50.79, 'BEL', 'BEL', 2, ['B12', 'G02']],
  ['af_asch', 'Asch airfield (Y-29)', 'airfield', 5.55, 50.98, 'BEL', 'BEL', 2, ['B12', 'G02']],
  // Fuel (B06, B09): contents conflict between sources; values/capacities are game-scale (G01)
  ['bullingen_fuel', 'Büllingen fuel dump', 'depot', 6.27, 50.40, 'USA', 'USA', 4, ['B02', 'B09']],
  ['stavelot_fuel', 'Stavelot-La Gleize fuel dump (contents uncertain)', 'depot', 5.90, 50.43, 'USA', 'USA', 5, ['B09']],
];

// ───────── Anchors (G03) ─────────
const A = {
  GER_HQ: [6.75, 50.6], G6A: [6.6, 50.45], G5A: [6.7, 50.15], G7A: [6.8, 49.85],
  ISS: [6.5, 50.48], N_LOSH: [6.42, 50.4], N_HOLL: [6.4, 50.47], N_HOF: [6.38, 50.58], N_WAHL: [6.43, 50.52], PEIPER: [6.42, 50.35], FJ3: [6.33, 50.34],
  LXVI: [6.3, 50.26], LXVI2: [6.3, 50.17], LVIII: [6.36, 50.12], XLVII: [6.38, 50.0], XLVII_R: [6.55, 50.05],
  SA_FJ: [6.45, 49.93], SA_352: [6.5, 49.85], SA_212: [6.5, 49.78],
  IISS: [6.9, 50.42], REAR5: [6.85, 50.2], SKORZ: [6.55, 50.28],
  US_HQ1: [5.87, 50.49], VCORPS: [6.03, 50.63], N99: [6.27, 50.43], N2: [6.25, 50.49], N38: [6.24, 50.55], CAV14: [6.22, 50.34],
  VIII: [5.72, 50.0], D28: [6.03, 50.02], D106: [6.17, 50.25], CCB9: [6.05, 50.34], CCR9: [5.78, 50.0], D4: [6.32, 49.78],
  XXX: [5.0, 50.55],
};
// reinforcement anchors
const R = {
  ELSEN: [6.2, 50.45], VIELSALM: [5.92, 50.28], BASTOGNE: [5.72, 50.0], MALMEDY: [6.03, 50.42], WERBOMONT: [5.72, 50.35],
  NAMUR_DINANT: [4.88, 50.36], S_EDGE: [5.8, 49.56], FOY: [5.1, 50.2], BASTOGNE_E: [6.0, 50.0],
};

// ───────── Units [id, name, shortName, nation, type, parent, anchor|[lon,lat], srcs, opts] ─────────
const U = [];
const add = (id, name, sh, nation, type, parent, anc, srcs, opts = {}) => U.push({ id, name, sh, nation, type, parent, anc, srcs, opts });
const g = (id, nm, sh, type, parent, anc, srcs, o) => add(id, nm, sh, 'GER', type, parent, anc, srcs, o);
const u = (id, nm, sh, type, parent, anc, srcs, o) => add(id, nm, sh, 'USA', type, parent, anc, srcs, o);

g('ger.hq.hgb', 'Heeresgruppe B (Model)', 'HGr B', 'hq', null, 'GER_HQ', ['B01']);
g('ger.a6', '6. Panzerarmee (Dietrich)', '6.PzArmee', 'hq', 'ger.hq.hgb', 'G6A', ['B01', 'B03']);
g('ger.c.ISS', 'I. SS-Panzerkorps (Priess)', 'I.SS-PzK', 'hq', 'ger.a6', 'ISS', ['B01', 'B03']);
g('ger.1ss', '1. SS-Panzer-Division "Leibstandarte Adolf Hitler" (Mohnke)', '1.SS-PzD', 'armoured', 'ger.c.ISS', 'ISS', ['B01', 'B03']);
g('ger.kg.peiper', 'Kampfgruppe Peiper (1. SS-Panzer-Regiment)', 'KG Peiper', 'armoured', 'ger.1ss', 'PEIPER', ['B03', 'B09'], { mp: 5000 });
g('ger.12ss', '12. SS-Panzer-Division "Hitlerjugend" (Kraas)', '12.SS-PzD', 'armoured', 'ger.c.ISS', 'ISS', ['B01', 'B03']);
g('ger.3fj', '3. Fallschirmjäger-Division (Wadehn)', '3.FJD', 'infantry', 'ger.c.ISS', 'FJ3', ['B01', 'B03'], { exp: 40 });
g('ger.12vg', '12. Volksgrenadier-Division (Engel)', '12.VGD', 'infantry', 'ger.c.ISS', 'N_LOSH', ['B01', 'B03'], { exp: 45 });
g('ger.277vg', '277. Volksgrenadier-Division (Viebig)', '277.VGD', 'infantry', 'ger.c.ISS', 'N_HOLL', ['B01', 'B03'], { exp: 45 });
g('ger.150pzb', '150. Panzer-Brigade (Skorzeny) (Operation Greif)', '150.PzBrig', 'armoured', 'ger.a6', 'SKORZ', ['B01', 'B02'], { mp: 3500, exp: 40 });
g('ger.c.LXVII', 'LXVII. Armeekorps (Hitzfeld)', 'LXVII.AK', 'hq', 'ger.a6', 'N_HOF', ['B01', 'B03']);
g('ger.326vg', '326. Volksgrenadier-Division (Kaschner)', '326.VGD', 'infantry', 'ger.c.LXVII', 'N_HOF', ['B01', 'B03'], { exp: 45 });
g('ger.272vg', '272. Volksgrenadier-Division (König)', '272.VGD', 'infantry', 'ger.c.LXVII', 'N_WAHL', ['B01', 'B03'], { exp: 45 });
g('ger.c.IISS', 'II. SS-Panzerkorps (Bittrich)', 'II.SS-PzK', 'hq', 'ger.a6', 'IISS', ['B01', 'B06']);
g('ger.2ss', '2. SS-Panzer-Division "Das Reich" (Lammerding)', '2.SS-PzD', 'armoured', 'ger.c.IISS', 'IISS', ['B01', 'B06']);
g('ger.9ss', '9. SS-Panzer-Division "Hohenstaufen" (Stadler)', '9.SS-PzD', 'armoured', 'ger.c.IISS', 'IISS', ['B01', 'B04', 'B06']);
g('ger.a5', '5. Panzerarmee (v. Manteuffel)', '5.PzArmee', 'hq', 'ger.hq.hgb', 'G5A', ['B01']);
g('ger.c.LXVI', 'LXVI. Armeekorps (Lucht)', 'LXVI.AK', 'hq', 'ger.a5', 'LXVI', ['B01', 'B04']);
g('ger.18vg', '18. Volksgrenadier-Division (Hoffmann-Schönborn)', '18.VGD', 'infantry', 'ger.c.LXVI', 'LXVI', ['B01', 'B04'], { exp: 45 });
g('ger.62vg', '62. Volksgrenadier-Division (Kittel)', '62.VGD', 'infantry', 'ger.c.LXVI', 'LXVI2', ['B01', 'B04'], { exp: 45 });
g('ger.c.LVIII', 'LVIII. Panzerkorps (Krüger)', 'LVIII.PzK', 'hq', 'ger.a5', 'LVIII', ['B01']);
g('ger.116pz', '116. Panzer-Division (v. Waldenburg)', '116.PzD', 'armoured', 'ger.c.LVIII', 'LVIII', ['B01', 'B04']);
g('ger.560vg', '560. Volksgrenadier-Division (Langhauser)', '560.VGD', 'infantry', 'ger.c.LVIII', 'LVIII', ['B01'], { exp: 45 });
g('ger.c.XLVII', 'XLVII. Panzerkorps (v. Lüttwitz)', 'XLVII.PzK', 'hq', 'ger.a5', 'XLVII', ['B01', 'B05']);
g('ger.2pz', '2. Panzer-Division (v. Lauchert)', '2.PzD', 'armoured', 'ger.c.XLVII', 'XLVII', ['B01', 'B05', 'B06']);
g('ger.pzl', 'Panzer-Lehr-Division (Bayerlein)', 'Pz-Lehr', 'armoured', 'ger.c.XLVII', 'XLVII', ['B01', 'B05']);
g('ger.26vg', '26. Volksgrenadier-Division (Kokott)', '26.VGD', 'infantry', 'ger.c.XLVII', 'XLVII', ['B01', 'B05'], { exp: 45 });
g('ger.fbb', 'Führer-Begleit-Brigade (Remer)', 'FBB', 'armoured', 'ger.c.XLVII', 'REAR5', ['B01', 'B04', 'B05'], { mp: 6000 });
g('ger.a7', '7. Armee (Brandenberger)', '7.Armee', 'hq', 'ger.hq.hgb', 'G7A', ['B01']);
g('ger.c.LXXXV', 'LXXXV. Armeekorps (Kniess)', 'LXXXV.AK', 'hq', 'ger.a7', 'SA_FJ', ['B01']);
g('ger.5fj', '5. Fallschirmjäger-Division (Heilmann)', '5.FJD', 'infantry', 'ger.c.LXXXV', 'SA_FJ', ['B01', 'B05'], { exp: 40 });
g('ger.352vg', '352. Volksgrenadier-Division (Schmidt)', '352.VGD', 'infantry', 'ger.c.LXXXV', 'SA_352', ['B01'], { exp: 45 });
g('ger.c.LXXX', 'LXXX. Armeekorps (Beyer)', 'LXXX.AK', 'hq', 'ger.a7', 'SA_212', ['B01']);
g('ger.212vg', '212. Volksgrenadier-Division (Sensfuss)', '212.VGD', 'infantry', 'ger.c.LXXX', 'SA_212', ['B01'], { exp: 45 });

u('usa.hq.1a', 'US First Army (Hodges)', 'First Army', 'hq', null, 'US_HQ1', ['B01', 'B02']);
u('usa.c.V', 'V Corps (Gerow)', 'V Corps', 'hq', 'usa.hq.1a', 'VCORPS', ['B01']);
u('usa.99id', '99th Infantry Division (Lauer)', '99th ID', 'infantry', 'usa.c.V', 'N99', ['B01', 'B03']);
u('usa.2id', '2nd Infantry Division (Robertson)', '2nd ID', 'infantry', 'usa.c.V', 'N2', ['B01', 'B03']);
u('usa.38cav', '38th Cavalry Squadron', '38th Cav', 'recon', 'usa.c.V', 'N38', ['B03']);
u('usa.14cavg', '14th Cavalry Group', '14th CavGp', 'recon', 'usa.c.VIII', 'CAV14', ['B03', 'B04']);
u('usa.c.VIII', 'VIII Corps (Middleton)', 'VIII Corps', 'hq', 'usa.hq.1a', 'VIII', ['B01', 'B05']);
u('usa.28id', '28th Infantry Division (Cota)', '28th ID', 'infantry', 'usa.c.VIII', 'D28', ['B01', 'B05']);
u('usa.106id', '106th Infantry Division (Jones)', '106th ID', 'infantry', 'usa.c.VIII', 'D106', ['B01', 'B04', 'B08'], { exp: 20, morale: 65 });
u('usa.9ad.ccb', 'Combat Command B, 9th Armored Division (Hoge)', 'CCB/9AD', 'armoured', 'usa.c.VIII', 'CCB9', ['B04'], { mp: 4500 });
u('usa.9ad.ccr', 'Combat Command Reserve, 9th Armored Division (Gilbreth)', 'CCR/9AD', 'armoured', 'usa.c.VIII', 'CCR9', ['B05'], { mp: 4000 });
u('usa.4id', '4th Infantry Division (Barton)', '4th ID', 'infantry', 'usa.c.VIII', 'D4', ['B01']);
u('usa.xxx.hq', 'British XXX Corps (Horrocks)', 'XXX Corps', 'hq', null, 'XXX', ['B01', 'B11']);
U[U.length - 1].nation = 'GBR';

// Allied fighter groups at wing/group level (B12; basing documented for 1 Jan 1945 only; 36 aircraft = game-scale G01)
for (const [id, nm, sh, af] of [['usa.air.48fg', '48th Fighter Group (USAAF)', '48th FG', 'af_sint_truiden'], ['usa.air.404fg', '404th Fighter Group (USAAF)', '404th FG', 'af_sint_truiden'], ['usa.air.352fg', '352nd Fighter Group (USAAF)', '352nd FG', 'af_asch'], ['usa.air.366fg', '366th Fighter Group (USAAF)', '366th FG', 'af_asch']]) add(id, nm, sh, 'USA', 'air_fighter', null, LOC.find((l) => l[0] === af).slice(3, 5), ['B12'], { air: true });

// reinforcements: [unit id, ISO time, pos, srcs]
const REINF = [
  ['usa.1id', '1944-12-17T00:00:00Z', R.ELSEN, 'US 1st Infantry Division (Andrus) - 26th Infantry reached Elsenborn from 16/17 Dec', 'infantry', 'USA', '1st ID', ['B01', 'B03'], true],
  ['usa.7ad', '1944-12-17T08:00:00Z', R.VIELSALM, '7th Armored Division (Hasbrouck)', 'armoured', 'USA', '7th AD', ['B01', 'B04'], false],
  ['usa.10ad.ccb', '1944-12-18T00:00:00Z', R.BASTOGNE, 'Combat Command B, 10th Armored Division (Roberts)', 'armoured', 'USA', 'CCB/10AD', ['B05', 'B07'], true, 4500],
  ['usa.30id', '1944-12-18T12:00:00Z', R.MALMEDY, '30th Infantry Division (Hobbs)', 'infantry', 'USA', '30th ID', ['B01', 'B04'], true],
  ['usa.82abn', '1944-12-19T12:00:00Z', R.WERBOMONT, '82nd Airborne Division (Gavin)', 'paratroop', 'USA', '82nd Abn', ['B01', 'B04'], true],
  ['usa.101abn', '1944-12-19T06:00:00Z', R.BASTOGNE, '101st Airborne Division (McAuliffe)', 'paratroop', 'USA', '101st Abn', ['B01', 'B05', 'B07'], false],
  // US reinforcing divisions listed in the B01 order of battle; B02 gives only AGGREGATE counts (Allied infantry divisions 6 on 16 Dec, 15 on 24 Dec, 22 on 2 Jan; armoured 2, 6, 8).
  // Individual arrival dates and arrival areas below are taken from the B13 unit articles where they state a date (26th ID, 6th AD, 87th ID); the 3rd AD, 75th, 78th, 80th, 84th, 35th and 90th were DROPPED because no arrival date was found. Arrival AREAS and the remaining dates (7th AD, 10th AD CCB, 30th, 82nd, 101st, 4th AD, 2nd AD, 15. PzGrD, 29 Armd Bde) are approximate.
  ['usa.26id', '1944-12-21T12:00:00Z', [5.7, 49.57], '26th Infantry Division (moved to Luxembourg 19-21 Dec)', 'infantry', 'USA', '26th ID', ['B01', 'B13'], true],
  ['usa.6ad', '1944-12-23T12:00:00Z', [6.0, 49.57], '6th Armored Division (ordered north 23 Dec)', 'armoured', 'USA', '6th AD', ['B01', 'B13'], true],
  ['usa.87id', '1944-12-29T12:00:00Z', [5.45, 49.6], '87th Infantry Division (committed 29 Dec)', 'infantry', 'USA', '87th ID', ['B01', 'B13'], true],
  ['gbr.29arm', '1944-12-19T12:00:00Z', R.NAMUR_DINANT, '29th Armoured Brigade (Harvey)', 'armoured', 'GBR', '29 Armd Bde', ['B01', 'B11'], true, 3500],
  ['usa.4ad', '1944-12-22T06:00:00Z', R.S_EDGE, '4th Armored Division (Gaffey)', 'armoured', 'USA', '4th AD', ['B01', 'B05', 'B07'], true],
  ['usa.2ad', '1944-12-23T12:00:00Z', R.FOY, '2nd Armored Division (Harmon)', 'armoured', 'USA', '2nd AD', ['B01', 'B02'], true],
  ['ger.15pg', '1944-12-24T12:00:00Z', R.BASTOGNE_E, '15. Panzergrenadier-Division (Deckert)', 'motorised', 'GER', '15.PzGrD', ['B01', 'B05'], true],
];

// ───────── Unit construction (G01 game scale) ─────────
const T = {
  hq: { mp: 600, eq: { rifle: 600 } }, infantry: { mp: 13000, eq: { rifle: 100, gun_arty: 50, gun_at: 30 } },
  motorised: { mp: 12000, eq: { rifle: 80, gun_arty: 40, truck: 60 } },
  armoured: { mp: 12000, eq: { tank_medium: 100, tank_light: 20, gun_arty: 24, truck: 60 } },
  recon: { mp: 3000, eq: { rifle: 40, armoured_car: 30 } }, paratroop: { mp: 9000, eq: { rifle: 90, gun_arty: 30, gun_at: 12 } },
};
const NAT = { GER: { side: 'axis', exp: 55, morale: 78 }, USA: { side: 'allies', exp: 55, morale: 75 }, GBR: { side: 'allies', exp: 65, morale: 80 }, BEL: { side: 'allies', exp: 40, morale: 70 } };
const spread = (anchor, k) => [Math.round((anchor[0] + ((k % 4) - 1.5) * 0.04) * 1000) / 1000, Math.round((anchor[1] + (Math.floor(k / 4) % 3 - 1) * 0.03) * 1000) / 1000];
const mkUnit = (id, name, shortName, nation, type, parentId, pos, mp, o = {}) => {
  if (o.air) {
    const n = NAT[nation], held = { aircraft_fighter: 36 };
    return { id, name, shortName, nation, side: n.side, type, domain: 'air', pos, manpower: 432, manpowerMax: 432, equipment: { held, authorised: { ...held } }, organisation: 90, morale: n.morale, experience: n.exp, fuel: 100, ammo: 100, supply: 100, fatigue: 0, readiness: 90, entrenchment: 0, moveStatus: 'stationary', combatStatus: 'idle', posture: 'defend', orders: [], kills: 0 };
  }
  const t = T[type], n = NAT[nation];
  const max = mp ?? t.mp;
  const held = { ...t.eq };
  return {
    id, name, shortName, nation, side: n.side, type, domain: 'land', ...(parentId ? { parentId } : {}), pos,
    manpower: max, manpowerMax: max, equipment: { held, authorised: { ...held } },
    organisation: 90, morale: o.morale ?? n.morale, experience: o.exp ?? n.exp, fuel: 100, ammo: 100, supply: 100, fatigue: 5, readiness: 90,
    entrenchment: nation === 'GER' ? 0 : 15, moveStatus: 'stationary', combatStatus: 'idle', posture: nation === 'GER' ? 'hold' : 'defend', orders: [], kills: 0,
  };
};
const cnt = {};
const units = U.map((r) => {
  const k = Array.isArray(r.anc) ? 0 : (cnt[r.anc] = (cnt[r.anc] ?? -1) + 1);
  return mkUnit(r.id, r.name, r.sh, r.nation, r.type, r.parent, (Array.isArray(r.anc) ? r.anc : spread(A[r.anc], k)), r.opts.mp, r.opts);
});
const reinforcements = REINF.map(([id, iso, pos, name, type, nation, sh, , approx, mp]) => {
  const unit = mkUnit(id, name, sh, nation, type, null, [...pos], mp);
  unit.organisation = 75; unit.fatigue = 15; unit.readiness = 75;
  if (type === 'paratroop') unit.entrenchment = 0;
  void approx;
  return { id: `reinf.${id}`, atMinutes: mins(iso), pos: [...pos], unit };
});
const unitSrc = Object.fromEntries([...U.map((r) => [r.id, r.srcs]), ...REINF.map((r) => [r[0], r[7]])]);
const reinfApprox = Object.fromEntries(REINF.map((r) => [`reinf.${r[0]}`, { sources: [...r[7], 'G03'], approximate: r[8] }]));

// ───────── Nations ─────────
const NATIONS = (() => {
  const mpOf = (n) => [...units, ...reinforcements.map((r) => r.unit)].filter((x) => x.nation === n).reduce((a, x) => a + x.manpowerMax, 0);
  const c = (n) => [...units, ...reinforcements.map((r) => r.unit)].filter((x) => x.nation === n).length;
  const pool = (n, fuelScale = 1) => ({
    resources: { manpower: Math.max(2000, Math.round(mpOf(n) * 0.15)), fuel: Math.max(1500, Math.round(c(n) * 40 * fuelScale)), ammo: Math.max(1500, c(n) * 50), equipment: Math.max(1500, c(n) * 100), supplyPoints: 600 },
    income: { manpower: Math.max(2, Math.ceil(mpOf(n) * 0.3 / TICKS)), fuel: Math.max(1, Math.ceil(c(n) * 0.15 * fuelScale)), ammo: Math.max(2, Math.ceil(c(n) * 0.2)), equipment: Math.max(2, Math.ceil(c(n) * 0.4)), supplyPoints: 5 },
  });
  return [
    ['GER', 'axis', 'Germany', true, 0.4], ['USA', 'allies', 'United States', true, 1], ['GBR', 'allies', 'United Kingdom (XXX Corps)', true, 1],
    ['BEL', 'allies', 'Belgium', false, 1], ['FRA', 'allies', 'France', false, 1], ['NED', 'allies', 'Netherlands', false, 1],
  ].map(([id, side, name, playable, fs]) => ({ id, side, name, playable, ...pool(id, fs), reinforcements: [] }));
})();

// ───────── Objectives ─────────
const END = mins(END_ISO);
const ob = (id, tier, side, title, description, condition, points) => ({ id, tier, side, title, description, condition, points, status: 'pending' });
const OBJ = [
  ob('o.ger.bastogne', 'primary', 'axis', 'Take Bastogne', 'Capture the road hub at Bastogne (seven roads converge there, B07).', { kind: 'capture_location', locationId: 'bastogne' }, 150),
  ob('o.ger.stvith', 'secondary', 'axis', 'Take St. Vith', 'Capture St. Vith, the key road junction.', { kind: 'capture_location', locationId: 'st_vith' }, 100),
  ob('o.ger.stavelot', 'secondary', 'axis', 'Break through at Stavelot', 'Capture Stavelot and the fuel stores beyond it.', { kind: 'capture_location', locationId: 'stavelot' }, 60),
  ob('o.ger.elsenborn', 'secondary', 'axis', 'Overrun Elsenborn Ridge', 'Capture the ridge that blocks the northern shoulder.', { kind: 'capture_location', locationId: 'elsenborn' }, 100),
  ob('o.ger.dinant', 'primary', 'axis', 'Reach the Meuse at Dinant', 'Capture Dinant and its Meuse bridges.', { kind: 'capture_location', locationId: 'dinant' }, 200),
  ob('o.ger.namur', 'secondary', 'axis', 'Seize Namur', 'Capture the Meuse crossings at Namur.', { kind: 'capture_location', locationId: 'namur' }, 100),
  ob('o.ger.huy', 'secondary', 'axis', 'Seize Huy', 'Capture the Meuse crossings at Huy.', { kind: 'capture_location', locationId: 'huy' }, 80),
  ob('o.ger.liege', 'strategic', 'axis', 'Stretch goal: Liège and beyond', 'Capture Liège, opening the road to Antwerp (Hitler\'s objective, B02; Antwerp lies outside this map).', { kind: 'capture_location', locationId: 'liege' }, 250),
  ob('o.ger.region', 'strategic', 'axis', 'Carve out the salient', 'Control 45% of the theatre.', { kind: 'control_fraction', fraction: 0.45 }, 150),
  ob('o.all.elsenborn', 'primary', 'allies', 'Hold Elsenborn Ridge', 'Hold the northern shoulder to the end (B02).', { kind: 'hold_location', locationId: 'elsenborn', untilMinutes: END }, 150),
  ob('o.all.bastogne', 'primary', 'allies', 'Hold Bastogne', 'Keep Bastogne until the end.', { kind: 'hold_location', locationId: 'bastogne', untilMinutes: END }, 200),
  ob('o.all.stvith', 'secondary', 'allies', 'Delay at St. Vith', 'Hold St. Vith until 21 Dec (evacuated on that date historically, B08).', { kind: 'hold_location', locationId: 'st_vith', untilMinutes: mins('1944-12-21T00:00:00Z') }, 80),
  ob('o.all.meuse', 'primary', 'allies', 'Deny the Meuse', 'Hold Dinant, the key Meuse crossing.', { kind: 'hold_location', locationId: 'dinant', untilMinutes: END }, 200),
  ob('o.all.namur', 'secondary', 'allies', 'Hold Namur', 'Hold the Namur crossings.', { kind: 'hold_location', locationId: 'namur', untilMinutes: END }, 80),
  ob('o.all.huy', 'secondary', 'allies', 'Hold Huy', 'Hold the Huy crossings.', { kind: 'hold_location', locationId: 'huy', untilMinutes: END }, 60),
  ob('o.all.liege', 'strategic', 'allies', 'Protect Liège', 'Keep Liège in Allied hands.', { kind: 'hold_location', locationId: 'liege', untilMinutes: END }, 150),
  ob('o.all.attrition', 'secondary', 'allies', 'Grind down the offensive', 'Destroy a third of the German units; the offensive was exhausted by attrition and fuel shortage (B02, B06).', { kind: 'destroy_units', side: 'axis', fraction: 0.33 }, 150),
  ob('o.all.fuel', 'secondary', 'allies', 'Deny the fuel', 'Keep the Büllingen fuel dump out of German hands.', { kind: 'hold_location', locationId: 'bullingen_fuel', untilMinutes: mins('1944-12-18T00:00:00Z') }, 60),
];

// ───────── Weather (B10 qualitative; temps game-scale) ─────────
const WEATHER = [
  { month: 12, probs: { fog: 0.3, cloud: 0.3, snow: 0.2, clear: 0.1, rain: 0.1 }, tempC: -1 },
  { month: 1, probs: { snow: 0.25, cloud: 0.3, fog: 0.15, clear: 0.25, rain: 0.05 }, tempC: -5 },
];

// ───────── Control polygons (G04) ─────────
const bb = [[4.5, 49.5], [7.5, 49.5], [7.5, 51.0], [4.5, 51.0]];
const CTRL = [
  { nation: 'NEUTRAL', polygon: bb },
  { nation: 'FRA', polygon: [[4.5, 50.0], [4.83, 50.14], [5.0, 49.95], [5.4, 49.55], [5.8, 49.5], [4.5, 49.5]] },
  { nation: 'BEL', polygon: [[4.5, 51.0], [5.5, 51.0], [5.7, 50.75], [6.03, 50.75], [6.15, 50.62], [6.2, 50.5], [6.35, 50.4], [6.4, 50.32], [6.13, 50.13], [5.97, 50.0], [5.82, 49.8], [5.8, 49.55], [5.4, 49.55], [5.0, 49.95], [4.83, 50.14], [4.5, 50.0]] },
  { nation: 'NED', polygon: [[5.5, 51.0], [5.7, 50.75], [6.03, 50.75], [6.1, 51.0]] },
  { nation: 'USA', polygon: [[6.13, 50.13], [6.3, 49.97], [6.42, 49.81], [6.37, 49.5], [5.8, 49.5], [5.8, 49.55], [5.82, 49.8], [5.97, 50.0]] },
  { nation: 'GER', polygon: [[6.1, 51.0], [6.03, 50.75], [6.15, 50.62], [6.2, 50.5], [6.35, 50.4], [6.4, 50.32], [6.13, 50.13], [6.3, 49.97], [6.42, 49.81], [6.37, 49.5], [7.5, 49.5], [7.5, 51.0]] },
];

// ───────── Events ─────────
const EVENTS = [
  { id: 'bulge.ev.offensive', date: '1944-12-16T05:30:00Z', title: 'Wacht am Rhein: the German offensive begins', body: 'A 90-minute barrage from about 1,600 guns opens the German offensive along a 130 km front. Thick overcast, fog and snow keep Allied aircraft grounded. Skorzeny\'s 150th Panzer Brigade stands ready for Operation Greif.', pos: [6.3, 50.35], src: ['B02', 'B10'], effects: [{ op: 'weather', kind: 'fog', intensity: 0.8, durationMinutes: 7 * 1440 }], effectsNote: 'Restates B10: overcast, fog and snow grounded Allied aircraft 16-22 Dec.', effectHints: [] },
  { id: 'bulge.ev.bullingen', date: '1944-12-17T06:00:00Z', title: 'Peiper captures fuel at Büllingen; Malmedy massacre', body: 'Kampfgruppe Peiper seizes an American fuel depot at Büllingen and refuels its tanks; later at Malmedy crossroads at least 84 American prisoners are killed.', pos: [6.26, 50.4], src: ['B02', 'B03', 'B09'], effectHints: ['German fuel relief if Büllingen depot captured'] },
  { id: 'bulge.ev.stavelot', date: '1944-12-18T00:00:00Z', title: 'Peiper takes Stavelot; Trois-Ponts bridge blown', body: 'Peiper\'s column takes Stavelot, but US engineers blow the bridge at Trois-Ponts. Stoumont falls the next day.', pos: [5.93, 50.39], src: ['B02'], effectHints: [] },
  { id: 'bulge.ev.meuse_order', date: '1944-12-19T00:00:00Z', title: 'Montgomery orders the Meuse bridges held', body: 'Montgomery orders the Meuse bridges at Givet, Dinant and Namur held; XXX Corps is ordered to hold the Meuse as a stop-line and the 29th Armoured Brigade moves to the Namur-Dinant sector. The 101st Airborne reaches Bastogne.', pos: [4.91, 50.26], src: ['B02', 'B11'], effectHints: [] },
  { id: 'bulge.ev.schnee_eifel', date: '1944-12-19T00:00:00Z', title: 'Schnee Eifel surrender', body: 'About 7,000 American soldiers of the 106th Division surrender on the Schnee Eifel, the largest US defeat in the European Theater.', pos: [6.25, 50.25], side: 'allies', src: ['B08'], effectHints: [] },
  { id: 'bulge.ev.bastogne_cut', date: '1944-12-20T00:00:00Z', title: 'Bastogne cut off; Montgomery takes the northern shoulder', body: 'The roads into Bastogne are cut and the 101st Airborne is surrounded. Eisenhower places the US First and Ninth Armies under Montgomery.', pos: [5.72, 50.0], src: ['B02', 'B05'], effectHints: [] },
  { id: 'bulge.ev.st_vith_lost', date: '1944-12-21T00:00:00Z', title: 'St. Vith evacuated', body: 'On Montgomery\'s orders Brig. Gen. Clarke withdraws from St. Vith after delaying the German timetable.', pos: [6.13, 50.28], side: 'allies', src: ['B02', 'B08'], effectHints: [] },
  { id: 'bulge.ev.nuts', date: '1944-12-22T00:00:00Z', title: '"Nuts!"', body: 'The Germans demand the surrender of Bastogne. McAuliffe replies "NUTS!"', pos: [5.72, 50.0], src: ['B02', 'B07'], effectHints: [] },
  { id: 'bulge.ev.clearing', date: '1944-12-23T00:00:00Z', title: 'The weather clears', body: 'The skies clear and much colder air arrives. Allied air attacks begin and 241 transport aircraft drop supplies to Bastogne; Peiper breaks out from La Gleize.', pos: [5.72, 50.0], src: ['B02', 'B05', 'B10'], effects: [{ op: 'weather', kind: 'clear', intensity: 0.9, durationMinutes: 3 * 1440 }], effectsNote: 'Restates B02/B10: weather cleared on 23 Dec. The 3-day duration is a game-scale choice; sources disagree on when clear weather ended.', effectHints: [] },
  { id: 'bulge.ev.foy_notre_dame', date: '1944-12-24T00:00:00Z', title: 'High-water mark at Foy-Notre-Dame', body: 'The US 2nd Armored Division stops the German advance at Foy-Notre-Dame, short of the Meuse at Dinant. Manteuffel asks for a halt; Hitler refuses.', pos: [5.02, 50.22], src: ['B02'], effectHints: [] },
  { id: 'bulge.ev.relief', date: '1944-12-26T16:50:00Z', title: 'Bastogne relieved', body: 'Company D, 37th Tank Battalion, 4th Armored Division reaches Bastogne from the south, ending the siege. The German push to the Meuse is effectively over by 27 December.', pos: [5.68, 49.9], src: ['B02', 'B05', 'B07'], effectHints: [] },
  { id: 'bulge.ev.bodenplatte', date: '1945-01-01T00:00:00Z', title: 'Operation Bodenplatte', body: 'The Luftwaffe attacks Allied airfields; about 465 Allied aircraft are destroyed or damaged but the Luftwaffe loses 277 aircraft and is largely ineffective for the rest of the war.', src: ['B02'], effectHints: [] },
  { id: 'bulge.ev.counteroffensive', date: '1945-01-03T00:00:00Z', title: 'Montgomery\'s counter-offensive begins', body: 'The northern counter-offensive begins; Hitler agrees on 7/8 January to withdraw gradually from the tip of the salient.', pos: [5.9, 50.4], src: ['B02'], effectHints: [] },
  { id: 'bulge.ev.houffalize', date: '1945-01-16T00:00:00Z', title: 'First and Third Armies link up at Houffalize', body: 'The Third and First Armies link up with the capture of Houffalize; First Army returns to 12th Army Group command.', pos: [5.79, 50.13], src: ['B02'], effectHints: [] },
  { id: 'bulge.ev.sixth_army', date: '1945-01-22T00:00:00Z', title: 'Sixth Panzer Army cedes its sector', body: 'Sixth Panzer Army cedes its sector to Fifth Panzer Army.', src: ['B02'], side: 'axis', effectHints: [] },
  { id: 'bulge.ev.stvith_retaken', date: '1945-01-23T00:00:00Z', title: 'St. Vith recaptured', body: 'American forces recapture St. Vith.', pos: [6.13, 50.28], src: ['B02'], effectHints: [] },
  { id: 'bulge.ev.end', date: '1945-01-25T00:00:00Z', title: 'The Ardennes battle ends', body: 'The battle is considered ended on 25 January (the infobox of the primary source gives 28 January).', src: ['B02'], effectHints: [] },
];

// ───────── Assemble ─────────
const locations = LOC.filter((l) => inBox([l[3], l[4]])).map(([id, name, kind, lon, lat, owner, orig, value]) => ({
  id, name, kind, pos: [lon, lat], owner, originalOwner: orig, value,
  ...(kind === 'city' || kind === 'depot' ? { supplyCapacity: kind === 'depot' ? 40 : 20 } : {}),
}));
const locIds = new Set(locations.map((l) => l.id));
const supply = { GER: ['euskirchen', 'trier', 'pruem'], USA: ['liege', 'verviers', 'luxembourg_city', 'spa'], GBR: ['namur', 'huy'], BEL: [] };
for (const k of Object.keys(supply)) supply[k] = supply[k].filter((id) => locIds.has(id));
const O = (side) => OBJ.filter((o) => o.side === side).map((o) => o.id);
const def = {
  schema: 1, id: 'bulge.short', campaignId: 'bulge', title: 'Battle of the Bulge (16 Dec 1944 - 25 Jan 1945)', scale: 'short',
  startDate: '1944-12-16T00:00:00Z', endDate: END_ISO, bbox: BBOX, estimatedPlayMinutes: [60, 150], mapSize: 'medium', complexity: 3,
  briefing: {
    historical: 'In the early hours of 16 December 1944 Germany launched its last major offensive in the West through the Ardennes, aiming at the Meuse and the port of Antwerp (B02). Three German armies - Sixth Panzer, Fifth Panzer and Seventh - struck a thinly held, quiet sector. Stubborn defence at Elsenborn Ridge and Bastogne and the arrival of reinforcements broke the timetable; the weather cleared on 23 December, Bastogne was relieved on 26 December and the salient was reduced by late January. Reinforcement arrival points and some arrival days are approximate.',
    situation: 'Germany must break through the American line, seize the road hubs of St. Vith and Bastogne and reach the Meuse before Allied reserves and air power arrive; its fuel is scarce, so capturing American fuel dumps is vital. The Allies must hold the shoulders at Elsenborn and Bastogne, delay the panzers, keep the Meuse crossings at Dinant, Namur and Huy, and then counter-attack. Start positions are approximate sector anchors.',
  },
  playableNations: [
    { nation: 'GER', difficultyRating: 4, summary: 'Armoured breakthrough with scarce fuel against a thin line that will be reinforced day by day.', objectiveIds: O('axis') },
    { nation: 'USA', difficultyRating: 3, summary: 'Absorb the surprise, hold the shoulders and the hubs, then counter-attack.', objectiveIds: O('allies') },
    { nation: 'GBR', difficultyRating: 2, summary: 'Command XXX Corps on the Meuse: a stop-line behind the Americans.', objectiveIds: O('allies') },
  ],
  nations: NATIONS, locations, units, reinforcements, objectives: OBJ,
  terrainFile: 'terrain_ardennes.json', infraFile: 'infra_ardennes.json',
  supplySources: supply, initialControl: CTRL, weatherProfile: WEATHER,
  eventTemplateIds: EVENTS.map((e) => e.id), specialSystems: [],
  victoryTiers: { axis: { decisive: 0.9, strategic: 0.75, limited: 0.55, stalemate: 0.35 }, allies: { decisive: 0.75, strategic: 0.6, limited: 0.4, stalemate: 0.2 } },
  sources: SOURCES.map(({ id, citation, url }) => ({ id, citation, ...(url ? { url } : {}) })),
};

const uncertain = [
  { item: 'All unit start positions', note: 'Approximate sector anchors (G03); no source gives division start coordinates.' },
  { item: 'Order-of-battle snapshot', note: 'B01 reflects late-campaign assignments. Divisions not confirmed present on 16 Dec by B03-B05 were omitted: US 9th/78th/84th/75th/83rd Inf, 3rd/6th Armored, 17th Airborne, 87th/80th/26th/35th/90th Inf, German 9th Pz, 3rd PzGren, 246th/167th/340th/79th/9th/276th VGD, Fifteenth Army.' },
  { item: 'Reinforcement times', note: 'Day-level only (B02-B05); times of day and the dates for CCB 10th Armored (18 Dec), 30th ID (18 Dec), 82nd Abn (19 Dec), 4th Armored (22 Dec at the map edge), 2nd Armored (23 Dec) and 15th Panzergrenadier (24 Dec) are APPROXIMATE/unverified.' },
  { item: 'Added US reinforcing divisions', note: 'Only the 26th ID (21 Dec), 6th AD (23 Dec) and 87th ID (29 Dec) carry arrival dates from B13; the 3rd AD and the 75th, 78th, 80th, 84th, 35th and 90th were dropped because no arrival date could be sourced. All arrival AREAS are approximate (APPROXIMATE ARRIVAL), as are the days of the other reinforcements.' },
  { item: 'XXX Corps', note: 'Only the corps HQ and 29th Armoured Brigade (B11, snippet-level); 6th Airborne, 51st, 53rd Infantry, Guards Armoured, 43rd and 50th (listed in B01) omitted: no sourced Meuse deployment dates. XXX Corps HQ start position is approximate.' },
  { item: '4th Infantry Division, 28th Division sector', note: '4th ID is placed on the southern shoulder from B01 only (XII Corps in the late snapshot); 16 Dec corps assignment unverified. 9th Armored CCA omitted (not sourced).' },
  { item: 'CCB 9th Armored start position', note: 'B04 says it began moving to St. Vith about 20:00 on 16 Dec; its position at 00:00 is an approximation.' },
  { item: 'Fuel dumps', note: 'Büllingen depot capture is sourced (17 Dec); contents conflict (B09). The Stavelot-La Gleize depot figures (2-3 million gallons) conflict with an account that the Stavelot supplies were destroyed; no Francorchamps dump was found. Depot value/capacity are game-scale.' },
  { item: 'Air formations', note: 'Only four USAAF fighter groups (48th, 404th at Sint-Truiden; 352nd, 366th at Asch) at group level, from B12 which documents basing on 1 Jan 1945 only (weak for 16 Dec); 36 aircraft each is game-scale. Luftwaffe JG units omitted: no sourced German airfield coordinates; Melsbroek/Le Culot/Evere lie at or beyond the bbox edge or have no named group. Asch lies at the bbox north edge (approx).' },
  { item: 'Weather', note: 'Qualitative only (B10): probabilities and temperatures are game-scale. The clear period after 23 Dec is set to 3 days.' },
  { item: 'Antwerp', note: 'Antwerp lies outside the map bbox; the German stretch goal is Liège.' },
  { item: 'Locations', note: 'Coordinates +/-0.05 deg; Elsenborn Ridge and depots +/-0.1 deg. Luxembourg towns are USA-held with originalOwner NEUTRAL (no Luxembourg NationId).' },
  { item: 'Nation resources / strengths / experience / morale', note: 'Game-scale (G01). German fuel pool set to 40% of the normal per-unit scale to reflect the sourced shortage (B06). 106th Division experience/morale set low from B08 (new to the front).' },
];

const sidecar = {
  scenarioId: def.id,
  note: 'Per-fact source references (ScenarioDefinition has no per-unit sourceRef field).',
  units: Object.fromEntries(units.map((x) => [x.id, { sources: [...new Set([...(unitSrc[x.id] ?? []), 'G01', 'G03'])], positionApproximate: true }])),
  locations: Object.fromEntries(locations.map((l) => [l.id, { sources: [...new Set([...(LOC.find((r) => r[0] === l.id)?.[8] ?? []), 'G02'])] }])),
  reinforcements: reinfApprox,
  nations: Object.fromEntries(NATIONS.map((n) => [n.id, { sources: ['G01'], gameScale: true }])),
  objectives: Object.fromEntries(OBJ.map((o) => [o.id, { sources: ['B02', 'G01'] }])),
  aiDoctrineHints: {
    GER: {
      posture: 'attack', armour: 'breakthrough', note: 'Schwerpunkt: Sixth Panzer Army north (Elsenborn/Stavelot, Peiper), Fifth Panzer Army centre (St. Vith, Bastogne, then Meuse at Dinant), Seventh Army south shoulder.',
      captureLocations: ['st_vith', 'bastogne', 'stavelot', 'houffalize', 'marche', 'dinant', 'namur', 'huy', 'liege'],
      objectiveScheduleHours: { stavelot: 36, st_vith: 120, bastogne: 120, houffalize: 150, marche: 168, dinant: 192 }, fuelAwareness: 'prefer routes via bullingen_fuel and stavelot_fuel; low German fuel pool',
      sources: ['B02', 'B04', 'B05'],
    },
    allies: { posture: 'defend then counter-attack', priorities: ['elsenborn', 'bastogne', 'st_vith (until 21 Dec)', 'meuse bridges dinant/namur/huy'], counterAttackAfterHours: 432, counterAttackTargets: ['houffalize', 'st_vith'], sources: ['B02', 'B08'] },
  },
  uncertain,
};

writeFileSync(join(OUT, 'bulge.short.json'), JSON.stringify(def, null, 1) + '\n');
writeFileSync(join(OUT, 'bulge.short.sources.json'), JSON.stringify(sidecar, null, 1) + '\n');
writeFileSync(join(OUT, 'bulge.events.json'), JSON.stringify({ campaignId: 'bulge', note: 'Historical event template DATA. Sources resolve against scenario sources[].', events: EVENTS.map((e) => ({ ...e, kind: 'historical', minutesFromStd: mins(e.date) })) }, null, 1) + '\n');
console.log('units', units.length, 'reinforcements', reinforcements.length, 'locations', locations.length);
for (const x of [...units, ...reinforcements.map((r) => r.unit)]) if (!inBox(x.pos)) console.error('OUT OF BBOX', x.id, x.pos);
