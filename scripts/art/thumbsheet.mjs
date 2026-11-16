// Usage: node scripts/art/thumbsheet.mjs out.jpg [idPrefix]  -> contact sheet of produced thumbnails (QA of crops)
import fs from 'node:fs'; import sharp from 'sharp'; import path from 'node:path';
const root = path.resolve(import.meta.dirname,'../..'); const [,,out,pre=''] = process.argv;
const m = JSON.parse(fs.readFileSync(path.join(root,'src/art/manifest.json'),'utf8')).filter(e=>process.env.IDS ? process.env.IDS.split(',').includes(e.id) : e.id.startsWith(pre));
const T=200, cols=6, rows=Math.ceil(m.length/cols); const comp=[];
for (let i=0;i<m.length;i++){ const b=await sharp(path.join(root,'public',m[i].thumb)).resize(T,T).toBuffer();
  const lab=Buffer.from(`<svg width="${T}" height="20"><rect width="${T}" height="20" fill="#000" opacity=".7"/><text x="3" y="14" font-size="12" fill="#ff0" font-family="Arial">${m[i].id}</text></svg>`);
  comp.push({input:b,left:(i%cols)*T,top:Math.floor(i/cols)*T},{input:lab,left:(i%cols)*T,top:Math.floor(i/cols)*T}); }
await sharp({create:{width:cols*T,height:rows*T,channels:3,background:'#000'}}).composite(comp).jpeg({quality:80}).toFile(out);
console.log(m.length);
