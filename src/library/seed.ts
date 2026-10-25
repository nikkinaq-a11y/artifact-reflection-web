import { deleteArtifact, listArtifactMeta, listArtworkMeta } from './db';
import { dropModel } from './models';
import { fetchSeed, STATIONS } from './stations';

/**
 * A starter gallery, for machines that have one: every object and print in the BM38–49
 * pairings, so each station in the Stage panel is ready the moment it is picked. Further
 * objects go in through the gallery as usual.
 *
 * The files are `public/seed/stations/`, which is gitignored: the scans belong to the
 * collection, and the published site is public, so they must never reach the repo or
 * GitHub Pages. They ship only where the build is made locally — `npm run dev`, a local
 * `npm run build`, and the Tauri app. Where the folder is missing (the public site) this
 * finds nothing and the gallery starts empty, exactly as before.
 *
 * Seeding happens once per browser: after that, a missing item means the curator removed
 * it, and putting it back on the next load would undo their work.
 *
 * v1 seeded four NOMA scans unrelated to the pairings. A browser that already has them gets
 * those four taken out — by name, and only those — and the pairing set added in their
 * place. Anything the curator added stays.
 */
const SEEDED_KEY = 'seed-loaded-v2';

/** What v1 seeded, by library name. */
const V1_SEED = [
  '1976_91_18_Dogon_Mask_85K_poly_4K_tex',
  '1976_19_9_Gelede_Mask_200K_polys',
  '2015_4_17_3_Ashanti_Fertility_Doll_84K_polys',
  '1974_29_7_Fertility_Sculpture_74k_Polys_4K_tex',
];

let started: Promise<boolean> | null = null;

function alreadySeeded(): boolean {
  try {
    return localStorage.getItem(SEEDED_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeeded(): void {
  try {
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    // Private windows can refuse storage; worst case the seed is checked again next time.
  }
}

const label = (file: string) => file.replace(/\.[^.]+$/, '');

/** Every pairing file, objects first, in station order, each once. */
function seedFiles(): { scans: string[]; prints: string[] } {
  const scans = new Set<string>();
  const prints = new Set<string>();
  for (const st of STATIONS) {
    for (const o of st.objects) if (o.scan) scans.add(o.scan);
    prints.add(st.print.file);
  }
  return { scans: [...scans], prints: [...prints] };
}

/**
 * Load the pairing set through the normal import path, if this machine has it and this
 * browser has not had it yet. Resolves true when anything changed.
 *
 * Each file goes in on its own call: a drop containing a model treats images in the same
 * drop as that model's textures, so prints must never ride along with a scan.
 *
 * Guarded at module level because StrictMode runs the calling effect twice in dev, and
 * two concurrent imports would add every scan twice.
 */
export function seedLibraryOnce(importFiles: (files: File[]) => Promise<void>): Promise<boolean> {
  started ??= (async () => {
    if (alreadySeeded()) return false;

    const { scans, prints } = seedFiles();
    // Probe before touching anything: on the public site the folder does not exist, and
    // the old seed must not be removed with nothing to replace it.
    const first = await fetchSeed(scans[0]);
    if (!first) return false;

    const objects = await listArtifactMeta();
    for (const a of objects.filter((a) => V1_SEED.includes(a.name))) {
      await deleteArtifact(a.id);
      dropModel(a.id);
    }

    const haveObjects = new Set(objects.map((a) => a.name));
    for (const [i, file] of scans.entries()) {
      if (haveObjects.has(label(file))) continue;
      const f = i === 0 ? first : await fetchSeed(file);
      if (f) await importFiles([f]);
    }

    const haveArt = new Set((await listArtworkMeta()).map((a) => a.name));
    for (const file of prints) {
      if (haveArt.has(label(file))) continue;
      const f = await fetchSeed(file);
      if (f) await importFiles([f]);
    }

    markSeeded();
    return true;
  })();
  return started;
}
