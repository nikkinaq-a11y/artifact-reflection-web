/**
 * End-to-end check of the artifact library: add two real FBX scans, cycle between them,
 * toggle the background, confirm they survive a reload, then remove one.
 *
 * Usage: node scripts/verify-import.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FBX_DIR = '/Users/nikkiquinn/Documents/Duke/Artifact Work/PhotogrammetryFiles/FBX_Files';
const FILES = [
  join(FBX_DIR, '1976_91_18_Dogon_Mask_85K_poly_4K_tex.fbx'),
  join(FBX_DIR, '1975_16_4_Pulley_Figure.fbx'),
];

const outDir = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:5179/';
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  // SwiftShader renders in software, and this app draws the whole scene twice a frame for
  // the reflection. On a machine that is also running the app in a real browser tab, a
  // single screenshot can blow past the 180 s default and abort a run that was fine.
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
const shot = async (name) => {
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log('  shot', name);
};
const hud = () =>
  page.evaluate(() => document.querySelector('.hud')?.textContent?.trim() ?? '(no hud)');

// Start from an empty library — a local build's starter gallery would otherwise fill a
// fresh profile before the empty state this script begins from ever shows.
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(async () => {
  localStorage.setItem('seed-loaded-v1', '1');
  localStorage.setItem('seed-loaded-v2', '1');
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('artifact-reflection');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
});
await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
await settle(1500);

console.log('1. empty state');
await shot('01-empty');

console.log('2. importing', FILES.length, 'FBX files');
const input = await page.$('input[type=file]');
await input.uploadFile(...FILES);

// Parsing blocks the main thread; poll for both to land rather than guessing.
await page.waitForFunction(
  () => document.querySelector('.hud')?.textContent?.includes('2/2'),
  { timeout: 120000, polling: 500 },
);
await settle(2500);
console.log('  hud:', await hud());
await shot('02-second-artifact');

console.log('3. cycling objects with O');
await page.keyboard.press('KeyO');
await settle(2500);
console.log('  hud:', await hud());
await shot('03-after-O');

console.log('4. the room — white gallery only, B does nothing');
await page.keyboard.press('KeyB');
await settle(600);
console.log('  white room:', await page.evaluate(() => document.querySelector('.app').classList.contains('theme-white')));
await shot('04-room');

console.log('5. gallery via its tab');
await page.click('.gallery-tab');
await settle(600);
await shot('05-gallery');
const rows = await page.$$eval('.gallery-list li', (li) => li.length);
console.log('  gallery rows:', rows);

console.log('6. reload — persistence');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(
  () => document.querySelector('.hud')?.textContent?.includes('/2'),
  { timeout: 120000, polling: 500 },
);
await settle(3000);
console.log('  hud:', await hud());
await shot('06-after-reload');

console.log('7. removing one from the gallery');
await page.click('.gallery-tab');
await settle(600);
await page.click('.gallery-remove');
await settle(1500);
const left = await page.$$eval('.gallery-list li', (li) => li.length);
console.log('  gallery rows after remove:', left);
await shot('07-after-remove');

console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nno page errors');
await browser.close();