// Generator for src/data/campaigns/fall_of_france.{standard,short}.json (+ .sources.json, .events.json).
// Run:  node src/data/campaigns/_build/build_fall_of_france.mjs
// All unit/location data is declared in compact tables below; every row carries source ids.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './sources_register.mjs';
import { AIRFIELDS, AIR } from './air_data.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EPOCH_STD = Date.parse('1940-05-10T00:00:00Z');
const mins = (iso, epoch = EPOCH_STD) => Math.round((Date.parse(iso) - epoch) / 60000);

// ───────────────────────── Locations (G02 coordinates) ─────────────────────────
// [id, name, kind, lon, lat, owner, value, src[]]
const LOC = [
  ['paris', 'Paris', 'city', 2.35, 48.86, 'FRA', 10, ['S06']],
  ['sedan', 'Sedan', 'town', 4.94, 49.70, 'FRA', 7, ['S08']],
  ['dinant', 'Dinant', 'bridge', 4.91, 50.26, 'BEL', 5, ['S04']],
  ['monthermé', 'Monthermé', 'bridge', 4.73, 49.88, 'FRA', 4, ['S07']],
  ['namur', 'Namur', 'town', 4.87, 50.47, 'BEL', 5, ['S13']],
  ['liege', 'Liège', 'city', 5.57, 50.63, 'BEL', 6, ['S04']],
  ['eben_emael', 'Fort Eben-Emael', 'fortress', 5.68, 50.80, 'BEL', 4, ['S06']],
  ['maastricht', 'Maastricht', 'town', 5.69, 50.85, 'NED', 4, ['S09']],
  ['brussels', 'Brussels', 'city', 4.35, 50.85, 'BEL', 8, ['S06']],
  ['antwerp', 'Antwerp', 'port', 4.40, 51.22, 'BEL', 7, ['S13']],
  ['ghent', 'Ghent', 'city', 3.72, 51.05, 'BEL', 4, ['S04']],
  ['ostend', 'Ostend', 'port', 2.92, 51.23, 'BEL', 4, ['S04']],
  ['charleroi', 'Charleroi', 'town', 4.44, 50.41, 'BEL', 4, ['S04']],
  ['gembloux', 'Gembloux', 'town', 4.69, 50.56, 'BEL', 3, ['S06']],
  ['hannut', 'Hannut', 'town', 5.08, 50.67, 'BEL', 3, ['S06']],
  ['bastogne', 'Bastogne', 'town', 5.72, 50.00, 'BEL', 3, ['S08']],
  ['luxembourg', 'Luxembourg City', 'city', 6.13, 49.61, 'NEUTRAL', 4, ['S06']],
  ['rotterdam', 'Rotterdam', 'port', 4.48, 51.92, 'NED', 7, ['S09']],
  ['the_hague', 'The Hague', 'city', 4.30, 52.08, 'NED', 6, ['S09']],
  ['amsterdam', 'Amsterdam', 'city', 4.90, 52.37, 'NED', 7, ['S09']],
  ['dunkirk', 'Dunkirk', 'port', 2.38, 51.04, 'FRA', 8, ['S11']],
  ['calais', 'Calais', 'port', 1.86, 50.95, 'FRA', 6, ['S11']],
  ['boulogne', 'Boulogne-sur-Mer', 'port', 1.61, 50.73, 'FRA', 6, ['S06']],
  ['lille', 'Lille', 'city', 3.06, 50.63, 'FRA', 6, ['S04']],
  ['arras', 'Arras', 'town', 2.78, 50.29, 'FRA', 4, ['S10']],
  ['abbeville', 'Abbeville', 'town', 1.83, 50.11, 'FRA', 5, ['S06']],
  ['amiens', 'Amiens', 'city', 2.30, 49.89, 'FRA', 5, ['S06']],
  ['reims', 'Reims', 'city', 4.03, 49.26, 'FRA', 5, ['S04']],
  ['rouen', 'Rouen', 'city', 1.10, 49.44, 'FRA', 5, ['S16']],
  ['le_havre', 'Le Havre', 'port', 0.11, 49.49, 'FRA', 6, ['S12', 'S16']],
  ['st_valery', 'Saint-Valery-en-Caux', 'port', 0.71, 49.87, 'FRA', 2, ['S06']],
  ['cherbourg', 'Cherbourg', 'port', -1.62, 49.64, 'FRA', 6, ['S06', 'S16']],
  ['brest', 'Brest', 'port', -4.49, 48.39, 'FRA', 6, ['S16', 'G02']],
  ['st_nazaire', 'Saint-Nazaire', 'port', -2.21, 47.27, 'FRA', 5, ['S06', 'S16']],
  ['nantes', 'Nantes', 'city', -1.55, 47.22, 'FRA', 4, ['S16', 'G02']],
  ['tours', 'Tours', 'city', 0.69, 47.39, 'FRA', 3, ['S06']],
  ['orleans', 'Orléans', 'city', 1.91, 47.90, 'FRA', 3, ['G02']],
  ['metz', 'Metz', 'city', 6.18, 49.12, 'FRA', 6, ['S04']],
  ['strasbourg', 'Strasbourg', 'city', 7.75, 48.58, 'FRA', 6, ['S04']],
  ['hackenberg', 'Maginot: Ouvrage Hackenberg', 'fortress', 6.33, 49.32, 'FRA', 5, ['S06', 'G02']],
  ['fermont', 'Maginot: Ouvrage Fermont', 'fortress', 5.55, 49.48, 'FRA', 4, ['S06', 'G02']],
  ['schoenenbourg', 'Maginot: Ouvrage Schoenenbourg', 'fortress', 7.95, 48.95, 'FRA', 4, ['S06', 'G02']],
  ['dover', 'Dover', 'port', 1.31, 51.13, 'GBR', 6, ['S11']],
  ['london', 'London', 'city', -0.13, 51.51, 'GBR', 10, ['G02']],
  ['aachen', 'Aachen', 'city', 6.08, 50.78, 'GER', 5, ['G02']],
  ['cologne', 'Cologne', 'city', 6.96, 50.94, 'GER', 7, ['G02']],
  ['duesseldorf', 'Düsseldorf', 'city', 6.78, 51.22, 'GER', 5, ['G02']],
  ['muenster', 'Münster', 'city', 7.63, 51.96, 'GER', 4, ['G02']],
  ['trier', 'Trier', 'city', 6.64, 49.76, 'GER', 4, ['G02']],
  ['koblenz', 'Koblenz', 'city', 7.59, 50.36, 'GER', 5, ['G02']],
  ['pruem', 'Prüm', 'town', 6.42, 50.21, 'GER', 2, ['G02']],
  ['bitburg', 'Bitburg', 'town', 6.53, 49.97, 'GER', 2, ['G02']],
];

// ───────────────────────── Anchors (G03 approximate) ─────────────────────────
// std: 10 May 1940 00:00 ; short: 12 May 1940 00:00
const A = {
  // German
  GA_HQ: [6.9, 50.2], GA_4A: [6.35, 50.55], GA_XV: [6.45, 50.35], GA_KLEIST_XLI: [6.6, 50.15], GA_XIX: [6.45, 49.95],
  GA_XIV: [6.75, 50.05], GA_12A: [6.65, 49.9], GA_16A: [6.6, 49.7], GA_XXXX: [7.05, 50.1],
  GB_HQ: [6.9, 51.4], GB_6A: [6.15, 50.9], GB_XVI: [6.25, 50.82], GB_18A: [6.3, 51.8], GB_9PZ: [6.35, 51.7], GB_AIR: [6.96, 50.94],
  GC_HQ: [7.9, 49.4], GC_1A: [7.3, 49.35], GC_7A: [7.8, 48.3],
  // Allied
  F1_HQ: [3.3, 50.15], F1_1A: [3.6, 50.2], F1_CAV: [3.45, 50.35], BEF: [3.15, 50.55], F7: [2.55, 50.75], F9: [4.85, 49.98], F2: [5.0, 49.5],
  PARIS: [2.35, 48.86], WL_SOMME_W: [1.95, 49.85], WL_SOMME_E: [2.85, 49.85], WL_AISNE: [3.9, 49.4], WL_SEINE: [1.2, 49.3], REAR: [6.0, 48.7],
  FRES: [4.1, 49.45], F3: [6.3, 49.2], F5: [7.3, 48.95], F8: [7.4, 48.2], FALPS: [6.4, 45.3], SAAR: [6.8, 49.1],
  BEL1: [5.0, 51.0], BEL2: [4.5, 51.15], BEL3: [5.55, 50.7], BEL4: [3.7, 51.0], BEL5: [4.4, 50.85], BEL6: [3.2, 51.1], BEL7: [5.1, 50.45], BELC: [5.3, 51.0],
  NED1: [5.0, 52.0], NED2: [5.5, 52.1], NED3: [5.9, 51.6], NED4: [4.5, 51.9],
};
const AS = { // short-scenario (12 May) anchors; absent => unit not present in short scale
  GA_4A: [5.5, 50.35], GA_XV: [5.0, 50.25], GA_XLI: [5.3, 49.98], GA_XIX: [5.2, 49.82], GA_XIV: [5.7, 49.95],
  GA_12A: [5.9, 49.9], GA_XXXX: [6.2, 50.0], GB_6A: [5.5, 50.75], GB_XVI: [5.25, 50.7],
  F1_1A: [4.7, 50.55], F1_CAV: [5.0, 50.65], BEF: [4.65, 50.8], F9: [4.85, 50.0], F2: [4.95, 49.55], FRES: [4.2, 49.65],
};

// ───────────────────────── Unit tables ─────────────────────────
// [id, name, shortName, nation, type, parentId|null, anchorKey, shortAnchorKey|null, srcs[]]
const U = [];
const add = (...r) => U.push(r);
const GER = 'GER', FRA = 'FRA', GBR = 'GBR', BEL = 'BEL', NED = 'NED';

