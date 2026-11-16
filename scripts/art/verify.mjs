// node scripts/art/verify.mjs -> checks every manifest file exists, sizes, total weight
import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';
const root = path.resolve(import.meta.dirname,'../..'); const m = JSON.parse(fs.readFileSync(path.join(root,'src/art/manifest.json'),'utf8'));
let total=0, bad=0;
for (const e of m) for (const [k,w,h] of [['thumb',256,256],['panel',640,400]]) { const f=path.join(root,'public',e[k]); if(!fs.existsSync(f)){console.log('MISSING',f);bad++;continue;} total+=fs.statSync(f).size; const md=await sharp(f).metadata(); if(md.width!==w||md.height!==h){console.log('SIZE',e.id,k,md.width,md.height);bad++;} }
console.log(m.length,'entries,',(total/1048576).toFixed(2),'MB,',bad,'problems');
