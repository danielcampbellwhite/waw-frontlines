// Usage: node scripts/art/build.mjs <picks.json> <rawDir>
// Verifies each pick's licence via the Commons API, downloads the source image (data only, never executed) into rawDir,
// and writes thumb (256x256 WebP) + panel (640x400 JPEG) into public/art/units/, then src/art/manifest.json,
// src/art/credits.json and docs/IMAGE_CREDITS.md.
import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';
const UA = 'TheatreCommandArtSourcing/1.0 (game asset research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const root = path.resolve(import.meta.dirname, '../..');
const [,, picksFile, rawDir] = process.argv; fs.mkdirSync(rawDir,{recursive:true});
const outDir = path.join(root,'public/art/units'); fs.mkdirSync(outDir,{recursive:true});
const picks = JSON.parse(fs.readFileSync(picksFile,'utf8'));
const today = new Date().toISOString().slice(0,10);
const OK = [/^public domain/i,/^pd[-\s]/i,/^pdm/i,/^cc0/i,/^cc[-\s]by[-\s]\d/i,/^cc[-\s]by[-\s]sa[-\s]\d/i,/^no restrictions/i,/^uk government/i,/^ogl/i,/^licence ouverte/i];
const BAD = /\bNC\b|\bND\b|non-?commercial|no-?deriv|fair use/i;
async function getJson(u){ for(let i=0;i<8;i++){ try{ const t=await (await fetch(u,{headers:{'User-Agent':UA}})).text(); return JSON.parse(t);}catch{await sleep(15000);} } throw new Error('api'); }
async function dl(u,f,n=2){ for(let i=0;i<n;i++){ let wait=30000; try{ const r=await fetch(u,{headers:{'User-Agent':UA}}); if(r.ok){fs.writeFileSync(f,Buffer.from(await r.arrayBuffer()));return;} const ra=parseInt(r.headers.get('retry-after')||'',10); if(r.status===429) wait=Math.min(Math.max(ra>0?ra*1000:60000,30000),180000); }catch{} await sleep(wait);} throw new Error('dl '+u); }
const strip = s => (s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/\s+/g,' ').trim();
function cleanAuthor(a) {
  a = a.replace(/^Bundesarchiv \/ /,'').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim();
  a = a.replace(/^No machine-readable author provided\.\s*/i,'').replace(/\s*assumed \(based on copyright claims\)\.?$/i,'');
  a = a.replace(/s*You are free to use this picture.*$/i,"").replace(/^The original uploader was (.+?) at .*$/i,"$1").trim(); if (a.length > 90) a = a.slice(0, 87).replace(/s+S*$/, "") + "...";
  a = a.replace(/^Canadian Forces Expired crown copyright.*$/i,'Canadian Forces (expired Crown copyright)');
  for (let n = 1; n <= a.length / 2; n++) { if (a.length % n === 0 && a.slice(0, n).repeat(a.length / n) === a && a.length / n >= 2) { a = a.slice(0, n); break; } }
  if (/^(unknown( author)?|not stated)$/i.test(a)) a = 'Unknown author';
  return a;
}
const mfPath = path.join(root,'src/art/manifest.json');
const prev = fs.existsSync(mfPath) ? JSON.parse(fs.readFileSync(mfPath,'utf8')) : [];
const manifest = []; const rejected = [];
for (const p of picks) { try {
  const old = prev.find(e=>e.id===p.id);
  if (old && !p.recrop && fs.existsSync(path.join(outDir,old.thumb.split('/').pop()))) { manifest.push({...old, category:p.category, alsoTypes:p.alsoTypes||[], subject:p.subject, equipmentKeys:p.equipmentKeys||[], tags:p.tags||[], role:p.category==='hq'?'hq':'combat'}); continue; }
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k,v] of Object.entries({action:'query',titles:'File:'+p.file,prop:'imageinfo',iiprop:'extmetadata|url|size|mime',format:'json'})) u.searchParams.set(k,v);
  const j = await getJson(u); await sleep(1500);
  const page = Object.values(j.query.pages)[0]; const ii = page.imageinfo?.[0];
  if (!ii) { rejected.push([p.id,'not found']); console.log('NOT FOUND', p.file); continue; }
  const m = ii.extmetadata; const lic = strip(m.LicenseShortName?.value); const restr = strip(m.Restrictions?.value);
  if (!OK.some(r=>r.test(lic)) || BAD.test(lic) || BAD.test(strip(m.UsageTerms?.value))) { rejected.push([p.id,'licence '+lic]); console.log('REJECT', p.id, lic); continue; }
  const artist = strip(m.Artist?.value) || strip(m.Credit?.value) || 'Unknown';
  const raw = path.join(rawDir, p.id + '.src');
  if (!fs.existsSync(raw)) { let ok=false; for (const w of [1024,800]) { try { await dl('https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(p.file.replace(/ /g,'_'))+(w?'?width='+w:''), raw, 2); ok=true; break; } catch {} } if(!ok) throw new Error('dl failed '+p.file); await sleep(6000); }
  const img = sharp(raw); const meta = await img.metadata(); const W = meta.width, H = meta.height;
  const box = (c, ar) => { // c = {x,y,w,h} fractions of source; default centre crop with aspect ar
    if (c) { const h = c.h ?? c.w*W/ar/H; const left=Math.round(c.x*W), top=Math.round(c.y*H); return {left,top,width:Math.max(1,Math.min(W-left,Math.round(c.w*W))),height:Math.max(1,Math.min(H-top,Math.round(h*H)))}; }
    let w=W,h=Math.round(W/ar); if(h>H){h=H;w=Math.round(H*ar);} return {left:Math.round((W-w)/2),top:Math.round((H-h)/2),width:w,height:h}; };
  const thumb = `${p.id}.thumb.webp`, panel = `${p.id}.panel.jpg`;
  await sharp(raw).extract(box(p.thumbCrop,1)).resize(256,256,{fit:'cover'}).webp({quality:78}).toFile(path.join(outDir,thumb));
  await sharp(raw).extract(box(p.panelCrop,1.6)).resize(640,400,{fit:'cover'}).jpeg({quality:80,mozjpeg:true}).toFile(path.join(outDir,panel));
  const srcUrl = ii.descriptionurl;
  const credit = `${p.subject} - ${artist} - ${lic} - ${srcUrl}`;
  manifest.push({ id:p.id, category:p.category, alsoTypes:p.alsoTypes||[], nation:p.nation, subject:p.subject, equipmentKeys:p.equipmentKeys||[], tags:p.tags||[], role:p.category==='hq'?'hq':'combat',
    thumb:`/art/units/${thumb}`, panel:`/art/units/${panel}`, license:lic, author:artist, sourceUrl:srcUrl, retrieved:today, credit });
  console.log('OK', p.id, lic);
} catch (e) { rejected.push([p.id,'error '+e.message.slice(0,80)]); console.log('ERROR', p.id, e.message.slice(0,120)); } }
for (const e of manifest) { // normalise attribution text (idempotent)
  e.author = cleanAuthor(e.author);
  if (/bundesarchiv/i.test(e.sourceUrl) && !/^Bundesarchiv/.test(e.author)) e.author = 'Bundesarchiv / ' + e.author;
  e.credit = `${e.subject} - ${e.author} - ${e.license} - ${e.sourceUrl}`;
}
const tsDir = path.join(root,'src/art'); fs.mkdirSync(tsDir,{recursive:true});
fs.writeFileSync(path.join(tsDir,'manifest.json'), JSON.stringify(manifest,null,2));
fs.writeFileSync(path.join(tsDir,'credits.json'), JSON.stringify(manifest.map(e=>({id:e.id,nation:e.nation,subject:e.subject,author:e.author,license:e.license,sourceUrl:e.sourceUrl,retrieved:e.retrieved})),null,2));
const esc = s => s.replace(/\|/g,'\|');
const rows = manifest.map(e=>`| ${e.id} | ${e.nation} | ${esc(e.subject)} | ${esc(e.author)} | ${esc(e.license)} | ${e.sourceUrl} | ${e.retrieved} |`).join('\n');
fs.writeFileSync(path.join(root,'docs/IMAGE_CREDITS.md'), `# Image credits\n\nAll unit photographs are from Wikimedia Commons. Licences were verified through the Commons API (extmetadata) on the retrieval date. Only Public Domain, CC0, CC BY and CC BY-SA images are used; CC BY-SA terms (attribution + share-alike) apply to that individual image only. Images are cropped/resized (thumbnail 256x256 WebP, panel 640x400 JPEG); that is a modification.\n\nMachine-readable list: \`src/art/credits.json\`. Regenerate with \`node scripts/art/build.mjs\`.\n\n| id | nation | subject | author / credit | licence | source | retrieved |\n|---|---|---|---|---|---|---|\n${rows}\n\n${fs.readFileSync(path.join(root,'scripts/art/gaps.md'),'utf8')}

## Rejected during verification\n${rejected.map(r=>`- ${r[0]}: ${r[1]}`).join('\n')||'none'}\n`);
console.log('manifest', manifest.length, 'rejected', rejected.length);
