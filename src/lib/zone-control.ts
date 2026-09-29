// The rules the Zone Control page explains, copied from the mod's
// lua/zonecontrol/balance.lua and mod.json (sanctuary-mods, ZoneControl
// 0.5.0). They are the mod's numbers, not ours: when a release changes one,
// change it here with the version in src/lib/mods.ts.

export interface Level {
  level: number;
  /** Kills to reach it; the "insanity" lobby option uses `insane` instead. */
  kills: number;
  insane: number;
  /** What every zone you hold sends you from this level. */
  units: string;
  /** Anything else the level brings. */
  bonus?: string;
}

export const LEVELS: Level[] = [
  { level: 0, kills: 0, insane: 0, units: 'Dingoes' },
  { level: 1, kills: 50, insane: 1, units: 'Pumas' },
  { level: 2, kills: 150, insane: 2, units: 'Jackals, every other beat' },
  { level: 3, kills: 400, insane: 3, units: 'Kodiaks, every third beat' },
  { level: 4, kills: 800, insane: 20, units: 'Kodiaks', bonus: 'A hero: Guard’s T4 bot' },
  { level: 5, kills: 1000, insane: 40, units: 'Kodiaks', bonus: 'A hero: Chosen’s T4 big bot' },
  { level: 6, kills: 1200, insane: 60, units: 'Kodiaks', bonus: 'A hero: the Behemoth' },
  { level: 7, kills: 1400, insane: 100, units: 'Kodiaks', bonus: 'A Grinder artillery in your base' },
  { level: 8, kills: 1600, insane: 150, units: 'Kodiaks', bonus: 'An Onager heavy artillery beside it' },
  { level: 9, kills: 1800, insane: 200, units: 'Kodiaks', bonus: 'Your artillery reloads twice as fast' },
];

export interface LobbyOption {
  label: string;
  value: string;
  text: string;
}

export const LOBBY_OPTIONS: LobbyOption[] = [
  {
    label: 'Seconds between spawns',
    value: '5 (2–15)',
    text: 'How often every zone you hold sends you a unit.',
  },
  {
    label: 'Unit cap per player',
    value: '150 (50–500)',
    text: 'Zones stop sending you units while you have this many.',
  },
  {
    label: 'Insanity mode',
    value: 'Off',
    text: 'Levels come after a handful of kills instead of hundreds.',
  },
  {
    label: 'Zone count banner',
    value: 'On',
    text: 'How many zones each player holds, and your own money and level.',
  },
];

/** The shops in your base, told apart by building: in the Playtest build the
 *  names over units don't show. Prices rise with each one bought. */
export const SHOPS = [
  { looks: 'The gun', sells: 'Attack upgrades', price: '50, then 100, 150…' },
  { looks: 'The radar', sells: 'Defence upgrades', price: '50, then 100, 150…' },
  { looks: 'The generator', sells: 'Kamikazes', price: '100, then 150, 200…' },
];

export const ORIGINAL_MAPS_HREF =
  'https://gitlab.com/supreme-commander-forged-alliance/maps/zone-control-maps';
export const MAP_RELEASE_HREF =
  'https://github.com/Remmyboy/sanctuary-map-converter/releases/tag/map-zone-control-for-faf-8p-v2';
