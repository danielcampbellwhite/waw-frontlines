// Generator for Normandy Short (6 Jun - 31 Jul 1944).
// Run: node src/data/campaigns/_build/build_normandy.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES } from './normandy_sources.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(OUT, { recursive: true });
const EPOCH = Date.parse('1944-06-06T00:00:00Z');
const END_ISO = '1944-07-31T00:00:00Z';
const mins = (iso) => Math.round((Date.parse(iso) - EPOCH) / 60000);
const hrs = (iso) => mins(iso) / 60;
const TICKS = mins(END_ISO) / 60;
const BBOX = { west: -2.6, south: 48.4, east: 0.8, north: 51.0 };
const inBox = ([lon, lat]) => lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;

// [id, name, kind, lon, lat, owner, originalOwner, value, srcs, extra]. Coordinates: M14 (Wikipedia) or M15 (Nominatim).
const LOC = [
  ['cherbourg', 'Cherbourg', 'port', -1.625, 49.6425, 'GER', 'GER', 10, ['M15', 'M10'], { availableFromHour: hrs('1944-07-16T00:00:00Z'), rampHours: 240 }],
  ['carentan', 'Carentan', 'town', -1.2523, 49.2948, 'GER', 'GER', 6, ['M15', 'M10']],
  ['saint_lo', 'Saint-Lo', 'city', -1.0909, 49.1158, 'GER', 'GER', 8, ['M15', 'M11']],
  ['caen', 'Caen', 'city', -0.3636, 49.1814, 'GER', 'GER', 10, ['M14', 'M02']],
  ['bayeux', 'Bayeux', 'town', -0.7028, 49.2794, 'GER', 'GER', 5, ['M14', 'M05']],
  ['isigny', 'Isigny-sur-Mer', 'town', -1.1008, 49.3186, 'GER', 'GER', 3, ['M14', 'M04']],
  ['sainte_mere_eglise', 'Sainte-Mere-Eglise', 'town', -1.3268, 49.4118, 'GER', 'GER', 3, ['M15', 'M09']],
  ['utah_beach', 'Utah Beach', 'depot', -1.2, 49.38, 'USA', 'GER', 4, ['M15', 'M03']],
  ['omaha_beach', 'Omaha Beach', 'depot', -0.8686, 49.3689, 'USA', 'GER', 4, ['M14', 'M04']],
  ['gold_beach', 'Gold Beach', 'depot', -0.538, 49.339, 'GBR', 'GER', 4, ['M15', 'M05']],
  ['juno_beach', 'Juno Beach', 'depot', -0.4153, 49.3354, 'CAN', 'GER', 4, ['M14', 'M06']],
  ['sword_beach', 'Sword Beach', 'depot', -0.3211, 49.3064, 'GBR', 'GER', 4, ['M14', 'M07']],
  ['arromanches', 'Arromanches (Mulberry B)', 'port', -0.6228, 49.3373, 'GBR', 'GER', 5, ['M15', 'M08', 'M02'], { throughputTonsPerDay: 6000, availableFromHour: 192, rampHours: 48, besiegedShare: 0.8 }],
  ['mulberry_a', 'Saint-Laurent-sur-Mer (Mulberry A)', 'port', -0.8789, 49.3604, 'USA', 'GER', 5, ['M15', 'M08'], { throughputTonsPerDay: 6000, availableFromHour: 192, rampHours: 48, besiegedShare: 0.8 }],
  ['port_en_bessin', 'Port-en-Bessin', 'port', -0.7527, 49.3458, 'GBR', 'GER', 2, ['M15', 'M05']],
  ['pointe_du_hoc', 'Pointe du Hoc', 'fortress', -0.9894, 49.3978, 'GER', 'GER', 3, ['M15', 'M04']],
  ['pegasus_bridge', 'Benouville (Caen Canal bridge)', 'bridge', -0.2741, 49.2424, 'GER', 'GER', 3, ['M15', 'M09']],
  ['carpiquet', 'Carpiquet (airfield)', 'airfield', -0.4433, 49.1864, 'GER', 'GER', 4, ['M14', 'M06']],
  ['villers_bocage', 'Villers-Bocage', 'town', -0.66, 49.08, 'GER', 'GER', 3, ['M14', 'M02']],
  ['tilly', 'Tilly-sur-Seulles', 'town', -0.6251, 49.1759, 'GER', 'GER', 2, ['M15', 'M12']],
  ['caumont', 'Caumont-l\'Eventé', 'town', -0.8039, 49.0911, 'GER', 'GER', 3, ['M14', 'M11']],
  ['bourguebus', 'Bourguebus (ridge)', 'town', -0.2964, 49.1222, 'GER', 'GER', 3, ['M14', 'M11']],
  ['avranches', 'Avranches', 'town', -1.3556, 48.685, 'GER', 'GER', 6, ['M14', 'M11']],
  ['coutances', 'Coutances', 'town', -1.4455, 49.0478, 'GER', 'GER', 4, ['M15', 'M11']],
  ['periers', 'Periers', 'town', -1.41, 49.1871, 'GER', 'GER', 3, ['M15', 'M11']],
  ['valognes', 'Valognes', 'town', -1.4706, 49.5091, 'GER', 'GER', 3, ['M15', 'M10']],
  ['falaise', 'Falaise', 'town', -0.1975, 48.8972, 'GER', 'GER', 4, ['M14', 'M02']],
  ['vire', 'Vire', 'town', -0.8686, 48.82, 'GER', 'GER', 4, ['M15', 'M11']],
  ['southampton', 'Southampton (embarkation port)', 'port', -1.3968, 50.8965, 'GBR', 'GBR', 6, ['M14', 'G01'], { throughputTonsPerDay: 6000 }],
  ['portsmouth', 'Portsmouth (embarkation port)', 'port', -1.0872, 50.8058, 'GBR', 'GBR', 6, ['M14', 'G01'], { throughputTonsPerDay: 4000 }],
  ['poole', 'Poole (embarkation port)', 'port', -1.9833, 50.7167, 'GBR', 'GBR', 4, ['M14', 'G01'], { throughputTonsPerDay: 2000 }],
  ['weymouth', 'Weymouth (embarkation port)', 'port', -2.4547, 50.6097, 'GBR', 'GBR', 4, ['M14', 'G01'], { throughputTonsPerDay: 2000 }],
  ['newhaven', 'Newhaven (embarkation port)', 'port', 0.0544, 50.7896, 'GBR', 'GBR', 3, ['M14', 'G01'], { throughputTonsPerDay: 2000 }],
  ['lisieux', 'Lisieux', 'town', 0.23, 49.15, 'GER', 'GER', 4, ['M14']],
];
const LOCOWN = Object.fromEntries(LOC.map((l) => [l[0], l]));

