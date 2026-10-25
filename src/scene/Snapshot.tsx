import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { currentArtifact, useViewer } from '../store';
import { CAMERA_PRESETS } from './presets';
import { saveFile } from '../lib/saveFile';

/** Characters macOS Finder and Windows both refuse, or that read as a path separator. */
const unsafe = /[\\/:*?"<>|]+/g;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * I, or the camera button: saves the canvas as a PNG — the scene only, with none of the
 * HUD, panels or prompts, since those are HTML laid over the canvas and never part of it.
 * Ported from the baseline viewer.
 *
 * The canvas is created without `preserveDrawingBuffer` (keeping it costs every frame, and
 * this app already draws the scene twice a frame for the reflection), so its contents are
 * only guaranteed until the browser composites. Rendering a fresh frame here and reading
 * it straight back in the same task gets a full image without paying that cost all the
 * time; toBlob copies the bitmap synchronously when called. The fresh frame reuses this
 * frame's reflection, which the acrylic's own pass has already drawn.
 *
 * Named for what is in it: the setup or station, the object, the view, and when.
 */
export function Snapshot() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const request = useViewer((s) => s.snapshotRequest);

  useEffect(() => {
    if (request === 0) return;

    const s = useViewer.getState();
    const n = CAMERA_PRESETS.length;
    const view = CAMERA_PRESETS[((s.camIndex % n) + n) % n].name;
    const setup = s.setups.find((x) => x.id === s.setupId)?.name ?? s.station;
    const object = currentArtifact(s)?.name ?? 'Empty pedestal';
    const subject = setup ? `${setup} - ${object}` : object;

    const d = new Date();
    const stamp =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const filename = `${subject} - ${view} - ${stamp}.png`.replace(unsafe, '-');

    gl.render(scene, camera);
    gl.domElement.toBlob((blob) => {
      if (!blob) {
        s.setNotice('Snapshot failed — the canvas could not be read.');
        return;
      }
      void saveFile(blob, filename).then(
        (saved) => s.setNotice(saved ? `Snapshot saved — ${filename}` : 'Snapshot not saved.'),
        () => s.setNotice('Snapshot could not be saved.'),
      );
    }, 'image/png');
  }, [request, gl, scene, camera]);

  return null;
}
