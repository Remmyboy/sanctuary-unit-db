// Cuts the developers' artwork down to the site's copies.
//
// Enhearten Media shared three Google Drive folders — the presskit, a faction
// icon pack and a folder of 2048px unit renders — about 490 MB in all. None of
// that is committed; this turns it into the ~3 MB the site actually serves:
//
//   public/art/mastheads/<page>.webp   a band of one presskit screenshot per
//                                      page masthead (see src/lib/art.ts)
//   public/art/factions/<faction>.png  the white emblems, used as CSS masks
//   public/renders/<id>.webp           384px unit renders for the detail
//                                      panel, plus manifest.json
//
//   npm run art -- "<folder>"
//
// where <folder> holds the three Drive zips unzipped side by side ("Sanctuary
// Presskit", "Faction Icons Pack", "Unit Icons"). Needs ffmpeg on PATH for
// the resizing and WebP encoding. Like extract.js this is local-only:
// production serves public/ as committed.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.js';
import { FACTION_EMBLEMS, MASTHEAD_ART, MASTHEAD_SIZE } from '../src/lib/art.ts';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');

// The detail panel shows a render at 170px; 384 covers that at 2× DPR.
const RENDER_PX = 384;
// The emblems go up to ~170px tall on the detail stage.
const EMBLEM_PX = 384;

// Renders in the Drive pack (dated September 2023) that no longer match the
// unit in game, found by comparing each against the game's own 64px
// thumbnail. These keep the 64px version until the devs send new ones.
const STALE_RENDERS = new Set([
  'ucl4003', // a different model entirely
  'ugl1501', // ugl1501/2501/3501 are one identical buggy in the pack;
  'ugl2501', // in game they're three distinct vehicles
  'ugl3501',
  'ucs3401', // silhouette has changed since
]);

async function main() {
  const root = process.argv[2];
  if (!root || !fs.existsSync(root)) {
    console.error('usage: npm run art -- "<folder with the unzipped Drive folders>"');
    process.exit(1);
  }
  await run('ffmpeg', ['-version']).catch(() => {
    console.error('ffmpeg not found on PATH');
    process.exit(1);
  });

  await mastheads(path.join(root, 'Sanctuary Presskit', 'Screenshots'));
  await emblems(path.join(root, 'Faction Icons Pack', 'Faction Icons 500px'));
  await renders(path.join(root, 'Unit Icons'));
}

async function mastheads(dir) {
  const out = path.join(PUBLIC, 'art', 'mastheads');
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = MASTHEAD_SIZE;

  for (const [page, { screenshot, crop }] of Object.entries(MASTHEAD_ART)) {
    const src = path.join(
      dir,
      `SANCTUARY_SHATTERED_SUN_SCREENSHOT${String(screenshot).padStart(2, '0')}.png`,
    );
    const [x, y, cw] = crop;
    const ch = Math.round((cw * h) / w);
    const dest = path.join(out, `${page}.webp`);
    await ffmpeg(src, `crop=${cw}:${ch}:${x}:${y},scale=${w}:${h}:flags=lanczos`, dest, ['-quality', '72']);
    console.log(`masthead  ${page.padEnd(10)} ${kb(dest)}`);
  }
}

async function emblems(dir) {
  const out = path.join(PUBLIC, 'art', 'factions');
  fs.mkdirSync(out, { recursive: true });

  for (const [faction, url] of Object.entries(FACTION_EMBLEMS)) {
    const dest = path.join(PUBLIC, url);
    await ffmpeg(
      path.join(dir, `${faction} White@0.25x.png`),
      `scale=${EMBLEM_PX}:${EMBLEM_PX}:flags=lanczos,format=rgba`,
      dest,
    );
    // ffmpeg's PNGs are barely compressed; png.js re-encodes losslessly.
    fs.writeFileSync(dest, encodePng(decodePng(fs.readFileSync(dest))));
    console.log(`emblem    ${faction.padEnd(10)} ${kb(dest)}`);
  }
}

async function renders(dir) {
  const out = path.join(PUBLIC, 'renders');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  // Only units the site knows about; the pack has the odd cut unit.
  const known = new Set(
    JSON.parse(fs.readFileSync(path.join(PUBLIC, 'data', 'units.json'), 'utf8')).units.map((u) => u.id),
  );
  const ids = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.slice(0, -4))
    .filter((id) => known.has(id) && !STALE_RENDERS.has(id))
    .sort();

  let bytes = 0;
  await pool(ids, os.availableParallelism(), async (id) => {
    const dest = path.join(out, `${id}.webp`);
    await ffmpeg(path.join(dir, `${id}.png`), `scale=${RENDER_PX}:${RENDER_PX}:flags=lanczos`, dest, [
      '-quality',
      '82',
    ]);
    bytes += fs.statSync(dest).size;
  });
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(ids));
  console.log(
    `renders   ${ids.length} units, ${(bytes / 1024 / 1024).toFixed(1)} MB (${STALE_RENDERS.size} stale skipped)`,
  );
}

function ffmpeg(src, filter, dest, extra = []) {
  const codec = dest.endsWith('.webp') ? ['-c:v', 'libwebp', '-compression_level', '6', ...extra] : extra;
  return run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', filter, ...codec, '-frames:v', '1', dest]);
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

const kb = (file) => `${(fs.statSync(file).size / 1024).toFixed(0)} KB`;

main();
