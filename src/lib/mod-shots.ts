// In-game screenshots for the mod cards on /mods: which capture each card
// shows, the part of it to cut, and the line under it.
// scripts/build-mod-shots.js reads this to cut the files into
// public/art/mods/, and the page reads it to show them. So, like art.ts, it's
// a plain .ts module (no JSX, no imports) that Node can load under native
// type stripping.
//
// The captures come from the sanctuary-mods repo's website-screenshots
// folder (one numbered folder per mod, 2560×1440 frames plus tight crops of
// single panels). They're not committed here; only the cut WebPs are.
//
// Captions follow the page's rule: say what the player sees and gets, not
// how the mod does it.

export interface ShotPart {
  /** Path inside the website-screenshots folder. */
  file: string;
  /** Size of that file, checked by the build so a re-shot capture can't
   *  silently shift a crop. */
  size: readonly [number, number];
  /** Region to cut, x, y, width, height; the whole file when left out. */
  crop?: readonly [number, number, number, number];
}

export interface ModShot {
  /** Output name, unique within the mod. */
  slug: string;
  /** One part, or several of the same width stacked top to bottom. */
  parts: readonly ShotPart[];
  /** A whole frame (scaled down, lossy) or a panel at the game's own pixel
   *  size (kept at 1:1, near-lossless, and allowed to scale up on the page). */
  kind: 'frame' | 'panel';
  alt: string;
  caption: string;
}

const FRAME = [2560, 1440] as const;
const frame = (file: string, crop?: ShotPart['crop']): ShotPart => ({ file, size: FRAME, crop });

/** Frames are cut down to this width at most; enough for a full-screen view. */
export const FRAME_MAX_WIDTH = 1920;
/** Thumbnails fit inside this box (2× the tile they sit in). */
export const THUMB_BOX = [240, 136] as const;

