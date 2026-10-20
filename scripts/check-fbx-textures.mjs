/**
 * Report whether each FBX carries its texture *inside* the file, or only references one
 * by path. A file that only references an external texture will import untextured —
 * three.js has no way to resolve a path like "X:/Exports/foo.jpg" from a browser.
 *
 * Usage: node scripts/check-fbx-textures.mjs <dir-or-file>...
 */
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

const SOI = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Find real embedded images.
 *
 * Naively scanning for the JPEG start-of-image bytes gives false positives — a mesh's
 * float vertex data contains 0xFFD8FF often enough to look like a texture. A real JPEG
 * has a recognised segment marker immediately after SOI and terminates with EOI, so both
 * are required here.
 */
function embeddedImageBytes(buf) {
  let total = 0;
  let count = 0;

  // APP0-APP15, DQT, DHT, SOF0/1/2, COM — what actually follows SOI in a real JPEG.
  const validAfterSOI = (b) => (b >= 0xe0 && b <= 0xef) || [0xdb, 0xc4, 0xc0, 0xc1, 0xc2, 0xfe].includes(b);

  let at = 0;
  for (;;) {
    const i = buf.indexOf(SOI, at);
    if (i === -1) break;
    at = i + 1;
    if (!validAfterSOI(buf[i + 3])) continue;

    const end = buf.indexOf(Buffer.from([0xff, 0xd9]), i + 4);
    if (end === -1) continue;
    const size = end + 2 - i;
    if (size < 20_000) continue; // thumbnails and stray matches

    total += size;
    count += 1;
    at = end + 2;
  }

  at = 0;
  for (;;) {
    const i = buf.indexOf(PNG, at);
    if (i === -1) break;
    at = i + 1;
    // Full 8-byte PNG signature, not just the first four.
    if (buf.slice(i, i + 8).toString('hex') !== '89504e470d0a1a0a') continue;
    count += 1;
    total += 0;
  }

  return { total, count };
}

function referencedTextures(buf) {
  const text = buf.toString('latin1');
  const names = new Set();
  for (const m of text.matchAll(/[A-Za-z0-9_\-. /\\:]+\.(?:jpg|jpeg|png|tga|tif|tiff)/gi)) {
    names.add(basename(m[0].replace(/\\/g, '/')));
  }
  return [...names];
}

const targets = [];
for (const arg of process.argv.slice(2)) {
  const st = statSync(arg);
  if (st.isDirectory()) {
    for (const f of readdirSync(arg)) {
      if (extname(f).toLowerCase() === '.fbx') targets.push(join(arg, f));
    }
  } else {
    targets.push(arg);
  }
}

let embedded = 0;
let external = 0;

for (const file of targets.sort()) {
  const buf = readFileSync(file);
  const { total, count } = embeddedImageBytes(buf);
  const refs = referencedTextures(buf);
  const ok = count > 0;
  ok ? embedded++ : external++;

  console.log(
    `${ok ? 'EMBEDDED' : 'EXTERNAL'}  ${(buf.length / 1048576).toFixed(1).padStart(6)} MB  ` +
      `${ok ? `${count} image(s), ${(total / 1048576).toFixed(1)} MB  ` : 'no image data       '}` +
      `${basename(file)}` +
      (!ok && refs.length ? `   -> wants ${refs.slice(0, 2).join(', ')}` : ''),
  );
}

console.log(`\n${embedded} embedded (will import textured), ${external} external (will import black)`);