// Usage: node scripts/art/sheet.mjs cands.json outDir
// cands.json: { "group": ["title prefix", ...] }. Resolves each prefix to a Commons file, downloads 420px previews
// (untrusted data, never executed) into outDir and composes one labelled contact sheet per group.
import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';
const UA = 'TheatreCommandArtSourcing/1.0 (game asset research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [,, candFile, outDir] = process.argv; fs.mkdirSync(outDir, {recursive:true});
const cands = JSON.parse(fs.readFileSync(candFile,'utf8'));
async function api(params){ const u=new URL('https://commons.wikimedia.org/w/api.php'); for(const[k,v] of Object.entries({...params,format:'json'})) u.searchParams.set(k,v);
  for(let i=0;i<8;i++){ const t=await (await fetch(u,{headers:{'User-Agent':UA}})).text(); try{return JSON.parse(t);}catch{await sleep(15000);} } throw new Error('api'); }
async function dl(title,file){ const u='https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(title.replace(/ /g,'_'))+'?width=420';
  for(let i=0;i<8;i++){ const r=await fetch(u,{headers:{'User-Agent':UA}}); if(r.ok){ fs.writeFileSync(file,Buffer.from(await r.arrayBuffer())); return true;} await sleep(15000);} return false; }
for (const [g, list] of Object.entries(cands)) {
  const tiles=[]; let n=0;
  for (const pre of list) {
    const r = await api({action:'query',list:'allpages',apnamespace:6,apprefix:pre,aplimit:1}); await sleep(2000);
    const t = r.query?.allpages?.[0]?.title?.slice(5); if(!t){ console.log('NOT FOUND',pre); continue; }
    const f = path.join(outDir, `${g}_${n}.img`); if(!(await dl(t,f))){console.log('DL FAIL',t);continue;} await sleep(2000);
    console.log(`${g}[${n}] ${t}`);
    try { const b = await sharp(f).resize(420,300,{fit:'contain',background:'#222'}).toBuffer();
      const label = Buffer.from(`<svg width="420" height="300"><rect width="40" height="34" fill="#000" opacity=".7"/><text x="6" y="26" font-size="26" fill="#ff0" font-family="Arial">${n}</text></svg>`);
      tiles.push(await sharp(b).composite([{input:label}]).png().toBuffer()); } catch(e){ console.log('img err',t); }
    n++;
  }
  if(!tiles.length) continue;
  const cols=3, rows=Math.ceil(tiles.length/cols);
  await sharp({create:{width:cols*424,height:rows*304,channels:3,background:'#000'}}).composite(tiles.map((b,i)=>({input:b,left:(i%cols)*424,top:Math.floor(i/cols)*304}))).jpeg({quality:80}).toFile(path.join(outDir,`sheet_${g}.jpg`));
}
