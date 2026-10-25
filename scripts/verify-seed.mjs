/**
 * The starter set: every object and print from the BM38–49 pairings is loaded into a new
 * browser, which opens on the first station; and a browser that has the old four-scan
 * starter gallery gets those four replaced — without losing anything the curator added.
 *
 * Needs public/seed/stations/ (local only).
 *
 * Usage: node scripts/verify-seed.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FBX = '/Users/nikkiquinn/Documents/Duke/Artifact Work/PhotogrammetryFiles/FBX_Files';
const outDir = process.argv[2] ?? './shots';
const url = process.argv[3] ?? 'http://localhost:5179/';
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 900_000,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1600,1000'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const hud = () => page.evaluate(() => document.querySelector('.hud')?.textContent ?? '');
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};

/** Names in the library, straight from IndexedDB. */
const library = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('artifact-reflection');
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['artifacts', 'artworks']);
          const a = tx.objectStore('artifacts').getAll();
          const w = tx.objectStore('artworks').getAll();
          tx.oncomplete = () => {
            resolve({ objects: a.result.map((r) => r.name), prints: w.result.map((r) => r.name) });
            db.close();
          };
        };
      }),
  );

/** A browser with nothing in it — no library, no record of ever seeding. */
async function fresh(storage) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (storage) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase('artifact-reflection');
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  }, storage);
}

console.log('1. a new browser gets the pairing set and opens on BM38');
await fresh({});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('StationBM38'), {
  timeout: 600_000,
  polling: 1000,
});
await settle(4000);
await page.screenshot({ path: join(outDir, 'seed-01-bm38.png') });
let lib = await library();
check('all seven pairing scans are in the library', lib.objects.length === 7, lib.objects.join(', '));
check('all twelve prints are in the library', lib.prints.length === 12, `${lib.prints.length}`);
check('none of the old NOMA scans', !lib.objects.some((n) => /Dogon|Gelede|Ashanti|Fertility/.test(n)));
const t = await hud();
check('BM38 staged with the Prisionero Moche', t.includes('MAM_01425_PrisioneroMoche'));
check('…on La esclava', t.includes('BM38_'));

console.log('2. a browser with the old starter gallery is migrated, keeping its own additions');
await fresh({ 'seed-loaded-v1': '1', 'seed-loaded-v2': '1' });
await page.reload({ waitUntil: 'networkidle0' });
await settle(1000);
const input = await page.$('input[type=file]');
await input.uploadFile(join(FBX, '1976_91_18_Dogon_Mask_85K_poly_4K_tex.fbx'));
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('(1/1)'), {
  timeout: 240_000,
  polling: 500,
});
await page.click('.gallery-tab');
await settle(300);
const add = await page.$('.gallery-add input[type=file]');
await add.uploadFile(join(FBX, '1975_16_4_Pulley_Figure.fbx'), join(FBX, '1975_16_4_Pulley_Figure.jpg'));
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('(2/2)'), {
  timeout: 240_000,
  polling: 500,
});
lib = await library();
check('set up: old seed scan plus the curator\'s own', lib.objects.length === 2, lib.objects.join(', '));

// Now this browser "updates" to the new build: v2 has never run here.
await page.evaluate(() => localStorage.removeItem('seed-loaded-v2'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('StationBM38'), {
  timeout: 600_000,
  polling: 1000,
});
await settle(2000);
lib = await library();
check('the old seed scan is gone', !lib.objects.includes('1976_91_18_Dogon_Mask_85K_poly_4K_tex'));
check('the curator\'s own object stayed', lib.objects.includes('1975_16_4_Pulley_Figure'));
check('the pairing set was added', lib.objects.filter((n) => n.startsWith('MAM_')).length === 7, `${lib.objects.length} objects`);

console.log('3. it happens once');
await page.reload({ waitUntil: 'networkidle0' });
await settle(3000);
const again = await library();
check('a second load adds nothing', again.objects.length === lib.objects.length && again.prints.length === lib.prints.length);

console.log('');
if (errors.length) {
  console.log('Console/page errors:');
  for (const e of [...new Set(errors)]) console.log('  ', e);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
await browser.close();