export const MOD_SHOTS: Record<string, readonly ModShot[]> = {
  ModManager: [
    {
      slug: 'mods-page',
      parts: [frame('07 ModManager/mods page - UI mods.png')],
      kind: 'frame',
      alt: 'The Mods page in the game’s menu: a list of mods, each with an off/on switch',
      caption: 'Every mod you have, with a switch, on a Mods page in the game’s own menu.',
    },
    {
      slug: 'settings',
      parts: [frame('01 SanctuaryHud/settings 1.png')],
      kind: 'frame',
      alt: 'A mod opened on the Mods page, showing its settings as switches, sliders and key boxes',
      caption: 'Click a mod for its settings: the game’s own switches and sliders.',
    },
    {
      slug: 'lobby-panel',
      parts: [frame('07 ModManager/lobby - gameplay mods panel.png')],
      kind: 'frame',
      alt: 'The lobby’s Mods panel: gameplay mods with off/on switches and one mod’s options as sliders',
      caption: 'The host picks the match’s gameplay mods, and their options, in the lobby.',
    },
    {
      slug: 'lobby-chat',
      parts: [frame('07 ModManager/lobby - picked mods announced in chat.png')],
      kind: 'frame',
      alt: 'A game lobby whose chat lists the gameplay mod the host switched on, with its settings',
      caption: 'Everyone in the lobby is told what’s on before the match starts.',
    },
    {
      slug: 'gameplay-mods',
      parts: [frame('07 ModManager/mods page - gameplay mods.png')],
      kind: 'frame',
      alt: 'The Mods page’s gameplay tab, listing installed gameplay mods and community AIs',
      caption: 'Gameplay mods and community AIs you’ve installed, with what’s in each.',
    },
  ],

  SanctuaryHud: [
    {
      slug: 'overview',
      parts: [frame('01 SanctuaryHud/overview - factory building, with queue.png')],
      kind: 'frame',
      alt: 'A match with the HUD on: economy strip across the top, mini-map top left, commander top right, and the docked bottom panels',
      caption:
        'A match with it on: economy strip, mini-map, commander and the bottom panels. (Eco Manager and Idle Engineers on too.)',
    },
    {
      slug: 'mini-map',
      parts: [{ file: '01 SanctuaryHud/mini-map.png', size: [210, 210] }],
      kind: 'panel',
      alt: 'The mini-map: two islands, your units as dots, fog over what you can’t see',
      caption: 'The mini-map. Click or drag on it to move the camera.',
    },
    {
      slug: 'economy',
      parts: [
        { file: '01 SanctuaryHud/economy strip.png', size: [2560, 62], crop: [0, 0, 1205, 62] },
        { file: '01 SanctuaryHud/economy strip - stalling.png', size: [2560, 62], crop: [0, 0, 1205, 62] },
      ],
      kind: 'panel',
      alt: 'Two alloy readouts: one warning “empty in 9s”, the other “stall −9/s”, each with income, spend and net',
      caption: 'Stored, in, out and net, with a warning before you run dry and when you stall.',
    },
    {
      slug: 'reclaim',
      parts: [frame('01 SanctuaryHud/reclaim values over wrecks.png', [800, 180, 1280, 720])],
      kind: 'frame',
      alt: 'Wrecks on the map labelled with their reclaim value, 2718 on one cluster',
      caption: 'Hold Left Alt for what every wreck is worth.',
    },
    {
      slug: 'build-countdown',
      parts: [{ file: '01 SanctuaryHud/build countdown.png', size: [260, 220] }],
      kind: 'panel',
      alt: 'A structure under construction with 0:24 counting down under it',
      caption: 'A countdown under everything you’re building.',
    },
    {
      slug: 'alert',
      parts: [frame('01 SanctuaryHud/alert - commander under attack.png', [640, 0, 1280, 720])],
      kind: 'frame',
      alt: 'A “Commander under attack” banner at the top of the screen',
      caption: 'Alerts for what matters, like your commander under attack.',
    },
    {
      slug: 'bottom-panels',
      parts: [{ file: '01 SanctuaryHud/bottom panels - factory with queue.png', size: [960, 290] }],
      kind: 'panel',
      alt: 'A land factory selected: its card with health and spend, its queue, and its build options with hotkeys',
      caption: 'Bottom panels with only what your selection can do, and a card you can read.',
    },
    {
      slug: 'match-stats',
      parts: [frame('01 SanctuaryHud/match stats - economy.png', [210, 76, 2140, 1300])],
      kind: 'frame',
      alt: 'The match stats window: each army’s score and resources in a table, and a score chart over time',
      caption: 'After the match: every army’s score, economy and units, with charts.',
    },
  ],

  EcoManager: [
    {
      slug: 'spend',
      parts: [{ file: '02 EcoManager/spend panel.png', size: [160, 290] }],
      kind: 'panel',
      alt: 'Two columns of build tiles, alloy and energy, each with what it’s spending',
      caption: 'What’s eating your alloy and energy, hungriest first.',
    },
    {
      slug: 'in-match',
      parts: [frame('02 EcoManager/in match.png', [0, 0, 1280, 720])],
      kind: 'frame',
      alt: 'The spend panel in a match, under the mini-map on the left of the screen',
      caption: 'In a match, tucked under the mini-map.',
    },
  ],

  IdleEngineers: [
    {
      slug: 'panel',
      parts: [{ file: '03 IdleEngineers/idle panel - engineers and factories.png', size: [265, 395] }],
      kind: 'panel',
      alt: 'The idle panel: the commander, five T1 and two T2 engineers, then three idle factories',
      caption: 'Idle engineers by tier, idle factories underneath. Click one to select them.',
    },
    {
      slug: 'in-match',
      parts: [frame('03 IdleEngineers/in match.png', [1280, 0, 1280, 720])],
      kind: 'frame',
      alt: 'The idle panel in a match, on the right of the screen under the commander',
      caption: 'In a match, out of the way on the right.',
    },
  ],

  BuildHotkeys: [
    {
      slug: 'factory',
      parts: [{ file: '04 BuildHotkeys/hotkey letters - factory.png', size: [580, 100] }],
      kind: 'panel',
      alt: 'A factory’s build buttons, each labelled with its key: 1, M, E, T, B, R, N, S',
      caption: 'The build buttons show your keys.',
    },
    {
      slug: 'engineer',
      parts: [{ file: '04 BuildHotkeys/hotkey letters - engineers.png', size: [1220, 100] }],
      kind: 'panel',
      alt: 'An engineer’s build buttons labelled with keys: W for factories, S and D for extractors and generators, X and C for defences',
      caption: 'The same letters for the same buildings, on every faction.',
    },
    {
      slug: 'keys',
      parts: [frame('04 BuildHotkeys/settings.png')],
      kind: 'frame',
      alt: 'Build Hotkeys’ settings: every structure listed beside the key it’s on',
      caption: 'Every key listed, ready to change.',
    },
  ],

  CameraUtilities: [
    {
      slug: 'panel',
      parts: [{ file: '05 CameraUtilities/F4 panel.png', size: [380, 360] }],
      kind: 'panel',
      alt: 'The Camera Utilities panel: strategic icons always, when far or never; switches to hide range rings, order lines, health bars and the HUD',
      caption: 'Everything on one panel, mid-match.',
    },
    {
      slug: 'before',
      parts: [frame('05 CameraUtilities/F4 panel - before, ranges shown.png')],
      kind: 'frame',
      alt: 'A base with range rings drawn over it in red, yellow and white',
      caption: 'Before: range rings everywhere.',
    },
    {
      slug: 'after',
      parts: [frame('05 CameraUtilities/F4 panel - after, ranges hidden.png')],
      kind: 'frame',
      alt: 'The same base with the range rings switched off',
      caption: 'After: the same shot, clean.',
    },
  ],

  ReplayManager: [
    {
      slug: 'all-armies',
      parts: [frame('06 ReplayManager/replay - all armies.png')],
      kind: 'frame',
      alt: 'A replay with the fog lifted, both armies visible, and the replay panel in the top right',
      caption: 'Every army at once, no fog.',
    },
    {
      slug: 'panel',
      parts: [{ file: '06 ReplayManager/replay panel.png', size: [690, 170] }],
      kind: 'panel',
      alt: 'The replay panel: time, pause, speed, skip, fog and timeline buttons, and each army’s alloy and energy',
      caption: 'Speed, skip, fog and every army’s economy on one panel.',
    },
    {
      slug: 'one-army',
      parts: [frame('06 ReplayManager/replay - one army, HUD back.png')],
      kind: 'frame',
      alt: 'A replay watched from one player’s seat, with their HUD showing',
      caption: 'Or sit in one player’s seat, with their HUD.',
    },
  ],
};

export const shotSrc = (modId: string, shot: ModShot): string => `/art/mods/${modId}/${shot.slug}.webp`;
export const thumbSrc = (modId: string, shot: ModShot): string =>
  `/art/mods/${modId}/${shot.slug}-thumb.webp`;

/** The size of the cut file: the parts stacked, then a frame scaled down to
 *  FRAME_MAX_WIDTH. Shared by the build and the page, so the page can reserve
 *  the space before the image arrives. */
export function shotSize(shot: ModShot): [number, number] {
  const sizes = shot.parts.map((p) => (p.crop ? [p.crop[2], p.crop[3]] : [p.size[0], p.size[1]]));
  const w = sizes[0][0];
  const h = sizes.reduce((sum, s) => sum + s[1], 0);
  if (shot.kind === 'frame' && w > FRAME_MAX_WIDTH) {
    return [FRAME_MAX_WIDTH, Math.round((h * FRAME_MAX_WIDTH) / w)];
  }
  return [w, h];
}
