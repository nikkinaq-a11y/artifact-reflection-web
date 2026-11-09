/**
 * The Orientation window and the floor option: a scan is tipped upright, the correction
 * is saved to the object, survives a reload and a gallery zip round trip, and changes
 * what the main scene draws; the window screenshots (incl. a transparent PNG); and an
 * object can stand on the floor instead of its pedestal.
 *
 * Needs public/seed/stations/ (stages BM45). Usage: node scripts/verify-orient.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { unzipSync, strFromU8 } from 'fflate';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = process.argv[2] ?? './shots/orient';
const url = process.argv[3] ?? 'http://localhost:5179/';
const dl = resolve(join(outDir, 'downloads'));
mkdirSync(dl, { recursive: true });
for (const f of readdirSync(dl)) unlinkSync(join(dl, f));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 600_000,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1600,1000'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const hud = () => page.evaluate(() => document.querySelector('.hud')?.textContent ?? '');
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const clickText = async (scope, text) => {
  const ok = await page.evaluate(
    (scope, text) => {
      const b = [...document.querySelectorAll(`${scope} button`)].find((x) => x.textContent.trim().includes(text));
      b?.click();
      return Boolean(b);
    },
    scope,
    text,
  );
  if (!ok) throw new Error(`no button "${text}" in ${scope}`);
  await settle(600);
};
const files = (ext) => readdirSync(dl).filter((f) => f.endsWith(ext));
const waitFile = async (ext, n) => {
  for (let i = 0; i < 60 && files(ext).length < n; i++) await settle(500);
  return files(ext);
};
/** Fraction of pixels that differ noticeably between two screenshots. */
const diff = (a, b) => {
  let n = 0;
  let total = 0;
  for (let i = 0; i < a.data.length; i += 4 * 7) {
    total += 1;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 30) n += 1;
  }
  return n / total;
};
const grab = async () => PNG.sync.read(await page.screenshot());

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  localStorage.setItem('seed-loaded-v1', '1');
  localStorage.setItem('seed-loaded-v2', '1');
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('artifact-reflection');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
});
await page.reload({ waitUntil: 'networkidle0' });
await settle(1500);
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });

console.log('1. stage BM45');
await page.click('.stage .gallery-tab');
await settle(300);
await page.select('.stage-station', 'BM45');
await page.waitForFunction(
  () => document.querySelector('.hud')?.textContent?.includes('StationBM45') && !document.querySelector('.modal'),
  { timeout: 240_000, polling: 500 },
);
await settle(4000);
await shot('o01-before');
const before = await grab();
const uprightLabel = () =>
  page.evaluate(() => [...document.querySelectorAll('.stage-row')].find((r) => r.textContent.startsWith('Upright'))?.querySelector('em')?.textContent);
check('Stage panel says as imported', (await uprightLabel()) === 'as imported');

console.log('2. J opens the Orientation window');
await page.keyboard.press('KeyJ');
await page.waitForSelector('.orient', { timeout: 5000 });
await page.waitForFunction(() => !document.querySelector('.orient-loading'), { timeout: 60_000 });
await settle(2500);
await shot('o02-window');
check('window names the object', (await page.$eval('.orient-name', (n) => n.textContent)).includes('MAM_1985_01_128'));
const rotBefore = (await hud()).match(/Rotation(-?[\d.]+)°/)?.[1];
await page.keyboard.press('KeyR');
await settle(300);
check('scene keys are off while it is open', (await hud()).match(/Rotation(-?[\d.]+)°/)?.[1] === rotBefore);

console.log('3. tip it 90° toward the viewer');
const viewBefore = await grab();
await clickText('.orient-rows', 'Toward');
await settle(1500);
check('readout shows tip 90°', (await page.$eval('.orient-readout', (n) => n.textContent)).includes('tip 90°'));
const viewAfter = await grab();
check('the preview changed', diff(viewBefore, viewAfter) > 0.02, diff(viewBefore, viewAfter).toFixed(3));
await shot('o03-tipped');

