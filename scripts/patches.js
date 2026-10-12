// Writes public/data/patches.json: what every game patch changed, for the
// /patches page.
//
//   npm run patches             after a re-extract: if public/data/units.json is
//                               a new Steam build, diff it against the committed
//                               extract and add (or redo) that patch. Runs at the
//                               end of `npm run refresh`.
//   npm run patches -- --rebuild
//                               every patch again, from the commits in HISTORY.
//
// A patch is always the extract before it against the extract after it, both
// made by the same extractor, so what moved is the game. That's why history is
// a list of commits rather than every build in git: a commit that changed the
// extractor along with the data would show the extractor's changes as the
// game's. Add the commit that lands a game update to HISTORY once it merges.
//
// Like units.json, the output is committed: the site's build never needs git
// history or the game.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffUnits } from '../src/lib/patch-diff.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNITS = 'public/data/units.json';
const OUT = path.join(ROOT, 'public/data/patches.json');

// The commits that landed each game update, oldest first. Each is diffed
// against its parent's extract.
const HISTORY = [
  // The September balance patch. The extracts didn't record the Steam build
  // yet: the next commit, the same morning on the same install, was the first
  // to (25114838). The build before it is unknown.
  { commit: 'f243d55', buildFrom: '077462b' },
  { commit: '24a5dc3' }, // 25114838 -> 25135612
  { commit: 'bfab039' }, // 25135612 -> 25474094 (0.0.1.20)
  { commit: 'a867f55' }, // 25474094 -> 25856019 (0.0.1.21.1)
];

const git = (...args) =>
  execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' });
const unitsAt = (rev) => JSON.parse(git('show', `${rev}:${UNITS}`));

const build = (data) => ({
  buildId: data.meta?.game?.buildId ?? null,
  installedAt: data.meta?.game?.updatedAt ?? null,
});

function patchFrom(before, after, commit) {
  return { from: build(before), to: build(after), commit, ...diffUnits(before, after) };
}

function rebuild() {
  return HISTORY.map(({ commit, buildFrom }) => {
    const p = patchFrom(unitsAt(`${commit}^`), unitsAt(commit), git('rev-parse', '--short', commit).trim());
    if (buildFrom) p.to = build(unitsAt(buildFrom));
    return p;
  }).reverse();
}

function readExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8')).patches;
  } catch {
    return null;
  }
}

function update() {
  const existing = readExisting();
  if (!existing) {
    console.log('patches:   no patches.json yet, building every patch from git');
    return rebuild();
  }
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, UNITS), 'utf8'));
  let committed;
  try {
    committed = unitsAt('HEAD');
  } catch {
    console.log('patches:   no committed units.json to diff against, skipping');
    return existing;
  }
  const was = build(committed).buildId;
  const now = build(current).buildId;
  if (was == null || now == null || was === now) {
    console.log(`patches:   build ${now ?? 'unknown'} is the committed one, no new patch`);
    return existing;
  }
  // Uncommitted, so no commit yet: --rebuild fills it in once it's in HISTORY.
  const patch = patchFrom(committed, current, null);
  return [patch, ...existing.filter((p) => p.to.buildId !== now)];
}

function summary(p) {
  const parts = [`${p.changed.length} changed`];
  if (p.added.length) parts.push(`${p.added.length} added`);
  if (p.removed.length) parts.push(`${p.removed.length} removed`);
  return `${p.from.buildId ?? '?'} -> ${p.to.buildId ?? '?'}: ${parts.join(', ')}`;
}

const before = readExisting();
const patches = process.argv.includes('--rebuild') ? rebuild() : update();
for (const p of patches) console.log(`patches:   ${summary(p)}`);
// Left alone when nothing moved, so a refresh of the same build leaves no diff.
if (JSON.stringify(patches) === JSON.stringify(before)) {
  console.log(`unchanged: ${path.relative(ROOT, OUT)}`);
} else {
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), patches }));
  console.log(`wrote:     ${path.relative(ROOT, OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
}
