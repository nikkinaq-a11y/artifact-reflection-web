import { invoke, isTauri } from '@tauri-apps/api/core';
import { downloadBlob } from '../library/galleryFile';

/**
 * The one way the app hands a file to the user — gallery exports and snapshots both come
 * through here, so whatever it takes to save on a given platform is fixed in one place.
 *
 * In the Mac app an `<a download>` click does nothing in the app's WebKit window, so the
 * native Save panel is used instead (src-tauri/src/lib.rs), and the bytes are sent raw
 * rather than as JSON, since a gallery zip can be hundreds of MB.
 *
 * In a browser, `pickSaveTarget` uses the "Save as" picker where there is one (Chrome,
 * Edge) so the curator chooses where a gallery goes; elsewhere (Safari, Firefox) it falls
 * back to an ordinary download into the Downloads folder.
 */

/** Where a file will be written, once the curator has chosen. */
export type SaveTarget = { write: (blob: Blob) => Promise<void> };

type PickerWindow = Window & {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

/**
 * Ask where to save `filename`, before the file exists. Call it straight from the click:
 * a browser only opens its picker during the user's gesture, and building a gallery zip
 * takes long enough to lose it. Resolves null if the curator cancels.
 */
export async function pickSaveTarget(
  filename: string,
  type?: { description: string; mime: string; ext: string },
): Promise<SaveTarget | null> {
  if (isTauri()) {
    const picked = await invoke<boolean>('choose_save_path', { fileName: filename });
    if (!picked) return null;
    return {
      write: async (blob) => {
        await invoke('write_saved_file', new Uint8Array(await blob.arrayBuffer()));
      },
    };
  }

  const w = window as PickerWindow;
  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        ...(type ? { types: [{ description: type.description, accept: { [type.mime]: [type.ext] } }] } : {}),
      });
      return {
        write: async (blob) => {
          const out = await handle.createWritable();
          await out.write(blob);
          await out.close();
        },
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      // Anything else (a picker refused outside a gesture, say) falls back to a download.
    }
  }

  return { write: async (blob) => downloadBlob(blob, filename) };
}

/**
 * Save a file that already exists. Snapshots use this: in a browser they go straight to
 * Downloads rather than asking every time; in the Mac app the Save panel opens.
 * Resolves true once saved, false if the curator cancelled the Save panel.
 */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  if (!isTauri()) {
    downloadBlob(blob, filename);
    return true;
  }
  const target = await pickSaveTarget(filename);
  if (!target) return false;
  await target.write(blob);
  return true;
}
