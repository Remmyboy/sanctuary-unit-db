// The /patches page's reading of public/data/patches.json: choosing a range of
// game builds, folding the patches between them into one change list, and
// putting each change into words with a verdict (buff, nerf, or neither).
//
// The diff itself is made at extract time (src/lib/patch-diff.ts); this is
// presentation only, so a label can change without regenerating anything.

import { fmt } from './format';
import { STATUS_LABELS } from './board';
import type { Patch, PatchBuild, PatchChange, PatchUnit, PatchUnitInfo, PatchValue } from './patch-diff';
import { PATCH_NOTES } from './patch-notes';

export type { Patch, PatchBuild, PatchChange, PatchUnit, PatchUnitInfo, PatchValue } from './patch-diff';

export const PATCHES_URL = '/data/patches.json';

// ---- Builds and ranges --------------------------------------------------

/** A build as the range pickers and URL know it: its id, or "first" for the
 *  extract before the earliest patch, which didn't record one. */
export const buildKey = (b: PatchBuild): string => (b.buildId == null ? 'first' : String(b.buildId));

export interface BuildPoint {
  key: string;
  build: PatchBuild;
  /** Index into the oldest-first patch list of the patch that ended here, or
   *  -1 for the first build. */
  patchIndex: number;
}

/** Every build the history passes through, oldest first. */
export function buildTimeline(newestFirst: Patch[]): BuildPoint[] {
  const patches = [...newestFirst].reverse();
  if (!patches.length) return [];
  return [
    { key: buildKey(patches[0].from), build: patches[0].from, patchIndex: -1 },
    ...patches.map((p, i) => ({ key: buildKey(p.to), build: p.to, patchIndex: i })),
  ];
}

export function buildName(b: PatchBuild): string {
  if (b.buildId == null) return 'Late-August Playtest';
  const v = PATCH_NOTES[b.buildId]?.version;
  return v ? `${v}` : `Build ${b.buildId}`;
}

export const day = (iso: string | null | undefined): string | null =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/** The patches between two builds, oldest first. from must come before to. */
export function patchesBetween(newestFirst: Patch[], fromKey: string, toKey: string): Patch[] {
  const oldestFirst = [...newestFirst].reverse();
  const timeline = buildTimeline(newestFirst);
  const a = timeline.findIndex((b) => b.key === fromKey);
  const b = timeline.findIndex((x) => x.key === toKey);
  if (a < 0 || b < 0 || a >= b) return [];
  return oldestFirst.slice(a, b);
}

// ---- Folding a range ---------------------------------------------------

export interface FoldedPatch {
  added: PatchUnitInfo[];
  removed: PatchUnitInfo[];
  changed: PatchUnit[];
}

/** Several consecutive patches as one: each field from its value before the
 *  first to its value after the last, dropping what came back to where it
 *  started. A unit added inside the range is just new; one removed is gone. */
export function foldPatches(oldestFirst: Patch[]): FoldedPatch {
  const added = new Map<string, PatchUnitInfo>();
  const removed = new Map<string, PatchUnitInfo>();
  const units = new Map<string, { info: PatchUnitInfo; changes: Map<string, PatchChange> }>();

  for (const p of oldestFirst) {
    for (const u of p.added) {
      if (removed.has(u.id)) removed.delete(u.id);
      else added.set(u.id, u);
      units.delete(u.id);
    }
    for (const u of p.removed) {
      if (added.has(u.id)) added.delete(u.id);
      else removed.set(u.id, u);
      units.delete(u.id);
    }
    for (const u of p.changed) {
      if (added.has(u.id)) {
        added.set(u.id, pickInfo(u));
        continue;
      }
      const entry = units.get(u.id) ?? { info: pickInfo(u), changes: new Map() };
      entry.info = pickInfo(u);
      for (const c of u.changes) {
        const prev = entry.changes.get(c.key);
        entry.changes.set(c.key, { key: c.key, before: prev ? prev.before : c.before, after: c.after });
      }
      units.set(u.id, entry);
    }
  }

  const changed: PatchUnit[] = [];
  for (const { info, changes } of units.values()) {
    const kept = [...changes.values()].filter((c) => !sameValue(c.before, c.after));
    if (kept.length) changed.push({ ...info, changes: kept });
  }
  return { added: [...added.values()], removed: [...removed.values()], changed };
}

function pickInfo(u: PatchUnitInfo): PatchUnitInfo {
  const { id, name, displayName, faction, domain, tier, icon, weaponCount } = u;
  return { id, name, displayName, faction, domain, tier, icon, weaponCount };
}

