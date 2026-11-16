// Usage: node scripts/art/desc.mjs "File name" ...   -> prints plain-text description + licence
const UA='TheatreCommandArtSourcing/1.0 (game asset research)'; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for (const t of process.argv.slice(2)) {
  const u=new URL('https://commons.wikimedia.org/w/api.php');
  for(const[k,v] of Object.entries({action:'query',titles:'File:'+t,prop:'imageinfo',iiprop:'extmetadata',format:'json'})) u.searchParams.set(k,v);
  let j; for(let i=0;i<6;i++){ const x=await (await fetch(u,{headers:{'User-Agent':UA}})).text(); try{j=JSON.parse(x);break;}catch{await sleep(10000);} }
  const m=Object.values(j.query.pages)[0].imageinfo?.[0]?.extmetadata||{}; const s=x=>(x?.value||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ');
  console.log(t.slice(-14),'|',s(m.LicenseShortName),'|',s(m.Artist).slice(0,60),'|',s(m.ImageDescription).slice(0,200)); await sleep(1500);
}
