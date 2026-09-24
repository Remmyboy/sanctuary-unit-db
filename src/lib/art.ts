// Artwork from the game's developers (Enhearten Media): which presskit
// screenshot heads each page, and the faction emblems. scripts/build-art.js
// reads this to cut the files into public/art/, verify.js to check they're
// there, and the site to point at them — so it's a plain .ts module (no JSX,
// no imports) that Node can load under native type stripping.

/**
 * One presskit screenshot per masthead. `crop` is the band taken from the
 * 1920×1080 original (x, y, width; height follows from the 4.8:1 output), set
 * so the subject sits right of centre, clear of the title. `focus` is the
 * background-position used on phones, where the masthead is narrow and tall
 * and only a slice of the band shows.
 */
export const MASTHEAD_ART = {
  units: { screenshot: 13, crop: [0, 120, 1920], focus: '50% 50%' },
  calculator: { screenshot: 4, crop: [300, 390, 1100], focus: '70% 50%' },
  maps: { screenshot: 2, crop: [0, 280, 1920], focus: '30% 50%' },
  mods: { screenshot: 10, crop: [500, 480, 1420], focus: '45% 50%' },
  play: { screenshot: 8, crop: [0, 400, 1920], focus: '40% 50%' },
  lobbies: { screenshot: 5, crop: [100, 280, 1100], focus: '65% 50%' },
  ladder: { screenshot: 7, crop: [0, 180, 1300], focus: '60% 50%' },
} as const satisfies Record<
  string,
  { screenshot: number; crop: readonly [number, number, number]; focus: string }
>;

export type MastheadArt = keyof typeof MASTHEAD_ART;

/** Output size of every masthead band. Dimmed behind text, so no need for 2×. */
export const MASTHEAD_SIZE = [1600, 333] as const;

export const mastheadSrc = (page: MastheadArt) => `/art/mastheads/${page}.webp`;

/** White-on-transparent emblems, used as CSS masks filled with `--fc`. */
export const FACTION_EMBLEMS: Record<string, string> = {
  EDA: '/art/factions/eda.png',
  Chosen: '/art/factions/chosen.png',
  Guard: '/art/factions/guard.png',
};
