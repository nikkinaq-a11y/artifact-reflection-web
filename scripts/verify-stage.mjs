/**
 * The BM42–49 iteration: stations from the install plan, plinth + pedestal + base, the
 * white room, two objects, and moving them by drag, arrow keys and typed centimetres.
 *
 * Needs the local starter set in public/seed/stations/ (decimated Pluriversal scans and
 * the BM prints) — it is gitignored, so this runs on a local machine only.
 *
 * Usage: node scripts/verify-stage.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { PNG } from 'pngjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = process.argv[2] ?? './shots';
const url = process.argv[3] ?? 'http://localhost:5179/';
mkdirSync(outDir, { recursive: true });

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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const hud = () => page.evaluate(() => document.querySelector('.hud')?.textContent ?? '');
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });
const field = (re) => hud().then((t) => t.match(re)?.[1]);

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const press = async (key, shift = false) => {
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.press(key);
  if (shift) await page.keyboard.up('Shift');
  await settle(200);
};

/** Start clean: no library, no seed, so only what the stations load is present. */
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

const stage = async (id) => {
  await page.select('.stage-station', id);
  await page.waitForFunction(
    (id) => document.querySelector('.hud')?.textContent?.includes(`Station${id}`) &&
      !document.querySelector('.modal'),
    { timeout: 240_000, polling: 500 },
    id,
  );
  await settle(4000);
};

console.log('1. open the stage panel, stage BM45');
await page.click('.stage .gallery-tab');
await settle(300);
await stage('BM45');
await shot('s01-bm45');
let t = await hud();
check('BM45 print on the sheet', t.includes('BM45_'));
check('sheet pinned to 106.5 × 82.5', t.includes('106.5 × 82.5 cm wide'), t.match(/Sheet[^·]*/)?.[0]);
check('scan loaded at true height', /MAM_1985_01_128/.test(t) && /cm true height/.test(t), t.match(/[\d.]+ cm true height/)?.[0]);
check('base riser shown', t.includes('Base25 × 20 × 10 cm'));
check('plinth on', t.includes('Plinth10 cm'));
check('white room', await page.evaluate(() => document.querySelector('.app')?.classList.contains('theme-white')));

const along = () => field(/· (-?[\d.]+) cm along/).then(Number);
const prompt = () => page.evaluate(() => document.querySelector('.move-prompt')?.textContent ?? '');

console.log('2. arrow keys ask first, then move the active object; G steps the gap');
const xAsk = await along();
await press('ArrowRight');
check('an arrow on a locked pedestal asks "Move pedestal?"', (await prompt()).includes('Move pedestal?'));
check('…and does not move it', (await along()) === xAsk, `${xAsk} → ${await along()}`);
await shot('s01b-ask');
await page.click('.move-prompt .is-primary');
await settle(200);
check('confirming offers Done', (await prompt()).includes('Done'));
const x0 = await along();
await press('ArrowRight', true);
await press('ArrowRight');
const x1 = Number(await field(/· (-?[\d.]+) cm along/));
check('Shift+→ then → moves 11 cm along the wall', x1 - x0 === 11, `${x0} → ${x1}`);
const g0 = Number(await field(/Gap(-?[\d.]+) cm/));
await press('KeyG');
const g1 = Number(await field(/Gap(-?[\d.]+) cm/));
check('G widens the gap 5 cm', g1 - g0 === 5, `${g0} → ${g1}`);
await press('KeyG', true);
await press('ArrowUp', true);
await press('ArrowUp', true);
await press('ArrowUp', true);
const g2 = Number(await field(/Gap(-?[\d.]+) cm/));
check('the pedestal stops at the sheet', g2 === 21, `gap ${g2} (pedestal 40 deep → min 21)`);

console.log('3. a locked pedestal cannot be dragged; click, confirm, then it can');
await press('Escape');
check('Escape locks it again', (await prompt()) === '');

/** Sweep the pointer across the middle of the view until the canvas says a stand is there. */
const findStand = async () => {
  for (let y = 380; y <= 760; y += 20) {
    for (let x = 520; x <= 1080; x += 20) {
      await page.mouse.move(x, y);
      const cur = await page.evaluate(() => document.querySelector('canvas').style.cursor);
      if (cur === 'pointer' || cur === 'grab') return { x, y, cur };
    }
  }
  return null;
};
const dragFrom = async (at, dx) => {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(at.x + (dx * i) / 10, at.y);
    await settle(40);
  }
  await page.mouse.up();
  await settle(500);
};

