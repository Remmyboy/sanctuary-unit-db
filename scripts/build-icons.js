// Recolours the extracted strategic icons into per-faction variants.
//
// The game's icons are two-tone masks: magenta marks the region it tints with
// the player's colour at runtime, black is the glyph and outline drawn on top.
// Shipping them as-is would put magenta squares on the page, so this bakes a
// copy per faction using the same palette the SVG fallback uses.
//
//   icons-src/<shape>_<tech>_<symbol>.png   ->  public/icons/<faction>/<same>.png
//
// Run with `npm run icons` after re-extracting. Zero dependencies: PNG decode
// and encode come from png.js, against node:zlib.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.js';
import { FACTION_COLOURS } from '../src/lib/faction-colours.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', 'icons-src');
const OUT = path.join(here, '..', 'public', 'icons');

function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error(`No icon masters at ${SRC}. See README "Icons" for the extraction step.`);
  }
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.png'));
  if (!files.length) throw new Error(`No .png files in ${SRC}`);

  const factions = Object.entries(FACTION_COLOURS).filter(([name]) => name !== 'Unknown');

  for (const [name] of factions) {
    fs.mkdirSync(path.join(OUT, slug(name)), { recursive: true });
  }

  let written = 0;
  let untinted = 0;

  for (const file of files) {
    const image = decodePng(fs.readFileSync(path.join(SRC, file)));
    // The extracted icons are all 8-bit RGBA, and tint() assumes it. png.js
    // already rejects other depths and interlacing; fail loudly on the rest.
    if (image.colorType !== 6) throw new Error(`${file}: unsupported PNG colour type ${image.colorType}`);

    for (const [name, hex] of factions) {
      const tinted = tint(image, hexToRgb(hex));
      if (!tinted.replaced) untinted++;
      fs.writeFileSync(path.join(OUT, slug(name), file), encodePng(tinted.image, { filter: 'none-or-up' }));
      written++;
    }
  }

  // The site reads this to decide, per unit, whether real artwork exists or it
  // should fall back to the generated SVG.
  const manifest = files.map((f) => path.basename(f, '.png')).sort();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));

  writePreviewManifest();

  const bytes = factions.reduce(
    (sum, [name]) =>
      sum +
      fs
        .readdirSync(path.join(OUT, slug(name)))
        .reduce((n, f) => n + fs.statSync(path.join(OUT, slug(name), f)).size, 0),
    0,
  );

  console.log(`masters:   ${files.length} in icons-src/`);
  console.log(`factions:  ${factions.map(([n]) => n).join(', ')}`);
  console.log(`written:   ${written} icons (${(bytes / 1024).toFixed(0)} KB total)`);
  // A master with no tintable pixels would come out identical for every faction,
  // which almost certainly means the source icon isn't the mask we expect.
  if (untinted) console.warn(`warning:   ${untinted} outputs had no tintable pixels`);
}

// Unit previews need no processing — they're rendered thumbnails with colours
// already baked in — so they sit in public/ directly. All this does is index
// them, since 57 units (all disabled content) have no preview.
function writePreviewManifest() {
  const dir = path.join(here, '..', 'public', 'previews');
  if (!fs.existsSync(dir)) {
    console.warn('warning:   no public/previews directory; unit previews will be skipped');
    return;
  }
  // A few units ship a fully transparent placeholder instead of a render.
  // Indexing those would give the detail panel an empty glowing box, so they're
  // treated as missing and fall through to no preview at all.
  const ids = [];
  let blank = 0;

  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort()) {
    const id = path.basename(file, '.png');
    let hasPixels = true;
    try {
      const { pixels, colorType } = decodePng(fs.readFileSync(path.join(dir, file)));
      // Only RGBA can be fully transparent; anything else has pixels.
      if (colorType === 6) hasPixels = false;
      for (let i = 3; !hasPixels && i < pixels.length; i += 4) {
        if (pixels[i] !== 0) {
          hasPixels = true;
          break;
        }
      }
    } catch {
      // Unreadable here doesn't mean unusable in a browser — keep it.
    }
    hasPixels ? ids.push(id) : blank++;
  }

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(ids));
  console.log(`previews:  ${ids.length} indexed${blank ? ` (${blank} blank placeholders skipped)` : ''}`);
}

const slug = (name) => name.toLowerCase();

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Magenta is the tint mask. Match it tolerantly rather than on an exact
// 255,0,255 so any antialiased edge pixels recolour with the rest.
const isTintable = (r, g, b) => r > 150 && b > 150 && g < 100;

function tint({ width, height, pixels }, [tr, tg, tb]) {
  const out = Buffer.from(pixels);
  let replaced = 0;

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    if (isTintable(out[i], out[i + 1], out[i + 2])) {
      out[i] = tr;
      out[i + 1] = tg;
      out[i + 2] = tb;
      replaced++;
    }
  }
  return { image: { width, height, channels: 4, colorType: 6, pixels: out }, replaced };
}

main();