// Anchors (G03) [lon, lat]
const A = {
  UTAH: [-1.2, 49.38], OMAHA: [-0.88, 49.358], GOLD: [-0.538, 49.339], JUNO: [-0.4153, 49.3354], SWORD: [-0.3211, 49.3064],
  DZ_US: [-1.33, 49.38], DZ_BR: [-0.25, 49.23],
  CHER: [-1.625, 49.635], G709: [-1.3, 49.45], G91: [-1.4, 49.38], G6FJ: [-1.255, 49.293], G243: [-1.55, 49.3], G352: [-0.9, 49.31], G716: [-0.36, 49.21], G21PZ: [-0.35, 49.17],
  LXXXIV: [-1.09, 49.11], I_SS: [-0.15, 49.05],
  E_12SS: [-0.2, 49.07], E_PLEHR: [-0.63, 49.02], E_17SS: [-1.4, 49.2], E_3FJ: [-1.0, 49.1], E_2SS: [-1.1, 49.0], E_9SS: [-0.55, 49.0], E_10SS: [-0.5, 49.0], E_1SS: [-0.1, 49.0],
  E_101HP: [-0.55, 49.0], E_275: [-1.1, 49.0], BEACH_SEA: [-0.5, 49.35],
};
const U = [];
const add = (id, name, sh, nation, type, anc, srcs, o = {}) => U.push({ id, name, sh, nation, type, anc, srcs, o });
const G = (id, name, sh, type, anc, srcs, o = {}) => add(id, name, sh, 'GER', type, anc, srcs, o);

// --- German start (6 Jun 00:00): static coast divisions, the 21st Panzer and the Carentan paratroop regiment. Positions approximate.
G('ger.c.LXXXIV', 'LXXXIV Army Corps (Marcks)', 'LXXXIV.AK', 'hq', 'LXXXIV', ['M01'], { exp: 50 });
G('ger.d.709', '709th Static Infantry Division (von Schlieben)', '709.ID', 'infantry', 'G709', ['M03', 'M10'], { exp: 35, morale: 62, ent: 50 });
G('ger.cherbourg', 'Cherbourg fortress garrison (game-scale share of the 21,000 men in M10)', 'Cherb Gar', 'infantry', 'CHER', ['M10'], { exp: 35, morale: 62, mp: 8000, ent: 50, exact: true });
G('ger.d.91', '91st Infantry Division', '91.ID', 'infantry', 'G91', ['M03'], { exp: 45, ent: 25 });
G('ger.fjr6', '6th Fallschirmjager Regiment (2nd Fallschirmjager Division)', '6.FJR', 'paratroop', 'G6FJ', ['M03', 'M10', 'M18'], { exp: 50, mp: 3500, ent: 30, exact: true });
G('ger.d.243', '243rd Static Infantry Division', '243.ID', 'infantry', 'G243', ['M18'], { exp: 35, morale: 62, ent: 40 });
G('ger.d.352', '352nd Infantry Division (Kraiss)', '352.ID', 'infantry', 'G352', ['M04', 'M05', 'M12'], { exp: 50, mp: 12000, ent: 55 });
G('ger.d.716', '716th Static Infantry Division', '716.ID', 'infantry', 'G716', ['M05', 'M06'], { exp: 35, morale: 62, mp: 6000, ent: 55, exact: true });
G('ger.d.21pz', '21st Panzer Division', '21.PzD', 'armoured', 'G21PZ', ['M06', 'M12'], { exp: 60, exact: true });

