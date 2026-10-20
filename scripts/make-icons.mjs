/**
 * Generate the PWA / desktop icons. Drawn procedurally rather than exported from a design
 * tool so the icons can be regenerated without any external file.
 *
 * This app installs *beside* the baseline Artifact Viewer, so the icon has to be legible
 * as a different thing at 32 px in a dock, not a variation on it. The baseline is a lit
 * object on a pedestal, centred. This one is the setup that distinguishes them: a dark
 * sheet, the object standing to one side of it, and its dimmer mirrored twin — the
 * asymmetry is what reads at small sizes, long before any detail does.
 *
 * Usage: node scripts/make-icons.mjs
 */
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public', { recursive: true });

const BG = [6, 6, 9];
/** The acrylic sheet: darker than the room, so it reads as a panel and not a hole. */
const SHEET = [15, 16, 22];
const SHEET_EDGE = [120, 124, 138];
const STONE = [214, 202, 186];
const PEDESTAL = [58, 58, 64];

function draw(size) {
  const png = new PNG({ width: size, height: size });
  const s = (v) => Math.round(v * size);

  const put = (x, y, [r, g, b], a = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (size * y + x) << 2;
    png.data[i] = Math.round(png.data[i] * (1 - a) + r * a);
    png.data[i + 1] = Math.round(png.data[i + 1] * (1 - a) + g * a);
    png.data[i + 2] = Math.round(png.data[i + 2] * (1 - a) + b * a);
    png.data[i + 3] = 255;
  };

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, BG);

  // The sheet, filling most of the frame with a lit edge on three sides.
  const shL = s(0.16);
  const shR = s(0.94);
  const shT = s(0.12);
  const shB = s(0.78);
  for (let y = shT; y < shB; y++) {
    for (let x = shL; x < shR; x++) {
      // A faint gradient across the face, standing in for the room it reflects.
      const t = (x - shL) / (shR - shL);
      const lift = 10 * t;
      put(x, y, [SHEET[0] + lift, SHEET[1] + lift, SHEET[2] + lift]);
    }
  }
  const edge = Math.max(1, s(0.012));
  for (let x = shL; x < shR; x++) {
    for (let d = 0; d < edge; d++) {
      put(x, shT + d, SHEET_EDGE);
      put(x, shB - 1 - d, SHEET_EDGE, 0.5);
    }
  }
  for (let y = shT; y < shB; y++) {
    for (let d = 0; d < edge; d++) put(shR - 1 - d, y, SHEET_EDGE, 0.6);
  }

  /**
   * The tapered mask form the baseline icon uses, so the two icons read as one family.
   * `fade` returns a per-row alpha, which is what separates the object from its twin.
   */
  const form = (cx, top, bottom, tint, fade) => {
    for (let y = top; y < bottom; y++) {
      const t = (y - top) / (bottom - top);
      const halfW = s(0.05 + 0.062 * Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.06)));
      for (let x = cx - halfW; x <= cx + halfW; x++) {
        const across = (x - (cx - halfW)) / (2 * halfW);
        const shade = 0.55 + 0.45 * Math.cos((across - 0.32) * 1.9);
        put(x, y, tint.map((c) => c * Math.max(0.3, Math.min(1, shade))), fade(t));
      }
    }
  };

  // The reflection first, so the real object can overlap it if they meet.
  //
  // Getting this dim enough is the whole job: at a flat alpha it reads as a second object
  // standing next to the first, which is the one thing the icon must not say. It is faint
  // at the top and fades out entirely toward the bottom, the way a reflection in a
  // vertical sheet loses the object against the darker lower half.
  form(s(0.68), s(0.3), s(0.72), STONE, (t) => 0.22 * (1 - t * 0.85));

  // The object, standing on its pedestal in front of the sheet's left half.
  const pTop = s(0.72);
  for (let y = pTop; y < s(0.93); y++) {
    for (let x = s(0.2); x < s(0.46); x++) {
      put(x, y, PEDESTAL.map((c) => c * (x > s(0.38) ? 0.7 : 1)));
    }
  }
  for (let x = s(0.2); x < s(0.46); x++) {
    for (let d = 0; d < Math.max(1, s(0.014)); d++) put(x, pTop + d, [96, 96, 104]);
  }

  const cx = s(0.33);
  form(cx, s(0.22), pTop, STONE, () => 1);

  // Two eye slots — the detail that makes it read as an object rather than a blob.
  const eyeY = s(0.4);
  for (let dy = 0; dy < s(0.05); dy++) {
    for (let dx = 0; dx < s(0.026); dx++) {
      put(cx - s(0.042) + dx, eyeY + dy, [24, 20, 18]);
      put(cx + s(0.018) + dx, eyeY + dy, [24, 20, 18]);
    }
  }

  return PNG.sync.write(png);
}

for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, draw(size));
  console.log(`wrote public/icon-${size}.png`);
}

// A tiny SVG stand-in for the browser tab: sheet, object, and its dimmer twin.
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#060609"/>
  <rect x="5" y="4" width="26" height="21" fill="#111219"/>
  <rect x="5" y="4" width="26" height="1" fill="#787c8a"/>
  <path d="M21 9c2.2 2.2 3 5.9 3 8.9V22h-6v-4.1c0-3 .8-6.7 3-8.9z" fill="#d6caba" opacity="0.3"/>
  <rect x="4" y="23" width="12" height="6" fill="#3a3a40"/>
  <path d="M10 7c2.4 2.4 3.2 6.4 3.2 9.6V23H6.8v-6.4C6.8 13.4 7.6 9.4 10 7z" fill="#d6caba"/>
  <rect x="8" y="14" width="1.7" height="3" fill="#181412"/>
  <rect x="10.6" y="14" width="1.7" height="3" fill="#181412"/>
</svg>`,
);
console.log('wrote public/favicon.svg');