function sameValue(a: PatchValue, b: PatchValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return [...a].sort().join() === [...b].sort().join();
  return a === b;
}

// ---- Words -------------------------------------------------------------

const UNIT_LABELS: Record<string, string> = {
  name: 'name',
  displayName: 'type',
  status: 'availability',
  demoOnly: 'demo only',
  tier: 'tier',
  'cost.alloys': 'alloy cost',
  'cost.energy': 'energy cost',
  buildTime: 'build time',
  health: 'health',
  healthRegen: 'health regen/s',
  dps: 'DPS',
  maxRange: 'range',
  'movement.type': 'movement',
  'movement.speed': 'speed',
  'movement.acceleration': 'acceleration',
  'movement.rotationSpeed': 'turn rate (deg/s)',
  'movement.minSpeed': 'stall speed',
  vision: 'vision',
  radar: 'radar range',
  sonar: 'sonar range',
  'production.alloys': 'makes alloy/s',
  'production.energy': 'makes energy/s',
  'upkeep.alloys': 'upkeep alloy/s',
  'upkeep.energy': 'upkeep energy/s',
  'storage.alloys': 'alloy storage',
  'storage.energy': 'energy storage',
  buildPower: 'build power',
  buildRange: 'build range',
  canAssist: 'can assist',
  transportSlots: 'transport slots',
  'deathExplosion.damage': 'death blast damage',
  'deathExplosion.radius': 'death blast radius',
  upgradesTo: 'upgrades to',
  orders: 'orders',
  builds: 'builds',
  tags: 'tags',
  weapons: 'weapons',
  shields: 'shields',
};

const WEAPON_LABELS: Record<string, string> = {
  damage: 'damage',
  damageRadius: 'splash',
  reloadTime: 'reload (s)',
  cycleTime: 'fires every (s)',
  salvoSize: 'salvo',
  salvoDelay: 'salvo gap (s)',
  count: 'mounts',
  rangeMax: 'range',
  rangeMin: 'min range',
  projectileSpeed: 'shot speed',
  beamMode: 'beam',
  homing: 'guided',
  traverseSpeed: 'turret turn (deg/s)',
  elevationSpeed: 'turret elevation (deg/s)',
  targets: 'targets',
};

const SHIELD_LABELS: Record<string, string> = {
  max: 'strength',
  regen: 'regen/s',
  radius: 'radius',
  rechargeTime: 'recharge (s)',
};

/** A change's key in words. A unit with one weapon (or shield) needn't say which. */
export function changeLabel(key: string, unit: Pick<PatchUnitInfo, 'weaponCount'>): string {
  const w = key.match(/^weapon\.(\d+)\.(.+)$/);
  if (w) {
    const label = WEAPON_LABELS[w[2]] ?? w[2];
    return unit.weaponCount > 1 ? `weapon ${w[1]} ${label}` : label;
  }
  const s = key.match(/^shield\.(\d+)\.(.+)$/);
  if (s) return `shield ${SHIELD_LABELS[s[2]] ?? s[2]}`;
  return UNIT_LABELS[key] ?? key;
}

// Tags the list leaves out: demo-only is its own line, and a tier tag says
// what the tier line does.
const QUIET_TAGS = /^(DEMO_UI_ONLY|TECH\d)$/;

const TAG_WORDS = (t: string) => t.toLowerCase().replace(/_/g, ' ');

