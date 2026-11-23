/**
 * The 2026-11-16 round: Save (button and Cmd+S) keeps the scene across a reload and as a
 * saved pairing, the pairing leads the recommendations for its print, a gallery zip
 * carries the stands and pairings (gallery.json + README.md) and an import restores them
 * by id; D steps the camera distance, F the wall light and its slider, and the Eye Level
 * view is in the sweep.
 *
 * Needs public/seed/stations (BM45, BM47). Usage: node scripts/verify-save.mjs <outDir> [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = process.argv[2] ?? './shots/save';
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
// Chrome's Save-as picker cannot be clicked headless. Stand in for it: record the call and
// hand what is written to an ordinary download, which CDP drops in the downloads folder.
await page.evaluateOnNewDocument(() => {
  window.__picked = [];
  window.showSaveFilePicker = async (opts) => {
    window.__picked.push(opts.suggestedName);
    return {
      createWritable: async () => {
        const parts = [];
        return {
          write: async (b) => parts.push(b),
          close: async () => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(parts));
            a.download = opts.suggestedName;
            a.click();
          },
        };
      },
    };
  };
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const hud = () => page.evaluate(() => document.querySelector('.hud')?.textContent ?? '');
const state = (fn) => page.evaluate(`(${fn})(window.__viewer.getState())`);
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const press = async (code, mods = []) => {
  for (const m of mods) await page.keyboard.down(m);
  await page.keyboard.press(code);
  for (const m of mods.reverse()) await page.keyboard.up(m);
  await settle(250);
};
const files = (ext) => readdirSync(dl).filter((f) => f.endsWith(ext));
const waitFile = async (ext, n) => {
  for (let i = 0; i < 60 && files(ext).length < n; i++) await settle(500);
  return files(ext);
};
const notice = async () => {
  await page.waitForSelector('.notice', { timeout: 30_000 });
  return page.evaluate(() => document.querySelector('.notice')?.textContent ?? '');
};
const stage = async (id) => {
  await page.evaluate(() => window.__viewer.setState({ showStage: true }));
  await settle(300);
  await page.select('.stage-station', id);
  await page.waitForFunction(
    (id) => document.querySelector('.hud')?.textContent?.includes(`Station${id}`) && !document.querySelector('.modal'),
    { timeout: 240_000, polling: 500 },
    id,
  );
  await page.evaluate(() => window.__viewer.setState({ showStage: false }));
  await settle(2500);
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  localStorage.setItem('seed-loaded-v1', '1');
  localStorage.setItem('seed-loaded-v2', '1');
  localStorage.removeItem('reflection-scene-v1');
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('artifact-reflection');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
});
await page.reload({ waitUntil: 'networkidle0' });
await settle(1500);
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });

console.log('1. cameras: Eye Level and D');
check('14 views', (await hud()).includes('of 14'));
const eye = await state((s) => s.camIndex);
await page.mouse.click(8, 500);
for (let i = 0; i < 14 && !(await hud()).includes('Eye Level'); i++) await press('KeyC');
check('Eye Level is in the sweep', (await hud()).includes('Eye Level'), `from ${eye}`);
await settle(2500);
await press('KeyD');
check('D → near', (await hud()).includes('· near') && (await state((s) => s.camDistance)) === 1);
await press('KeyD');
check('D → far', (await hud()).includes('· far'));
await press('KeyD', ['Shift']);
check('Shift+D back to near', (await state((s) => s.camDistance)) === 1);
await press('KeyD', ['Shift']);
check('standard shows no distance tag', !(await hud()).includes('· near') && !(await hud()).includes('· far'));

console.log('2. F is the wall light, with its slider');
check('wall light starts off, no slider', !(await state((s) => s.lights.wall.on)) && !(await page.$('.rail-slider-wall')));
check('front light is gone', (await state((s) => s.lights.front)) === undefined);
await press('KeyF');
check('F turns it on', await state((s) => s.lights.wall.on));
check('slider appears', Boolean(await page.$('.rail-slider-wall')));
check('HUD says so', (await hud()).includes('Wall light'));

console.log('3. stage BM45, change it, Save (Cmd+S)');
await stage('BM45');
await page.mouse.click(8, 500);
await press('KeyR');
await press('KeyR');
await page.evaluate(() => window.__viewer.getState().setLightIntensity('wall', 80));
await press('KeyF'); // station reset nothing about lights; keep it on — check below
await press('KeyF');
await page.evaluate(() => {
  const s = window.__viewer.getState();
  s.updateSlot('A', { gapCm: 47.5, base: { ...s.slots.A.base, heightCm: 13 } });
  s.setPlinth({ heightCm: 12 });
});
await settle(500);
await press('KeyS', ['Meta']);
const n1 = await notice();
check('Cmd+S saves', n1.startsWith('Saved'), n1);
const setups1 = await state((s) => s.setups.map((x) => x.name));
check('one saved pairing, named after the station', setups1.length === 1 && setups1[0] === 'BM45 — MAM_1985_01_128', JSON.stringify(setups1));
await press('KeyS', ['Meta']);
await settle(800);
check('saving again updates it, no duplicate', (await state((s) => s.setups.length)) === 1);

console.log('4. reload brings the scene back');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__viewer && window.__viewer.getState().artifacts.length > 0, { timeout: 120_000 });
await settle(3000);
const back = await state((s) => ({
  rot: s.slots.A.rotationStep,
  gap: s.slots.A.gapCm,
  base: s.slots.A.base.heightCm,
  baseOn: s.slots.A.baseOn,
  plinth: s.plinth,
  wall: s.lights.wall,
  obj: s.artifacts[s.slots.A.objectIndex]?.name,
  art: s.artworks[s.artIndex]?.name,
  setup: s.setupId,
}));
check('turn kept', back.rot === 2, back.rot);
check('gap kept', back.gap === 47.5, back.gap);
check('base kept', back.baseOn && back.base === 13, back.base);
check('plinth kept', back.plinth.on && back.plinth.heightCm === 12, JSON.stringify(back.plinth));
check('wall light kept, at its strength', back.wall.on && back.wall.intensity === 80, JSON.stringify(back.wall));
check('same object, found by id', /1985_01_128/.test(back.obj ?? ''), back.obj);
check('same print', /^BM45_/.test(back.art ?? ''), back.art);
check('HUD names the setup', (await hud()).includes('SetupBM45'));

console.log('5. the pairing leads the recommendations for its print');
await page.evaluate(() => window.__viewer.setState({ showStage: true }));
await settle(400);
const group = await page.evaluate(() => document.querySelector('.stage-rows optgroup')?.label ?? '');
check('Object list says "Paired with “BM45 — …”"', group.startsWith('Paired with “BM45'), group);

console.log('6. a second pairing, then export');
await stage('BM47');
await press('KeyS', ['Meta']);
await settle(800);
check('a different print + object is a second pairing', (await state((s) => s.setups.length)) === 2);
await page.evaluate(() => window.__viewer.setState({ showGallery: true }));
await settle(400);
await page.evaluate(() => [...document.querySelectorAll('.gallery-pack button')].find((b) => b.textContent.includes('Export gallery'))?.click());
const zips = await waitFile('.zip', 1);
const zip = zips[0] && unzipSync(readFileSync(join(dl, zips[0])));
const manifest = zip && JSON.parse(strFromU8(zip['gallery.json']));
const readme = zip && strFromU8(zip['README.md']);
check('export asked where to save (Save-as picker)', (await page.evaluate(() => window.__picked)).some((n) => n.endsWith('.zip')));
check('gallery.json has both pairings', manifest?.setups?.length === 2);
const bm45 = manifest?.setups?.find((x) => x.name.startsWith('BM45'));
check('…with stands', bm45?.settings.slots.A.base.heightCm === 13 && bm45?.settings.plinth.heightCm === 12 && bm45?.settings.slots.A.gapCm === 47.5);
check('scene recorded by id', typeof manifest?.settings.objectIds?.A === 'string' && typeof manifest?.settings.artworkId === 'string');
check('README.md lists the pairings and stands', /## Saved pairings/.test(readme) && /### BM45/.test(readme) && /base 25 W × 20 D × 13 H cm/.test(readme));

console.log('7. import on a clean library restores scene and pairings');
await page.evaluate(async () => {
  localStorage.removeItem('reflection-scene-v1');
  await new Promise((r) => {
    const req = indexedDB.deleteDatabase('artifact-reflection');
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
});
await page.reload({ waitUntil: 'networkidle0' });
await settle(1500);
await page.evaluate(() => window.__viewer.setState({ showGallery: true }));
await settle(400);
await (await page.$('.gallery-pack input[type=file]')).uploadFile(join(dl, zips[0]));
await page.waitForFunction(() => window.__viewer.getState().setups.length === 2, { timeout: 180_000, polling: 500 });
await settle(2000);
const imp = await state((s) => ({
  obj: s.artifacts[s.slots.A.objectIndex]?.name,
  art: s.artworks[s.artIndex]?.name,
  station: s.station,
}));
check('scene is BM47 again', imp.station === 'BM47' && /^BM47_/.test(imp.art ?? '') && /1985_01_106/.test(imp.obj ?? ''), JSON.stringify(imp));
const bm45setup = await state((s) => s.setups.find((x) => x.name.startsWith('BM45'))?.id);
await page.evaluate((id) => {
  window.__viewer.setState({ showStage: true });
}, bm45setup);
await settle(400);
await page.evaluate(() => [...document.querySelectorAll('.stage-setup-load')].find((b) => b.textContent.startsWith('BM45'))?.click());
await settle(1500);
const loaded = await state((s) => ({ base: s.slots.A.base.heightCm, rot: s.slots.A.rotationStep, obj: s.artifacts[s.slots.A.objectIndex]?.name }));
check('the BM45 pairing loads with its stands', loaded.base === 13 && loaded.rot === 2 && /1985_01_128/.test(loaded.obj ?? ''), JSON.stringify(loaded));
check('import is remembered for next launch', await page.evaluate(() => Boolean(localStorage.getItem('reflection-scene-v1'))));

const real = errors.filter((e) => !/WebGL|GPU|swiftshader|favicon/i.test(e));
check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
