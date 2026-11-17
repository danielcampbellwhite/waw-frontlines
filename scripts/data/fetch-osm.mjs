// Optional: named rivers from OpenStreetMap (Overpass API, ODbL) for regions where Natural Earth is too coarse.
// One bounded query per region, cached to scripts/data/cache/osm_<id>_rivers.json. The public Overpass servers are
// often at capacity: this retries with backoff across mirrors and gives up politely (build.mjs works without it).
// Usage: node scripts/data/fetch-osm.mjs ardennes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS } from './regions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const id = process.argv[2] ?? 'ardennes';
const kinds = process.argv.slice(3).length ? process.argv.slice(3) : ['rivers'];
const R = REGIONS[id];
const NAMES = {
  barbarossa: ['Narew','Нарев','Berezina','Березина','Бярэзіна','Bug','Західний Буг','Zachodni Bug','Буг'], // rivers Natural Earth lacks (Narew, Berezina) plus Bug in local spellings
  normandy: ['Orne', 'Vire', 'Douve', 'Douves', 'Gorget', 'Taute', 'Dives', 'Seine', 'Touques', 'Aure', 'Seulles', 'Odon', 'Merderet', 'Taute', 'Sée', 'Sélune', 'Risle', 'Divette', 'Dromme', 'Lézarde', 'Sienne', 'Soulles', 'Ouve', 'Laize', 'Noireau', 'Muance', 'Mue', 'Thar', 'Couesnon', 'Ay', 'Rouvre', 'Orne Saosnoise'],
  stalingrad: ['Чир', 'Мышкова', 'Аксай Есауловский', 'Аксай', 'Карповка', 'Ахтуба', 'Медведица', 'Иловля', 'Сал', 'Дон', 'Волга', 'Донская Царица', 'Царица', 'Бузулук', 'Хопёр', 'Цимла', 'Червлёная'],
  ardennes: ['Ourthe', 'Ourthe Orientale', 'Ourthe Occidentale', 'Salm', 'Amblève', 'Amel', 'Our', 'Sûre', 'Sauer', 'Semois', 'Lesse', 'Vesdre', 'Rur', 'Roer', 'Wiltz', 'Clerve', 'Clerf', 'Alzette', 'Kyll', 'Prüm', 'Urft', 'Inde', 'Wurm', 'Warche', 'Lienne', 'Moselle', 'Mosel', 'Meuse', 'Maas', 'Sambre', 'Rhein', 'Ahr', 'Erft'],
};
if (!R || (kinds.includes('rivers') && !NAMES[id])) { console.error('no OSM river list for region', id); process.exit(1); }
const B = R.bbox;
const bb = `(${B.south},${B.west},${B.north},${B.east})`;
const QUERIES = {
  rivers: `[out:json][timeout:90];(way["waterway"="river"]["name"~"^((L'|La |Le |Les )?(${(NAMES[id] ?? []).join('|')}))$"]${bb};);out geom;`,
  // desert tracks / named historic routes (Trigh Capuzzo, Trigh el Abd, Via Balbia ...) as mapped today
  tracks: `[out:json][timeout:120];(way["highway"]["name"~"Trigh|Tariq|Balbia|Capuzzo|el Abd",i]${bb};way["highway"]["name:en"~"Trigh|Balbia|Capuzzo",i]${bb};);out geom;`,
  // present-day road / rail network (NOT 1944): trunk/primary/secondary roads (no motorways), main-line and branch railways
  roads: `[out:json][timeout:180][maxsize:1000000000];(way["highway"~"^(trunk|primary|secondary)$"]${bb};);out geom qt;`,
  rail: `[out:json][timeout:180][maxsize:1000000000];(way["railway"="rail"]["service"!~"."]${bb};);out geom qt;`,
};
const endpoints = (process.env.OSM_MIRRORS_FIRST ? ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'] : ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']);
// Heavy kinds are fetched in 1-degree tiles with polite delays and merged (dedup by way id); partial progress is cached per tile.
const TILE = 1;
const tileQuery = (kind, t) => {
  const tb = `(${t.s},${t.w},${t.n},${t.e})`;
  if (kind === 'rivers') return `[out:json][timeout:60];way["waterway"="river"]["name"~"^((L'|La |Le |Les )?(${(NAMES[id] ?? []).join('|')}))$"]${tb};out geom;`;
  if (kind === 'roads') return `[out:json][timeout:60];way["highway"~"^(trunk|primary|secondary)$"]${tb};out geom qt;`;
  if (kind === 'rail') return `[out:json][timeout:60];way["railway"="rail"][!"service"]${tb};out geom qt;`;
  return null;
};
const post = async (q) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep, { method: 'POST', headers: { 'User-Agent': 'mapdata-script/1.0', 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(90000) });
        const text = await r.text();
        if (r.ok && text.startsWith('{') && !text.includes('"remark"')) return text;
        console.log('  ', ep, r.status);
      } catch (e) { console.log('  ', ep, String(e.message ?? e)); }
      await new Promise((res) => setTimeout(res, 2000));
    }
    await new Promise((res) => setTimeout(res, 10000 * (attempt + 1)));
  }
  return null;
};
const tdir = path.join(here, 'cache', 'osm_tiles'); fs.mkdirSync(tdir, { recursive: true });
let failed = 0;
for (const kind of kinds) {
  const file = path.join(here, 'cache', `osm_${id}_${kind}.json`);
  if (fs.existsSync(file)) { console.log('cached', kind); continue; }
  if (kind === 'tracks' || (kind === 'rivers' && !R.tiledRivers)) { // small bounded queries
    const text = await post(QUERIES[kind]);
    if (text) { fs.writeFileSync(file, text); console.log('saved', kind); } else { failed++; console.log('unavailable', kind); }
    continue;
  }
  const els = new Map(); let miss = 0, n = 0;
  for (let s0 = Math.floor(B.south); s0 < B.north; s0 += TILE) for (let w0 = Math.floor(B.west); w0 < B.east; w0 += TILE) {
    const t = { s: Math.max(B.south, s0), n: Math.min(B.north, s0 + TILE), w: Math.max(B.west, w0), e: Math.min(B.east, w0 + TILE) };
    const tf = path.join(tdir, `${id}_${kind}_${t.s}_${t.w}.json`);
    let text = fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8') : null;
    if (!text) { text = await post(tileQuery(kind, t)); if (text) fs.writeFileSync(tf, text); await new Promise((res) => setTimeout(res, 3000)); }
    if (!text) { miss++; continue; }
    for (const el of JSON.parse(text).elements ?? []) els.set(el.id, el);
    n++;
  }
  console.log(kind, 'tiles ok', n, 'missing', miss, 'ways', els.size);
  if (miss) { failed++; continue; }
  fs.writeFileSync(file, JSON.stringify({ elements: [...els.values()] }));
}
process.exit(failed ? 2 : 0);
