// Which mod releases the site hasn't caught up with:
//
//   npm run mod-releases                    compare src/lib/mods.ts with sanctuary-mods' releases
//   npm run mod-releases -- --ref origin/main   compare a git ref's mods.ts instead
//   npm run mod-releases -- --write         also bump the versions that are a plain bump
//   npm run mod-releases -- --json          machine-readable
//
// Every download link on /mods and /gameplay-mods is derived from the
// version in mods.ts, so a release only reaches the site once that version
// moves. This lists, per mod, the site's version against the newest
// published release, and says what kind of work catching up is:
//
//   bump       the release has its zips; --write changes the version
//   manual     Zone Control and the Balance Patch take more than a version
//              (the WithMap zip, balance-patch.json); see the update-mods skill
//   waiting    the release exists but its zips aren't all uploaded yet
//   in-pr      an open site PR already carries that version
//   pr-behind  an open site PR changes the mod, but to an older version: the
//              bump belongs on that PR's branch, not in a second PR
//   new        a mod with releases that the site doesn't list at all
//
// Open PRs are read so an update doesn't open a second PR for a bump
// that is already waiting for review; the current branch's own PR doesn't
// count. Exits 1 under --check when there is anything to do, else 0.
//
// Uses the GitHub REST API, with `gh auth token` when gh is installed (the
// repos are public, so it works without one, at 60 requests an hour).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODS_REPO = 'Remmyboy/sanctuary-mods';
const SITE_REPO = 'Remmyboy/sanctuary-unit-db';
const MODS_FILE = 'src/lib/mods.ts';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

/** Released, but never on the site: the loader ships inside the Mod Manager
 *  now, and its old releases would otherwise read as a new mod. */
const NOT_ON_SITE = new Set(['ModLoader']);
/** A version bump alone would leave these wrong; the skill has their steps. */
const MANUAL = new Set(['ZoneControl', 'BalancePatch']);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** The zips a release must carry before the site may link to it. */
function expectedAssets(id, version) {
  const tag = `${id}-${version}`;
  if (id === 'ModManager') return [`${tag}-Standalone.zip`, `${tag}-ModManager.zip`];
  if (id === 'ZoneControl') return [`${tag}-WithMap.zip`, `${tag}-ModManager.zip`];
  if (id === 'BalancePatch') return [`${tag}-ModManager.zip`, 'balancepatch.json'];
  return [`${tag}-ModManager.zip`];
}

/** `id: 'X',` then `name: …,` then `version: '…'` — the shape of every entry
 *  in mods.ts, read as text so any ref (or an open PR's head) parses the same. */
