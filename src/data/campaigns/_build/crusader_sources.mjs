// Source register for the Operation Crusader (short) scenario DRAFT. Mirrored in docs/HISTORICAL_SOURCES.md (N01-N05).
export const SOURCES = [
  { id: 'N01', citation: 'Wikipedia, "Operation Crusader order of battle" (ground forces only; no air section; Italian divisional commanders partly missing).', url: 'https://en.wikipedia.org/wiki/Operation_Crusader_order_of_battle' },
  { id: 'N02', citation: 'Wikipedia, "Operation Crusader" (timeline 18 Nov-Dec 1941; strengths; fuel shortage and convoys; weather).', url: 'https://en.wikipedia.org/wiki/Operation_Crusader' },
  { id: 'N04', citation: 'Wikipedia, "Desert Air Force" (AHQ Western Desert wing/squadron table, 18 Nov 1941-19 May 1942; WEAK for Crusader-day positions; no Axis air).', url: 'https://en.wikipedia.org/wiki/Desert_Air_Force' },
  { id: 'N05', citation: 'Wikipedia, "Siege of Tobruk" (port capacity, garrison changes, Via Balbia, Tripoli/Benghazi throughput, Tobruk coordinates).', url: 'https://en.wikipedia.org/wiki/Siege_of_Tobruk' },
  { id: 'G01', citation: 'GAME-SCALE ABSTRACTION (internal): manpower, equipment, morale/experience, resources, objective points and thresholds are nominal game values, not historical strengths. Axis fuel pool scaled down to reflect the sourced fuel shortage (N02).' },
  { id: 'G02', citation: 'Modern gazetteer coordinates rounded to 0.01 deg, recalled by the author; accuracy +/-0.05 deg towns, +/-0.15 deg desert features (Gabr Saleh, Bir el Gubi, Sidi Rezegh, Belhamed, Ed Duda).', url: 'https://www.geonames.org/' },
  { id: 'G03', citation: 'POSITION POLICY (internal): no source gives start coordinates. Positions are approximate sector anchors from the named places in N01/N02 (e.g. Ariete at Bir el Gubi on 19 Nov) with a small deterministic spread; Allied start inside Egypt near the frontier (offensive crossed into Libya near Fort Maddalena).' },
  { id: 'G04', citation: 'BORDER POLICY (internal): initialControl is a coarse 1941 split: Italian Libya (ITA) west of the Egyptian frontier (~25.15E), Egypt (GBR-held) east, Tobruk perimeter GBR.' },
];
