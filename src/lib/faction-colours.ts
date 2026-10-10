// Faction liveries, matching the in-game unit schemes, and the order the
// factions run in. Kept in a plain .ts module (no JSX, no runtime imports) so
// scripts/build-icons.js can load it under Node's native type stripping as
// well as the site importing it through Vite.

import type { Faction } from './types';

export const FACTION_COLOURS: Record<string, string> = {
  EDA: '#4ad17e',
  Chosen: '#ff5a52',
  Guard: '#f5b52a',
  Unknown: '#8b95a5',
};

// Column order everywhere in the UI.
export const FACTION_ORDER: Faction[] = ['EDA', 'Chosen', 'Guard'];