console.log('4. screenshots from the window');
await page.click('.orient-shot');
let pngs = await waitFile('.png', 1);
check('screenshot button saves a PNG', pngs.length === 1, pngs[0]);
const img = pngs[0] && PNG.sync.read(readFileSync(join(dl, pngs[0])));
check('…opaque on the gallery backdrop', img && img.data[3] === 255);
await clickText('.orient-side', 'Clear');
await settle(1500);
await page.keyboard.press('KeyI');
pngs = await waitFile('.png', 2);
check('I saves a second one', pngs.length === 2);
const clear = pngs.map((f) => PNG.sync.read(readFileSync(join(dl, f)))).find((p) => p.data[3] === 0);
let solid = 0;
if (clear) for (let i = 3; i < clear.data.length; i += 4 * 13) solid += clear.data[i] > 200 ? 1 : 0;
check('Clear gives a transparent PNG with the object in it', Boolean(clear) && solid > 200, `${solid} solid samples`);
await clickText('.orient-side', 'Floor');
await clickText('.orient-side', 'Gallery');
await settle(1500);
await shot('o04-floor');

console.log('5. Save as default');
await clickText('.orient-side footer', 'Save as default');
check('window closes', !(await page.$('.orient')));
await settle(3000);
await shot('o05-scene-after');
const after = await grab();
check('main scene draws the tipped object', diff(before, after) > 0.01, diff(before, after).toFixed(3));
check('Stage panel says corrected', (await uprightLabel()) === 'corrected');
const t = await hud();
check('saving with Floor stood it on the plinth', /Pedestalnone — standing on the plinth/.test(t));

console.log('6. Stands on: Pedestal / Plinth in the Stage panel');
await clickText('.stage-row', 'Pedestal');
await settle(2000);
check('back on its pedestal', /Pedestal\d/.test(await hud()));
const onPed = await grab();
await clickText('.stage-row', 'Plinth');
await settle(2000);
check('floor moves the object', diff(onPed, await grab()) > 0.01);

console.log('7. survives a reload');
await page.reload({ waitUntil: 'networkidle0' });
await settle(5000);
await page.click('.stage .gallery-tab').catch(() => {});
await settle(500);
check('still corrected after reload', (await uprightLabel()) === 'corrected');

console.log('8. gallery zip carries it');
await page.click('.gallery > .gallery-tab');
await settle(400);
check('gallery row marks it', Boolean(await page.$('.gallery-orient.is-set')));
await clickText('.gallery-pack', 'Export gallery');
const zips = await waitFile('.zip', 1);
const zip = zips[0] && unzipSync(readFileSync(join(dl, zips[0])));
const manifest = zip && JSON.parse(strFromU8(zip['gallery.json']));
const scan = manifest?.artifacts.find((a) => a.name.includes('1985_01_128'));
check('manifest has the orientation', Array.isArray(scan?.orientation) && scan.orientation.length === 4, JSON.stringify(scan?.orientation));
check('README notes it', strFromU8(zip['README.txt']).includes('orientation corrected'));

await page.evaluate(() => indexedDB.deleteDatabase('artifact-reflection'));
await page.reload({ waitUntil: 'networkidle0' });
await settle(1500);
await page.click('.gallery > .gallery-tab');
await settle(400);
await (await page.$('.gallery-pack input[type=file]')).uploadFile(join(dl, zips[0]));
await page.waitForFunction(() => document.querySelectorAll('.gallery-list li').length > 1, { timeout: 180_000, polling: 500 });
await settle(3000);
check('import restores the correction', Boolean(await page.$('.gallery-orient.is-set')));

console.log('9. As imported clears it');
await page.click('.gallery-orient.is-set');
await page.waitForSelector('.orient');
await settle(1500);
await clickText('.orient-pair', 'As imported');
await clickText('.orient-side footer', 'Save as default');
check('cleared', !(await page.$('.gallery-orient.is-set')));

const real = errors.filter((e) => !/WebGL|GPU|swiftshader|favicon/i.test(e));
check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));
await browser.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
