// Copies Remmy's Balance Patch's export into the site:
//
//   npm run balance-patch -- <path to balancepatch.json>
//
// The mod's own tool writes that file (`node BalancePatch/tools/preview.mjs
// --json` in sanctuary-mods): every change it makes to the game's templates,
// with the game's value, the patch's value and the reason. The site keeps the
// changes and drops the full patched templates, which are most of the file's
// size and which the extractor doesn't need: it applies the changes to the
// templates it reads from the install itself (see writeBalancePatch in
// extract.js). Run `npm run extract` afterwards to rebuild
// public/data/units-balance-patch.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(here, '..', 'src', 'lib', 'balance-patch.json');

const source = process.argv[2];
if (!source) {
  console.error('Usage: npm run balance-patch -- <path to balancepatch.json>');
  process.exit(1);
}

const patch = JSON.parse(fs.readFileSync(source, 'utf8'));
if (patch.format !== 'sanctuary-balance-patch/1') {
  console.error(`Unknown format "${patch.format}" — expected sanctuary-balance-patch/1.`);
  process.exit(1);
}

const kept = Object.fromEntries(
  Object.entries(patch).filter(([key]) => !['units', 'projectiles', 'about'].includes(key)),
);
fs.writeFileSync(OUT_FILE, JSON.stringify(kept, null, 1) + '\n');

console.log(
  `patch:     ${patch.mod.name} ${patch.mod.version} for game ${patch.game.version} (build ${patch.game.steamBuild})`,
);
console.log(`changes:   ${patch.changes.length} (${patch.skipped.length} skipped by the mod)`);
console.log(`wrote:     ${path.relative(process.cwd(), OUT_FILE)}`);
console.log('next:      npm run extract, to rebuild public/data/units-balance-patch.json');
