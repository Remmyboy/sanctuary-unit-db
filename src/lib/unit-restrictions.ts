// The options the Unit Restrictions card on /gameplay-mods explains, copied
// from the mod's mod.json and release notes (sanctuary-mods,
// UnitRestrictions 0.1.0). When a release changes one, change it here with
// the version in src/lib/mods.ts.

import type { LobbyOption } from './zone-control';

export const LOBBY_OPTIONS: LobbyOption[] = [
  {
    label: 'No land units',
    value: 'Off',
    text: 'Every mobile land unit except engineers. Land factories stay, for their engineers.',
  },
  {
    label: 'No air units',
    value: 'Off',
    text: 'Every aircraft. Air factories stay, for their engineers; restrict them in the unit list to take them out too.',
  },
  {
    label: 'No naval units',
    value: 'Off',
    text: 'Every ship and submarine. Naval factories stay, for their engineers; restrict them in the unit list to take them out too.',
  },
  {
    label: 'No experimentals',
    value: 'Off',
    text: 'Every tier 4 unit and structure.',
  },
  {
    label: 'Restricted units',
    value: 'None',
    text: 'Units picked one by one, on top of the sections above: a kind of unit for every faction, or one faction’s unit alone. Structures, factories and their upgrades can be picked too.',
  },
];
