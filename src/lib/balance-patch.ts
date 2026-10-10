// Remmy's Balance Patch on the site: the toggle that swaps the database's
// numbers for the patch's, and the words its changes are printed in.
//
// The patched units are a second extract, public/data/units-balance-patch.json:
// scripts/extract.js applies the patch's changes (src/lib/balance-patch.json,
// imported from the mod by `npm run balance-patch`) to the game's templates
// and derives every unit again, so DPS, tiers and build trees follow the
// patch rather than being patched on top. This file stays small because the
// unit pages load it; the full change list is only imported by the patch's
// own page.

import type { BalanceChange, BalanceValue } from './types';
import { fmt, resourceName } from './format';

/** The `balance` URL param's one value. A param rather than a switch in
 *  storage, so a shared link shows the numbers its sender saw. */
export type Balance = 'remmy';

export const parseBalance = (v: unknown): Balance | undefined => (v === 'remmy' ? 'remmy' : undefined);

export const BALANCE_PATCH_NAME = 'Remmy’s Balance Patch';
export const BALANCE_DATA_URL = '/data/units-balance-patch.json';

/** Fields the patch sets that say nothing a reader needs: a unit spawns with
 *  its max health, so `defence.health.value` always moves with `health`. The
 *  extractor leaves the same ones off each unit. */
export const HIDDEN_FIELDS = new Set(['defence.health.value']);

// The export's labels use the template's words; the site says "alloy", as
// everywhere else, and says which of a unit's numbers a bare resource is.
const LABELS: Record<string, string> = {
  alloys: 'alloy cost',
  energy: 'energy cost',
  'alloys/s': 'alloy/s',
  name: 'label',
  'economy.maintenanceConsumption.energy': 'upkeep energy/s',
  'intel.radarRadius': 'radar range',
};

// Some labels end in the template's own name for a gun's turn rates.
const WORDS: [RegExp, string][] = [
  [/\byawSpeed$/, 'gun turn rate (deg/s)'],
  [/\bpitchSpeed$/, 'gun elevation rate (deg/s)'],
];

export const changeLabel = (label: string): string =>
  LABELS[label] ?? WORDS.reduce((l, [from, to]) => l.replace(from, to), label);

/** One value as a change list prints it. */
export function formatValue(v: BalanceValue, label = ''): string {
  if (v == null) return 'none';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return fmt(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  const perSecond = label === 'income' ? '/s' : '';
  return Object.entries(v)
    .map(([k, n]) => `${fmt(n)} ${resourceName(k)}${perSecond}`)
    .join(' + ');
}

export interface ChangeText {
  label: string;
  before: string;
  after: string;
  /** Percent change, for numbers that both exist and aren't zero to start with. */
  percent: number | null;
  /** How many of the unit's weapons change this way, when more than one. */
  count?: number;
}

/** Lines that read the same (a T4's three guns turning faster) as one, with a count. */
export function collapseTexts(texts: ChangeText[]): ChangeText[] {
  const out: ChangeText[] = [];
  for (const t of texts) {
    const same = out.find((o) => o.label === t.label && o.before === t.before && o.after === t.after);
    if (same) same.count = (same.count ?? 1) + 1;
    else out.push({ ...t });
  }
  return out;
}

/** A change in words. A list (tags, what a weapon targets) shows only what
 *  left it and what joined it, since the rest didn't change. */
export function describeChange(c: Pick<BalanceChange, 'label' | 'before' | 'after'>): ChangeText {
  let { before, after } = c;
  // A shell with no movement table falls under the game's gravity; the patch
  // gives some anti-air shells one with gravityMultiplier 0 so they fly straight.
  if (
    c.label === 'movement' &&
    before == null &&
    after != null &&
    typeof after === 'object' &&
    !Array.isArray(after) &&
    Object.keys(after).join() === 'gravityMultiplier' &&
    after.gravityMultiplier === 0
  ) {
    return { label: 'flight', before: 'falls', after: 'straight', percent: null };
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const was = before;
    const now = after;
    before = was.filter((x) => !now.includes(x));
    after = now.filter((x) => !was.includes(x));
  }
  const percent =
    typeof c.before === 'number' && typeof c.after === 'number' && c.before !== 0
      ? Math.round(((c.after - c.before) / Math.abs(c.before)) * 100)
      : null;
  return {
    label: changeLabel(c.label),
    before: formatValue(before, c.label),
    after: formatValue(after, c.label),
    percent,
  };
}
