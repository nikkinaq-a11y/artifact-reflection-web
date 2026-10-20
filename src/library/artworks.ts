import { useEffect, useState } from 'react';
import { LinearMipmapLinearFilter, SRGBColorSpace, Texture, TextureLoader } from 'three';
import { getArtwork } from './db';
import { currentArtwork, useViewer } from '../store';

/**
 * Decoded artwork textures, kept outside React state for the same reason the parsed
 * models are: they are large mutable THREE objects, and putting one in the store
 * re-renders the tree every time an image is added.
 */
type LoadedArt = { texture: Texture; aspect: number; blobUrl: string };

const cache = new Map<string, LoadedArt>();
const inFlight = new Map<string, Promise<LoadedArt | null>>();

export function getArt(id: string): LoadedArt | undefined {
  return cache.get(id);
}

export function dropArt(id: string): void {
  const loaded = cache.get(id);
  if (!loaded) return;
  loaded.texture.dispose();
  URL.revokeObjectURL(loaded.blobUrl);
  cache.delete(id);
}

export function clearArt(): void {
  for (const id of [...cache.keys()]) dropArt(id);
}

/** Decode a stored artwork on demand — used after a reload, when the cache is empty. */
export async function ensureArt(id: string): Promise<LoadedArt | null> {
  const existing = cache.get(id);
  if (existing) return existing;

  const pending = inFlight.get(id);
  if (pending) return pending;

  const task = (async () => {
    const record = await getArtwork(id);
    if (!record) return null;

    // The blob URL is held for the texture's lifetime, not just the load — revoking it
    // early leaves the texture with nothing to re-read if the GPU context is lost.
    const blobUrl = URL.createObjectURL(new Blob([record.bytes], { type: record.mime }));
    const texture = await new TextureLoader().loadAsync(blobUrl);

    // The print is an sRGB image; without this it is sampled as linear and the artwork
    // comes out washed out and far too bright under the sheet.
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    const loaded: LoadedArt = {
      texture,
      aspect: record.widthPx / record.heightPx,
      blobUrl,
    };
    cache.set(id, loaded);
    return loaded;
  })().finally(() => inFlight.delete(id));

  inFlight.set(id, task);
  return task;
}

/**
 * The decoded texture for whatever the sheet is currently printed with, or null for a
 * bare sheet. Returns null while an image is still decoding, so the sheet shows as plain
 * acrylic for a frame or two rather than flashing an untextured white plane.
 */
export function useArtTexture(): LoadedArt | null {
  const meta = useViewer(currentArtwork);
  const id = meta?.id;

  const [, bump] = useState(0);

  useEffect(() => {
    if (!id || cache.has(id)) return;
    let cancelled = false;
    void ensureArt(id).then(() => {
      if (!cancelled) bump((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return id ? cache.get(id) ?? null : null;
}

/**
 * Read an image's pixel dimensions before it is stored. The sheet takes its shape from
 * the artwork, so this is needed at import time rather than at first render.
 */
export async function measureImage(file: File): Promise<{ widthPx: number; heightPx: number }> {
  const bitmap = await createImageBitmap(file);
  const measured = { widthPx: bitmap.width, heightPx: bitmap.height };
  bitmap.close();
  return measured;
}
