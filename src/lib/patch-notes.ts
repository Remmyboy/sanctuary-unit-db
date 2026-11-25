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
  26907462: {
    // Two hotfixes landed between extracts (0.0.1.22.2 and 0.0.1.22.3); this
    // is the bundleVersion in the build's own globalgamemanagers.
    version: '0.0.1.22.3',
    title: 'T1 transports, subs hit the seabed',
    notes: [
      'Hotfixes 0.0.1.22.2 and 0.0.1.22.3, shown together.',
      'The T1 air transports join the game for every faction (Courier, Stork, Shuttle), and the Chosen and EDA get their T3 ones (Emissary, Albatross), so every faction now has a transport at each tier.',
      'Submarines and torpedo launchers can hit targets on the seabed, such as commanders walking underwater.',
      'The EDA T3 sonar sees 450, up from 150, in line with the Guardian one.',
    ],
  },
  26880003: {
    // The mods hadn't named this one yet; this is the bundleVersion in the
    // build's own globalgamemanagers.
    version: '0.0.1.22.1',
    title: 'Air transports, naval goes live',
    notes: [
      'Air transports: a T2 transport for every faction (Envoy, Pelican, Conveyer) and a T3 one for the Guardians (Haulier). Nearly every land unit can be carried. The T1 transports are still demo-only, and the Chosen and EDA T3 ones have no model yet.',
      'The navy joins the game: frigates, submarines, destroyers, battleships, naval factories, sonar and torpedo launchers for every faction, plus a new Chosen T2 submarine. The naval tech centres go the other way: they’re demo-only now, which takes the Guardian ones out of the game.',
      'Torpedo launchers are armed for the first time (120 damage at 35 range at T1, 180 at 40 at T2), and submarines and T3 subs get sonar.',
      'T2 destroyers swap their cannon for a short pulse beam (160 damage every second at 27 range, was 200 every 3 s at 55). The Dreadnought’s main gun fires far faster at much shorter range (112.5 every 1.5 s at 50, was 583 every 10 s at 140), and the EDA and Guardian battleships gain an 80-range gun.',
      'T2 bombers (Typhoon, Kingfisher, Barometer) actually drop bombs now: 300 damage each, every 4 s.',
      'T4 rework: the EDA Centaur costs more (5,295 alloy, 52,950 energy), has 35k health (was 55k) and moves slower, but outranges everything at 70 with 5,000-damage shots. The Ares and the Guardian T4 move faster; the Guardian one gains health and hits almost twice as hard.',
      'Economy: shields cost twice as much energy to run at T2 and 60% more at T3, T2 air factories take longer to build, the Prophet costs twice the energy, and the Crucible costs and takes twice as long. Engineers build from one unit further away.',
      'The Gladius hovers instead of riding tracks. T1 interceptors fire slower shells, and the Guardian one trades its fast single shots for slow splash every 5 s.',
    ],
  },
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