let at = await findStand();
check('a locked stand shows a click cursor, not a grab', at?.cur === 'pointer', at && `${at.x},${at.y} ${at.cur}`);
if (at) {
  const before = await along();
  await dragFrom(at, -120);
  check('dragging a locked pedestal leaves it where it is', (await along()) === before, `${before} → ${await along()}`);
  check('…and asks nothing (it was an orbit)', (await prompt()) === '');

  // The camera orbited, so find the stand again, then click it.
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyC', { delay: 10 });
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Shift');
  await settle(1500);
  at = await findStand();
  await page.mouse.click(at.x, at.y);
  await settle(400);
  check('clicking a pedestal asks "Move pedestal?"', (await prompt()).includes('Move pedestal?'));
  await shot('s02a-outlined');
  await page.click('.move-prompt .is-primary');
  await settle(300);
  at = await findStand();
  check('once confirmed it offers the grab cursor', at?.cur === 'grab');
  const b2 = await along();
  await dragFrom(at, -120);
  const a2 = await along();
  check('dragging the confirmed pedestal moves it along the wall', a2 < b2 - 5, `${b2} → ${a2}`);
  await shot('s02-dragged');
  await page.mouse.click(1500, 160); // empty wall, top right
  await settle(400);
  check('a click on empty space locks it', (await prompt()) === '');
}

console.log('4. BM43 — two objects, each on its own pedestal');
await stage('BM43');
await settle(3000);
await shot('s03-bm43');
t = await hud();
check('second object present', t.includes('Object A'));
await press('Digit2');
t = await hud();
check('2 selects object B', t.includes('Object B') && t.includes('MAM_1981_04_049'));
await press('KeyT');
check('T removes B', !(await hud()).includes('Object B'));
await press('KeyT');
check('T brings B back', (await hud()).includes('Object B'));

console.log('4b. the install plan\'s pairing leads the object list');
const recOptions = () =>
  page.$$eval('.stage-row select optgroup:first-child option', (o) =>
    o.map((x) => ({ text: x.textContent.trim(), disabled: x.disabled })),
  );
let recs = await recOptions();
check('two-object pairing offers Recommended A and B', recs[0]?.text === 'Recommended A — Figure FA' && recs[1]?.text === 'Recommended B — Figure FB', recs.map((r) => r.text).join(' | '));
check('…and the object on B shows as its recommendation', await page.$eval('.stage-row select', (s) => s.selectedOptions[0]?.textContent.trim()) === 'Recommended B — Figure FB');
const galleryRecs = async () => {
  await page.click('.gallery-tab');
  await settle(300);
  const rows = await page.$$eval('.gallery-rec .gallery-name', (n) => n.map((x) => x.textContent.trim()));
  await page.click('.gallery-tab');
  await settle(200);
  return rows;
};
check('the gallery pins them first too', (await galleryRecs()).join(' | ') === 'Recommended A — Figure FA | Recommended B — Figure FB');

// Choosing a print is enough: the recommendation follows the painting on the sheet.
await page.click('.gallery-tab');
await settle(300);
await page.evaluate(() => [...document.querySelectorAll('.gallery-seg button')].find((b) => b.textContent.includes('Prints'))?.click());
await settle(300);
await page.evaluate(() => [...document.querySelectorAll('.gallery-pick')].find((b) => b.textContent.includes('BM45_'))?.click());
await settle(400);
await page.evaluate(() => [...document.querySelectorAll('.gallery-seg button')].find((b) => b.textContent.includes('Objects'))?.click());
await page.click('.gallery-tab');
await settle(300);
recs = await recOptions();
check('picking the BM45 print recommends its object', recs.length === 1 && recs[0].text === 'Recommended — Seated figure', recs.map((r) => r.text).join(' | '));

console.log('5. typed centimetres');
const alongInput = await page.evaluateHandle(() =>
  [...document.querySelectorAll('.stage-row')]
    .find((r) => r.textContent.startsWith('Along wall'))
    .querySelector('input'),
);
await alongInput.click();
await page.keyboard.type('42.5');
await page.keyboard.press('Enter');
await settle(400);
check('typed 42.5 cm lands exactly', (await hud()).includes('42.5 cm along'));

console.log('6. stand toggles');
await press('KeyE');
check('E puts a base on B', (await hud()).includes('Base'));
await press('KeyY');
check('Y takes the plinth off', !(await hud()).includes('Plinth'));
await press('KeyY');

console.log('7. a station with no PS scan stands empty and says so');
await stage('BM42');
await shot('s04-bm42');
t = await hud();
check('empty pedestal reported', t.includes('empty pedestal'));
recs = await recOptions();
check('a pairing with no scan still names it, greyed', recs[0]?.text === 'Recommended — Xipe Totec (no scan)' && recs[0]?.disabled, recs[0] && `${recs[0].text} disabled=${recs[0].disabled}`);
check('…and the empty pedestal reads as empty', await page.$eval('.stage-row select', (s) => s.selectedOptions[0]?.textContent.trim()) === '— empty pedestal —');
const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '');
check('missing scan explained', /Xipe Totec/.test(toast), toast.slice(0, 80));
await page.click('.toast-reduce');
await settle(200);
check('the notes box reduces to a chip', Boolean(await page.$('.toast-chip')) && !(await page.$('.toast-text')));
await page.click('.toast-chip');
await settle(200);
check('…and opens again', /Xipe Totec/.test(await page.$eval('.toast-text', (n) => n.textContent)));
await page.click('.hud-tab');
await settle(200);
check('the readout reduces to its camera chip', !(await page.$('.hud-body')) && Boolean(await page.$('.hud.is-closed')));
await page.click('.hud-tab');
await settle(200);
check('…and opens again', Boolean(await page.$('.hud-body')));