const ENTRY = /(\bid: '(\w+)',\s*\n\s*name: [^\n]+\n\s*version: ')([^']+)(')/g;

function siteVersions(source) {
  return new Map([...source.matchAll(ENTRY)].map((m) => [m[2], m[3]]));
}

function cmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

function ghPath() {
  if (process.env.GH) return process.env.GH;
  const windows = 'C:\\Program Files\\GitHub CLI\\gh.exe';
  return fs.existsSync(windows) ? windows : 'gh';
}

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync(ghPath(), ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

const auth = token();

async function api(url) {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com/${url}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sanctuarydb-mod-releases',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return url.includes('raw.githubusercontent.com') ? res.text() : res.json();
}

/** Newest published release per mod id, with the names of its assets. */
async function latestReleases() {
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = await api(`repos/${MODS_REPO}/releases?per_page=100&page=${page}`);
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  const latest = new Map();
  for (const r of releases) {
    if (r.draft || r.prerelease) continue;
    const m = /^(\w+)-(\d+(?:\.\d+)*)$/.exec(r.tag_name);
    if (!m) continue;
    const [, id, version] = m;
    const seen = latest.get(id);
    if (!seen || cmp(version, seen.version) > 0) {
      latest.set(id, { version, assets: r.assets.map((a) => a.name), url: r.html_url });
    }
  }
  return latest;
}

function currentBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/** Versions carried by open site PRs that change mods.ts: id → [{ version, pr }]. */
async function inFlight(skipBranch) {
  const found = new Map();
  const pulls = await api(`repos/${SITE_REPO}/pulls?state=open&per_page=100`);
  for (const pr of pulls) {
    if (pr.head.ref === skipBranch) continue;
    const files = await api(`repos/${SITE_REPO}/pulls/${pr.number}/files?per_page=100`);
    if (!files.some((f) => f.filename === MODS_FILE)) continue;
    const source = await api(`https://raw.githubusercontent.com/${SITE_REPO}/${pr.head.sha}/${MODS_FILE}`);
    for (const [id, version] of siteVersions(source)) {
      found.set(id, [...(found.get(id) ?? []), { version, pr: pr.number }]);
    }
  }
  return found;
}

const ref = option('--ref');
const source = ref
  ? execFileSync('git', ['show', `${ref}:${MODS_FILE}`], { cwd: root, encoding: 'utf8' })
  : fs.readFileSync(path.join(root, MODS_FILE), 'utf8');
const site = siteVersions(source);
const releases = await latestReleases();
const prs = flag('--no-prs') ? new Map() : await inFlight(ref ? '' : currentBranch());

const rows = [];
for (const [id, rel] of [...releases].sort(([a], [b]) => a.localeCompare(b))) {
  if (NOT_ON_SITE.has(id)) continue;
  const current = site.get(id);
  const base = { id, site: current ?? null, latest: rel.version, release: rel.url };
  if (current && cmp(rel.version, current) <= 0) {
    rows.push({ ...base, status: 'current' });
    continue;
  }
  const missing = expectedAssets(id, rel.version).filter((a) => !rel.assets.includes(a));
  const inPrs = prs.get(id) ?? [];
  const pr = inPrs.find((p) => cmp(p.version, rel.version) >= 0) ?? inPrs[0];
  let status;
  if (missing.length) status = 'waiting';
  else if (pr) status = cmp(pr.version, rel.version) >= 0 ? 'in-pr' : 'pr-behind';
  else if (!current) status = 'new';
  else if (MANUAL.has(id)) status = 'manual';
  else status = 'bump';
  rows.push({ ...base, status, ...(missing.length ? { missing } : {}), ...(pr ? { pr: pr.pr } : {}) });
}

if (flag('--write')) {
  if (ref) throw new Error('--write edits the working tree, so it can’t be combined with --ref');
  const bumps = new Map(rows.filter((r) => r.status === 'bump').map((r) => [r.id, r.latest]));
  const updated = source.replace(ENTRY, (all, head, id, _v, tail) =>
    bumps.has(id) ? `${head}${bumps.get(id)}${tail}` : all,
  );
  fs.writeFileSync(path.join(root, MODS_FILE), updated);
  for (const r of rows) if (r.status === 'bump') r.written = true;
}

const todo = rows.filter((r) => ['bump', 'manual', 'new', 'pr-behind'].includes(r.status));

if (flag('--json')) {
  console.log(JSON.stringify({ todo: todo.length, rows }, null, 2));
} else {
  const notes = {
    current: '',
    bump: 'bump',
    manual: 'manual steps (see the update-mods skill)',
    waiting: 'release still uploading',
    'in-pr': '',
    new: 'NEW MOD — needs a card',
  };
  for (const r of rows) {
    if (r.status === 'current') continue;
    let note = notes[r.status];
    if (r.status === 'in-pr') note = `already in PR #${r.pr}`;
    if (r.status === 'pr-behind') note = `PR #${r.pr} has an older version — bump it on that branch`;
    if (r.missing) note += ` (no ${r.missing.join(', ')})`;
    if (r.written) note += ', written to mods.ts';
    console.log(`${r.id.padEnd(18)} ${(r.site ?? '—').padStart(7)} → ${r.latest.padEnd(7)}  ${note}`);
  }
  const current = rows.filter((r) => r.status === 'current').length;
  console.log(
    todo.length
      ? `${todo.length} to do; ${current} mods already current.`
      : `Nothing to do; ${current} mods current${rows.length > current ? ', the rest waiting or in a PR' : ''}.`,
  );
}

if (flag('--check') && todo.length) process.exit(1);
