// Remmy's Balance Patch's change list, arranged for its page: one block per
// section (the patch's lobby options), each with the units it changes, the
// rules it changes, and why. Kept apart from balance-patch.ts so only the
// page pays for the list; the unit pages read the same changes off each
// patched unit instead.
//
// The list is src/lib/balance-patch.json, the mod's own export (`npm run
// balance-patch`), so the page always says exactly what the release does.

import PATCH from './balance-patch.json';
import type { BalanceValue, Faction } from './types';
import { HIDDEN_FIELDS, collapseTexts, describeChange, type ChangeText } from './balance-patch';
import { netChanges } from './balance-net';

interface PatchChange {
  kind: 'unit' | 'projectile';
  id: string;
  name: string | null;
  displayName: string | null;
  faction: string | null;
  field: string;
  label: string;
  before: BalanceValue;
  after: BalanceValue;
  sections: string[];
  why: string[];
}

// Against the unmodded game: a field the patch changes twice shows once,
// from the game's value to the final one (see balance-net.ts).
const changes = netChanges((PATCH.changes as PatchChange[]).filter((c) => !HIDDEN_FIELDS.has(c.field)));

export const PATCH_MOD = PATCH.mod;
export const PATCH_GAME = PATCH.game;

/** The export names a projectile by its template id only. These are the
 *  words its changelog uses; a test fails if a release adds one without. */
export const PROJECTILE_NAMES: Record<string, string> = {
  pei141: 'EDA and Guardian commander missile',
  pca341: 'Chosen T3 anti-air missile',
  pea341: 'EDA anti-air missile',
  pea131: 'EDA T1 anti-air shell',
  pca111: 'Chosen T1 anti-air shell',
  pca211: 'Chosen T2 anti-air shell',
  pca311: 'Chosen T3 fighter shell',
  pga211: 'Guardian T2 anti-air shell',
};

// The export spells the third faction out; the site calls it Guard.
const FACTION: Record<string, Faction> = { EDA: 'EDA', Chosen: 'Chosen', Guardian: 'Guard' };

export interface PatchUnit {
  id: string;
  name: string | null;
  faction: Faction;
}

/** One line of a section: a unit, or several factions' units that change
 *  the same way, and what changes. */
export interface PatchRow {
  key: string;
  /** "T1 Tank", "Commander", or a projectile's name. */
  title: string;
  units: PatchUnit[];
  changes: ChangeText[];
  /** Units link to the database; projectiles have nowhere to go. */
  projectile: boolean;
}

/** A rule the patch changes in code rather than in a template. */
export interface PatchRule {
  title: string;
  text: string;
}

export interface PatchSection {
  key: string;
  label: string;
  description: string;
  rows: PatchRow[];
  rules: PatchRule[];
  why: string[];
  /** Units with at least one change in this section. */
  unitCount: number;
}

// "Tier 1: Tank" -> "T1 Tank"; a commander is just "Commander".
const shortTitle = (displayName: string): string => displayName.replace(/^Tier (\d+):\s*/, 'T$1 ');

// Board order: commanders, then land, air, naval and structures, each by tier.
const DOMAIN_ORDER = 'lans';
const rowOrder = (r: PatchRow): [number, string] => {
  if (r.projectile) return [9, r.title];
  const id = r.units[0].id;
  const commander = /0000$/.test(id);
  return [commander ? -1 : DOMAIN_ORDER.indexOf(id[2]), r.title];
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The export's notes say where in the mod each rule lives ("Targeting
// (append to host/units/…/weaponsBaseClass.lua, with "fixes" on): …"). The
// page keeps the rule and the section it belongs to, not the file.
export function parseNote(note: string): (PatchRule & { section: string | null }) | null {
  const m = /^([^(:]+?)\s*(?:\(([^)]*)\))?:\s*([\s\S]*)$/.exec(note);
  if (!m) return null;
  const section = /"(\w+)"/.exec(m[2] ?? m[3])?.[1] ?? null;
  const text = m[3]
    .replace(/\s*\([^)]*\.lua\)/g, '')
    .replace(/ when the "\w+" section is on/, '')
    .replace(/\s*Not a template change\.\s*$/, '');
  return { title: m[1].trim(), text: capitalise(text.trim()), section };
}

function buildSections(): PatchSection[] {
  const notes = PATCH.notes.map(parseNote).filter((n) => n != null);

  return PATCH.sections.map(({ key, label, description }) => {
    const mine = changes.filter((c) => c.sections.includes(key));

    // Each unit's (or projectile's) changes in this section, in the export's order.
    const byThing = new Map<string, PatchChange[]>();
    for (const c of mine) byThing.set(c.id, [...(byThing.get(c.id) ?? []), c]);

    // Factions whose same unit changes the same way share a row, as in the changelog.
    const rows = new Map<string, PatchRow>();
    for (const [id, list] of byThing) {
      const first = list[0];
      const projectile = first.kind === 'projectile';
      const title = projectile
        ? (PROJECTILE_NAMES[id] ?? `Projectile ${id}`)
        : shortTitle(first.displayName ?? id);
      const texts = collapseTexts(list.map(describeChange));
      const key = `${title}|${JSON.stringify(texts)}`;
      const unit: PatchUnit = { id, name: first.name, faction: FACTION[first.faction ?? ''] ?? 'Unknown' };
      const row = rows.get(key);
      if (row) row.units.push(unit);
      else rows.set(key, { key: `${id}-${key.length}`, title, units: [unit], changes: texts, projectile });
    }

    const sorted = [...rows.values()].sort((a, b) => {
      const [da, ta] = rowOrder(a);
      const [db, tb] = rowOrder(b);
      return da - db || ta.localeCompare(tb, 'en', { numeric: true });
    });

    return {
      key,
      label,
      description,
      rows: sorted,
      rules: notes.filter((n) => n.section === key).map(({ title, text }) => ({ title, text })),
      why: [...new Set(mine.flatMap((c) => c.why))],
      unitCount: new Set(mine.filter((c) => c.kind === 'unit').map((c) => c.id)).size,
    };
  });
}

export const PATCH_SECTIONS = buildSections();

/** Every unit the patch changes, in any section. */
export const PATCH_UNIT_COUNT = new Set(changes.filter((c) => c.kind === 'unit').map((c) => c.id)).size;

/** Changes as the page lists them: one per field, spawn health folded into health. */
export const PATCH_CHANGE_COUNT = changes.length;
