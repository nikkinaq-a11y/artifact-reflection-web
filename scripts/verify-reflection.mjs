/**
 * End-to-end check of the thing this app exists for: an object standing in front of the
 * acrylic, its reflection landing on the printed artwork, and the sheet's controls
 * actually changing what the surface does.
 *
 * The measurements matter as much as the screenshots. A planar reflection that silently
 * renders black still produces a perfectly plausible-looking dark studio shot, so each
 * stage samples pixels out of the region where the reflection falls and asserts that the
 * numbers move in the direction the control claims.
 *
 * Usage: node scripts/verify-reflection.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FBX_DIR = '/Users/nikkiquinn/Documents/Duke/Artifact Work/PhotogrammetryFiles/FBX_Files';
const IMG_DIR = '/Users/nikkiquinn/Documents/Duke/Artifact Work/NOMA Images';

const MODEL = join(FBX_DIR, '1976_91_18_Dogon_Mask_85K_poly_4K_tex.fbx');
const ARTWORK = join(IMG_DIR, 'Facsimilie1.jpeg');

const outDir = process.argv[2] ?? './shots';
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
const hud = () => page.evaluate(() => document.querySelector('.hud')?.textContent ?? '');

async function shot(name) {
  const path = join(outDir, `${name}.png`);
  const buffer = await page.screenshot({ path, fullPage: false });
  return PNG.sync.read(buffer);
}

/**
 * Mean luminance over a rectangle, 0-255. The regions below are in screen space for the
 * default 1600x1000 viewport and the default camera, which is why the checks that use
 * them never move the camera.
 */
function luma(png, x0, y0, x1, y1) {
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (png.width * y + x) << 2;
      sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
      n += 1;
    }
  }
  return sum / n;
}

/**
 * Screen-space regions for the default 1600x1000 viewport on camera preset 1, which is
 * why the checks that use them never move the camera first.
 *
 * REFLECTION is where the object's mirror image lands on the sheet — to the right of the
 * object, because the camera is off to the right and a plane mirror throws the image away
 * from the viewer's side. PRINT_ONLY is a patch of sheet the reflection never reaches.
 * Pinned deliberately: a regression that moves the reflection off the sheet, or renders
 * it black, should fail rather than quietly produce a plausible dark studio shot.
 */
const REFLECTION = [1000, 300, 1110, 540];
const PRINT_ONLY = [1200, 250, 1330, 400];

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const press = async (key, shift = false) => {
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.press(key);
  if (shift) await page.keyboard.up('Shift');
  await settle(250);
};

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await settle(1500);

console.log('1. empty scene — bare acrylic, no object');
await shot('01-bare');
check('HUD reports no print', (await hud()).includes('none'));

console.log('2. import the object');
const input = await page.$('input[type=file]');
await input.uploadFile(MODEL);
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('1/1'), {
  timeout: 120000,
  polling: 500,
});
await settle(2500);
await shot('02-object');

console.log('3. print an artwork on the sheet');
// The whole-window empty-state picker is gone once an object exists, so the artwork goes
// in through the gallery's Prints tab — which also exercises the panel's own add path.
await page.click('.gallery-tab');
await settle(300);
await page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.gallery-seg button')];
  tabs.find((b) => b.textContent.includes('Prints'))?.click();
});
await settle(300);
const artInput = await page.$('.gallery-add input[type=file]');
await artInput.uploadFile(ARTWORK);
await page.waitForFunction(
  () => !document.querySelector('.hud')?.textContent?.includes('none — drop an image'),
  { timeout: 60000, polling: 500 },
);
await settle(2000);
check('HUD names the artwork', (await hud()).includes('Facsimilie1'));

// Shut the panel again so it is not sitting over the sheet in every later screenshot.
await page.click('.gallery-tab');
await settle(500);
const withPrint = await shot('03-with-print');

const basePrint = luma(withPrint, ...PRINT_ONLY);
console.log(`     print-only ${basePrint.toFixed(1)}`);
check('the print composites onto the sheet', basePrint > 12, `print-only luma ${basePrint.toFixed(1)}`);
check(
  'the sheet swallows most of the print',
  basePrint < 140,
  `print-only luma ${basePrint.toFixed(1)} — ink under dark acrylic, not a lit poster`,
);

