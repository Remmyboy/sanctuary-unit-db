// Copies the ranked map pool's preview art out of a local game install.
//
// Every map the game ships carries its own preview.png — a top-down terrain
// render the map generator wrote. The match room shows it once a game is
// matched, so players see the ground before they load it, with each player's
// name over the start they were given (spawns.json, written here too).
//
//   npm run mappreviews                 # every map in the pools
//   npm run mappreviews -- "Some Map"   # ...plus maps added to a pool since
//
// The pool names come from src/lib/ladder-maps.ts, the offline mirror of the
// live ladder_maps table. A map curated into a pool from the admin page after
// this last ran has no art here; the match room simply shows no picture, so
// re-run and commit when the pools change.
//
// Like extract.js this is local-only: production serves public/ as committed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { locateGame } from './locate-game.js';
import { decodePng, encodePng } from './png.js';
import { LADDER_MAPS, mapPreviewSlug } from '../src/lib/ladder-maps.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'public', 'ladder-maps');

// The match room shows one preview about 300px wide; 320 covers that without
// putting 500 KB terrain renders in the repo for art nobody zooms into.
const MAX_PX = 320;

// Pool names are the game's lobby names, which differ from the folder on disk
// in spacing and case ("Two step shuffle" -> Two_Step_Shuffle). Compare on
// letters and digits alone.
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function main() {
  const extra = process.argv.slice(2);
  const names = [
    ...new Set([
      ...Object.values(LADDER_MAPS)
        .flat()
        .map((m) => m.name),
      ...extra,
    ]),
  ];

  const maps = path.join(locateGame(), 'engine', 'Sanctuary_Data', 'Maps');
  if (!fs.existsSync(maps)) throw new Error(`No Maps folder in the install: ${maps}`);
  const folders = new Map(fs.readdirSync(maps).map((f) => [key(f), f]));

  fs.mkdirSync(OUT, { recursive: true });
  const wrote = new Set();
  const missing = [];
  const spawns = {};
  let bytes = 0;

  for (const name of names.sort()) {
    const folder = folders.get(key(name));
    const src = folder && path.join(maps, folder, 'preview.png');
    if (!src || !fs.existsSync(src)) {
      missing.push(name);
      continue;
    }
    const slug = mapPreviewSlug(name);
    const out = encodePng(shrink(decodePng(fs.readFileSync(src)), MAX_PX));
    fs.writeFileSync(path.join(OUT, `${slug}.png`), out);
    wrote.add(`${slug}.png`);
    bytes += out.length;

    const starts = readSpawns(path.join(maps, folder));
    if (starts.length) spawns[slug] = starts;
    console.log(
      `${name.padEnd(32)} -> ${slug}.png  ${(out.length / 1024).toFixed(0)} KB` +
        `  ${starts.length || 'no'} starts`,
    );
  }

  // Sorted by slug so a re-run with the same install produces the same file.
  // A line per map: generated, but small enough that a diff should read.
  const slugs = Object.keys(spawns).sort();
  const body = slugs
    .map((s) => `  ${JSON.stringify(s)}: [${spawns[s].map((p) => JSON.stringify(p)).join(', ')}]`)
    .join(',\n');
  fs.writeFileSync(path.join(OUT, 'spawns.json'), `{\n${body}\n}\n`);

  console.log(`\n${wrote.size} previews, ${(bytes / 1048576).toFixed(1)} MB total`);
  console.log(`spawns.json: start positions for ${slugs.length} maps`);
  if (missing.length) {
    console.log(`\nNo preview in the install for: ${missing.join(', ')}`);
  }
  // Maps leave pools too; say so rather than deleting art the caller may have
  // put there on purpose.
  const orphans = fs.readdirSync(OUT).filter((f) => f.endsWith('.png') && !wrote.has(f));
  if (orphans.length) {
    console.log(`\nNot in any pool (delete if the map is gone for good): ${orphans.join(', ')}`);
  }
}

/* ---------------- start positions ---------------- */

// Where each army starts, as a fraction of the preview image: 0,0 is its top
// left corner. The .sanmap beside the art is plain JSON and carries the same
// markers the game reads, so the numbered circles baked into the preview and
// these coordinates are the same points — which is what makes it safe to draw
// a name over one.
//
// Two conversions matter. The preview frames the *playable* area rather than
// the whole map (the hand-made maps put a 256 playable square in the middle
// of a 512 map, the generated ones make them the same), and world Z runs up
// the image while CSS Y runs down it, so Z is flipped. Army keys are
// ARMY_1 on generated maps and Army_1 on hand-made ones — hence the loose
// match on the trailing number.
function readSpawns(dir) {
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.sanmap'));
  if (!file) return [];

  const map = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const transforms = map.markers?.Spawn?.transforms;
  if (!transforms) return [];

  // PlayableArea's y is the world Z offset, not a height.
  const area = map.areas?.PlayableArea ?? { x: 0, y: 0, width: map.width, height: map.length };
  const round = (n) => Math.round(n * 10000) / 10000;

  return Object.entries(transforms)
    .map(([armyKey, t]) => {
      const army = Number(/(\d+)$/.exec(armyKey)?.[1]);
      const { x, z } = t.position ?? {};
      if (!army || typeof x !== 'number' || typeof z !== 'number') return null;
      return {
        army,
        x: round((x - area.x) / area.width),
        y: round(1 - (z - area.y) / area.height),
      };
    })
    .filter((s) => s !== null && s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1)
    .sort((a, b) => a.army - b.army);
}

/* ---------------- scaling ---------------- */

// Box average down to at most `max` on the long side. Exact area averaging,
// so a 512 render lands on 320 without the aliasing a nearest-pixel drop
// would put through terrain detail. Anything already small enough is left
// alone (re-encoding it is lossless either way).
function shrink(img, max) {
  const { width, height, channels, colorType, pixels } = img;
  if (width <= max && height <= max) return img;

  const scale = max / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = Buffer.alloc(w * h * channels);

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w));
      const n = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) sum += pixels[(sy * width + sx) * channels + c];
        }
        out[(y * w + x) * channels + c] = Math.round(sum / n);
      }
    }
  }
  return { width: w, height: h, channels, colorType, pixels: out };
}

main();
