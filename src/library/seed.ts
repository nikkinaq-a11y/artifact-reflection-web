/**
 * A starter gallery, for machines that have one.
 *
 * `public/seed/` holds a few museum scans and a `seed.json` listing them in order. The
 * folder is gitignored: the scans belong to the collection, and the published site is
 * public, so they must never reach the repo or GitHub Pages. They ship only where the
 * build is made locally — `npm run dev`, a local `npm run build`, and the Tauri app.
 * Where the folder is missing (the public site) this finds nothing and the gallery
 * starts empty, exactly as before.
 *
 * Seeding happens once per browser: after that, an empty gallery means the curator
 * emptied it, and refilling it on the next load would undo their work.
 */
const SEEDED_KEY = 'seed-loaded-v1';

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
    // Private windows can refuse storage; worst case the seed loads again next time.
  }
}

async function fetchSeedFiles(): Promise<File[]> {
  let names: unknown;
  try {
    const res = await fetch('seed/seed.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    // A dev server answers unknown paths with index.html, so a missing manifest can
    // arrive as a 200 — json() throws on it and lands in the catch.
    names = await res.json();
  } catch {
    return [];
  }
  if (!Array.isArray(names)) return [];

  const files = await Promise.all(
    names
      .filter((n): n is string => typeof n === 'string')
      .map(async (name) => {
        const res = await fetch(`seed/${encodeURIComponent(name)}`);
        return res.ok ? new File([await res.blob()], name) : null;
      }),
  );
  return files.filter((f): f is File => f !== null);
}

/**
 * Load the starter gallery through the normal import path, if this machine has one and
 * this browser has never had it. Resolves true when something was imported.
 *
 * Guarded at module level because StrictMode runs the calling effect twice in dev, and
 * two concurrent imports would add every scan twice.
 */
export function seedLibraryOnce(importFiles: (files: File[]) => Promise<void>): Promise<boolean> {
  started ??= (async () => {
    if (alreadySeeded()) return false;
    const files = await fetchSeedFiles();
    if (files.length === 0) return false;
    await importFiles(files);
    markSeeded();
    return true;
  })();
  return started;
}
