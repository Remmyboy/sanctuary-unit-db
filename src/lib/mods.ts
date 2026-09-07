// The mod catalogue behind /mods and the Play page's download card.
//
// Every mod lives in the open-source sanctuary-mods repo and ships as release
// assets there, so the version below is the only thing that moves when one is
// cut — the download URLs, the release-notes links and both pages follow it.
// Keeping it here rather than in a component means the Play page and the mods
// page can never disagree about which version is current.
//
// Blurbs stay short on purpose: the repo README is the long version, and it is
// one click away on every card.

export const MODS_REPO = 'https://github.com/Remmyboy/sanctuary-mods';
export const SITE_REPO = 'https://github.com/Remmyboy/sanctuary-unit-db';

// Where the game reads mods from. The install root moves with the branch and
// the Steam library, so this is the common default rather than a promise.
export const ENGINE_PATH =
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Sanctuary Shattered Sun Playtest\\engine';

export interface Mod {
  /** Repo folder and release-tag prefix — `SanctuaryHud`, `EcoManager`. */
  id: string;
  name: string;
  version: string;
  /** One line, shown under the name. */
  summary: string;
  /** The two or three things you actually get. One short line each. */
  points: string[];
  /** Keys it binds, if any — worth knowing before you install it. */
  keys?: string;
}

// Ordered the way someone new reads them: the manager first, because every
// other mod plugs into it, then the ones you would want in a normal game, then
// the ladder mod, then the tools for watching and recording.
export const MODS: Mod[] = [
  {
    id: 'ModManager',
    name: 'Mod Manager',
    version: '0.3.0',
    summary: 'A Mods page in the game menu. Install this one first.',
    points: [
      'Every mod gets a switch, and its own settings underneath.',
      'Changes apply with no restart, and stick between sessions.',
      'Loads Lua mods too, and shows the lobby hash for comparing with friends.',
    ],
    keys: 'F8',
  },
  {
    id: 'SanctuaryHud',
    name: 'SanctuaryDB HUD',
    version: '0.7.1',
    summary: 'A readable economy strip across the top of the screen.',
    points: [
      'Alloy and energy: stored, in, out, net per second, over a storage bar that reddens as you head for empty.',
      'A STALL warning when your queue wants more than you earn, and by how much.',
      'A commander button top-right — click to select it and snap the camera there.',
      'Drawn in the game’s own font and colours; can replace the built-in bars.',
    ],
    keys: 'F10',
  },
  {
    id: 'EcoManager',
    name: 'Eco Manager',
    version: '0.3.0',
    summary: 'Your alloy extractors by tier, and assist that actually upgrades.',
    points: [
      'One clickable row per extractor tier, plus what is mid-upgrade.',
      'Assisting a finished extractor starts its upgrade, instead of the engineer standing there doing nothing.',
      'Each upgrade is held paused until its engineer arrives, so five at once don’t flatten your economy.',
    ],
  },
  {
    id: 'IdleEngineers',
    name: 'Idle Engineers',
    version: '0.1.0',
    summary: 'Shows the engineers standing around doing nothing.',
    points: [
      'A row per tech tier; click to select that group.',
      'Hides itself completely when nothing is idle.',
    ],
  },
  {
    id: 'BuildHotkeys',
    name: 'Build Hotkeys',
    version: '0.1.0',
    summary: 'One key per kind of unit, the same on every faction.',
    points: [
      'E is an engineer, T a tank, W a factory — whoever you are playing. Press again to walk down the tiers.',
      'Follows Zulan’s hotbuild layout, so FA and FAF players already know it. Shift queues five, Alt goes backwards.',
      'Reaches everything the stock keys can’t: shields, artillery, air and naval factories, tech centres, walls.',
      'A strip shows what your press picked, and the build buttons relabel themselves. Escape clears a factory queue.',
    ],
    keys: 'All rebindable',
  },
  {
    id: 'LadderReporter',
    name: 'Ladder Reporter',
    version: '0.3.0',
    summary: 'Reports your ranked results, and starts your matches for you.',
    points: [
      'Ranked 1v1 results post themselves to the SanctuaryDB ladder when the game ends.',
      'Match in the queue and you are dropped straight into the game — no hosting, no invites — when both players have it.',
      'Only ever touches two-player Steam lobbies that match an open ladder game.',
    ],
  },
  {
    id: 'ReplayManager',
    name: 'Replay Manager',
    version: '0.2.0',
    summary: 'Watch the game’s replays from any seat, fog-free.',
    points: [
      'Any player’s point of view, or every army at once, with the fog lifted.',
      'Every army’s economy side by side, including whole-game totals.',
      'Pause, 0.1× to 16× speed, skip a minute, seek — or hide the timeline so you don’t know when it ends.',
    ],
    keys: 'F7',
  },
  {
    id: 'CameraUtilities',
    name: 'Camera Utilities',
    version: '0.1.2',
    summary: 'Strip the overlays off the picture, for screenshots and cinematics.',
    points: [
      'Switch off icons, range rings, order lines, build ghosts, health bars and the whole HUD.',
      'Strategic icons can drop away only when you zoom in, so you keep them where they help.',
      'Unlock how far out units are drawn, instead of a wide shot turning into icons.',
    ],
    keys: 'F4',
  },
];

const byId = new Map(MODS.map((m) => [m.id, m]));

/** The current entry for a mod, by repo id. Throws rather than returning
 *  undefined: every caller names a mod that is in the list above, so a typo
 *  should blow up in the first render rather than emit a dead download link. */
export function mod(id: string): Mod {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown mod: ${id}`);
  return found;
}

export const releaseTag = (m: Mod): string => `${m.id}-${m.version}`;

export const releaseNotes = (m: Mod): string => `${MODS_REPO}/releases/tag/${releaseTag(m)}`;

export const sourceHref = (m: Mod): string => `${MODS_REPO}/tree/main/${m.id}`;

/** Everything in one zip — BepInEx, the loader and the mod — for an install
 *  with no mods on it yet. */
export const standaloneHref = (m: Mod): string =>
  `${MODS_REPO}/releases/download/${releaseTag(m)}/${releaseTag(m)}-Standalone.zip`;

/** Just the mod, for an install that already has the Mod Manager. */
export const managerHref = (m: Mod): string =>
  `${MODS_REPO}/releases/download/${releaseTag(m)}/${releaseTag(m)}-ModManager.zip`;
