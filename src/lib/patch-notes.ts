// The words around each game patch on /patches: its version, where one is
// known, and what it changed that the unit-by-unit list can't show.
//
// The game has no version string in its files (see README, "Game version");
// these are the names the developers' updates went by, as the mods' release
// notes recorded them. Builds without one are shown by Steam build.
//
// Notes are written by hand, from the patch's own diff and from the game's
// templates where the site's data doesn't reach (projectiles, flight
// patterns, the lobby). Keep them to what a player would notice.

export interface PatchNote {
  version?: string;
  /** A few words for the timeline. */
  title: string;
  /** What the patch did beyond the unit list, or its headline changes. */
  notes: string[];
}

export const PATCH_NOTES: Record<number, PatchNote> = {
  25856019: {
    version: '0.0.1.21.1',
    title: 'Anti-air pass, submarines, new flight model',
    notes: [
      'An anti-air pass: T3 fighters lead their shots with much faster shells, anti-air missiles fly at 50 (were 20–25) and the EDA one turns three times as fast, anti-air turrets elevate twice as fast, and T1 anti-air gains splash.',
      'Submarines get a Surface/Dive order, and their main weapon only fires while surfaced.',
      'The Dreadnought’s third gun was limited to firing from land, so it never fired. It now fires from the water.',
      'The Peregrine fires a new, more agile missile, and its second launcher targets aircraft instead of the ground.',
      'The Engraver is a continuous beam now, and the TALEN got the muzzle it was missing, so it fires.',
      'A new flight model: aircraft cruise, circle and strafe in patterns picked by what they’re doing, and fighters, bombers and scouts bank up to 30°.',
      'Under the hood: a new entity engine, build queue and order drawing, and a new lobby where players join unassigned, pick a seat, and the lobby sets up AI seats itself.',
    ],
  },
  25474094: {
    version: '0.0.1.20',
    title: 'Engineers from every factory',
    notes: [
      'No stat changes.',
      'Air and naval factories can build engineers, up to their own tier.',
      'The EDA Spitter (T2 artillery) has a model now.',
    ],
  },
  25135612: {
    title: 'One tag',
    notes: ['A one-unit patch: the EDA Spitter was tagged demo-only.'],
  },
  25114838: {
    title: 'The September balance patch',
    notes: [
      '12 new naval units: two submarines and a T2 destroyer for each faction, EDA and Guardian T3 battleships, and a Chosen test submarine.',
      'Naval opens up: sonar, naval tech centres and torpedo launchers are no longer demo-only, naval factories are signed off, and commanders can walk the seabed.',
      'T4 land units cost 30–83% less. T3 tanks cost more (782–906 alloy, were 600) and move faster.',
      'Point defences cost 1.5–2.3× as much and take longer to build. Radar costs more to run, except the EDA T3 one.',
      'The Longbow and Scorpion artillery fire more slowly, and T2 raiders move at 3.5.',
      'Several air units, the Dreadnought and naval factories are signed off as in game.',
    ],
  },
};