// The reflection term is isolated by taking the print out of the way first. Measured
// against a patch of the same sheet the reflection never reaches, so this proves the
// planar pass actually rendered the object rather than that the sheet is lit at all.
console.log('4. print off — the reflection on its own');
for (let i = 0; i < 10; i++) await press('KeyX', true);
await settle(700);
const bare = await shot('04-print-off');
const bareSheet = luma(bare, ...PRINT_ONLY);
const baseReflection = luma(bare, ...REFLECTION);
console.log(`     reflection ${baseReflection.toFixed(1)}  bare sheet ${bareSheet.toFixed(1)}`);
check(
  'print brightness reaches bare acrylic',
  bareSheet < basePrint * 0.5,
  `print-only ${basePrint.toFixed(1)} -> ${bareSheet.toFixed(1)}`,
);
check(
  'the object is reflected in the sheet',
  baseReflection > bareSheet + 4,
  `reflection ${baseReflection.toFixed(1)} vs bare ${bareSheet.toFixed(1)}`,
);

console.log('5. reflectance up — Z x6');
for (let i = 0; i < 6; i++) await press('KeyZ');
await settle(700);
const mirrored = await shot('05-reflectance-high');
const highReflection = luma(mirrored, ...REFLECTION);
console.log(`     reflection ${baseReflection.toFixed(1)} -> ${highReflection.toFixed(1)}`);
check(
  'raising reflectance brightens the reflection',
  highReflection > baseReflection * 1.15,
  `${baseReflection.toFixed(1)} -> ${highReflection.toFixed(1)}`,
);

console.log('6. print back on, at high reflectance — Fresnel should dim it');
for (let i = 0; i < 10; i++) await press('KeyX');
await settle(700);
const mirroredPrint = await shot('06-mirror-over-print');
const dimmedPrint = luma(mirroredPrint, ...PRINT_ONLY);
console.log(`     print-only ${basePrint.toFixed(1)} -> ${dimmedPrint.toFixed(1)}`);
check(
  'a more reflective sheet shows less of the print',
  dimmedPrint < basePrint,
  `${basePrint.toFixed(1)} -> ${dimmedPrint.toFixed(1)}`,
);

console.log('7. reflectance back down — Shift+Z x6');
for (let i = 0; i < 6; i++) await press('KeyZ', true);
await settle(600);

console.log('8. surface finish — U x8 should diffuse the reflection');
for (let i = 0; i < 8; i++) await press('KeyU');
await settle(600);
await shot('07-frosted');
check('HUD reports a diffused finish', /frosted|diffused|satin/.test(await hud()));
for (let i = 0; i < 8; i++) await press('KeyU', true);

console.log('9. geometry — G widens the gap, N the sheet, M the mount');
for (let i = 0; i < 4; i++) await press('KeyG');
for (let i = 0; i < 4; i++) await press('KeyN');
await settle(800);
await shot('08-geometry');
const geomHud = await hud();
check('gap moved', geomHud.includes('60 cm'), geomHud.match(/Gap\s*(\d+)/)?.[0]);
check('sheet widened', geomHud.includes('140 cm wide'));
for (let i = 0; i < 4; i++) await press('KeyG', true);
for (let i = 0; i < 4; i++) await press('KeyN', true);

console.log('10. A cycles through the bare sheet and back');
await press('KeyA');
check('A reaches the bare sheet', (await hud()).includes('bare sheet'));
await press('KeyA');
check('A returns to the artwork', (await hud()).includes('Facsimilie1'));

console.log('11. camera presets');
for (const [i, name] of ['09-cam-2', '10-cam-3', '11-cam-grazing'].entries()) {
  const presses = i === 2 ? 10 : 1;
  for (let k = 0; k < presses; k++) await press('KeyC');
  await settle(900);
  await shot(name);
}
check('grazing preset reached', (await hud()).includes('GRAZING') || (await hud()).includes('Grazing'));

console.log('12. themes');
await press('KeyB');
await settle(700);
await shot('12-theme-gallery');
await press('KeyB');
await settle(700);
await shot('13-theme-reveal');
await press('KeyB');

console.log('13. survives a reload');
await page.reload({ waitUntil: 'networkidle0' });
await settle(4000);
await shot('14-reloaded');
const after = await hud();
check('object survived reload', after.includes('1/1'));
check('artwork survived reload', after.includes('Facsimilie1'));

console.log('');
if (errors.length) {
  console.log('Console/page errors:');
  for (const e of [...new Set(errors)]) console.log('  ', e);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
console.log(`shots in ${outDir}`);

await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
