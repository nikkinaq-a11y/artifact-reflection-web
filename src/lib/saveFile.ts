import { invoke, isTauri } from '@tauri-apps/api/core';
import { downloadBlob } from '../library/galleryFile';

/**
 * The one way the app hands a file to the user — gallery exports and snapshots both come
 * through here, so whatever it takes to save on a given platform is fixed in one place.
 *
 * In a browser that is an ordinary download. In the Mac app it is not: an `<a download>`
 * click does nothing in the app's WebKit window, so exports and snapshots silently went
 * nowhere. There the native Save panel is used instead (src-tauri/src/lib.rs), and the
 * bytes are sent raw rather than as JSON, since a gallery zip can be hundreds of MB.
 *
 * Resolves true once saved, false if the user cancelled the Save panel.
 */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  if (!isTauri()) {
    downloadBlob(blob, filename);
    return true;
  }

  const picked = await invoke<boolean>('choose_save_path', { fileName: filename });
  if (!picked) return false;

  await invoke('write_saved_file', new Uint8Array(await blob.arrayBuffer()));
  return true;
}
