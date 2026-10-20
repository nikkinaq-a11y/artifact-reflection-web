/**
 * Checks the newly supported formats actually import, plus the pedestal toggle and the
 * persistent gallery tab.
 *
 * Usage: node scripts/verify-formats.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:5179/';
mkdirSync(outDir, { recursive: true });

const Q = '/Users/nikkiquinn/Downloads/03_3D_Assets/Quimbaya_Museum_Artifacts';
const FBX = '/Users/nikkiquinn/Documents/Duke/Artifact Work/PhotogrammetryFiles/FBX_Files';

// One representative file per format, skipped when not present on this machine.
const CASES = [
  { label: 'GLB', files: [join(Q, 'Filled Model + Texture.glb')] },
  { label: 'OBJ+MTL', files: [join(Q, 'Filled Model + Texture.obj'), join(Q, 'Filled Model + Texture.mtl')] },
  { label: 'STL', files: [join(Q, '41Quimbaya01-17447 .stl')] },
  { label: 'FBX', files: [join(FBX, '1976_91_18_Dogon_Mask_85K_poly_4K_tex.fbx')] },
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1400,900'],
});

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

for (const { label, files } of CASES) {
  const present = files.filter((f) => existsSync(f));
  if (present.length !== files.length) {
    console.log(`${label.padEnd(9)} skipped — file not on disk`);
    continue;
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => indexedDB.deleteDatabase('artifact-viewer'));
  await page.reload({ waitUntil: 'networkidle0' });
  await settle(1200);

  await (await page.$('input[type=file]')).uploadFile(...present);
  let ok = true;
  try {
    await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('1/1'), {
      timeout: 120000,
      polling: 500,
    });
  } catch {
    ok = false;
  }
  await settle(3500);

  const toast = await page.$eval('.toast', (n) => n.textContent.replace('Dismiss', '').trim()).catch(() => '');
  await page.screenshot({ path: join(outDir, `fmt-${label.replace(/\W/g, '')}.png`) });
  console.log(
    `${label.padEnd(9)} ${ok ? 'loaded ' : 'FAILED '}${toast ? '| ' + toast.slice(0, 70) : ''}${errs.length ? ' | ERR ' + errs[0].slice(0, 60) : ''}`,
  );
  await page.close();
}

// Pedestal toggle + persistent gallery tab
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
await page.goto(url, { waitUntil: 'networkidle0' });
// IndexedDB is shared across pages in this browser, so clear it or the library is
// already populated and the empty-state file input never mounts.
await page.evaluate(() => indexedDB.deleteDatabase('artifact-viewer'));
await page.reload({ waitUntil: 'networkidle0' });
await settle(1200);

const tabAlways = await page.$$eval('.gallery-tab', (n) => n.length);
console.log(`\ngallery tab visible without any key press: ${tabAlways === 1}`);

await page.click('.gallery-tab');
await settle(500);
const openNow = await page.$$eval('.gallery-add', (n) => n.length);
console.log(`clicking the tab opens the panel: ${openNow === 1}`);
await page.click('.gallery-tab');
await settle(500);
const closedNow = await page.$$eval('.gallery-add', (n) => n.length);
console.log(`clicking again closes it: ${closedNow === 0}`);

await (await page.$('input[type=file]')).uploadFile(join(FBX, '1976_91_18_Dogon_Mask_85K_poly_4K_tex.fbx'));
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('1/1'), {
  timeout: 120000,
  polling: 500,
});
await settle(3000);
await page.screenshot({ path: join(outDir, 'pedestal-on.png') });
await page.keyboard.press('KeyV');
await settle(900);
await page.screenshot({ path: join(outDir, 'pedestal-off.png') });
console.log('wrote pedestal-on.png / pedestal-off.png');

await browser.close();