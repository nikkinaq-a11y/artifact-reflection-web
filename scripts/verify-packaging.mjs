/**
 * End-to-end check of gallery packaging against the production build:
 *   1. import two artifacts and stage the scene
 *   2. export the gallery to a .zip
 *   3. wipe the library completely
 *   4. re-import the .zip and confirm artifacts AND scene settings came back
 *   5. reload with the network cut, to prove the service worker serves it offline
 *
 * Run `npm run build` first, then serve dist/ and pass its URL.
 * Usage: node scripts/verify-packaging.mjs <outDir> <url>
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FBX = '/Users/nikkiquinn/Documents/Duke/Artifact Work/PhotogrammetryFiles/FBX_Files';
const outDir = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:4179/';

mkdirSync(outDir, { recursive: true });
const downloads = join(outDir, 'downloads');
rmSync(downloads, { recursive: true, force: true });
mkdirSync(downloads, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  // SwiftShader renders in software, and this app draws the whole scene twice a frame for
  // the reflection. On a machine that is also running the app in a real browser tab, a
  // single screenshot can blow past the 180 s default and abort a run that was fine.
  protocolTimeout: 600_000,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1400,900'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: downloads,
  eventsEnabled: true,
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const hud = () => page.$eval('.hud', (n) => n.textContent);

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluate(() => indexedDB.deleteDatabase('artifact-reflection'));
await page.reload({ waitUntil: 'networkidle0' });
await settle(1500);

console.log('1. importing two artifacts');
await (await page.$('input[type=file]')).uploadFile(
  join(FBX, '1976_91_18_Dogon_Mask_85K_poly_4K_tex.fbx'),
  join(FBX, '2015_4_16_1_Wooden_Spoon_100k_polys.fbx'),
);
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('2/2'), {
  timeout: 180000,
  polling: 500,
});
await settle(2500);

console.log('2. staging the scene (pedestal taller, gallery background, front light on)');
for (let i = 0; i < 4; i++) await page.keyboard.press('KeyH');
await page.keyboard.press('KeyB');
await page.keyboard.press('KeyF');
await settle(800);
const staged = await hud();
console.log('   ', staged.replace(/\s+/g, ' ').slice(0, 110));

console.log('3. exporting');
await page.click('.gallery-tab');
await settle(400);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.gallery-pack button')].find((x) =>
    x.textContent.includes('Export'),
  );
  b.click();
});

let zipPath = null;
for (let i = 0; i < 60 && !zipPath; i++) {
  await settle(1000);
  const { readdirSync } = await import('node:fs');
  const f = readdirSync(downloads).find((n) => n.endsWith('.zip'));
  if (f) zipPath = join(downloads, f);
}
if (!zipPath) throw new Error('no .zip was downloaded');

const entries = unzipSync(readFileSync(zipPath));
const names = Object.keys(entries);
const manifest = JSON.parse(new TextDecoder().decode(entries['gallery.json']));
console.log('    file:', zipPath.split('/').pop(), `(${(readFileSync(zipPath).length / 1048576).toFixed(1)} MB)`);
console.log('    entries:', names.length, '| artifacts in manifest:', manifest.artifacts.length);
console.log('    settings captured:', JSON.stringify(manifest.settings.pedestal), 'theme=' + manifest.settings.studioTheme, 'frontLight=' + manifest.settings.lights.front.on);

console.log('4. wiping the library');
await page.evaluate(() => indexedDB.deleteDatabase('artifact-reflection'));
await page.reload({ waitUntil: 'networkidle0' });
await settle(1500);
const empty = await page.$$eval('.gallery-list li', (n) => n.length).catch(() => 0);
console.log('    artifacts after wipe:', empty);

console.log('5. re-importing the gallery file');
await page.click('.gallery-tab');
await settle(400);
const importInput = await page.$('.gallery-pack input[type=file]');
await importInput.uploadFile(zipPath);
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('/2'), {
  timeout: 180000,
  polling: 500,
});
await settle(3000);
const restored = await hud();
console.log('   ', restored.replace(/\s+/g, ' ').slice(0, 110));
await page.screenshot({ path: join(outDir, 'restored.png') });

// Four presses of H at the 5 cm step take the default 95 cm to 115 cm. Anchored to the
// Pedestal row rather than matched loose: the HUD also carries a "120 cm wide" sheet row,
// and a bare /115 cm/ would happily pass on the wrong line.
const pedestalKept = /Pedestal\s*\d+ × \d+ × 115 cm/.test(restored);
const themeKept = await page.$$eval('.theme-gallery', (n) => n.length > 0);
const frontKept = /Front light/.test(restored);
console.log('    pedestal height restored:', pedestalKept);
console.log('    gallery background restored:', themeKept);
console.log('    front light restored:', frontKept);

console.log('6. offline reload (network disabled)');
await client.send('Network.enable');
await client.send('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
});
await page.reload({ waitUntil: 'domcontentloaded' });
await settle(4000);
const offlineOk = await page.$$eval('canvas', (n) => n.length > 0);
const offlineArtifacts = await page.$eval('.hud', (n) => /\/2\)/.test(n.textContent)).catch(() => false);
console.log('    app rendered with no network:', offlineOk);
console.log('    artifacts still present offline:', offlineArtifacts);
await page.screenshot({ path: join(outDir, 'offline.png') });

console.log(errors.length ? `\nERRORS:\n${errors.join('\n')}` : '\nno page errors');
await browser.close();