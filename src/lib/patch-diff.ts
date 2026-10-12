// What a game patch changed, unit by unit: two extracts of public/data/units.json
// compared field by field.
//
// scripts/patches.js runs this on each game update (the committed extract
// against the new one) and on the history in git, and writes the result to
// public/data/patches.json for the /patches page. Each patch is diffed
// against the extract made just before it by the same extractor, so a change
// here is the game's, not the extractor's. That's also why a field is only
// compared when both extracts have it: older extracts lack fields the
// extractor learned later.
//
// Plain TypeScript with type-only imports, so the script can load it under
// Node's type stripping as well as the site.

import type { Unit, UnitIconSpec, UnitsData } from './types';

export type PatchValue = number | string | boolean | null | string[];

export interface PatchChange {
  /** A field path: "health", "cost.alloys", "weapon.2.damage". */
  key: string;
  before: PatchValue;
  after: PatchValue;
}

/** Enough of a unit to show it after the game has moved on: a patch can
 *  rename a unit, and a later one remove it. */
export interface PatchUnitInfo {
  id: string;
  name: string | null;
  displayName: string;
  faction: string;
  domain: string;
  tier: number | null;
  icon: UnitIconSpec | null;
  weaponCount: number;
}

export interface PatchUnit extends PatchUnitInfo {
  changes: PatchChange[];
}

export interface PatchDiff {
  added: PatchUnitInfo[];
  removed: PatchUnitInfo[];
  changed: PatchUnit[];
}

export interface PatchBuild {
  /** Steam build id, or null when the extract predates recording it. */
  buildId: number | null;
  /** When Steam installed the build on the extracting machine, ISO 8601. */
  installedAt: string | null;
}

export interface Patch extends PatchDiff {
  from: PatchBuild;
  to: PatchBuild;
  /** The commit whose extract is the patch's "after". */
  commit: string;
}

export interface PatchesFile {
  generatedAt: string;
  /** Newest first. */
  patches: Patch[];
}

// The unit fields a patch is read through, in the order a unit's changes are
// listed. Everything else on a unit is either derived from these (builtBy is
// the mirror of builds), the extractor's bookkeeping (statusReason, icon), or
// too fiddly to read as a change (adjacency, canBuildExpr).
const UNIT_FIELDS = [
  'name',
  'displayName',
  'status',
  'demoOnly',
  'tier',
  'cost.alloys',
  'cost.energy',
  'buildTime',
  'health',
  'healthRegen',
  'dps',
  'maxRange',
  'movement.type',
  'movement.speed',
  'movement.acceleration',
  'movement.rotationSpeed',
  'movement.minSpeed',
  'vision',
  'radar',
  'sonar',
  'production.alloys',
  'production.energy',
  'upkeep.alloys',
  'upkeep.energy',
  'storage.alloys',
  'storage.energy',
  'buildPower',
  'buildRange',
  'canAssist',
  'transportSlots',
  'deathExplosion.damage',
  'deathExplosion.radius',
  'upgradesTo',
  'orders',
  'builds',
  'tags',
] as const;

const WEAPON_FIELDS = [
  'damage',
  'damageRadius',
  'reloadTime',
  'cycleTime',
  'salvoSize',
  'salvoDelay',
  'count',
  'rangeMax',
  'rangeMin',
  'projectileSpeed',
  'beamMode',
  'homing',
  'traverseSpeed',
  'elevationSpeed',
  'targets',
] as const;

const SHIELD_FIELDS = ['max', 'regen', 'radius', 'rechargeTime'] as const;

/** A path into a unit, or undefined when some step of it isn't there. */
function at(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Whether an extract has the field at all: its top-level key. Below that a
 *  missing key is a real absence (a resource map leaves out what a unit
 *  doesn't make), so it reads as null rather than unknown. */
const knows = (obj: unknown, path: string): boolean =>
  obj != null && typeof obj === 'object' && path.split('.')[0] in obj;

function asValue(v: unknown): PatchValue {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return JSON.stringify(v);
}

function same(a: PatchValue, b: PatchValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    // Lists are sets here: a list reordered by the game is no change.
    return a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  return a === b;
}

/** Compares one field when both extracts know it. */
function compare(out: PatchChange[], key: string, was: unknown, now: unknown, path: string) {
  if (!knows(was, path) || !knows(now, path)) return;
  const before = asValue(at(was, path));
  const after = asValue(at(now, path));
  if (!same(before, after)) out.push({ key, before, after });
}

export function unitInfo(u: Unit): PatchUnitInfo {
  return {
    id: u.id,
    name: u.name,
    displayName: u.displayName,
    faction: u.faction,
    domain: u.domain,
    tier: u.tier,
    icon: u.icon,
    weaponCount: u.weapons?.length ?? 0,
  };
}

export function diffUnit(was: Unit, now: Unit): PatchChange[] {
  const out: PatchChange[] = [];
  for (const f of UNIT_FIELDS) compare(out, f, was, now, f);

  // The extractor merges identical weapons into one entry with a count, so a
  // patch that makes two launchers alike (the Peregrine's, in 0.0.1.21.1)
  // shortens the list without taking a gun away. Weapons are counted by
  // mount, and when the merging has reshuffled the list a slot's count says
  // nothing about the patch.
  const wasW = was.weapons ?? [];
  const nowW = now.weapons ?? [];
  const mounts = (ws: Unit['weapons']) => ws.reduce((n, w) => n + (w.count ?? 1), 0);
  if (mounts(wasW) !== mounts(nowW)) out.push({ key: 'weapons', before: mounts(wasW), after: mounts(nowW) });
  const reshuffled = wasW.length !== nowW.length;
  for (let i = 0; i < Math.min(wasW.length, nowW.length); i++) {
    for (const f of WEAPON_FIELDS) {
      if (f === 'count' && reshuffled) continue;
      compare(out, `weapon.${i + 1}.${f}`, wasW[i], nowW[i], f);
    }
  }

  const wasS = was.shields ?? [];
  const nowS = now.shields ?? [];
  if (wasS.length !== nowS.length) out.push({ key: 'shields', before: wasS.length, after: nowS.length });
  for (let i = 0; i < Math.min(wasS.length, nowS.length); i++) {
    for (const f of SHIELD_FIELDS) compare(out, `shield.${i + 1}.${f}`, wasS[i], nowS[i], f);
  }
  return out;
}

export function diffUnits(before: UnitsData, after: UnitsData): PatchDiff {
  const was = new Map(before.units.map((u) => [u.id, u]));
  const now = new Map(after.units.map((u) => [u.id, u]));
  const added = after.units.filter((u) => !was.has(u.id)).map(unitInfo);
  const removed = before.units.filter((u) => !now.has(u.id)).map(unitInfo);
  const changed: PatchUnit[] = [];
  for (const u of after.units) {
    const old = was.get(u.id);
    if (!old) continue;
    const changes = diffUnit(old, u);
    if (changes.length) changed.push({ ...unitInfo(u), changes });
  }
  return { added, removed, changed };
}
