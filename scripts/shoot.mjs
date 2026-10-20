/**
 * Screenshot the running dev server with a real browser, waiting for the artifact to
 * actually finish loading rather than guessing at a timeout.
 *
 * Usage: node scripts/shoot.mjs <out.png> [url] [waitMs]
 */
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const out = process.argv[2] ?? 'shot.png';
const url = process.argv[3] ?? 'http://localhost:5179/';
const waitMs = Number(process.argv[4] ?? 8000);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    '--window-size=1600,1000',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

page.on('console', (m) => console.log(`[console:${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) =>
  console.log('[requestfailed]', r.url(), r.failure()?.errorText),
);
page.on('response', (r) => {
  if (r.url().includes('.glb')) console.log('[glb]', r.status(), r.url());
});

await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, waitMs));

await page.screenshot({ path: out });
console.log('wrote', out);

await browser.close();