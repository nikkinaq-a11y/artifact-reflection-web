/**
 * Phase 1 verification: loads the viewer, exercises the keybinds, and writes a
 * screenshot per state so the camera rig, pedestal controls and help overlay can be
 * checked without a human at the keyboard.
 *
 * Usage: node scripts/verify.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = process.argv[2] ?? '.';
const url = process.argv[3] ?? 'http://localhost:5179/';

mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1600,1000'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => errors.push(`${r.url()} ${r.failure()?.errorText}`));

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
await settle(9000);

const shot = async (name) => {
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log('wrote', name);
};

await shot('01-front');

// Cycle two cameras — exercises the blend in CameraRig.
await page.keyboard.press('KeyC');
await settle(1800);
await page.keyboard.press('KeyC');
await settle(1800);
await shot('02-three-quarter-r');

// Pedestal: taller + wider, exercising BP_AdjustablePedestal parity.
for (let i = 0; i < 5; i++) await page.keyboard.press('KeyH');
for (let i = 0; i < 4; i++) await page.keyboard.press('KeyK');
await settle(900);
await shot('03-pedestal-adjusted');

// Shift reverses, per the Unreal legend.
await page.keyboard.down('Shift');
for (let i = 0; i < 5; i++) await page.keyboard.press('KeyH');
await page.keyboard.up('Shift');
await settle(900);
await shot('04-pedestal-reverted');

// R steps 30° per press and the artifact must stay upright — yaw only.
await page.keyboard.press('KeyR');
await settle(700);
await shot('05-rotate-step-1');

for (let i = 0; i < 2; i++) {
  await page.keyboard.press('KeyR');
  await settle(500);
}
await shot('06-rotate-step-3');

// Shift+R walks it back.
await page.keyboard.down('Shift');
await page.keyboard.press('KeyR');
await page.keyboard.up('Shift');
await settle(700);
await shot('07-rotate-step-back');

await page.keyboard.press('Tab');
await settle(600);
await shot('08-help-overlay');

console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
await browser.close();