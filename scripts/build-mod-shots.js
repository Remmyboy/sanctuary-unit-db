// Cuts the in-game mod screenshots down to the site's copies.
//
// The captures live in the sanctuary-mods repo's website-screenshots folder:
// 2560×1440 frames and tight crops of single panels, about 150 MB of PNG.
// None of that is committed; this cuts the ones src/lib/mod-shots.ts names
// into public/art/mods/<mod>/:
//
//   <slug>.webp        the shot itself (frames ≤1920 wide, panels at 1:1)
//   <slug>-thumb.webp  a small copy for the strip under it
//
//   npm run modshots -- "<website-screenshots folder>"
//
// Needs ffmpeg on PATH. Like build-art.js this is local-only: production
// serves public/ as committed.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { MOD_SHOTS, THUMB_BOX, shotSize } from '../src/lib/mod-shots.ts';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'public', 'art', 'mods');

async function main() {
  const root = process.argv[2];
  if (!root || !fs.existsSync(root)) {
    console.error('usage: npm run modshots -- "<website-screenshots folder>"');
    process.exit(1);
  }
  await run('ffmpeg', ['-version']).catch(() => {
    console.error('ffmpeg not found on PATH');
    process.exit(1);
  });

  fs.rmSync(OUT, { recursive: true, force: true });
  let bytes = 0;
  let count = 0;
  for (const [modId, shots] of Object.entries(MOD_SHOTS)) {
    const dir = path.join(OUT, modId);
    fs.mkdirSync(dir, { recursive: true });
    for (const shot of shots) {
      const inputs = [];
      for (const part of shot.parts) {
        const file = path.join(root, part.file);
        const actual = await probeSize(file);
        if (actual.join('x') !== part.size.join('x')) {
          throw new Error(`${part.file} is ${actual.join('x')}, expected ${part.size.join('x')}`);
        }
        inputs.push('-i', file);
      }

      // Cut each part, stack them, then size: a frame scales down, a panel
      // stays at the game's own pixels.
      const [w, h] = shotSize(shot);
      const cuts = shot.parts.map(
        (p, i) =>
          `[${i}:v]${p.crop ? `crop=${p.crop[2]}:${p.crop[3]}:${p.crop[0]}:${p.crop[1]}` : 'null'}[p${i}]`,
      );
      const stacked =
        shot.parts.length > 1
          ? `${shot.parts.map((_, i) => `[p${i}]`).join('')}vstack=inputs=${shot.parts.length}[s]`
          : '[p0]null[s]';
      const graph = [...cuts, stacked, `[s]scale=${w}:${h}:flags=lanczos,split[full][t]`];
      const [tw, th] = THUMB_BOX;
      graph.push(`[t]scale=${tw}:${th}:force_original_aspect_ratio=decrease:flags=lanczos[thumb]`);

      const full = path.join(dir, `${shot.slug}.webp`);
      const thumb = path.join(dir, `${shot.slug}-thumb.webp`);
      const quality = shot.kind === 'frame' ? '78' : '92';
      await run('ffmpeg', [
        '-v',
        'error',
        '-y',
        ...inputs,
        '-filter_complex',
        graph.join(';'),
        '-map',
        '[full]',
        '-c:v',
        'libwebp',
        '-compression_level',
        '6',
        '-quality',
        quality,
        '-frames:v',
        '1',
        full,
        '-map',
        '[thumb]',
        '-c:v',
        'libwebp',
        '-compression_level',
        '6',
        '-quality',
        '80',
        '-frames:v',
        '1',
        thumb,
      ]);
      const size = fs.statSync(full).size + fs.statSync(thumb).size;
      bytes += size;
      count++;
      console.log(`${modId.padEnd(16)} ${shot.slug.padEnd(16)} ${w}x${h}  ${(size / 1024).toFixed(0)} KB`);
    }
  }
  console.log(`${count} shots, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

async function probeSize(file) {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0',
    file,
  ]);
  return stdout.trim().split(',').map(Number);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
