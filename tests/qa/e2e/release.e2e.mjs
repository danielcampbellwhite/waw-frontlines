// Release-checklist E2E. Usage: BASE_URL=http://localhost:5190 [ONLY=normandy] [PW=<path to playwright pkg>] node tests/qa/e2e/release.e2e.mjs
// Per playable campaign: menu -> nation -> briefing -> play 1 game day at 8x -> save -> export -> reload -> load -> import -> autosave listed; zero console errors.
import { pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const PW = process.env.PW || 'C:/Users/Daniel.White/AppData/Local/npm-cache/_npx/86170c4cd1c5da32/node_modules/playwright/index.mjs';
const { chromium } = await import(PW.startsWith('file:') ? PW : pathToFileURL(PW).href);
const BASE = process.env.BASE_URL || 'http://localhost:5190/';
const ONLY = process.env.ONLY ? process.env.ONLY.toLowerCase() : null;
const dateOf = async (p) => (await p.evaluate(() => document.body.innerText)).match(/\d{2} [A-Z]{3} \d{4}/)?.[0] ?? null;
const clickText = (p, re) => p.evaluate((src) => { const r = new RegExp(src); const b = [...document.querySelectorAll('button')].find((x) => r.test(x.innerText || x.getAttribute('aria-label') || '')); if (b) b.click(); return !!b; }, re.source);
const dismiss = async (p) => { for (let i = 0; i < 6; i++) { const n = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); if (!d) return 0; const bs = [...d.querySelectorAll('button')].filter((b) => !/show location/i.test(b.innerText)); const pick = bs.find((b) => /stay|continue|ok|close|dismiss|resume|accept/i.test(b.innerText)) || bs[0]; if (pick) { pick.click(); return 1; } return 0; }); if (!n) break; await p.waitForTimeout(400); } };
const browser = await chromium.launch();
const results = [];
const tmp = mkdtempSync(join(tmpdir(), 'e2e-'));
const listCampaigns = async () => { const p = await (await browser.newContext()).newPage(); await p.goto(BASE); await p.waitForTimeout(4000); await clickText(p, /New campaign/); await p.waitForTimeout(1200); const t = await p.evaluate(() => [...document.querySelectorAll('article')].map((a, i) => ({ i, text: a.innerText.replace(/\n+/g, ' | ').slice(0, 120), ok: !/planned|locked/i.test(a.innerText) }))); await p.context().close(); return t; };
const camps = (await listCampaigns()).filter((c) => c.ok && (!ONLY || c.text.toLowerCase().includes(ONLY)));
for (const c of camps) {
  const r = { campaign: c.text.split(' | ')[0], steps: {}, errors: [] };
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 768 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => r.errors.push('pageerror ' + e.message.slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error') r.errors.push(m.text().slice(0, 160)); });
  const step = async (name, fn) => { try { r.steps[name] = (await fn()) === false ? 'FAIL' : 'ok'; } catch (e) { r.steps[name] = 'FAIL ' + e.message.split('\n')[0].slice(0, 120); } };
  await step('menu->campaign->nation->briefing', async () => {
    await p.goto(BASE); await p.waitForTimeout(4000); await clickText(p, /New campaign/); await p.waitForTimeout(1200);
    await p.getByRole('button', { name: 'Select campaign' }).nth(c.i).click(); await p.waitForTimeout(600);
    await p.getByRole('radio').nth(0).click(); await p.getByRole('button', { name: 'Proceed to briefing' }).click(); await p.waitForTimeout(600);
    await p.getByRole('button', { name: 'Begin the campaign' }).click(); await p.waitForTimeout(6000);
  });
  let d0, d1;
  await step('play 1 day at 8x', async () => {
    await dismiss(p); d0 = await dateOf(p); await p.getByRole('button', { name: '8', exact: true }).first().click();
    const t0 = Date.now(); let day0 = d0;
    while (Date.now() - t0 < 240000) { await p.waitForTimeout(2000); await dismiss(p); d1 = await dateOf(p); if (d1 && d1 !== day0) break; }
    return !!d1 && d1 !== d0;
  });
  await clickText(p, /Pause/); await dismiss(p); const dSaved = await dateOf(p);
  await step('save', async () => {
    await p.getByRole('button', { name: 'Save or load' }).click(); await p.waitForTimeout(600);
    await p.locator('[role=dialog] .seg button', { hasText: 'Save' }).first().click().catch(() => {});
    await p.locator('[role=dialog] input[placeholder="Name this save"]').first().fill('e2e ' + r.campaign.slice(0, 20));
    await p.locator('[role=dialog] .slot-actions button.primary').first().click(); await p.waitForTimeout(1200);
    return /Saved to/.test(await p.locator('[role=dialog] .notice').innerText());
  });
  await step('export', async () => {
    await p.locator('[role=dialog] .seg button', { hasText: 'Load' }).first().click(); await p.waitForTimeout(400);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.locator('[role=dialog] button[aria-label^="Export Slot"], [role=dialog] button[aria-label^="Export"]').filter({ hasNotText: 'zzz' }).last().click()]);
    r.file = join(tmp, dl.suggestedFilename()); await dl.saveAs(r.file); return true;
  });
  await step('autosave listed', async () => { const t = await p.locator('[role=dialog] .slot:not(.empty-slot) .slot-id').allInnerTexts(); r.autosaves = t.filter((x) => /Autosave/.test(x)).length; return r.autosaves > 0; });
  await step('import', async () => {
    await p.locator('[role=dialog] input[type=file]').setInputFiles(r.file); await p.waitForTimeout(1500);
    return /Imported save file/.test(await p.locator('[role=dialog] .notice').innerText());
  });
  await p.keyboard.press('Escape').catch(() => {});
  await step('reload -> main menu load', async () => {
    await p.goto(BASE); await p.waitForTimeout(4000); await clickText(p, /Load game/); await p.waitForTimeout(1000);
    const row = p.locator('[role=dialog] .slot:not(.empty-slot)', { hasText: 'e2e' }).first();
    await row.locator('button.primary').click(); await p.waitForTimeout(6000); await dismiss(p);
    const dl = await dateOf(p); r.loadedDate = dl; r.savedDate = dSaved; return !!dl && dl === dSaved;
  });
  await step('console errors zero', async () => r.errors.length === 0);
  await ctx.close(); results.push(r);
  console.log(JSON.stringify(r));
}
await browser.close();
const fails = results.filter((r) => Object.values(r.steps).some((s) => s !== 'ok'));
console.log(`E2E ${results.length} campaigns, ${fails.length} with failures`);
process.exit(fails.length ? 1 : 0);