/** A value in words. Names are looked up for the ids a builds list holds. */
export function formatPatchValue(key: string, v: PatchValue, nameOf: (id: string) => string): string {
  if (v == null || v === '') return 'none';
  if (Array.isArray(v)) {
    if (!v.length) return 'none';
    if (key === 'builds') return v.map(nameOf).join(', ');
    if (key === 'tags') return v.map(TAG_WORDS).join(', ');
    return v.join(', ');
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return key === 'tier' ? `T${v}` : fmt(v);
  if (key === 'status') return STATUS_LABELS[v] ?? v;
  if (key === 'upgradesTo') return nameOf(v);
  return v;
}

// Which way is better, for a buff/nerf colour. Anything not listed is
// neither: a movement type, a new name, a stall speed.
const LOWER_IS_BETTER = new Set([
  'cost.alloys',
  'cost.energy',
  'buildTime',
  'upkeep.alloys',
  'upkeep.energy',
  'reloadTime',
  'cycleTime',
  'salvoDelay',
  'rangeMin',
  'rechargeTime',
]);
const HIGHER_IS_BETTER = new Set([
  'health',
  'healthRegen',
  'dps',
  'maxRange',
  'movement.speed',
  'movement.acceleration',
  'movement.rotationSpeed',
  'vision',
  'radar',
  'sonar',
  'production.alloys',
  'production.energy',
  'storage.alloys',
  'storage.energy',
  'buildPower',
  'buildRange',
  'transportSlots',
  'damage',
  'damageRadius',
  'salvoSize',
  'count',
  'rangeMax',
  'projectileSpeed',
  'traverseSpeed',
  'elevationSpeed',
  'max',
  'regen',
  'radius',
]);

export type Verdict = 'buff' | 'nerf' | null;

function field(key: string): string {
  const m = key.match(/^(?:weapon|shield)\.\d+\.(.+)$/);
  return m ? m[1] : key;
}

export function verdict(c: PatchChange): Verdict {
  const f = field(c.key);
  if (c.key === 'demoOnly' && typeof c.after === 'boolean') return c.after ? 'nerf' : 'buff';
  if (c.key === 'status') {
    const rank = { 'no-model': 0, 'in-progress': 1, 'in-game': 2 } as Record<string, number>;
    const a = rank[String(c.before)];
    const b = rank[String(c.after)];
    if (a == null || b == null || a === b) return null;
    return b > a ? 'buff' : 'nerf';
  }
  if (HIGHER_IS_BETTER.has(f)) return higher(c);
  if (LOWER_IS_BETTER.has(f)) {
    // "None" isn't zero here: a weapon that couldn't fire gaining a reload
    // isn't firing slower.
    if (c.before == null || c.after == null) return null;
    const v = higher(c);
    return v === 'buff' ? 'nerf' : v === 'nerf' ? 'buff' : null;
  }
  if (c.key === 'weapons' || c.key === 'shields') return higher(c);
  return null;
}

function higher(c: PatchChange): Verdict {
  const a = typeof c.before === 'number' ? c.before : c.before == null ? 0 : null;
  const b = typeof c.after === 'number' ? c.after : c.after == null ? 0 : null;
  if (a == null || b == null || a === b) return null;
  return b > a ? 'buff' : 'nerf';
}

export interface ChangeLine {
  key: string;
  label: string;
  before: string;
  after: string;
  /** Percent change, for numbers that both exist and don't start at zero. */
  percent: number | null;
  verdict: Verdict;
}

/** A change as one line. A list shows only what left it and what joined it. */
export function describe(
  c: PatchChange,
  unit: PatchUnitInfo,
  nameOf: (id: string) => string,
): ChangeLine | null {
  let { before, after } = c;
  if (Array.isArray(before) || Array.isArray(after)) {
    const was = Array.isArray(before) ? before : [];
    const now = Array.isArray(after) ? after : [];
    const quiet = (x: string) => c.key === 'tags' && QUIET_TAGS.test(x);
    before = was.filter((x) => !now.includes(x) && !quiet(x));
    after = now.filter((x) => !was.includes(x) && !quiet(x));
    if (!before.length && !after.length) return null;
  }
  const percent =
    typeof c.before === 'number' && typeof c.after === 'number' && c.before !== 0
      ? Math.round(((c.after - c.before) / Math.abs(c.before)) * 100)
      : null;
  return {
    key: c.key,
    label: changeLabel(c.key, unit),
    before: formatPatchValue(c.key, before, nameOf),
    after: formatPatchValue(c.key, after, nameOf),
    percent,
    verdict: verdict(c),
  };
}

/** A unit's changes on the whole: all buffs, all nerfs, both, or neither. */
export function unitVerdict(lines: ChangeLine[]): 'buff' | 'nerf' | 'mixed' | null {
  const buffs = lines.some((l) => l.verdict === 'buff');
  const nerfs = lines.some((l) => l.verdict === 'nerf');
  return buffs && nerfs ? 'mixed' : buffs ? 'buff' : nerfs ? 'nerf' : null;
}

/** "T2 Destroyer", from the game's "Tier 2: Destroyer". A type the game gives
 *  no tier ("Commander", tagged TECH1 all the same) stays as it is. */
export function unitKind(u: PatchUnitInfo): string {
  const m = u.displayName.match(/^Tier (\d+):\s*(.*)$/);
  return m ? `T${m[1]} ${m[2]}` : u.displayName;
}

export const unitLabel = (u: PatchUnitInfo): string => u.name ?? unitKind(u);

export const DOMAIN_ORDER = ['Land', 'Air', 'Naval', 'Structure'];
