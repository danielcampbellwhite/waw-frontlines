// Usage: node scripts/art/search.mjs "query1" "query2" ...  -> lists Commons file candidates with licence info
const UA = 'TheatreCommandArtSourcing/1.0 (game asset research)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (const q of process.argv.slice(2)) {
  console.log('== ' + q);
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({action:'query',generator:'search',gsrsearch:q,gsrnamespace:6,gsrlimit:10,prop:'imageinfo',iiprop:'extmetadata|size',format:'json'}).forEach(([k,v])=>u.searchParams.set(k,v));
  let r;
  for (let i=0;i<4;i++){ const t = await (await fetch(u,{headers:{'User-Agent':UA}})).text(); try { r = JSON.parse(t); break; } catch { await sleep(5000); } }
  for (const p of Object.values(r?.query?.pages||{})) {
    const ii = p.imageinfo?.[0]; const m = ii?.extmetadata||{};
    const d = (m.ImageDescription?.value||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').slice(0,0);
    console.log(`${p.title.slice(5)} | ${ii?.width}x${ii?.height} | ${m.LicenseShortName?.value} | ${d}`);
  }
  await sleep(1500);
}
