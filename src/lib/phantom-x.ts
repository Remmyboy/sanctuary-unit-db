// The rules the Phantom-X card on /gameplay-mods explains, copied from the mod's
// mod.json and release notes (sanctuary-mods, PhantomX 0.2.2). They are the
// mod's numbers, not ours: when a release changes one, change it here with
// the version in src/lib/mods.ts.

import type { LobbyOption } from './zone-control';

export const LOBBY_OPTIONS: LobbyOption[] = [
  {
    label: 'Number of phantoms',
    value: 'Players vote (or 1–3)',
    text: 'With nobody voting, a third of the players, rounded up. There’s always at least one innocent.',
  },
  {
    label: 'Phantoms chosen at',
    value: '8 min (3–15)',
    text: 'Until then nobody has a role. The vote opens two minutes before, volunteering one minute before.',
  },
  {
    label: 'Picking phantoms',
    value: 'Volunteers more likely',
    text: 'Or at random, or (with two phantoms) the pair that best balances the teams.',
  },
  {
    label: 'Phantom bonus',
    value: '70% (30–250%)',
    text: 'At 100%, one phantom gets 20–28% of the innocents’ combined income.',
  },
  {
    label: 'Paladins per phantom',
    value: '1 per 2 phantoms',
    text: 'Innocents with a share of the bonus, from none up to one per phantom.',
  },
  {
    label: 'Paladin bonus',
    value: '45% (25–65%)',
    text: 'Of a phantom’s.',
  },
  {
    label: 'Paladin marks',
    value: '1 per phantom',
    text: 'A mark costs 1,000 alloys plus more as the match goes on, paid from storage, and stops a paladin’s bonus once it’s paid in full.',
  },
  {
    label: 'Reveals',
    value: '30 min, then just after',
    text: 'Three reveals, the first counted from when phantoms are chosen. Any of them can be never.',
  },
  {
    label: 'Reveal who, and to whom',
    value: 'Phantoms, to everyone',
    text: 'Phantoms, paladins or both, to everyone or only to phantoms or paladins.',
  },
  {
    label: 'Reveal on death',
    value: 'On',
    text: 'A player’s role is shown when they die, with how many phantoms and innocents are left.',
  },
];