console.log('8. BM48 tall sheet, BM49 cropped detail');
await stage('BM48');
await shot('s05-bm48');
await stage('BM49');
await shot('s06-bm49');
check('BM49 sheet is the 125.5 × 158.8 detail', (await hud()).includes('125.5 × 158.8 cm wide'));

console.log('9. save a setup, stage something else, bring it back');
await stage('BM45');
const typeInto = async (rowStart, value) => {
  const el = await page.evaluateHandle(
    (rowStart) =>
      [...document.querySelectorAll('.stage-row')]
        .find((r) => r.textContent.startsWith(rowStart))
        .querySelector('input'),
    rowStart,
  );
  await el.click();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
  await settle(300);
};
await typeInto('Along wall', '5');
await page.click('.stage-name', { clickCount: 3 });
await page.keyboard.type('Test BM45');
await page.click('.stage-btn.is-primary');
await settle(800);
check('the setup is listed', (await page.$$eval('.stage-setup-load', (b) => b.map((x) => x.textContent))).some((x) => x.includes('Test BM45')));
check('HUD names the saved setup', (await hud()).includes('SetupTest BM45'));
await stage('BM43');
check('another station replaces it', (await hud()).includes('StationBM43'));
await page.evaluate(() =>
  [...document.querySelectorAll('.stage-setup-load')].find((b) => b.textContent.includes('Test BM45')).click(),
);
await settle(2500);
t = await hud();
check('loading it restores the object', t.includes('MAM_1985_01_128'));
check('…the print', t.includes('BM45_'));
check('…and the adjusted position', t.includes('5 cm along'), t.match(/-?[\d.]+ cm along/)?.[0]);
check('…as one object, not two', !t.includes('Object B'));
await shot('s07-setup-loaded');

console.log('9b. snapshot, brightness, and the camera sweep');
const dl = join(outDir, 'downloads');
mkdirSync(dl, { recursive: true });
for (const f of readdirSync(dl)) if (f.endsWith('.png')) unlinkSync(join(dl, f));
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
await page.click('.rail-button');
await settle(2500);
const notice = await page.evaluate(() => document.querySelector('.notice')?.textContent ?? '');
check('the snapshot button saves', /Snapshot saved — .*Test BM45 - .*\.png/.test(notice), notice.slice(0, 90));
const pngs = readdirSync(dl).filter((f) => f.endsWith('.png'));
const snap = pngs[0] && PNG.sync.read(readFileSync(join(dl, pngs[0])));
check('…a real image of the scene, at full size', Boolean(snap) && snap.width === 1600 && snap.height === 1000, pngs[0]);
// Not blank: a snapshot read after the frame was presented would come back empty.
let lit = 0;
if (snap) for (let i = 0; i < snap.data.length; i += 4 * 97) lit += snap.data[i + 3] > 0 && snap.data[i] + snap.data[i + 1] + snap.data[i + 2] > 30 ? 1 : 0;
check('…and not blank', lit > 1000, `${lit} lit samples`);
await page.keyboard.press('KeyI');
await settle(2500);
check('I does the same', readdirSync(dl).filter((f) => f.endsWith('.png')).length === 2);

const frameLuma = async () => {
  const png = PNG.sync.read(await page.screenshot());
  let sum = 0;
  let n = 0;
  for (let y = 100; y < 900; y += 7) for (let x = 500; x < 1400; x += 7) {
    const i = (png.width * y + x) << 2;
    sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
    n += 1;
  }
  return sum / n;
};
const setLevel = (v) =>
  page.$eval('.rail-slider input', (el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, v);
check('brightness defaults to the middle step', (await page.$eval('.rail-slider-value', (n) => n.textContent)).includes('3 / 5'));
await setLevel(0);
await settle(1200);
const dim = await frameLuma();
await setLevel(4);
await settle(1200);
const bright = await frameLuma();
check('the light slider brightens the scene', bright > dim + 3, `${dim.toFixed(1)} → ${bright.toFixed(1)}`);
await setLevel(2);
await settle(300);

const camName = () => page.$eval('.hud-cam-name', (n) => n.textContent);
const order = [await camName()];
for (let i = 0; i < 4; i++) {
  await page.keyboard.press('KeyC');
  await settle(150);
  order.push(await camName());
}
check('C sweeps out along the right side first', order.every((n) => /Right|Grazing/.test(n)), order.join(' → '));

console.log('10. survives a reload of the library');
await stage('BM45');
await page.reload({ waitUntil: 'networkidle0' });
await settle(3000);
t = await hud();
check('station assets persisted in the library', /\(\d+\/\d+\)/.test(t), t.match(/Object[^(]*\(\d+\/\d+\)/)?.[0]);
await page.click('.stage .gallery-tab');
await settle(500);
check('saved setups persisted', (await page.$$eval('.stage-setup-load', (b) => b.map((x) => x.textContent))).some((x) => x.includes('Test BM45')));

console.log('');
if (errors.length) {
  console.log('Console/page errors:');
  for (const e of [...new Set(errors)]) console.log('  ', e);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(`shots in ${outDir}`);
await browser.close();
