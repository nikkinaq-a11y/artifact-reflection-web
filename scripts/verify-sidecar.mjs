/**
 * Regression check for FBX files that reference an external texture instead of embedding
 * it. Imports one such file alone (expected: flagged untextured), then again with its
 * .jpg alongside (expected: textured), and compares rendered brightness.
 *
 * Usage: node scripts/verify-sidecar.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIR = '/Users/nikkiquinn/Documents/Duke/Artifact Work/PhotogrammetryFiles/FBX_Files';
const FBX = join(DIR, '1991_6_60_Female_Twin_Figure.fbx');
const JPG = join(DIR, '1991_6_60_Female_Twin_Figure.jpg');

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

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Colourfulness of the artifact region. Reading the WebGL canvas directly returns blank
 * without preserveDrawingBuffer, so the screenshot is measured instead. An untextured
 * import is grey (R≈G≈B); a textured one has real chroma.
 */
const measure = async (file) => {
  const buf = await page.screenshot({ path: file, clip: { x: 640, y: 300, width: 320, height: 380 } });
  const { PNG } = await import('pngjs');
  const png = PNG.sync.read(buf);
  let lum = 0;
  let chroma = 0;
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    const mean = (r + g + b) / 3;
    if (mean < 12) continue; // skip background
    lum += mean;
    chroma += Math.max(r, g, b) - Math.min(r, g, b);
    n += 1;
  }
  return n
    ? { lum: +(lum / n).toFixed(1), chroma: +(chroma / n).toFixed(2), pixels: n }
    : { lum: 0, chroma: 0, pixels: 0 };
};

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluate(() => indexedDB.deleteDatabase('artifact-viewer'));
await page.reload({ waitUntil: 'networkidle0' });
await settle(1500);

console.log('A. FBX alone (external texture reference, no .jpg)');
await (await page.$('input[type=file]')).uploadFile(FBX);
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('1/1'), {
  timeout: 90000,
  polling: 500,
});
await settle(3000);
const alone = await measure(join(outDir, 'A-fbx-alone.png'));
console.log('   ', alone);
console.log('   flagged untextured:', await page.$$eval('.gallery-warn', (n) => n.length > 0).catch(() => 'n/a'));

console.log('\nB. FBX + its .jpg dropped together');
await page.evaluate(() => indexedDB.deleteDatabase('artifact-viewer'));
await page.reload({ waitUntil: 'networkidle0' });
await settle(1500);
await (await page.$('input[type=file]')).uploadFile(FBX, JPG);
await page.waitForFunction(() => document.querySelector('.hud')?.textContent?.includes('1/1'), {
  timeout: 90000,
  polling: 500,
});
await settle(3000);
const withJpg = await measure(join(outDir, 'B-fbx-with-jpg.png'));
console.log('   ', withJpg);

console.log(`\nchroma ${alone.chroma} -> ${withJpg.chroma} :: ${withJpg.chroma > alone.chroma + 2 ? 'TEXTURE APPLIED' : 'STILL UNTEXTURED'}`);
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');

await browser.close();