// --- Allied D-Day arrivals and later reinforcements: [id, iso, anchor/pos, name, type, nation, shortName, srcs, opts]. Arrival areas approximate.
const REI = [
  // 6 Jun airborne drops (about 01:00; local-time vs UTC is not resolved, G01)
  ['usa.82abn', '1944-06-06T01:00:00Z', 'DZ_US', '82nd Airborne Division (Ridgway)', 'paratroop', 'USA', '82nd Abn', ['M09'], { landing: { kind: 'airborne', casualties: 0.12, dispersionKm: 20, penaltyHours: 18, organisation: 40 } }],
  ['usa.101abn', '1944-06-06T01:00:00Z', 'DZ_US', '101st Airborne Division (Taylor)', 'paratroop', 'USA', '101st Abn', ['M09', 'M10'], { landing: { kind: 'airborne', casualties: 0.12, dispersionKm: 20, penaltyHours: 18, organisation: 40 } }],
  ['gbr.6abn', '1944-06-06T01:00:00Z', 'DZ_BR', '6th Airborne Division (Gale)', 'paratroop', 'GBR', '6th Abn', ['M09'], { landing: { kind: 'airborne', casualties: 0.12, dispersionKm: 20, penaltyHours: 18, organisation: 40 } }],
  // 6 Jun seaborne landings (about 06:30)
  ['usa.c.VII', '1944-06-06T06:30:00Z', 'UTAH', 'VII Corps (Collins)', 'hq', 'USA', 'VII Corps', ['M03', 'M09'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 3 } }],
  ['usa.4id', '1944-06-06T06:30:00Z', 'UTAH', '4th Infantry Division', 'infantry', 'USA', '4th ID', ['M03'], { landing: { kind: 'amphibious', casualties: 0.01, penaltyHours: 3 } }],
  ['usa.c.V', '1944-06-06T06:30:00Z', 'OMAHA', 'V Corps (Gerow)', 'hq', 'USA', 'V Corps', ['M04'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 3 } }],
  ['usa.1id', '1944-06-06T06:30:00Z', 'OMAHA', '1st Infantry Division', 'infantry', 'USA', '1st ID', ['M04'], { landing: { kind: 'amphibious', casualties: 0.07, penaltyHours: 6 } }],
  ['usa.29id', '1944-06-06T06:30:00Z', 'OMAHA', '29th Infantry Division', 'infantry', 'USA', '29th ID', ['M04', 'M16'], { landing: { kind: 'amphibious', casualties: 0.07, penaltyHours: 6 } }],
  ['usa.rangers', '1944-06-06T06:30:00Z', 'OMAHA', 'US Army Rangers (nine companies)', 'infantry', 'USA', 'Rangers', ['M04'], { mp: 1500, landing: { kind: 'amphibious', casualties: 0.07, penaltyHours: 6 } }],
  ['gbr.c.XXX', '1944-06-06T06:30:00Z', 'GOLD', 'XXX Corps (Bucknall)', 'hq', 'GBR', 'XXX Corps', ['M05'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 3 } }],
  ['gbr.50div', '1944-06-06T07:25:00Z', 'GOLD', '50th (Northumbrian) Infantry Division (Graham)', 'infantry', 'GBR', '50th Div', ['M05'], { landing: { kind: 'amphibious', casualties: 0.03, penaltyHours: 4 } }],
  ['gbr.8arm', '1944-06-06T07:20:00Z', 'GOLD', '8th Armoured Brigade (DD tanks)', 'armoured', 'GBR', '8 Armd Bde', ['M05'], { mp: 3500, landing: { kind: 'amphibious', casualties: 0.03, penaltyHours: 4 } }],
  ['gbr.c.I', '1944-06-06T07:25:00Z', 'SWORD', 'I Corps (Crocker)', 'hq', 'GBR', 'I Corps', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 3 } }],
  ['gbr.3div', '1944-06-06T07:25:00Z', 'SWORD', '3rd Infantry Division (Rennie)', 'infantry', 'GBR', '3rd Div', ['M07'], { landing: { kind: 'amphibious', casualties: 0.03, penaltyHours: 4 } }],
  ['gbr.27arm', '1944-06-06T07:25:00Z', 'SWORD', '27th Armoured Brigade (DD tanks)', 'armoured', 'GBR', '27 Armd Bde', ['M07'], { mp: 3500, landing: { kind: 'amphibious', casualties: 0.03, penaltyHours: 4 } }],
  ['gbr.1ssb', '1944-06-06T07:25:00Z', 'SWORD', '1st Special Service Brigade (Lovat)', 'infantry', 'GBR', '1 SS Bde', ['M07'], { mp: 2500, landing: { kind: 'amphibious', casualties: 0.03, penaltyHours: 4 } }],
  ['can.3div', '1944-06-06T07:45:00Z', 'JUNO', '3rd Canadian Infantry Division (Keller)', 'infantry', 'CAN', '3rd Cdn Div', ['M06'], { mp: 12000, landing: { kind: 'amphibious', casualties: 0.03, penaltyHours: 4 } }],
  ['can.2arm', '1944-06-06T08:00:00Z', 'JUNO', '2nd Canadian Armoured Brigade', 'armoured', 'CAN', '2 Cdn Armd Bde', ['M06'], { mp: 3500, landing: { kind: 'amphibious', casualties: 0.03, penaltyHours: 4 } }],
  // follow-on arrivals with sourced dates (position = the beach they came ashore on; M16/M17)
  ['gbr.7arm', '1944-06-07T23:00:00Z', 'GOLD', '7th Armoured Division', 'armoured', 'GBR', '7th Armd', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['gbr.51hd', '1944-06-07T12:00:00Z', 'SWORD', '51st (Highland) Infantry Division', 'infantry', 'GBR', '51st HD', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.2ad', '1944-06-09T12:00:00Z', 'OMAHA', '2nd Armored Division', 'armoured', 'USA', '2nd AD', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.9id', '1944-06-10T12:00:00Z', 'UTAH', '9th Infantry Division', 'infantry', 'USA', '9th ID', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.90id', '1944-06-10T12:00:00Z', 'UTAH', '90th Infantry Division', 'infantry', 'USA', '90th ID', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.30id', '1944-06-11T12:00:00Z', 'OMAHA', '30th Infantry Division (Hobbs)', 'infantry', 'USA', '30th ID', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.79id', '1944-06-13T12:00:00Z', 'UTAH', '79th Infantry Division', 'infantry', 'USA', '79th ID', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['gbr.11arm', '1944-06-13T12:00:00Z', 'JUNO', '11th Armoured Division', 'armoured', 'GBR', '11th Armd', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['gbr.49div', '1944-06-13T12:00:00Z', 'GOLD', '49th (West Riding) Infantry Division', 'infantry', 'GBR', '49th Div', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.83id', '1944-06-18T12:00:00Z', 'OMAHA', '83rd Infantry Division', 'infantry', 'USA', '83rd ID', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['gbr.43div', '1944-06-20T12:00:00Z', 'SWORD', '43rd (Wessex) Infantry Division', 'infantry', 'GBR', '43rd Div', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['gbr.15div', '1944-06-26T00:00:00Z', 'JUNO', '15th (Scottish) Infantry Division', 'infantry', 'GBR', '15th Div', ['M11', 'M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['gbr.53div', '1944-06-28T12:00:00Z', 'GOLD', '53rd (Welsh) Infantry Division', 'infantry', 'GBR', '53rd Div', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['gbr.guards', '1944-06-30T00:00:00Z', 'GOLD', 'Guards Armoured Division', 'armoured', 'GBR', 'Gds Armd', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['gbr.59div', '1944-06-30T12:00:00Z', 'GOLD', '59th (Staffordshire) Infantry Division', 'infantry', 'GBR', '59th Div', ['M17'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.35id', '1944-07-06T12:00:00Z', 'OMAHA', '35th Infantry Division', 'infantry', 'USA', '35th ID', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['can.2div', '1944-07-07T12:00:00Z', 'JUNO', '2nd Canadian Infantry Division', 'infantry', 'CAN', '2nd Cdn Div', ['M17'], { mp: 12000, landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.5id', '1944-07-09T12:00:00Z', 'UTAH', '5th Infantry Division', 'infantry', 'USA', '5th ID', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.4ad', '1944-07-11T12:00:00Z', 'UTAH', '4th Armored Division', 'armoured', 'USA', '4th AD', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  ['usa.28id', '1944-07-22T12:00:00Z', 'OMAHA', '28th Infantry Division', 'infantry', 'USA', '28th ID', ['M16'], { landing: { kind: 'amphibious', casualties: 0, penaltyHours: 2 } }],
  // German reinforcements (M12, M18): arrival areas approximate
  ['ger.d.12ss', '1944-06-07T06:00:00Z', 'E_12SS', '12th SS Panzer Division Hitlerjugend', 'armoured', 'GER', '12.SS-PzD', ['M12'], { exp: 60, morale: 85 }],
  ['ger.d.plehr', '1944-06-08T06:00:00Z', 'E_PLEHR', 'Panzer Lehr Division', 'armoured', 'GER', 'Pz Lehr', ['M12'], { exp: 65, morale: 82 }],
  ['ger.d.3fj', '1944-06-10T12:00:00Z', 'E_3FJ', '3rd Fallschirmjager Division', 'paratroop', 'GER', '3.FJD', ['M18'], { exp: 50 }],
  ['ger.d.17ss', '1944-06-11T12:00:00Z', 'E_17SS', '17th SS Panzergrenadier Division Gotz von Berlichingen', 'motorised', 'GER', '17.SS-PzGrD', ['M10', 'M18'], { exp: 50 }],
  ['ger.sspz101', '1944-06-12T12:00:00Z', 'E_101HP', '101st SS Heavy Panzer Battalion (Tigers)', 'armoured', 'GER', 's.SS-Pz.Abt 101', ['M18'], { mp: 800, exp: 65, morale: 85 }],
  ['ger.d.2ss', '1944-06-22T12:00:00Z', 'E_2SS', '2nd SS Panzer Division Das Reich', 'armoured', 'GER', '2.SS-PzD', ['M18'], { exp: 60, morale: 82 }],
  ['ger.d.9ss', '1944-06-26T12:00:00Z', 'E_9SS', '9th SS Panzer Division Hohenstaufen', 'armoured', 'GER', '9.SS-PzD', ['M11', 'M18'], { exp: 55, morale: 82 }],
  ['ger.d.10ss', '1944-06-28T00:00:00Z', 'E_10SS', '10th SS Panzer Division Frundsberg', 'armoured', 'GER', '10.SS-PzD', ['M11', 'M18'], { exp: 55, morale: 82 }],
  ['ger.d.1ss', '1944-06-28T00:00:00Z', 'E_1SS', '1st SS Panzer Division Leibstandarte', 'armoured', 'GER', '1.SS-PzD', ['M18'], { exp: 60, morale: 85 }],
  ['ger.d.275', '1944-07-15T00:00:00Z', 'E_275', '275th Infantry Division (remainder)', 'infantry', 'GER', '275.ID', ['M18'], { exp: 45 }],
];

const T = {
  hq: { mp: 600, eq: { rifle: 600 } }, infantry: { mp: 12000, eq: { rifle: 100, gun_arty: 50, gun_at: 30 } },
  motorised: { mp: 12000, eq: { rifle: 80, gun_arty: 40, truck: 60 } },
  armoured: { mp: 12000, eq: { tank_medium: 100, tank_light: 20, gun_arty: 24, truck: 60 } },
  paratroop: { mp: 9000, eq: { rifle: 90, gun_arty: 30, gun_at: 12 } },
};
const NAT = { GER: ['axis', 55, 76], USA: ['allies', 50, 75], GBR: ['allies', 60, 80], CAN: ['allies', 45, 78] };
const spread = (a, k, tight = false) => (tight ? [Math.round((a[0] + ((k % 4) - 1.5) * 0.008) * 1000) / 1000, Math.round((a[1] + (Math.floor(k / 4) % 3 - 1) * 0.004) * 1000) / 1000] : [Math.round((a[0] + ((k % 4) - 1.5) * 0.04) * 1000) / 1000, Math.round((a[1] + (Math.floor(k / 4) % 3 - 1) * 0.03) * 1000) / 1000]);
const cnt = {};
const mk = (r, pos) => {
  const t = T[r.type], [side, exp, morale] = NAT[r.nation], max = r.o.mp ?? t.mp, held = { ...t.eq };
  if (r.id === 'ger.d.plehr') held.tank_medium = 208; // M12: 208 tanks and assault guns on 6 June
  return { id: r.id, name: r.name, shortName: r.sh, nation: r.nation, side, type: r.type, domain: 'land', pos,
    manpower: max, manpowerMax: max, equipment: { held, authorised: { ...held } }, organisation: 90, morale: r.o.morale ?? morale, experience: r.o.exp ?? exp, fuel: 100, ammo: 100, supply: 100, fatigue: 5, readiness: 90,
    entrenchment: r.o.ent ?? (r.nation === 'GER' ? 20 : 0), moveStatus: 'stationary', combatStatus: 'idle', posture: r.nation === 'GER' ? 'hold' : 'defend', orders: [], kills: 0 };
};
const units = U.map((r) => { const k = (cnt[r.anc] = (cnt[r.anc] ?? -1) + 1); return mk(r, r.o.exact ? [...A[r.anc]] : spread(A[r.anc], k)); });
const rcnt = {};
const reinforcements = REI.map(([id, iso, anc, name, type, nation, sh, , o]) => {
  const k = (rcnt[anc] = (rcnt[anc] ?? -1) + 1);
  const pos = spread(A[anc], k, !!o.landing && o.landing.kind === 'amphibious');
  const u = mk({ id, name, sh, nation, type, o }, pos);
  u.organisation = 80; u.fatigue = 10; u.entrenchment = 0;
  return { id: `reinf.${id}`, atMinutes: mins(iso), pos, unit: u, ...(o.landing ? { landing: o.landing } : {}) };
});
const reinSrc = Object.fromEntries(REI.map((r) => [`reinf.${r[0]}`, { sources: [...r[7], 'G03'], approximate: true }]));

const NATIONS = (() => {
  const all = [...units, ...reinforcements.map((r) => r.unit)];
  const mpOf = (n) => all.filter((x) => x.nation === n).reduce((a, x) => a + x.manpowerMax, 0), c = (n) => all.filter((x) => x.nation === n).length;
  const pool = (n, fs = 1) => ({ resources: { manpower: Math.max(2000, Math.round(mpOf(n) * 0.15)), fuel: Math.max(1500, Math.round(c(n) * 40 * fs)), ammo: Math.max(1500, c(n) * 50), equipment: Math.max(1500, c(n) * 100), supplyPoints: 600 },
    income: { manpower: Math.max(2, Math.ceil(mpOf(n) * 0.3 / TICKS)), fuel: Math.max(1, Math.ceil(c(n) * 0.15 * fs)), ammo: Math.max(2, Math.ceil(c(n) * 0.2)), equipment: Math.max(2, Math.ceil(c(n) * 0.4)), supplyPoints: 5 } });
  return [['USA', 'allies', 'United States', true, 1], ['GBR', 'allies', 'United Kingdom', true, 1], ['CAN', 'allies', 'Canada', true, 1], ['GER', 'axis', 'Germany', true, 0.7]]
    .map(([id, side, name, playable, fs]) => ({ id, side, name, playable, ...pool(id, fs), reinforcements: [] }));
})();
const END = mins(END_ISO);
const ob = (id, tier, side, title, description, condition, points) => ({ id, tier, side, title, description, condition, points, status: 'pending' });
const OBJ = [
  ob('o.all.cherbourg', 'primary', 'allies', 'Capture Cherbourg', 'Take the fortified port of Cherbourg (26 June, M02; 27 June in M11).', { kind: 'capture_location', locationId: 'cherbourg' }, 250),
  ob('o.all.caen', 'primary', 'allies', 'Capture Caen', 'Take Caen, a D-Day objective not completed until 21 July (M02).', { kind: 'capture_location', locationId: 'caen' }, 250),
  ob('o.all.carentan', 'secondary', 'allies', 'Capture Carentan', 'Link the Utah and Omaha beachheads at Carentan (10-12 June, M10).', { kind: 'capture_location', locationId: 'carentan' }, 100),
  ob('o.all.bayeux', 'secondary', 'allies', 'Capture Bayeux', 'Take Bayeux, a D-Day objective (M02, M05).', { kind: 'capture_location', locationId: 'bayeux' }, 80),
  ob('o.all.isigny', 'secondary', 'allies', 'Capture Isigny', 'Take Isigny to link Omaha with Utah (M04).', { kind: 'capture_location', locationId: 'isigny' }, 60),
  ob('o.all.saint_lo', 'secondary', 'allies', 'Capture Saint-Lo', 'Take Saint-Lo (fell by 19 July, M11).', { kind: 'capture_location', locationId: 'saint_lo' }, 150),
  ob('o.all.carpiquet', 'secondary', 'allies', 'Capture Carpiquet airfield', 'D-Day objective of the 3rd Canadian Division (M06).', { kind: 'capture_location', locationId: 'carpiquet' }, 80),
  ob('o.all.avranches', 'strategic', 'allies', 'Break out to Avranches', 'Operation Cobra reached Avranches by 31 July (M11).', { kind: 'capture_location', locationId: 'avranches' }, 200),
  ob('o.all.mulberry', 'secondary', 'allies', 'Keep the Arromanches harbour', 'Hold Arromanches (Mulberry B), used for ten months (M08).', { kind: 'hold_location', locationId: 'arromanches', untilMinutes: END }, 100),
  ob('o.ger.hold_caen', 'primary', 'axis', 'Hold Caen', 'Keep Caen out of Anglo-Canadian hands (not fully captured until 21 July, M02).', { kind: 'hold_location', locationId: 'caen', untilMinutes: END }, 250),
  ob('o.ger.hold_cherbourg', 'primary', 'axis', 'Hold Cherbourg', 'Deny the Allies a deep-water port (Cherbourg fell 26 June, M02).', { kind: 'hold_location', locationId: 'cherbourg', untilMinutes: END }, 250),
  ob('o.ger.hold_saint_lo', 'secondary', 'axis', 'Hold Saint-Lo', 'Keep the Saint-Lo crossroads (fell by 19 July, M11).', { kind: 'hold_location', locationId: 'saint_lo', untilMinutes: END }, 150),
  ob('o.ger.hold_carentan', 'secondary', 'axis', 'Hold Carentan', 'Keep the Utah and Omaha beachheads apart (M10).', { kind: 'hold_location', locationId: 'carentan', untilMinutes: END }, 100),
  ob('o.ger.hold_bayeux', 'secondary', 'axis', 'Hold Bayeux', 'Deny Bayeux (taken 7 June, M05).', { kind: 'hold_location', locationId: 'bayeux', untilMinutes: END }, 60),
  ob('o.ger.hold_avranches', 'secondary', 'axis', 'Keep the Avranches gateway', 'Stop the US First Army breaking out into Brittany (M11).', { kind: 'hold_location', locationId: 'avranches', untilMinutes: END }, 150),
];
const O = (s) => OBJ.filter((o) => o.side === s).map((o) => o.id);
const WEATHER = [
  { month: 6, probs: { clear: 0.35, cloud: 0.3, rain: 0.2, fog: 0.05, storm: 0.1 }, tempC: 16 },
  { month: 7, probs: { clear: 0.4, cloud: 0.3, rain: 0.2, fog: 0.05, storm: 0.05 }, tempC: 19 },
];
const bx = (n, lon, lat, w = 0.1, h = 0.07) => ({ nation: n, polygon: [[lon - w, lat - h], [lon + w, lat - h], [lon + w, lat + h], [lon - w, lat + h]] });
const CTRL = [{ nation: 'GER', polygon: [[-2.6, 48.4], [0.8, 48.4], [0.8, 49.9], [-2.6, 49.9]] }, bx('GBR', -0.9, 50.65, 1.7, 0.35), bx('USA', -1.2, 49.36, 0.08, 0.06), bx('USA', -0.9, 49.34, 0.1, 0.05), bx('GBR', -0.65, 49.33, 0.12, 0.05), bx('CAN', -0.42, 49.32, 0.05, 0.05), bx('GBR', -0.3, 49.3, 0.05, 0.05)];
const EV = (id, iso, title, body, src, pos, extra = {}) => ({ id: `nm.ev.${id}`, date: iso, title, body, ...(pos ? { pos } : {}), src, effectHints: [], ...extra });
const EVENTS = [
  EV('airborne', '1944-06-06T01:00:00Z', 'Airborne landings', 'The US 82nd and 101st Airborne on the Cotentin and the British 6th Airborne east of the Orne drop after midnight; weather and navigation scatter the drops (M09). Time of day approximate.', ['M01', 'M09'], [-1.33, 49.38]),
  EV('d_day', '1944-06-06T06:30:00Z', 'D-Day: the beaches', 'Landings begin about 06:30 at Utah, Omaha, Gold, Juno and Sword (M01). Omaha is the costliest: 2,400 casualties and 34,000 landed by the end of the day (M04); Utah costs 197 of 21,000 (M03).', ['M01', 'M03', 'M04'], [-0.87, 49.36]),
  EV('21pz', '1944-06-06T16:00:00Z', '21st Panzer counter-attacks', 'The 21st Panzer Division counter-attacks between Sword and Juno at 16:00 and nearly reaches the coast, then is recalled to the Caen-Bayeux area (M02).', ['M02'], [-0.38, 49.27], { side: 'axis' }),
  EV('12ss', '1944-06-07T06:00:00Z', 'The Hitlerjugend arrives at Caen', 'The 12th SS Panzer Division is committed to the defence of Caen on 7 June (M12).', ['M12'], [-0.4, 49.2], { side: 'axis' }),
  EV('plehr', '1944-06-08T06:00:00Z', 'Panzer Lehr committed', 'Panzer Lehr, the Panzer Group West reserve, is released and committed against the British and Canadians on 8 June (M12).', ['M12'], [-0.63, 49.1], { side: 'axis' }),
  EV('carentan', '1944-06-12T00:00:00Z', 'Carentan taken, beachheads linked', 'The 101st Airborne forces the causeway into Carentan on 10-11 June and the Germans withdraw on 12 June; all five beachheads are connected by 12 June (M01, M10). The 17th SS Panzergrenadier Division counter-attacks on 13 June.', ['M01', 'M10'], [-1.25, 49.29], { side: 'allies' }),
  EV('villers_bocage', '1944-06-13T00:00:00Z', 'Villers-Bocage', 'The 22nd Armoured Brigade of the 7th Armoured Division takes Villers-Bocage and threatens the rear of Panzer Lehr; the Tigers of the 101st SS Heavy Panzer Battalion arrive 12-13 June and force the British back; Panzer Lehr is pushed back to Tilly-sur-Seulles by 17 June (M02, M12, M18).', ['M02', 'M12', 'M18'], [-0.66, 49.08]),
  EV('cotentin', '1944-06-17T00:00:00Z', 'The Cotentin is cut', 'US forces reach the west coast of the Cotentin on 17 June, cutting off Cherbourg (M02).', ['M02'], [-1.62, 49.38], { side: 'allies' }),
  EV('storm', '1944-06-19T00:00:00Z', 'The Great Storm', 'A four-day storm batters the Channel from 19 to 22 June. Mulberry A at Omaha is wrecked before it is securely anchored and abandoned; operations are postponed (M01, M08). Mulberry B survives.', ['M01', 'M08'], [-0.88, 49.36],
    { effects: [{ op: 'weather', kind: 'storm', intensity: 0.9, hours: 72 }, { op: 'port_throughput', locationId: 'mulberry_a', factor: 0.1 }], effectsNote: 'Restates M01 (storm 19-22 June, four days) and M08 (Mulberry A abandoned after the storm).' }),
  EV('cherbourg', '1944-06-26T00:00:00Z', 'Cherbourg falls', 'VII Corps captures Cherbourg on 26 June (M02); another account gives 27 June (M11). The port is not cleared of mines and obstructions until 16 July (M02). This event uses the earlier date.', ['M02', 'M11'], [-1.62, 49.64], { side: 'allies' }),
  EV('epsom', '1944-06-26T00:00:00Z', 'Operation Epsom', 'VIII Corps, with the 15th (Scottish) Division and the 31st Tank Brigade, attacks west of Caen on 26 June and crosses the Odon; Operation Martlet secures its flank. Bomber support is cancelled by weather (M11). The 9th and 10th SS Panzer Divisions counter-attack.', ['M11'], [-0.5, 49.15]),
  EV('rundstedt', '1944-07-01T00:00:00Z', 'Kluge replaces Rundstedt', 'Rundstedt is dismissed on 1 July and Kluge becomes OB West (M02).', ['M02'], null, { side: 'axis' }),
  EV('charnwood', '1944-07-08T00:00:00Z', 'Operation Charnwood', 'Three British and Canadian infantry divisions attack Caen at dawn on 8 July after a controversial heavy-bomber raid on the city and take it up to the Orne and Odon by the next evening (M11).', ['M11'], [-0.36, 49.19],
    { side: 'allies' }),
  EV('saint_lo_battle', '1944-07-07T00:00:00Z', 'Battle of Saint-Lo', 'The US First Army fights the Battle of Saint-Lo from 7 to 19 July in the hedgerows (M11).', ['M11'], [-1.09, 49.12], { side: 'allies' }),
  EV('cherbourg_cleared', '1944-07-16T00:00:00Z', 'Cherbourg cleared', 'The port of Cherbourg is cleared of mines and obstructions on 16 July and can begin to receive shipping (M02).', ['M02'], [-1.62, 49.64], { side: 'allies' }),
  EV('goodwood', '1944-07-18T00:00:00Z', 'Operation Goodwood', 'VIII Corps with three armoured divisions attacks east of Caen on 18 July after a heavy-bomber raid; Operation Atlantic (II Canadian Corps) takes the southern suburbs. The armour advances 7 miles but is stopped short of Bourguebus Ridge by 20 July (M11).', ['M11'], [-0.26, 49.15]),
  EV('saint_lo_falls', '1944-07-19T00:00:00Z', 'Saint-Lo falls', 'The Battle of Saint-Lo ends on 19 July with the town in US hands (M11).', ['M11'], [-1.09, 49.12], { side: 'allies' }),
  EV('caen_falls', '1944-07-21T00:00:00Z', 'Caen is completely captured', 'Caen, a D-Day objective, is completely captured on 21 July (M02).', ['M02'], [-0.36, 49.18], { side: 'allies' }),
  EV('cobra', '1944-07-25T00:00:00Z', 'Operation Cobra', 'The First US Army (VII Corps, two-division assault) begins Operation Cobra on 25 July after a concentrated bombing raid, intending to break out of the bocage; friendly-fire casualties include Lt-Gen McNair (M11).', ['M11'], [-1.25, 49.15]),
  EV('bluecoat', '1944-07-30T00:00:00Z', 'Operation Bluecoat', 'VIII and XXX Corps attack from Caumont towards Vire and Mont Pincon on 30 July to exploit Cobra (M11).', ['M11'], [-0.8, 49.09], { side: 'allies' }),
  EV('avranches', '1944-07-31T00:00:00Z', 'Avranches reached', 'By 31 July XIX Corps has destroyed the last forces opposing the First Army, which emerges from the bocage and liberates Avranches (M11).', ['M11'], [-1.36, 48.69], { side: 'allies' }),
];
const PORT = { cherbourg: { fromHour: 960 } };
EVENTS.find((e) => e.id === 'nm.ev.cherbourg_cleared').effects = [{ op: 'port_available', locationId: 'cherbourg', fromHour: 984, rampHours: 240 }];
EVENTS.find((e) => e.id === 'nm.ev.cherbourg_cleared').effectsNote = 'Restates M02 (Cherbourg cleared of mines and obstructions on 16 July); ramp time 240 h is game-scale (G01).';
void PORT;
const carpetBombings = [
  { id: 'cb.charnwood', atMinutes: mins('1944-07-07T21:00:00Z'), pos: [-0.38, 49.2], radiusKm: 4, side: 'allies', casualtyPct: 0.05, orgLoss: 30 },
  { id: 'cb.goodwood', atMinutes: mins('1944-07-18T05:30:00Z'), pos: [-0.26, 49.15], radiusKm: 6, side: 'allies', casualtyPct: 0.06, orgLoss: 35 },
  { id: 'cb.cobra', atMinutes: mins('1944-07-25T09:40:00Z'), pos: [-1.25, 49.15], radiusKm: 6, side: 'allies', casualtyPct: 0.08, orgLoss: 40 },
];
const airSupremacy = [{ side: 'allies', radiusKm: 80, speedMul: 0.7 }];
const locations = LOC.map(([id, name, kind, lon, lat, owner, orig, value, , extra]) => ({ id, name, kind, pos: [lon, lat], owner, originalOwner: orig, value, ...(['city', 'airfield', 'port', 'depot'].includes(kind) ? { supplyCapacity: kind === 'city' ? 40 : kind === 'port' ? 40 : kind === 'depot' ? 8 : 20 } : {}), ...(extra ?? {}) }));
const ENG = ['southampton', 'portsmouth', 'poole', 'weymouth', 'newhaven'];
const supplySources = { GER: ['lisieux', 'falaise', 'vire'], USA: ENG, GBR: ENG, CAN: ENG };
const def = {
  schema: 1, id: 'normandy.short', campaignId: 'normandy', title: 'Normandy: D-Day to Cobra (6 Jun - 31 Jul 1944)', scale: 'short', startDate: '1944-06-06T00:00:00Z', endDate: END_ISO,
  bbox: BBOX, estimatedPlayMinutes: [120, 240], mapSize: 'large', complexity: 4,
  briefing: { historical: 'On 6 June 1944 the Allies landed on five Normandy beaches, Utah, Omaha, Gold, Juno and Sword, after airborne drops on both flanks. Carentan, Saint-Lo, Bayeux and Caen remained in German hands after the first day; Cherbourg fell on 26 June, Caen on 21 July, and Operation Cobra reached Avranches on 31 July (M01, M02, M11).',
    situation: 'The Allies must hold the beaches, link the beachheads, take Cherbourg and Caen and break out; the Germans must contain the lodgement with static divisions and arriving panzer reserves under Allied air supremacy. Start positions and several arrival points and times are approximate; Canadian, Polish and French follow-on divisions beyond those listed, naval and air forces are not included (not retrieved).' },
  playableNations: [
    { nation: 'USA', difficultyRating: 3, summary: 'Land at Utah and Omaha, take Cherbourg, break out at Cobra.', objectiveIds: O('allies') },
    { nation: 'GBR', difficultyRating: 4, summary: 'Land at Gold and Sword, take Caen against the panzer divisions.', objectiveIds: O('allies') },
    { nation: 'CAN', difficultyRating: 4, summary: 'Land at Juno and fight for Carpiquet and Caen.', objectiveIds: O('allies') },
    { nation: 'GER', difficultyRating: 5, summary: 'Contain the beachheads with static divisions and arriving panzers under Allied air supremacy.', objectiveIds: O('axis') }],
  nations: NATIONS, locations, units, reinforcements, objectives: OBJ, terrainFile: 'terrain_normandy.json', infraFile: 'infra_normandy.json',
  supplySources, initialControl: CTRL, weatherProfile: WEATHER, eventTemplateIds: EVENTS.map((x) => x.id), specialSystems: [],
  airSupremacy, carpetBombings, seaSupply: true, weatherControl: { stormScale: 0 }, captureBlockKm: 6.5,
  victoryTiers: { axis: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 }, allies: { decisive: 0.8, strategic: 0.6, limited: 0.4, stalemate: 0.2 } },
  sources: SOURCES.map(({ id, citation, url }) => ({ id, citation, ...(url ? { url } : {}) })),
};
const uncertain = [
  { item: 'Order-of-battle depth', note: 'Division level plus a few brigades; regiments, battalions and the Luftwaffe/naval/Allied air orders of battle omitted (not retrieved). German 7th Army, Panzer Group West and Army Group B headquarters omitted (no positions). 70th Tank Battalion and the airborne regiments are inside their divisions.' },
  { item: 'Omitted formations', note: 'US 2nd, 3rd Armored (landing date not retrieved), 8th Infantry Divisions and 2nd Infantry; British 79th Armoured, 4th Canadian Armoured (July, date not retrieved), Polish, French and Belgian units; German 2nd Panzer, 116th Panzer, 346th, 353rd, 77th and 85th Infantry Divisions, 102nd and 503rd Heavy Panzer Battalions (no arrival dates in M18). These were omitted rather than invented.' },
  { item: 'All start and arrival positions', note: 'Approximate sector anchors (G03); no source gives division coordinates. Beach arrivals use the beach coordinates (M14/M15); airborne drop zones, German start areas and German arrival areas are inferred from the named sectors in M01-M12.' },
  { item: 'Arrival times of day', note: 'Airborne 01:00 and seaborne 06:30-08:00 on 6 June are approximate, and local time versus UTC is not resolved (G01). Follow-on arrivals use the sourced day (M16, M17, M18) at 12:00. 15th Scottish is set to 26 June 00:00 (Epsom start) as a latest-possible date; 43rd Wessex at 20 June (recce regiment off Sword); 59th Division and the Guards Armoured at the end of June; 1st SS, 2nd SS (midpoint of 15-30 June) and 10th SS dates are approximations of the sourced windows.' },
  { item: 'Strengths', note: 'Game-scale (G01), except the sourced figures: 352nd about 12,000, 716th about 6,000, Panzer Lehr 208 tanks and assault guns. Rangers (9 companies), commandos and tank brigades have game-scale manpower.' },
  { item: 'Landing casualties and dispersion', note: 'Utah 1% (197 of 21,000, M03) and Omaha 7% (2,400 of 34,000, M04) are derived from sourced counts; Gold/Juno/Sword 3% casualties, and for airborne drops 12% casualties, 20 km dispersion, 18 penalty hours and organisation 40 (drops were scattered, M09), are game-scale (G01).' },
  { item: 'Mulberry harbours', note: 'Arromanches throughput 6,000 t/day is the sourced achieved rate (M02); Mulberry A at 6,000 t/day is half the 12,000 t/day planning requirement (M08) and is game-scale. Availability from hour 192 (D+8, per team-lead from sources) with a 48 h ramp is game-scale; the storm cuts Mulberry A to 0.1 (abandoned, M08) and no repair step is modelled (no sourced repair date). Beach depots have small game-scale supplyCapacity 8. Mulberry B is not damaged by the storm event (M08 says it survived).' },
  { item: 'Mulberry besiegedShare', note: 'besiegedShare 0.8 on both Mulberries is a game-scale modelling choice (G01): sea-fed artificial harbours keep most of their throughput when German units are near; no source gives a figure.' },
  { item: 'Cherbourg port', note: 'Cherbourg is unusable as a supply port until 16 July (M02), then ramps over 240 h (game-scale). Its capture date is 26 June (M02) or 27 June (M11); both are recorded and the event uses 26 June.' },
  { item: 'Allied air supremacy', note: 'Sourced as a fact (M01: 9,543 Allied against 815 Luftwaffe aircraft; M02: 4,029+5,514 against 570), but radius 80 km and speed multiplier 0.7 are game-scale (G01). No interdiction numbers were retrieved.' },
  { item: 'Carpet bombings', note: 'Charnwood (raid before dawn 8 July, time and aim point approximate), Goodwood (18 July, aim near Cagny) and Cobra (25 July, aim midway between Saint-Lo and Periers) positions, radii and casualty rates are approximate/game-scale; only the days are sourced (M11).' },
  { item: 'Beach locations', note: 'Utah is a Nominatim hamlet near Sainte-Marie-du-Mont, Gold a Nominatim guidepost, Omaha/Juno/Sword Wikipedia coordinates; positions are approximate and nudged to land.' },
  { item: 'Supply model', note: 'Allied supply sources are the English embarkation ports Southampton, Portsmouth, Poole, Weymouth and Newhaven (positions from Wikipedia, M14); their throughputs (6,000/4,000/2,000/2,000/2,000 t/day) are game-scale (G01), not sourced. The beaches, Mulberries and Port-en-Bessin are Allied-owned from the start but are not sources (sea-fed). German sources are Lisieux, Falaise and Vire (rear towns, game-scale roles). Only Arromanches 6,000 t/day is a sourced tonnage. England is one coarse GBR initialControl box (G04).' },
  { item: 'Capture block radius', note: 'captureBlockKm 6.5 (default 4) is a modelling flag (G01): a garrison on the outskirts of a town still holds it against an unopposed capture. Not a historical datum.' },
  { item: 'Sea supply and random storms', note: 'seaSupply: true and weatherControl.stormScale 0 are modelling flags (G01): every coastal port/depot a side holds is a supply source so the beachhead is supplied across the sea, and random storms are off because the Great Storm of 19-22 June is scripted (M01, M08). Neither is a historical datum.' },
  { item: 'Weather', note: 'Qualitative profile (game-scale). Sourced weather: the 19-22 June storm (M01), poor weather cancelling Epsom bombers and delaying Cobra (M11).' },
  { item: 'Objective values and tiers', note: 'Game-scale (G01). All hold objectives credit only at the end date.' },
  { item: 'initialControl', note: 'One German polygon over the whole map, small Allied boxes at the beaches, one over southern England.' },
];
const sidecar = { scenarioId: def.id, note: 'Per-fact source references.',
  units: Object.fromEntries(units.map((x, i) => [x.id, { sources: [...new Set([...U[i].srcs, 'G01', 'G03'])], positionApproximate: true }])),
  locations: Object.fromEntries(LOC.map((l) => [l[0], { sources: [...new Set([...l[8], 'G02'])] }])),
  reinforcements: reinSrc, nations: Object.fromEntries(NATIONS.map((n) => [n.id, { sources: ['G01'], gameScale: true }])),
  objectives: Object.fromEntries(OBJ.map((o) => [o.id, { sources: ['M01', 'M02', 'G01'] }])), uncertain };
writeFileSync(join(OUT, 'normandy.short.json'), JSON.stringify(def, null, 1) + '\n');
writeFileSync(join(OUT, 'normandy.short.sources.json'), JSON.stringify(sidecar, null, 1) + '\n');
writeFileSync(join(OUT, 'normandy.events.json'), JSON.stringify({ campaignId: 'normandy', note: 'Historical event template data. Sources resolve against scenario sources[].', events: EVENTS.map((x) => ({ ...x, kind: 'historical', minutesFromStd: mins(x.date) })) }, null, 1) + '\n');
for (const x of [...units, ...locations, ...reinforcements.map((r) => r.unit)]) if (!inBox(x.pos)) console.error('OUT OF BBOX', x.id, x.pos);
console.log('units', units.length, 'reinforcements', reinforcements.length, 'locations', locations.length, 'events', EVENTS.length, 'ticks', TICKS);
