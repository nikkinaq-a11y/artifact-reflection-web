import type { Group } from 'three';
import { getArtifact } from './db';
import { loadModel } from '../import/loadModel';

/**
 * Parsed scene graphs, kept outside React state. They are large mutable THREE objects, so
 * putting them in the store would mean re-rendering the tree whenever one is added.
 * Components read metadata from the store and pull the model from here by id.
 */
const cache = new Map<string, Group>();
const inFlight = new Map<string, Promise<Group | null>>();

export function getModel(id: string): Group | undefined {
  return cache.get(id);
}

export function setModel(id: string, group: Group): void {
  cache.set(id, group);
}

/** Drop every parsed model — used when an imported gallery replaces the whole library. */
export function clearModels(): void {
  for (const id of [...cache.keys()]) dropModel(id);
}

export function dropModel(id: string): void {
  const group = cache.get(id);

  // Blob URLs for sidecar textures are held for the model's lifetime, not just its parse.
  for (const url of (group?.userData.blobUrls as string[] | undefined) ?? []) {
    URL.revokeObjectURL(url);
  }

  group?.traverse((o) => {
    const mesh = o as unknown as {
      geometry?: { dispose(): void };
      material?: { dispose(): void } | { dispose(): void }[];
    };
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) m.dispose();
  });
  cache.delete(id);
}

/** Re-parse a stored artifact on demand — used after a reload, when the cache is empty. */
export async function ensureModel(id: string): Promise<Group | null> {
  const existing = cache.get(id);
  if (existing) return existing;

  const pending = inFlight.get(id);
  if (pending) return pending;

  const task = (async () => {
    const record = await getArtifact(id);
    if (!record) return null;
    const { group } = await loadModel(record.bytes, record.format, record.textures ?? []);
    cache.set(id, group);
    return group;
  })().finally(() => inFlight.delete(id));

  inFlight.set(id, task);
  return task;
}