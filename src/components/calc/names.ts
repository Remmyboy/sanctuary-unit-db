// How the calculator names and orders the units it lists: a unit's own name
// where it has one, else its label without the "Tier 2:" prefix.

import { shortName } from '../../lib/format';
import type { Unit } from '../../lib/types';

export const label = (u: Unit): string => u.name ?? shortName(u);

export const byTierName = (a: Unit, b: Unit) =>
  (a.tier ?? 0) - (b.tier ?? 0) || label(a).localeCompare(label(b));