// --- German HQs
add('ger.hq.hgA', 'Heeresgruppe A (v. Rundstedt)', 'HGr A', GER, 'hq', null, 'GA_HQ', null, ['S01']);
add('ger.hq.hgB', 'Heeresgruppe B (v. Bock)', 'HGr B', GER, 'hq', null, 'GB_HQ', null, ['S02']);
add('ger.hq.hgC', 'Heeresgruppe C (v. Leeb)', 'HGr C', GER, 'hq', null, 'GC_HQ', null, ['S03']);
// Army Group A
const gA = (id, nm, sh, type, parent, anc, sanc, s = ['S01']) => add(id, nm, sh, GER, type, parent, anc, sanc, s);
gA('ger.a4', '4. Armee (v. Kluge)', '4.Armee', 'hq', 'ger.hq.hgA', 'GA_4A', 'GA_4A');
gA('ger.c.II', 'II. Armeekorps (Strauß)', 'II.AK', 'hq', 'ger.a4', 'GA_4A', null);
gA('ger.id.012', '12. Infanterie-Division', '12.ID', 'infantry', 'ger.c.II', 'GA_4A', null);
gA('ger.id.032', '32. Infanterie-Division', '32.ID', 'infantry', 'ger.c.II', 'GA_4A', null);
gA('ger.c.V', 'V. Armeekorps (Ruoff)', 'V.AK', 'hq', 'ger.a4', 'GA_4A', null);
gA('ger.id.211', '211. Infanterie-Division', '211.ID', 'infantry', 'ger.c.V', 'GA_4A', null, ['S01']);
gA('ger.id.251', '251. Infanterie-Division', '251.ID', 'infantry', 'ger.c.V', 'GA_4A', null);
gA('ger.id.263', '263. Infanterie-Division', '263.ID', 'infantry', 'ger.c.V', 'GA_4A', null);
gA('ger.c.VIII', 'VIII. Armeekorps (Heitz)', 'VIII.AK', 'hq', 'ger.a4', 'GA_4A', 'GA_4A');
for (const n of [8, 28, 87, 267]) gA(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.VIII', 'GA_4A', n === 8 || n === 28 ? 'GA_4A' : null);
gA('ger.c.XV', 'XV. Armeekorps (Hoth)', 'XV.AK', 'hq', 'ger.a4', 'GA_XV', 'GA_XV', ['S01', 'S07']);
gA('ger.pz.005', '5. Panzer-Division', '5.Pz', 'armoured', 'ger.c.XV', 'GA_XV', 'GA_XV', ['S01', 'S07']);
gA('ger.pz.007', '7. Panzer-Division (Rommel)', '7.Pz', 'armoured', 'ger.c.XV', 'GA_XV', 'GA_XV', ['S01', 'S07']);
gA('ger.id.062', '62. Infanterie-Division', '62.ID', 'infantry', 'ger.c.XV', 'GA_XV', null);
gA('ger.a12', '12. Armee (List)', '12.Armee', 'hq', 'ger.hq.hgA', 'GA_12A', 'GA_12A');
gA('ger.c.III', 'III. Armeekorps (Haase)', 'III.AK', 'hq', 'ger.a12', 'GA_12A', 'GA_12A');
for (const n of [3, 23, 52]) gA(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.III', 'GA_12A', 'GA_12A');
gA('ger.c.VI', 'VI. Armeekorps (Förster)', 'VI.AK', 'hq', 'ger.a12', 'GA_12A', 'GA_12A');
for (const n of [16, 24]) gA(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.VI', 'GA_12A', 'GA_12A');
gA('ger.c.XVIII', 'XVIII. Armeekorps (Beyer)', 'XVIII.AK', 'hq', 'ger.a12', 'GA_12A', 'GA_12A');
for (const n of [5, 21, 25]) gA(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XVIII', 'GA_12A', 'GA_12A');
gA('ger.gjd.001', '1. Gebirgs-Division', '1.GebD', 'infantry', 'ger.a12', 'GA_12A', null);
gA('ger.a16', '16. Armee (Busch)', '16.Armee', 'hq', 'ger.hq.hgA', 'GA_16A', null);
gA('ger.c.VII', 'VII. Armeekorps (v. Schobert)', 'VII.AK', 'hq', 'ger.a16', 'GA_16A', null);
for (const n of [36, 68]) gA(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.VII', 'GA_16A', null);
gA('ger.c.XIII', 'XIII. Armeekorps (v. Vietinghoff)', 'XIII.AK', 'hq', 'ger.a16', 'GA_16A', null);
for (const n of [17, 10]) gA(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XIII', 'GA_16A', null);
gA('ger.c.XXIII', 'XXIII. Armeekorps (Schubert)', 'XXIII.AK', 'hq', 'ger.a16', 'GA_16A', null);
for (const n of [34, 58, 76, 26]) gA(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XXIII', 'GA_16A', null);
gA('ger.pgk', 'Panzergruppe von Kleist', 'PzGr Kleist', 'hq', 'ger.hq.hgA', 'GA_KLEIST_XLI', 'GA_XLI', ['S01', 'S07']);
gA('ger.c.XIV', 'XIV. Armeekorps (mot.) (v. Wietersheim)', 'XIV.AK(mot)', 'hq', 'ger.pgk', 'GA_XIV', 'GA_XIV');
for (const n of [2, 13, 29]) gA(`ger.mot.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division (mot.)`, `${n}.ID(mot)`, 'motorised', 'ger.c.XIV', 'GA_XIV', 'GA_XIV');
gA('ger.c.XLI', 'XLI. Armeekorps (Reinhardt)', 'XLI.AK', 'hq', 'ger.pgk', 'GA_KLEIST_XLI', 'GA_XLI', ['S01', 'S07']);
gA('ger.pz.006', '6. Panzer-Division', '6.Pz', 'armoured', 'ger.c.XLI', 'GA_KLEIST_XLI', 'GA_XLI', ['S01', 'S07']);
gA('ger.pz.008', '8. Panzer-Division', '8.Pz', 'armoured', 'ger.c.XLI', 'GA_KLEIST_XLI', 'GA_XLI', ['S01', 'S07']);
gA('ger.c.XIX', 'XIX. Armeekorps (Guderian)', 'XIX.AK', 'hq', 'ger.pgk', 'GA_XIX', 'GA_XIX', ['S01', 'S07', 'S08']);
gA('ger.pz.001', '1. Panzer-Division', '1.Pz', 'armoured', 'ger.c.XIX', 'GA_XIX', 'GA_XIX', ['S01', 'S07', 'S08']);
gA('ger.pz.002', '2. Panzer-Division', '2.Pz', 'armoured', 'ger.c.XIX', 'GA_XIX', 'GA_XIX', ['S01', 'S07', 'S08']);
gA('ger.pz.010', '10. Panzer-Division', '10.Pz', 'armoured', 'ger.c.XIX', 'GA_XIX', 'GA_XIX', ['S01', 'S07', 'S08']);
gA('ger.ir.gd', 'Infanterie-Regiment Großdeutschland', 'IR GD', 'motorised', 'ger.c.XIX', 'GA_XIX', 'GA_XIX', ['S01', 'S08']);
gA('ger.c.XXXX', 'XXXX. Armeekorps (Stumme) (Reserve)', 'XXXX.AK', 'hq', 'ger.hq.hgA', 'GA_XXXX', 'GA_XXXX');
for (const n of [6, 9, 27, 71, 73]) gA(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XXXX', 'GA_XXXX', null);
// Army Group B
const gB = (id, nm, sh, type, parent, anc, sanc, s = ['S02']) => add(id, nm, sh, GER, type, parent, anc, sanc, s);
gB('ger.a6', '6. Armee (v. Reichenau)', '6.Armee', 'hq', 'ger.hq.hgB', 'GB_6A', 'GB_6A');
gB('ger.c.XVI', 'XVI. Armeekorps (Hoepner)', 'XVI.AK', 'hq', 'ger.a6', 'GB_XVI', 'GB_XVI');
gB('ger.pz.003', '3. Panzer-Division', '3.Pz', 'armoured', 'ger.c.XVI', 'GB_XVI', 'GB_XVI');
gB('ger.pz.004', '4. Panzer-Division', '4.Pz', 'armoured', 'ger.c.XVI', 'GB_XVI', 'GB_XVI');
gB('ger.id.033', '33. Infanterie-Division', '33.ID', 'infantry', 'ger.c.XVI', 'GB_XVI', 'GB_XVI');
gB('ger.c.IV', 'IV. Armeekorps (v. Schwedler)', 'IV.AK', 'hq', 'ger.a6', 'GB_6A', null);
gB('ger.id.205', '205. Infanterie-Division', '205.ID', 'infantry', 'ger.c.IV', 'GB_6A', null);
gB('ger.c.XI', 'XI. Armeekorps (v. Kortzfleisch)', 'XI.AK', 'hq', 'ger.a6', 'GB_6A', null);
for (const n of [7, 31]) gB(`ger.id.${String(n).padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XI', 'GB_6A', null);
gB('ger.c.IX', 'IX. Armeekorps (Geyer)', 'IX.AK', 'hq', 'ger.a6', 'GB_6A', null);
gB('ger.id.253', '253. Infanterie-Division', '253.ID', 'infantry', 'ger.c.IX', 'GB_6A', null);
gB('ger.c.XXVII', 'XXVII. Armeekorps (Wäger)', 'XXVII.AK', 'hq', 'ger.a6', 'GB_6A', null);
gB('ger.id.269', '269. Infanterie-Division', '269.ID', 'infantry', 'ger.c.XXVII', 'GB_6A', null);
gB('ger.a18', '18. Armee (v. Küchler)', '18.Armee', 'hq', 'ger.hq.hgB', 'GB_18A', null);
gB('ger.c.X', 'X. Armeekorps (Hansen)', 'X.AK', 'hq', 'ger.a18', 'GB_18A', null);
for (const n of [227, 207]) gB(`ger.id.${n}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.X', 'GB_18A', null);
gB('ger.c.XXVI', 'XXVI. Armeekorps (Wodrig)', 'XXVI.AK', 'hq', 'ger.a18', 'GB_18A', null);
for (const n of [256, 254]) gB(`ger.id.${n}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XXVI', 'GB_18A', null);
gB('ger.pz.009', '9. Panzer-Division (v. Hubicki)', '9.Pz', 'armoured', 'ger.a18', 'GB_9PZ', null);
gB('ger.cav.001', '1. Kavallerie-Division', '1.KD', 'recon', 'ger.a18', 'GB_18A', null);
gB('ger.ss.lssah', 'SS-Leibstandarte "Adolf Hitler" (verst. Rgt.)', 'LSSAH', 'motorised', 'ger.a18', 'GB_18A', null);
for (const n of [208, 225, 526]) gB(`ger.id.${n}`, `${n}. Infanterie-Division (HGr B Reserve)`, `${n}.ID`, 'infantry', 'ger.hq.hgB', 'GB_HQ', null);
gB('ger.air.007', '7. Flieger-Division (Fallschirmjäger)', '7.FlD', 'paratroop', 'ger.hq.hgB', 'GB_AIR', null);
gB('ger.id.022', '22. Luftlande-Infanterie-Division', '22.LL', 'infantry', 'ger.hq.hgB', 'GB_AIR', null);
// Army Group C (S03 only, single source)
const gC = (id, nm, sh, type, parent, anc, s = ['S03']) => add(id, nm, sh, GER, type, parent, anc, null, s);
gC('ger.a1', '1. Armee (v. Witzleben)', '1.Armee', 'hq', 'ger.hq.hgC', 'GC_1A');
for (const n of [197, 246, 215, 262, 257]) gC(`ger.id.${n}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.a1', 'GC_1A');
gC('ger.c.XXIV', 'XXIV. Armeekorps', 'XXIV.AK', 'hq', 'ger.a1', 'GC_1A');
for (const n of [60, 252, 168]) gC(`ger.id.${n.toString().padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XXIV', 'GC_1A');
gC('ger.c.XII', 'XII. Armeekorps', 'XII.AK', 'hq', 'ger.a1', 'GC_1A');
for (const n of [75, 268, 198]) gC(`ger.id.${n.toString().padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XII', 'GC_1A');
gC('ger.c.XXX', 'XXX. Armeekorps', 'XXX.AK', 'hq', 'ger.a1', 'GC_1A');
for (const n of [258, 93, 79]) gC(`ger.id.${n.toString().padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.c.XXX', 'GC_1A');
gC('ger.a7', '7. Armee (Dollmann)', '7.Armee', 'hq', 'ger.hq.hgC', 'GC_7A');
for (const n of [213, 554, 556, 239, 557, 555, 218, 221]) gC(`ger.id.${n.toString().padStart(3, '0')}`, `${n}. Infanterie-Division`, `${n}.ID`, 'infantry', 'ger.a7', 'GC_7A');

// --- French
const fr = (id, nm, sh, type, parent, anc, sanc, s = ['S04']) => add(id, nm, sh, FRA, type, parent, anc, sanc, s);
fr('fra.hq.ag1', '1er Groupe d\'Armées (Billotte)', '1er GA', 'hq', null, 'F1_HQ', null);
fr('fra.hq.ag2', '2e Groupe d\'Armées (Prételat)', '2e GA', 'hq', null, 'F3', null);
fr('fra.hq.ag3', '3e Groupe d\'Armées (Besson)', '3e GA', 'hq', null, 'F8', null);
fr('fra.a1', '1re Armée (Blanchard)', '1re Armée', 'hq', 'fra.hq.ag1', 'F1_1A', 'F1_1A');
fr('fra.c.cav', 'Corps de Cavalerie (Prioux)', 'CC', 'hq', 'fra.a1', 'F1_CAV', 'F1_CAV');
fr('fra.dlm.2', '2e Division Légère Mécanique', '2e DLM', 'mechanised', 'fra.c.cav', 'F1_CAV', 'F1_CAV');
fr('fra.dlm.3', '3e Division Légère Mécanique', '3e DLM', 'mechanised', 'fra.c.cav', 'F1_CAV', 'F1_CAV');
fr('fra.c.III', 'IIIe Corps d\'Armée', 'IIIe CA', 'hq', 'fra.a1', 'F1_1A', 'F1_1A');
fr('fra.dim.1', '1re Division d\'Infanterie Motorisée', '1re DIM', 'motorised', 'fra.c.III', 'F1_1A', 'F1_1A');
fr('fra.dim.1m', '1re Division Marocaine', '1re DM', 'infantry', 'fra.c.III', 'F1_1A', 'F1_1A');
fr('fra.dina.2', '2e Division d\'Infanterie Nord-Africaine', '2e DINA', 'infantry', 'fra.c.III', 'F1_1A', 'F1_1A');
fr('fra.c.IV', 'IVe Corps d\'Armée', 'IVe CA', 'hq', 'fra.a1', 'F1_1A', 'F1_1A');
fr('fra.di.032', '32e Division d\'Infanterie', '32e DI', 'infantry', 'fra.c.IV', 'F1_1A', 'F1_1A');
fr('fra.dim.15', '15e Division d\'Infanterie Motorisée', '15e DIM', 'motorised', 'fra.c.IV', 'F1_1A', 'F1_1A');
fr('fra.c.V', 'Ve Corps d\'Armée (R. Altmayer)', 'Ve CA', 'hq', 'fra.a1', 'F1_1A', 'F1_1A');
fr('fra.dina.5', '5e Division d\'Infanterie Nord-Africaine', '5e DINA', 'infantry', 'fra.c.V', 'F1_1A', 'F1_1A');
fr('fra.di.101', '101e Division d\'Infanterie', '101e DI', 'infantry', 'fra.c.V', 'F1_1A', 'F1_1A');
fr('fra.a2', '2e Armée (Huntziger)', '2e Armée', 'hq', 'fra.hq.ag1', 'F2', 'F2');
fr('fra.dlc.5', '5e Division Légère de Cavalerie', '5e DLC', 'recon', 'fra.a2', 'F2', null);
fr('fra.dlc.2', '2e Division Légère de Cavalerie', '2e DLC', 'recon', 'fra.a2', 'F2', null);
fr('fra.c.X', 'Xe Corps d\'Armée (Grandsard)', 'Xe CA', 'hq', 'fra.a2', 'F2', 'F2');
fr('fra.di.055', '55e Division d\'Infanterie', '55e DI', 'infantry', 'fra.c.X', 'F2', 'F2', ['S04', 'S08']);
fr('fra.di.071', '71e Division d\'Infanterie', '71e DI', 'infantry', 'fra.c.X', 'F2', 'F2');
fr('fra.dina.3', '3e Division d\'Infanterie Nord-Africaine', '3e DINA', 'infantry', 'fra.c.X', 'F2', 'F2');
fr('fra.c.XVIII', 'XVIIIe Corps d\'Armée (Doyen)', 'XVIIIe CA', 'hq', 'fra.a2', 'F2', 'F2');
fr('fra.dic.1', '1re Division d\'Infanterie Coloniale', '1re DIC', 'infantry', 'fra.c.XVIII', 'F2', 'F2');
fr('fra.dic.3', '3e Division d\'Infanterie Coloniale', '3e DIC', 'infantry', 'fra.c.XVIII', 'F2', 'F2');
fr('fra.di.041', '41e Division d\'Infanterie', '41e DI', 'infantry', 'fra.c.XVIII', 'F2', 'F2');
fr('fra.a7', '7e Armée (Giraud)', '7e Armée', 'hq', 'fra.hq.ag1', 'F7', null, ['S04', 'S13']);
for (const n of [21, 60, 68]) fr(`fra.di.${String(n).padStart(3, '0')}`, `${n}e Division d'Infanterie`, `${n}e DI`, 'infantry', 'fra.a7', 'F7', null);
fr('fra.c.I', 'Ier Corps d\'Armée', 'Ier CA', 'hq', 'fra.a7', 'F7', null);
fr('fra.dlm.1', '1re Division Légère Mécanique', '1re DLM', 'mechanised', 'fra.c.I', 'F7', null);
fr('fra.dim.25', '25e Division d\'Infanterie Motorisée', '25e DIM', 'motorised', 'fra.c.I', 'F7', null);
fr('fra.c.XVI', 'XVIe Corps d\'Armée', 'XVIe CA', 'hq', 'fra.a7', 'F7', null);
fr('fra.dim.9', '9e Division d\'Infanterie Motorisée', '9e DIM', 'motorised', 'fra.c.XVI', 'F7', null);
fr('fra.a9', '9e Armée (Corap)', '9e Armée', 'hq', 'fra.hq.ag1', 'F9', 'F9');
fr('fra.dina.4', '4e Division d\'Infanterie Nord-Africaine', '4e DINA', 'infantry', 'fra.a9', 'F9', 'F9');
fr('fra.di.053', '53e Division d\'Infanterie', '53e DI', 'infantry', 'fra.a9', 'F9', 'F9');
fr('fra.c.II', 'IIe Corps d\'Armée (Bouffet)', 'IIe CA', 'hq', 'fra.a9', 'F9', 'F9');
fr('fra.dlc.4', '4e Division Légère de Cavalerie', '4e DLC', 'recon', 'fra.c.II', 'F9', 'F9');
fr('fra.dim.5', '5e Division d\'Infanterie Motorisée', '5e DIM', 'motorised', 'fra.c.II', 'F9', 'F9');
fr('fra.c.XI', 'XIe Corps d\'Armée (Martin)', 'XIe CA', 'hq', 'fra.a9', 'F9', 'F9');
fr('fra.dlc.1', '1re Division Légère de Cavalerie', '1re DLC', 'recon', 'fra.c.XI', 'F9', 'F9');
fr('fra.di.018', '18e Division d\'Infanterie', '18e DI', 'infantry', 'fra.c.XI', 'F9', 'F9');
fr('fra.di.022', '22e Division d\'Infanterie', '22e DI', 'infantry', 'fra.c.XI', 'F9', 'F9');
fr('fra.c.XLI', 'XLIe Corps d\'Armée (Libaud)', 'XLIe CA', 'hq', 'fra.a9', 'F9', 'F9');
fr('fra.di.061', '61e Division d\'Infanterie', '61e DI', 'infantry', 'fra.c.XLI', 'F9', 'F9');
fr('fra.df.102', '102e Division d\'Infanterie de Forteresse', '102e DIF', 'infantry', 'fra.c.XLI', 'F9', 'F9');
fr('fra.dcr.1', '1re Division Cuirassée (Bruneau)', '1re DCR', 'armoured', 'fra.hq.ag1', 'FRES', 'FRES', ['S04', 'G03']);
fr('fra.dcr.2', '2e Division Cuirassée (Bruchard)', '2e DCR', 'armoured', 'fra.hq.ag1', 'FRES', 'FRES', ['S04', 'G03']);
fr('fra.dcr.3', '3e Division Cuirassée (Brocard)', '3e DCR', 'armoured', 'fra.hq.ag1', 'FRES', 'FRES', ['S04', 'G03']);
fr('fra.dim.3', '3e Division d\'Infanterie Motorisée (Bertin-Bossu)', '3e DIM', 'motorised', 'fra.hq.ag1', 'FRES', 'FRES', ['S04', 'G03']);
fr('fra.a3', '3e Armée (Condé)', '3e Armée', 'hq', 'fra.hq.ag2', 'F3', null);
fr('fra.dlc.3', '3e Division Légère de Cavalerie', '3e DLC', 'recon', 'fra.a3', 'F3', null);
for (const n of [6, 7, 8]) fr(`fra.di.${String(n).padStart(3, '0')}`, `${n}e Division d'Infanterie`, `${n}e DI`, 'infantry', 'fra.a3', 'F3', null);
fr('fra.c.XXIV', 'XXIVe Corps d\'Armée (Fougère)', 'XXIVe CA', 'hq', 'fra.a3', 'F3', null);
fr('fra.di.051', '51e Division d\'Infanterie (Boell)', '51e DI', 'infantry', 'fra.c.XXIV', 'F3', null);
fr('fra.c.XLII', 'XLIIe Corps d\'Armée (Sivot)', 'XLIIe CA', 'hq', 'fra.a3', 'F3', null);
for (const n of [20, 58]) fr(`fra.di.${String(n).padStart(3, '0')}`, `${n}e Division d'Infanterie`, `${n}e DI`, 'infantry', 'fra.c.XLII', 'F3', null);
fr('fra.a5', '5e Armée (Réquin)', '5e Armée', 'hq', 'fra.hq.ag2', 'F5', null);
for (const n of [45, 11, 47]) fr(`fra.di.${String(n).padStart(3, '0')}`, `${n}e Division d'Infanterie`, `${n}e DI`, 'infantry', 'fra.a5', 'F5', null);
fr('fra.a8', '8e Armée (Garchery)', '8e Armée', 'hq', 'fra.hq.ag3', 'F8', null);
fr('fra.df.104', '104e Division d\'Infanterie de Forteresse', '104e DIF', 'infantry', 'fra.a8', 'F8', null);
fr('fra.df.105', '105e Division d\'Infanterie de Forteresse', '105e DIF', 'infantry', 'fra.a8', 'F8', null);
fr('fra.alps', 'Armée des Alpes (Olry)', 'Armée Alpes', 'hq', null, 'FALPS', null, ['S04', 'S05']);

// --- Paris and general reserves (standard only). S18: Paris military command exists (strength not sourced -> game-scale garrison).
add('fra.paris', 'Gouvernement militaire de Paris (garrison, game-scale)', 'Paris Gar.', FRA, 'infantry', null, 'PARIS', null, ['S06', 'S18']);
// S04 "French Reserves": corps VII and XXIII behind the 2nd and 3rd Army Groups; listed reserve divisions. Corps assignment not stated -> no parent.
fr('fra.c.VII', 'VIIe Corps d\'Armée (réserve)', 'VIIe CA', 'hq', null, 'REAR', null);
fr('fra.c.XXIII', 'XXIIIe Corps d\'Armée (réserve)', 'XXIIIe CA', 'hq', null, 'REAR', null);
for (const n of [10, 14, 23, 28, 29, 36, 43]) fr(`fra.di.${String(n).padStart(3, '0')}`, `${n}e Division d'Infanterie (réserve)`, `${n}e DI`, 'infantry', null, 'REAR', null);
for (const n of [1, 7]) fr(`fra.dina.${n}`, `${n}re/e Division d'Infanterie Nord-Africaine (réserve)`.replace('1re/e', '1re').replace('7re/e', '7e'), `${n}e DINA`, 'infantry', null, 'REAR', null);
for (const n of [5, 7]) fr(`fra.dic.${n}`, `${n}e Division d'Infanterie Coloniale (réserve)`, `${n}e DIC`, 'infantry', null, 'REAR', null);
// --- British (S04, S12). Positions: Franco-Belgian frontier.
const gb = (id, nm, sh, type, parent, anc, sanc, s = ['S04', 'S12']) => add(id, nm, sh, GBR, type, parent, anc, sanc, s);
gb('gbr.hq.bef', 'British Expeditionary Force GHQ (Gort)', 'BEF GHQ', 'hq', null, 'BEF', 'BEF');
gb('gbr.c.I', 'I Corps (Barker)', 'I Corps', 'hq', 'gbr.hq.bef', 'BEF', 'BEF');
for (const n of [1, 2, 48]) gb(`gbr.div.${String(n).padStart(2, '0')}`, `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : 'th'} Infantry Division`, `${n} Div`, 'infantry', 'gbr.c.I', 'BEF', 'BEF');
gb('gbr.c.II', 'II Corps (Brooke)', 'II Corps', 'hq', 'gbr.hq.bef', 'BEF', 'BEF');
for (const n of [3, 4, 50]) gb(`gbr.div.${String(n).padStart(2, '0')}`, `${n}${n === 3 ? 'rd' : 'th'} Infantry Division`, `${n} Div`, 'infantry', 'gbr.c.II', 'BEF', 'BEF');
gb('gbr.c.III', 'III Corps (Adam)', 'III Corps', 'hq', 'gbr.hq.bef', 'BEF', 'BEF');
for (const n of [42, 44]) gb(`gbr.div.${n}`, `${n}nd Infantry Division`.replace('44nd', '44th'), `${n} Div`, 'infantry', 'gbr.c.III', 'BEF', 'BEF');
gb('gbr.div.05', '5th Infantry Division (GHQ troops)', '5 Div', 'infantry', 'gbr.hq.bef', 'BEF', 'BEF');
gb('gbr.div.51', '51st (Highland) Division (Saar Force)', '51 Div', 'infantry', 'gbr.hq.bef', 'SAAR', null, ['S04', 'S12']);
// --- Belgian (S04; corps level; positions approximate arc)
const be = (id, nm, sh, type, anc) => add(id, nm, sh, BEL, type, null, anc, null, ['S04', 'S05']);
be('bel.c.I', 'Belgian I Corps (van der Veken)', 'BE I', 'infantry', 'BEL1');
be('bel.c.II', 'Belgian II Corps (Michem)', 'BE II', 'infantry', 'BEL2');
be('bel.c.III', 'Belgian III Corps (de Krahe)', 'BE III', 'infantry', 'BEL3');
be('bel.c.IV', 'Belgian IV Corps (Bogaerts)', 'BE IV', 'infantry', 'BEL4');
be('bel.c.V', 'Belgian V Corps (Van den Bergen)', 'BE V', 'infantry', 'BEL5');
be('bel.c.VI', 'Belgian VI Corps (Verstraete)', 'BE VI', 'infantry', 'BEL6');
be('bel.c.VII', 'Belgian VII Corps (Deffontaine)', 'BE VII', 'infantry', 'BEL7');
be('bel.c.cav', 'Belgian Cavalry Corps (de Neve de Roden)', 'BE CC', 'recon', 'BELC');
// --- Dutch (S04; corps level)
const nl = (id, nm, sh, anc) => add(id, nm, sh, NED, 'infantry', null, anc, null, ['S04', 'S09']);
nl('ned.c.I', 'Dutch I Corps (Carstens)', 'NL I', 'NED1');
nl('ned.c.II', 'Dutch II Corps (Harberts)', 'NL II', 'NED2');
nl('ned.c.III', 'Dutch III Corps (van Nijnatten)', 'NL III', 'NED3');
nl('ned.c.IV', 'Dutch IV Corps (van den Bent)', 'NL IV', 'NED4');

// ───────────────────────── Unit construction (G01 game-scale stats) ─────────────────────────
const T = { // manpowerMax and nominal equipment per type (GAME SCALE, not historical)
  hq: { mp: 600, eq: { rifle: 600 } },
  infantry: { mp: 15000, eq: { rifle: 100, gun_arty: 50, gun_at: 30 } },
  motorised: { mp: 12000, eq: { rifle: 80, gun_arty: 40, truck: 60 } },
  mechanised: { mp: 10000, eq: { tank_light: 60, rifle: 50, gun_arty: 24 } },
  armoured: { mp: 12000, eq: { tank_medium: 100, tank_light: 40, gun_arty: 24, truck: 60 } },
  recon: { mp: 5000, eq: { rifle: 40, armoured_car: 30 } },
  paratroop: { mp: 7000, eq: { rifle: 60, gun_at: 12 } },
};
const NAT = {
  GER: { side: 'axis', exp: 60, morale: 80 }, FRA: { side: 'allies', exp: 50, morale: 72 }, GBR: { side: 'allies', exp: 55, morale: 78 },
  BEL: { side: 'allies', exp: 40, morale: 70 }, NED: { side: 'allies', exp: 35, morale: 68 },
};
const pos = (anchor, k) => [Math.round((anchor[0] + ((k % 4) - 1.5) * 0.07) * 1000) / 1000, Math.round((anchor[1] + (Math.floor(k / 4) % 3 - 1) * 0.05) * 1000) / 1000];

// ── Sedan/Meuse sector respread and quality classes (S08 sourced: 55th/71st = Series B reservists over 30, little training, short of AT/AA;
// "chiefly poor quality divisions" in the Ninth/Second Army sector). Positions are approximate river-segment anchors (G03);
// division-to-segment assignment below corps level is NOT sourced and is marked uncertain. Values are game-scale (G01) where unsourced.
const SECTOR_POS = {
  'fra.c.X': [4.98, 49.62], 'fra.di.055': [4.94, 49.69], 'fra.di.071': [5.0, 49.62], 'fra.dina.3': [5.1, 49.56], 'fra.dlc.5': [4.86, 49.62], 'fra.dlc.2': [5.15, 49.52],
  'fra.c.XVIII': [5.3, 49.49], 'fra.dic.1': [5.2, 49.5], 'fra.dic.3': [5.42, 49.47], 'fra.di.041': [5.6, 49.44],
  'fra.c.XLI': [4.75, 49.82], 'fra.di.061': [4.72, 49.78], 'fra.df.102': [4.72, 49.9], 'fra.dina.4': [4.68, 50.0], 'fra.di.053': [4.65, 49.75],
  'fra.c.XI': [4.86, 50.1], 'fra.di.018': [4.85, 50.12], 'fra.di.022': [4.92, 50.22], 'fra.dlc.1': [4.9, 50.17],
  'fra.c.II': [4.88, 50.38], 'fra.dlc.4': [4.88, 50.32], 'fra.dim.5': [4.87, 50.46],
  'fra.dcr.3': [4.45, 49.52], 'fra.dim.3': [4.5, 49.46],
};
const SERIES_B = new Set(['fra.di.055', 'fra.di.071']);
const FORTRESS = new Set(['fra.df.102', 'fra.df.104', 'fra.df.105']);
const POOR_INF = new Set(['fra.di.061', 'fra.di.053', 'fra.di.018', 'fra.di.022', 'fra.di.041']); // inf. divisions of 9th/2nd Army, S08 "poor quality" (individual series unsourced)
function classify(u) {
  if (SERIES_B.has(u.id)) { u.experience = 25; u.morale = 62; u.organisation = 75; u.entrenchment = 20; u.posture = 'hold'; u.equipment.held.gun_at = 15; u.equipment.authorised.gun_at = 15; }
  else if (FORTRESS.has(u.id)) { u.experience = 35; u.morale = 68; u.entrenchment = u.id === 'fra.df.102' ? 20 : 50; }
  else if (POOR_INF.has(u.id)) { u.experience = 40; u.morale = 65; u.organisation = 80; }
}

function buildUnits(short) {
  const counts = {};
  const out = [];
  for (const [id, name, shortName, nation, type, parentId, anc, sanc] of U) {
    const key = short ? sanc : anc;
    if (!key) continue;
    const anchor = short ? AS[key] : A[key];
    if (!anchor) throw new Error('missing anchor ' + key + ' for ' + id);
    const k = (counts[key] = (counts[key] ?? -1) + 1);
    const t = T[type]; const n = NAT[nation];
    const exp = Math.min(100, n.exp + (type === 'armoured' && nation === 'GER' ? 5 : 0));
    const held = Object.fromEntries(Object.entries(t.eq).map(([a, b]) => [a, b]));
    const sp = SECTOR_POS[id];
    out.push({
      id, name, shortName, nation, side: n.side, type, domain: 'land',
      ...(parentId && (short ? U.some((r) => r[0] === parentId && r[7]) : true) ? { parentId } : {}),
      pos: sp ?? pos(anchor, k),
      manpower: t.mp, manpowerMax: t.mp, equipment: { held, authorised: { ...held } },
      organisation: 90, morale: n.morale, experience: exp, fuel: 100, ammo: 100, supply: 100, fatigue: 5, readiness: 90,
      entrenchment: nation === 'GER' ? 0 : 15,
      moveStatus: 'stationary', combatStatus: 'idle', posture: nation === 'GER' ? 'hold' : 'defend', orders: [], kills: 0,
    });
    classify(out[out.length - 1]);
  }
  // air formations (positions are airfields; included when inside this scenario's bbox)
  const afPos = Object.fromEntries(AIRFIELDS.map((a) => [a[0], [a[2], a[3]]]));
  const afUse = {};
  for (const [id, name, shortName, nation, type, parentId, where, n] of AIR) {
    let p = typeof where === 'string' ? afPos[where] : where;
    if (!p || !inBox(short ? bbox.short : bbox.std, p)) continue;
    const k = typeof where === 'string' ? (afUse[where] = (afUse[where] ?? -1) + 1) : 0;
    p = [Math.round((p[0] + (k % 3) * 0.015) * 1000) / 1000, Math.round((p[1] + Math.floor(k / 3) * 0.015) * 1000) / 1000];
    const isHq = type === 'hq';
    const nat = NAT[nation];
    const aircraftKey = type === 'air_bomber' ? 'aircraft_bomber' : 'aircraft_fighter';
    const held = isHq ? { rifle: 300 } : { [aircraftKey]: n };
    const mp = isHq ? 300 : n * (type === 'air_bomber' ? 20 : 12);
    out.push({
      id, name, shortName, nation, side: nat.side, type, domain: isHq ? 'land' : 'air', ...(parentId ? { parentId } : {}), pos: p,
      manpower: mp, manpowerMax: mp, equipment: { held, authorised: { ...held } },
      organisation: 90, morale: nat.morale, experience: nat.exp, fuel: 100, ammo: 100, supply: 100, fatigue: 0, readiness: 90, entrenchment: 0,
      moveStatus: 'stationary', combatStatus: 'idle', posture: nation === 'GER' ? 'hold' : 'defend', orders: [], kills: 0,
    });
  }
  // drop parentIds whose parent absent in this scale
  const ids = new Set(out.map((u) => u.id));
  for (const u of out) if (u.parentId && !ids.has(u.parentId)) delete u.parentId;
  return out;
}

// ───────────────────────── Shared definitions ─────────────────────────
const bbox = { std: { west: -6, south: 44, east: 10, north: 55 }, short: { west: 1.0, south: 48.8, east: 7.0, north: 51.2 } };
const inBox = (b, [lon, lat]) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
const ownerSide = (o) => (o === 'GER' || o === 'ITA' ? 'axis' : o === 'NEUTRAL' ? 'neutral' : 'allies');
void ownerSide;

function buildLocations(b) {
  const air = AIRFIELDS.filter((a) => inBox(b, [a[2], a[3]])).map(([id, name, lon, lat, owner]) => ({ id, name, kind: 'airfield', pos: [lon, lat], owner, originalOwner: owner, value: 1 }));
  return [...LOC.filter((l) => inBox(b, [l[3], l[4]])).map(([id, name, kind, lon, lat, owner, value]) => ({
    id: id.replace('é', 'e'), name, kind, pos: [lon, lat], owner, originalOwner: owner, value,
    ...(kind === 'port' || kind === 'city' ? { supplyCapacity: kind === 'port' ? 30 : 20 } : {}),
  })), ...air];
}
const SIDE = { GER: 'axis', ITA: 'axis', FRA: 'allies', GBR: 'allies', BEL: 'allies', NED: 'allies' };
const sameSide = (a, b) => SIDE[a] !== undefined && SIDE[a] === SIDE[b];
const norm = (id) => id.replace('é', 'e');

// initialControl polygons (G04). painter's algorithm: later overrides.
const CTRL = [
  { nation: 'NEUTRAL', polygon: [[-6, 44], [10, 44], [10, 55], [-6, 55]] },
  { nation: 'FRA', polygon: [[2.55, 51.09], [3.1, 50.78], [3.28, 50.5], [3.65, 50.38], [3.97, 50.28], [4.3, 49.97], [4.83, 50.14], [5.0, 49.95], [5.4, 49.55], [5.82, 49.5], [6.37, 49.46], [7.07, 49.1], [7.95, 49.04], [8.17, 48.97], [7.8, 48.57], [7.55, 48.0], [7.59, 47.59], [6.9, 47.4], [6.1, 46.2], [6.8, 45.1], [7.0, 44.0], [-1.5, 44.0], [-1.25, 44.5], [-1.1, 45.5], [-1.2, 46.15], [-2.2, 47.0], [-3.0, 47.5], [-4.4, 47.8], [-4.8, 48.4], [-4.3, 48.7], [-3.0, 48.85], [-2.0, 48.65], [-1.5, 48.64], [-1.85, 49.5], [-1.6, 49.7], [-1.2, 49.7], [-1.1, 49.35], [0.0, 49.3], [0.1, 49.5], [1.0, 49.9], [1.6, 50.2], [1.55, 50.7], [1.6, 50.95]] },
  { nation: 'BEL', polygon: [[2.55, 51.09], [3.37, 51.37], [4.25, 51.37], [4.5, 51.48], [5.0, 51.47], [5.1, 51.3], [5.5, 51.3], [5.85, 51.05], [5.7, 50.76], [6.03, 50.75], [6.4, 50.32], [6.0, 50.0], [5.8, 49.55], [5.4, 49.55], [5.0, 49.95], [4.83, 50.14], [4.3, 49.97], [3.97, 50.28], [3.65, 50.38], [3.28, 50.5], [3.1, 50.78]] },
  { nation: 'NED', polygon: [[3.4, 51.4], [4.25, 51.37], [4.5, 51.48], [5.0, 51.47], [5.1, 51.3], [5.5, 51.3], [5.85, 51.05], [5.75, 50.8], [6.0, 50.75], [6.1, 50.9], [6.05, 51.15], [6.2, 51.4], [5.95, 51.75], [6.15, 51.85], [6.8, 51.95], [7.05, 52.4], [7.2, 53.2], [7.0, 53.45], [5.0, 53.2], [4.75, 52.9], [4.55, 52.45], [4.1, 52.0], [3.6, 51.85]] },
  { nation: 'GER', polygon: [[6.03, 50.75], [6.1, 50.9], [6.05, 51.15], [6.2, 51.4], [5.95, 51.75], [6.15, 51.85], [6.8, 51.95], [7.05, 52.4], [7.2, 53.3], [8.0, 53.7], [8.9, 54.0], [8.6, 54.9], [10, 55], [10, 47.55], [9.7, 47.55], [8.6, 47.65], [7.59, 47.59], [7.55, 48.0], [7.8, 48.57], [8.17, 48.97], [7.95, 49.04], [7.07, 49.1], [6.52, 49.45], [6.37, 49.47], [6.55, 49.85], [6.13, 50.13], [6.4, 50.32]] },
  { nation: 'ITA', polygon: [[7.05, 45.92], [7.9, 45.9], [8.4, 46.45], [8.9, 45.85], [9.4, 46.5], [10, 46.3], [10, 44], [7.0, 44.0], [6.8, 45.1]] },
  { nation: 'GBR', polygon: [[-6, 49.9], [-5.7, 50.05], [-4.2, 50.35], [-3.0, 50.6], [-1.9, 50.65], [-0.8, 50.75], [0.3, 50.75], [1.4, 51.15], [1.4, 51.35], [0.9, 51.38], [0.6, 51.5], [1.0, 51.8], [1.75, 52.5], [1.7, 52.7], [0.3, 53.5], [-0.2, 54.1], [-1.5, 55], [-6, 55]] },
];
// Short only (12 May): German-held ground in Luxembourg and the advance through southern Belgium (S06: Luxembourg occupied 10 May; Sedan article: advance through southern Belgium on 12 May). Coarse, approximate (G04).
const SHORT_GER = [
  { nation: 'GER', polygon: [[6.4, 50.32], [6.0, 50.0], [5.8, 49.55], [6.1, 49.45], [6.52, 49.45], [6.37, 49.47], [6.55, 49.85], [6.13, 50.13]] },
  { nation: 'GER', polygon: [[4.95, 50.0], [5.1, 50.38], [5.7, 50.5], [6.4, 50.32], [6.0, 50.0], [5.8, 49.6], [5.4, 49.6]] },
  { nation: 'GER', polygon: [[5.15, 50.55], [5.15, 50.8], [5.9, 50.8], [5.9, 50.55]] },
];
const clipCtrl = (b, short = false) => [...CTRL.slice(0, 5), ...(short ? SHORT_GER : []), ...CTRL.slice(5)].map((c) => ({ nation: c.nation, polygon: c.nation === 'NEUTRAL' ? [[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north]] : c.polygon }));

const WEATHER = [ // G01 + S15: approximate game-scale NW-Europe climatology; no quantitative source retrieved
  { month: 5, probs: { clear: 0.42, cloud: 0.3, rain: 0.18, fog: 0.05, storm: 0.05 }, tempC: 13 },
  { month: 6, probs: { clear: 0.4, cloud: 0.3, rain: 0.2, fog: 0.03, storm: 0.07 }, tempC: 16 },
];

const REINF_SRC = {};
const NATIONS = (short, units) => {
  const cnt = (n) => units.filter((u) => u.nation === n).length;
  const mpOf = (n) => units.filter((u) => u.nation === n).reduce((a, u) => a + u.manpowerMax, 0);
  const ticks = short ? 216 : 1128; // scenario length in 60-minute ticks (short 9 days; standard ~47 days)
  const pool = (n) => ({ // GAME-SCALE (G01): pools sized from the nation's OOB so replacement flows over the whole campaign
    resources: { manpower: Math.max(2000, Math.round(mpOf(n) * 0.15)), fuel: Math.max(1500, cnt(n) * 40), ammo: Math.max(1500, cnt(n) * 50), equipment: Math.max(1500, cnt(n) * 100), supplyPoints: 600 },
    income: { manpower: Math.max(2, Math.ceil(mpOf(n) * 0.3 / ticks)), fuel: Math.max(2, Math.ceil(cnt(n) * 0.15)), ammo: Math.max(2, Math.ceil(cnt(n) * 0.2)), equipment: Math.max(2, Math.ceil(cnt(n) * 0.4)), supplyPoints: 5 },
  });
  const base = [
    ['GER', 'axis', 'Germany', true], ['FRA', 'allies', 'France', true], ['GBR', 'allies', 'United Kingdom (BEF)', true],
    ['BEL', 'allies', 'Belgium', false], ['NED', 'allies', 'Netherlands', false], ['ITA', 'axis', 'Italy (enters 10 June 1940)', false],
  ];
  return base.filter((n) => !short || n[0] !== 'ITA' && n[0] !== 'NED').map(([id, side, name, playable]) => ({ id, side, name, playable, ...pool(id), reinforcements: [] }));
};

// Reinforcements. 4th DCR: S04 lists under French armoured reserves (de Gaulle); formation/arrival time APPROXIMATE (unverified).
function reinforcementsFor(epoch, short) {
  const mk = (id, name, shortName, type, pos, mp, exp, morale, ent) => ({
    id, name, shortName, nation: 'FRA', side: 'allies', type, domain: 'land', pos,
    manpower: mp, manpowerMax: mp, equipment: { held: { ...T[type].eq }, authorised: { ...T[type].eq } },
    organisation: 70, morale, experience: exp, fuel: 100, ammo: 100, supply: 100, fatigue: 10, readiness: 70, entrenchment: ent,
    moveStatus: 'stationary', combatStatus: 'idle', posture: 'defend', orders: [], kills: 0,
  });
  const R = [];
  const push = (key, iso, u, srcs) => { REINF_SRC[`reinf.${u.id}`] = srcs; R.push({ id: `reinf.${u.id}`, atMinutes: mins(iso, epoch), pos: u.pos, unit: u }); };
  // 4th DCR: S04 lists it under French armoured reserves; arrival 15 May APPROXIMATE/unverified.
  push('dcr4', '1940-05-15T00:00:00Z', mk('fra.dcr.4', '4e Division Cuirassée (de Gaulle)', '4e DCR', 'armoured', [3.62, 49.56], 8000, 30, 70, 0), ['S04', 'G03']);
  if (!short) {
    // S17: Tenth Army (Altmayer) reconstituted 23-28 May; position: Somme/lower Seine sector, APPROXIMATE. No divisions sourced.
    push('a10', '1940-05-28T00:00:00Z', mk('fra.a10', '10e Armée (Altmayer) (reconstituée)', '10e Armée', 'hq', [1.5, 49.7], 600, 50, 70, 0), ['S17', 'G03']);
  }
  return R;
}

// ───────────────────────── Objectives ─────────────────────────
function objectives(epoch, short) {
  const FR = { west: -4.8, south: 46.5, east: 8.2, north: 51.1 }; // France north of ~Loire; region for control_fraction
  const SH = { west: 1.0, south: 48.8, east: 7.0, north: 51.2 };
  const end = mins(short ? '1940-05-21T00:00:00Z' : '1940-06-25T00:00:00Z', epoch);
  const ob = (id, tier, side, title, description, condition, points) => ({ id, tier, side, title, description, condition, points, status: 'pending' });
  if (short) return [
    ob('o.ger.sedan', 'primary', 'axis', 'Force the Meuse at Sedan', 'Capture Sedan and establish a bridgehead over the Meuse.', { kind: 'capture_location', locationId: 'sedan' }, 100),
    ob('o.ger.dinant', 'secondary', 'axis', 'Seize the Dinant crossing', 'Take Dinant and its Meuse bridge.', { kind: 'capture_location', locationId: 'dinant' }, 60),
    ob('o.ger.abbeville', 'primary', 'axis', 'Reach the Channel at Abbeville', 'Drive to the coast and cut the Allied armies in two.', { kind: 'capture_location', locationId: 'abbeville' }, 150),
    ob('o.ger.amiens', 'secondary', 'axis', 'Take Amiens', 'Capture Amiens on the Somme.', { kind: 'capture_location', locationId: 'amiens' }, 60),
    ob('o.ger.control', 'strategic', 'axis', 'Dominate the Meuse-Somme corridor', 'Control a third of the theatre.', { kind: 'control_fraction', fraction: 0.45, region: SH }, 100),
    ob('o.all.sedan', 'primary', 'allies', 'Hold Sedan', 'Deny Sedan to the Germans until the end of the scenario.', { kind: 'hold_location', locationId: 'sedan', untilMinutes: end }, 100),
    ob('o.all.dinant', 'secondary', 'allies', 'Hold the Dinant bridge', 'Hold Dinant.', { kind: 'hold_location', locationId: 'dinant', untilMinutes: end }, 60),
    ob('o.all.abbeville', 'primary', 'allies', 'Keep the corridor closed to the sea', 'Hold Abbeville.', { kind: 'hold_location', locationId: 'abbeville', untilMinutes: end }, 150),
    ob('o.all.amiens', 'secondary', 'allies', 'Hold Amiens', 'Hold Amiens on the Somme.', { kind: 'hold_location', locationId: 'amiens', untilMinutes: end }, 60),
    ob('o.all.control', 'strategic', 'allies', 'Hold the line', 'Keep control of at least half of the theatre.', { kind: 'control_fraction', fraction: 0.55, region: SH }, 100),
  ];
  return [
    ob('o.ger.sedan', 'primary', 'axis', 'Cross the Meuse at Sedan', 'Capture Sedan and break the Meuse line.', { kind: 'capture_location', locationId: 'sedan' }, 100),
    ob('o.ger.abbeville', 'primary', 'axis', 'Sickle Cut to the Channel', 'Reach the coast at Abbeville, severing the Allied northern armies.', { kind: 'capture_location', locationId: 'abbeville' }, 150),
    ob('o.ger.dunkirk', 'secondary', 'axis', 'Take Dunkirk', 'Capture the last Allied port in the pocket.', { kind: 'capture_location', locationId: 'dunkirk' }, 100),
    ob('o.ger.rotterdam', 'secondary', 'axis', 'Subdue the Netherlands', 'Capture Rotterdam.', { kind: 'capture_location', locationId: 'rotterdam' }, 75),
    ob('o.ger.brussels', 'secondary', 'axis', 'Occupy Brussels', 'Capture the Belgian capital.', { kind: 'capture_location', locationId: 'brussels' }, 75),
    ob('o.ger.cherbourg', 'secondary', 'axis', 'Take Cherbourg', 'Capture the Channel port of Cherbourg.', { kind: 'capture_location', locationId: 'cherbourg' }, 50),
    ob('o.ger.paris', 'primary', 'axis', 'Enter Paris', 'Capture Paris.', { kind: 'capture_location', locationId: 'paris' }, 250),
    ob('o.ger.control', 'strategic', 'axis', 'Conquer northern France', 'Control half of northern France by the armistice.', { kind: 'control_fraction', fraction: 0.5, region: FR }, 300),
    ob('o.all.paris', 'primary', 'allies', 'Hold Paris', 'Keep Paris out of German hands.', { kind: 'hold_location', locationId: 'paris', untilMinutes: end }, 250),
    ob('o.all.sedan', 'secondary', 'allies', 'Hold Sedan past 13 May', 'Deny Sedan to the Germans through 13 May.', { kind: 'hold_location', locationId: 'sedan', untilMinutes: mins('1940-05-14T00:00:00Z', epoch) }, 100),
    ob('o.all.dunkirk', 'secondary', 'allies', 'Hold the Dunkirk perimeter', 'Hold Dunkirk until 4 June to cover the evacuation.', { kind: 'hold_location', locationId: 'dunkirk', untilMinutes: mins('1940-06-04T00:00:00Z', epoch) }, 100),
    ob('o.all.metz', 'secondary', 'allies', 'Hold the Maginot sector', 'Hold Metz until the end.', { kind: 'hold_location', locationId: 'metz', untilMinutes: end }, 75),
    ob('o.all.le_havre', 'secondary', 'allies', 'Hold Le Havre for the BEF', 'Keep Le Havre open until 10 June (Operation Cycle evacuations began then per S12).', { kind: 'hold_location', locationId: 'le_havre', untilMinutes: mins('1940-06-10T00:00:00Z', epoch) }, 50),
    ob('o.all.control', 'strategic', 'allies', 'Keep France in the war', 'Hold at least 45% of northern France until the armistice.', { kind: 'control_fraction', fraction: 0.45, region: FR }, 300),
    ob('o.all.survive', 'strategic', 'allies', 'Survive to the armistice', 'Keep fighting until 25 June 1940.', { kind: 'survive_until', minutes: end }, 100),
  ];
}

// ───────────────────────── Scenario assembly ─────────────────────────
function build(short) {
  const epochIso = short ? '1940-05-12T00:00:00Z' : '1940-05-10T00:00:00Z';
  const epoch = Date.parse(epochIso);
  const b = short ? bbox.short : bbox.std;
  const units = buildUnits(short);
  const locations = buildLocations(b).map((l) => ({ ...l, id: norm(l.id), ...(short && l.id === 'luxembourg' ? { owner: 'GER' } : {}) }));
  const objs = objectives(epoch, short);
  const locIds = new Set(locations.map((l) => l.id));
  const O = (pref) => objs.filter((o) => o.id.startsWith(pref)).map((o) => o.id);
  const allyIds = O('o.all.');
  const gerIds = O('o.ger.');
  const supply = short
    ? { GER: ['aachen', 'trier', 'luxembourg'], FRA: ['reims', 'amiens', 'lille'], GBR: ['dover', 'rouen'], BEL: ['brussels'] }
    : { GER: ['cologne', 'koblenz', 'trier', 'duesseldorf', 'muenster'], FRA: ['paris', 'reims', 'le_havre', 'cherbourg', 'brest', 'st_nazaire', 'nantes', 'metz', 'strasbourg'], GBR: ['dover', 'london', 'le_havre', 'cherbourg', 'rouen', 'nantes', 'st_nazaire', 'brest'], BEL: ['brussels', 'antwerp'], NED: ['rotterdam', 'amsterdam'] };
  for (const k of Object.keys(supply)) supply[k] = supply[k].filter((id) => locIds.has(id) && sameSide(locations.find((l) => l.id === id).owner, k));
  const std = {
    schema: 1,
    id: short ? 'fall_of_france.short' : 'fall_of_france.standard',
    campaignId: 'fall_of_france',
    title: short ? 'Fall of France: Breakthrough at Sedan (12-20 May 1940)' : 'Fall of France 1940 (Fall Gelb / Fall Rot)',
    scale: short ? 'short' : 'standard',
    startDate: epochIso,
    endDate: short ? '1940-05-21T00:00:00Z' : '1940-06-25T00:00:00Z',
    bbox: b,
    estimatedPlayMinutes: short ? [45, 90] : [240, 480],
    mapSize: short ? 'small' : 'large',
    complexity: short ? 3 : 4,
    briefing: short ? {
      historical: 'By 12 May 1940 the German Army Group A had driven armoured divisions through the Ardennes and stood on the Meuse. Guderian\'s XIX Panzer Corps entered Sedan that day (S08); Hoth\'s XV Corps and Reinhardt\'s XLI Corps closed on the river further north. The French Second and Ninth Armies held the Meuse line while the First Army and the BEF moved forward under Plan D toward the Dyle (S13).',
      situation: 'The Meuse crossings decide the campaign. As the Germans, force the river, widen the bridgehead and race for the Channel at Abbeville before the French armoured reserves can react. As the Allies, hold the Meuse, counter-attack with the DCRs and keep the corridor to the sea closed. The scenario ends 20 May 1940, the day the Germans reached the coast (S06).',
    } : {
      historical: 'On 10 May 1940 Germany attacked in the West (Fall Gelb). Army Group B invaded the Netherlands and Belgium while Army Group A, with seven panzer divisions, advanced through the Ardennes toward the Meuse (S06, S07). The Allied 1st Army Group, including the French First, Seventh and Ninth Armies and the BEF, advanced into Belgium under Plan D (S13). Sedan was crossed on 13 May (S08), the Channel reached about 20 May, the BEF evacuated from Dunkirk 26 May - 4 June (S11), and Fall Rot opened on 5 June. France signed the armistice on 22 June (S06).',
      situation: 'Play the German offensive, the French defence or the BEF. The Germans must break the Meuse and reach the Channel before the Allies can consolidate; the Allies must hold the Meuse and Paris and preserve their forces. Positions at the start are approximate assembly areas, not surveyed historical deployments. The scenario runs to the armistice, 25 June 1940.',
    },
    playableNations: short ? [
      { nation: 'GER', difficultyRating: 3, summary: 'Armoured breakthrough with a strong spearhead and a long supply line.', objectiveIds: gerIds },
      { nation: 'FRA', difficultyRating: 4, summary: 'Hold a river line with divided forces and slow communications.', objectiveIds: allyIds },
      { nation: 'GBR', difficultyRating: 3, summary: 'Command the BEF on the Dyle line and cover the French flank.', objectiveIds: allyIds },
    ] : [
      { nation: 'GER', difficultyRating: 3, summary: 'Execute Fall Gelb and Fall Rot against numerically comparable Allies with the initiative.', objectiveIds: gerIds },
      { nation: 'FRA', difficultyRating: 5, summary: 'Defend France with a large but poorly coordinated army and a fixed strategic plan.', objectiveIds: allyIds },
      { nation: 'GBR', difficultyRating: 4, summary: 'Command the BEF: a small force far from home with a coast at its back.', objectiveIds: allyIds },
    ],
    nations: NATIONS(short, [...units, ...reinforcementsFor(epoch, short).map((r) => r.unit)]),
    locations,
    units,
    reinforcements: reinforcementsFor(epoch, short),
    objectives: objs,
    terrainFile: 'terrain_westeurope.json',
    infraFile: 'infra_westeurope.json',
    supplySources: supply,
    initialControl: clipCtrl(b, short),
    weatherProfile: WEATHER,
    eventTemplateIds: EVENTS.filter((e) => !short || (e.date >= '1940-05-12' && e.date <= '1940-05-21')).map((e) => e.id),
    specialSystems: [],
    victoryTiers: { axis: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 }, allies: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 } },
    sources: SOURCES.map(({ id, citation, url }) => ({ id, citation, ...(url ? { url } : {}) })),
  };
  // short: reinforcement 4. DCR must fall in window
  if (short && std.reinforcements.some((r) => r.atMinutes < 0)) std.reinforcements = [];
  return std;
}

// ───────────────────────── Historical events (data for events engine) ─────────────────────────
const EVENTS = [
  { id: 'fof.ev.invasion', date: '1940-05-10', title: 'Germany attacks in the West', body: 'German forces invade the Netherlands, Belgium and Luxembourg. Army Group A begins its advance through the Ardennes; airborne troops land around The Hague, Rotterdam and Eben-Emael.', pos: [5.68, 50.80], src: ['S06', 'S07', 'S09'], effectHints: ['Allied 1st Army Group may begin Plan D advance', 'NED and BEL at war'] },
  { id: 'fof.ev.sedan_reached', date: '1940-05-12', title: 'Guderian reaches Sedan', body: 'XIX Panzer Corps enters Sedan. The Meuse line is now directly threatened.', pos: [4.94, 49.70], side: 'allies', src: ['S08'], effectHints: [] },
  { id: 'fof.ev.sedan_crossing', date: '1940-05-13', title: 'The Meuse is crossed at Sedan', body: 'After an eight-hour Luftwaffe bombardment, the 1st, 2nd and 10th Panzer Divisions cross the Meuse at Gaulier, Donchery and Wadelincourt. French morale at Sedan collapses.', pos: [4.94, 49.70], src: ['S08'], effectHints: ['Morale penalty to French units near Sedan', 'Bridgehead bonus to Germans'] },
  { id: 'fof.ev.rotterdam', date: '1940-05-14', title: 'Rotterdam bombed', body: 'The Luftwaffe bombs Rotterdam; German forces threaten further cities.', pos: [4.48, 51.92], src: ['S09'], effectHints: ['Netherlands may capitulate within 24h'] },
  { id: 'fof.ev.dutch_capitulation', date: '1940-05-15', title: 'The Netherlands capitulates', body: 'The main Dutch forces surrender. Fighting continues in Zeeland until 17 May. (S09 summary gives 14 May for the surrender; S06 gives 15 May.)', pos: [4.30, 52.08], src: ['S06', 'S09'], effectHints: ['NED units removed from play except Zeeland until 17 May'],
    effects: [
      { op: 'location_owner', locationId: 'the_hague', owner: 'GER' }, { op: 'location_owner', locationId: 'rotterdam', owner: 'GER' }, { op: 'location_owner', locationId: 'amsterdam', owner: 'GER' },
      { op: 'unit_manpower', nation: 'NED', fraction: -1 },
      { op: 'log', text: 'The Netherlands has capitulated; Dutch field forces are disbanded (Zeeland resistance to 17 May is abstracted away, S09).', severity: 'critical' },
    ],
    effectsNote: 'Restates S06/S09: main Dutch forces surrendered and the cities passed to German control. Zeeland holdout to 17 May is not modelled.' },
  { id: 'fof.ev.channel', date: '1940-05-20', title: 'German armour reaches the Channel', body: 'Panzer units reach the coast around Abbeville, separating the Allied northern armies from the south.', pos: [1.83, 50.11], src: ['S06', 'S08'], effectHints: ['Allied northern armies cut off from southern supply'] },
  { id: 'fof.ev.arras', date: '1940-05-21', title: 'Counter-attack at Arras', body: 'British Frankforce (1st Army Tank Brigade with elements of the 5th and 50th Divisions) attacks the flank of the German advance near Arras. It is withdrawn after dark but unsettles the German high command.', pos: [2.78, 50.29], side: 'allies', src: ['S10'], effectHints: [] },
  { id: 'fof.ev.halt_order', date: '1940-05-24', title: 'Halt order before Dunkirk', body: 'Hitler approves a halt order issued the previous night by Rundstedt; it is rescinded on 26 May.', pos: [2.38, 51.04], src: ['S11'], effectHints: ['German armour held back from the Dunkirk pocket until 26 May'] },
  { id: 'fof.ev.dynamo_start', date: '1940-05-26', title: 'Operation Dynamo begins; Calais falls', body: 'Evacuation from Dunkirk begins. The British garrison at Calais surrenders the same day.', pos: [2.38, 51.04], src: ['S11'], effectHints: ['Allied evacuation from Dunkirk enabled', 'Calais lost'] },
  { id: 'fof.ev.belgium', date: '1940-05-28', title: 'Belgium capitulates', body: 'King Leopold III surrenders the Belgian Army, against the advice of his government.', pos: [4.35, 50.85], src: ['S14'], effectHints: ['BEL units removed from play', 'Allied northern flank opened'],
    effects: [
      { op: 'unit_manpower', nation: 'BEL', fraction: -1 },
      { op: 'log', text: 'King Leopold III has surrendered the Belgian Army; Belgian forces cease to fight.', severity: 'critical' },
    ],
    effectsNote: 'Restates S14: Belgian army capitulated on 28 May. No territory transfer is scripted because the sources retrieved do not date the fall of individual Belgian cities.' },
  { id: 'fof.ev.dynamo_end', date: '1940-06-04', title: 'Operation Dynamo ends', body: 'The evacuation ends after 338,226 Allied troops were lifted from Dunkirk and the surrounding beaches.', pos: [2.38, 51.04], src: ['S11'], effectHints: [] },
  { id: 'fof.ev.fall_rot', date: '1940-06-05', title: 'Fall Rot begins', body: 'Germany launches the second phase against the French defence line on the Somme and Aisne.', pos: [2.30, 49.89], src: ['S06'], effectHints: [] },
  { id: 'fof.ev.italy', date: '1940-06-10', title: 'Italy declares war; Paris declared an open city', body: 'Italy enters the war against France and Britain. Paris is declared an open city.', pos: [2.35, 48.86], src: ['S06'], effectHints: ['ITA enters war on Axis side (Alpine front)'] },
  { id: 'fof.ev.st_valery', date: '1940-06-12', title: 'Surrender at Saint-Valery-en-Caux', body: 'The 7th Panzer Division forces the surrender of the British 51st (Highland) Division and French IX Corps.', pos: [0.71, 49.87], side: 'allies', src: ['S06'], effectHints: ['51st Highland Division destroyed/captured'] },
  { id: 'fof.ev.paris', date: '1940-06-14', title: 'German troops enter Paris', body: 'Paris is occupied without resistance.', pos: [2.35, 48.86], src: ['S06'], effectHints: ['Paris transfers to Germany if undefended'] },
  { id: 'fof.ev.tiger', date: '1940-06-15', title: 'Operation Tiger and Operation Aerial', body: 'Army Group C attacks across the Rhine against the Maginot Line (Operation Tiger). British evacuation from French Atlantic ports (Operation Aerial) begins and runs to 25 June.', pos: [7.75, 48.58], src: ['S06', 'S12'], effectHints: ['Maginot sector attacked', 'BEF evacuation via western ports'] },
  { id: 'fof.ev.petain', date: '1940-06-16', title: 'Reynaud resigns; Pétain takes office', body: 'Paul Reynaud resigns and is succeeded by Marshal Pétain.', pos: [2.35, 48.86], src: ['S06'], effectHints: ['French resolve reduced'] },
  { id: 'fof.ev.cherbourg', date: '1940-06-18', title: 'Cherbourg captured', body: 'German forces capture Cherbourg.', pos: [-1.62, 49.64], src: ['S06'], effectHints: [] },
  { id: 'fof.ev.armistice', date: '1940-06-22', title: 'Armistice signed at Compiègne', body: 'France and Germany sign an armistice; it takes effect at 00:35 on 25 June.', pos: [2.9, 49.42], src: ['S06'], effectHints: ['Scenario ends 25 June'] },
];

// ───────────────────────── Emit ─────────────────────────
const unitSrc = Object.fromEntries([...U.map((r) => [r[0], r[8]]), ...AIR.map((r) => [r[0], r[8]])]);
const uncertain = [
  { item: 'Meuse sector respread and quality classes (Sedan audit)', note: 'S08 sources: 55th Division at Sedan, 71st relieving it (partly by 10 May, completed 13-14 May), both Series B reservists over 30 with little training and short of anti-tank/anti-aircraft guns; X Corps held Remilly-Aillicourt; Ninth/Second Army divisions chiefly poor quality. NOT sourced: which 9th Army division held which Meuse segment, the positions of XVIII Corps divisions (placed Stenay-Longuyon), XXI Corps assembly area (3rd DCR / 3rd DIM placed near Rethel), the series of each division. All start positions are approximate river-segment anchors (G03). Series B experience 25 / morale 62 / organisation 75 / start entrenchment 20 and posture hold (entrenchment cap 40: S08 bunkers incomplete, no mines at Sedan), fortress divisions 35/68 (Maginot 104th/105th start entrenchment 50), other 9th/2nd Army infantry 40/65/80 are GAME-SCALE (G01), not historical.' },
  { item: 'All unit start positions', note: 'Approximate sector/assembly areas (G03); no source gives division start locations.' },
  { item: 'German 15th, 4th Infantry Divisions', note: 'Assigned to different corps/army groups in S01 vs S02; OMITTED.' },
  { item: 'German 211th ID', note: 'Listed under V Corps (S01) and XI Corps (S02); placed under V Corps only.' },
  { item: 'German 3rd ID', note: 'III Corps in S01; unassigned in S02; placed in III Corps (12. Armee).' },
  { item: 'German 6th Mountain Division, SS-Verfügungstruppe Division, XXXIX Corps', note: 'Listed by sources but unclear/inconsistent for 10 May; OMITTED.' },
  { item: 'Army Group C divisions', note: 'Single source (S03); lower confidence.' },
  { item: 'French armoured reserve positions (1st-3rd DCR, 3rd DIM)', note: 'No location sourced; placed in a reserve area behind the Meuse (approximate). 4th DCR arrival 15 May is approximate/unverified.' },
  { item: 'French 4th Army, Army of the Alps divisions, Polish divisions, 12th/23rd/46th BEF labour divisions, 1st Armoured Division, 52nd/1st Canadian Divisions', note: 'Omitted: role/arrival not verified (S12 gives only Second BEF composition from 2 June).' },
  { item: 'Belgian and Dutch corps', note: 'Corps-level only; positions are an approximate arc. Divisions omitted.' },
  { item: 'Italian army and Luftwaffe/RAF/Armée de l\'Air', note: 'Not modelled; Italy appears only as an event and a nation record.' },
  { item: 'Dutch capitulation date', note: 'S09 summary says 14 May, S06 says 15 May; scenario uses 15 May.' },
  { item: 'Weather profile', note: 'Qualitative only (S15); probabilities and temperatures are game-scale.' },
  { item: 'initialControl polygons', note: 'Coarse; ignore coastline detail (G04).' },
  { item: 'Short: German-held ground on 12 May', note: 'Extra GER initialControl polygons (Luxembourg, the Ardennes up to the Meuse bend, and the Maastricht-Hannut approach) and Luxembourg City owned by GER on 12 May are APPROXIMATE: S06 sources the 10 May occupation of Luxembourg and S08/Sedan article the 12 May advance through southern Belgium, but not the exact line. Added so the German spearheads do not start inside enemy-owned cells and cut off from supply.' },
  { item: 'Paris garrison and Weygand Line', note: 'Only the existence of a Paris military command (S18) and the reconstituted 10th Army HQ (S17) are sourced. The Paris garrison strength is game-scale; no Somme/Aisne/Paris divisions could be identified from retrievable sources, so none are modelled. French reserve divisions (S04) are placed behind the Maginot Line, not in the Paris region.' },
  { item: 'Air formations', note: 'Luftwaffe (S19) is a low-confidence forum aggregation; aircraft counts are sums of listed Stab/Gruppe strengths. French groupes use escadrilles x 11 (fighters, S22) or x 10 (bombers, game-scale). RAF squadrons use 16 aircraft each (game-scale; S21 gives no strengths). Airfield coordinates +/-0.15 deg. OMITTED: KG 51 and KG 55 (bases outside the map), Lysander squadrons, reconnaissance and army-co-operation groups (no unit type), French GIABSE bomber groups and ZOAA groups (committed later / in formation), UK-based Fighter Command squadrons (no sourced 10 May 1940 mapping found), Italian air force, Dutch and Belgian air forces. StG 2/StG 77 corps assignment conflicts between sources (VIII. vs IV. Fliegerkorps; VIII. used).' },
  { item: 'Nation resources / income / unit strengths / morale / experience', note: 'Game-scale abstraction (G01), not historical.' },
];
function emit(def) {
  writeFileSync(join(OUT, `${def.id}.json`), JSON.stringify(def, null, 1) + '\n');
  const sidecar = {
    scenarioId: def.id,
    note: 'Per-fact source references (ScenarioDefinition has no per-unit sourceRef field). IDs resolve against def.sources.',
    units: Object.fromEntries(def.units.map((u) => [u.id, { sources: [...new Set([...(unitSrc[u.id] ?? []), 'G01', 'G03'])], positionApproximate: true }])),
    locations: Object.fromEntries(def.locations.map((l) => [l.id, { sources: [...new Set([...(LOC.find((r) => norm(r[0]) === l.id)?.[7] ?? AIRFIELDS.find((a) => a[0] === l.id)?.[5] ?? []), 'G02'])], ...(l.kind === 'fortress' && l.id.match(/hackenberg|fermont|schoenenbourg/) ? { approximate: true } : {}) }])),
    reinforcements: Object.fromEntries(def.reinforcements.map((r) => [r.id, { sources: REINF_SRC[r.id] ?? ['S04', 'G03'], approximate: true }])),
    nations: Object.fromEntries(def.nations.map((n) => [n.id, { sources: ['G01'], gameScale: true }])),
    objectives: Object.fromEntries(def.objectives.map((o) => [o.id, { sources: ['S06', 'G01'] }])),
    uncertain,
  };
  writeFileSync(join(OUT, `${def.id}.sources.json`), JSON.stringify(sidecar, null, 1) + '\n');
}

const std = build(false);
const sh = build(true);
emit(std); emit(sh);
writeFileSync(join(OUT, 'fall_of_france.events.json'), JSON.stringify({
  campaignId: 'fall_of_france', note: 'Historical event template DATA for the events engine. date is UTC ISO date; scenario converts to minutes via startDate. Sources resolve against scenario sources[].',
  events: EVENTS.map((e) => ({ ...e, kind: 'historical', minutesFromStd: mins(e.date + 'T00:00:00Z') })),
}, null, 1) + '\n');
console.log('standard units', std.units.length, 'locations', std.locations.length, '| short units', sh.units.length, 'locations', sh.locations.length);
// bbox sanity
for (const d of [std, sh]) for (const u of d.units) if (!inBox(d.bbox, u.pos)) console.error('OUT OF BBOX', d.id, u.id, u.pos);
