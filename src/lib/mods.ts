// The mod catalogue behind /mods and the Play page's download card.
//
// Every mod lives in the open-source sanctuary-mods repo and ships as release
// assets there, so the version below is the only thing that moves when one is
// cut — the download URLs, the release-notes links and both pages follow it.
// Keeping it here rather than in a component means the Play page and the mods
// page can never disagree about which version is current.

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
  /** What it does, in play. Each entry is its own paragraph. */
  detail: string[];
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
    summary: 'A Mods page in the game menu — switch mods on and off and change their settings.',
    detail: [
      'Adds a Mods entry to the main menu sidebar, built out of the game’s own settings screen, so it looks and behaves like the rest of the menu. Every mod you have installed gets a row with an on/off switch, and unfolding a row shows that mod’s own settings — panel positions, hotkeys, thresholds, whatever it offers.',
      'Changes apply straight away, with no restart, and stick between sessions. It also loads Lua mods dropped into your SanctuaryMods folder, and shows the lobby hash so you can check that you and your friends are running the same thing.',
      'Install this one first: every other mod on this page has a small “for the Mod Manager” download that drops in next to it.',
    ],
    keys: 'F8 opens the Mods page, in the menu or mid-match.',
  },
  {
    id: 'SanctuaryHud',
    name: 'SanctuaryDB HUD',
    version: '0.7.1',
    summary: 'An economy strip across the top of the screen, and a commander button.',
    detail: [
      'Alloy on the left, energy on the right: how much you are holding, what is coming in, what your queue is asking for, and the net per second — over a bar that grows with your storage and reddens as the store heads for empty. When your queue wants more than you earn, a STALL warning says so, and by how much.',
      'It is drawn in the game’s own typeface and colours, so it reads as part of the interface rather than as an overlay, and you can hide the game’s built-in alloy and energy bars if you would rather have only this one.',
      'Top-right there is a commander button showing your ACU’s health — click it to select the commander and snap the camera to it.',
    ],
    keys: 'F10 shows and hides the overlay.',
  },
  {
    id: 'EcoManager',
    name: 'Eco Manager',
    version: '0.3.0',
    summary: 'Your alloy extractors by tier, and engineer-assist that starts the upgrade.',
    detail: [
      'A small ALLOY panel counting your extractors by tier, with an ALL row; click any row to select that group. While something is upgrading, an UPGRADING block lists those separately, so you can see what is mid-upgrade without hunting across the map.',
      'The bigger change is what an assist does. Ordering an engineer to assist a finished extractor normally does nothing at all — it walks over and stands there. Here the assist queues the upgrade first, so the engineer arrives to real work.',
      'Each upgrade started that way is held paused until its engineer actually turns up, so sending five engineers to five extractors spreads the cost over the walk instead of flattening your economy the instant you click, and an engineer killed on the way never spends anything. The catch: if an engineer never arrives, that extractor sits paused until you unpause it.',
    ],
  },
  {
    id: 'IdleEngineers',
    name: 'Idle Engineers',
    version: '0.1.0',
    summary: 'A panel showing the engineers standing around doing nothing.',
    detail: [
      'One row per tech tier of idle engineers, plus rows for your commander and for all of them at once. Click a row to select that group and put them back to work.',
      'It hides itself completely when nothing is idle, so it costs no screen space in a game you are on top of. Drag it wherever you like and it stays there.',
    ],
  },
  {
    id: 'BuildHotkeys',
    name: 'Build Hotkeys',
    version: '0.1.0',
    summary: 'One key per kind of unit, the same on every faction, cycling down the tiers.',
    detail: [
      'The game’s own build hotkeys are nine fixed letters, and plenty of buttons have no key at all — shields, artillery, air and naval factories, tech centres, walls and storage all render with a “?” on them. This replaces the lot with a key per role: E is an engineer, T a tank, F a fighter, W a factory, whichever faction you are playing. Press the same key again to walk down the tiers, so the first press always gives you the best you can currently build.',
      'The layout follows Zulan’s, the hotbuild scheme Forged Alliance and FAF players will recognise. Hold Shift to queue five, hold Alt to walk the cycle backwards — a fresh Alt press opens at the cheapest end, which is the quick route to a T1 factory you mean to upgrade later. Escape clears the build queue of every selected factory rather than opening the pause menu, and still opens the menu when there is no queue to clear.',
      'Every press pops up a strip showing that key’s whole cycle in the build menu’s own art, with the one you are on lit — so you can see that W→W landed on the air factory rather than guessing. The construction buttons relabel themselves with the key that actually builds them, and every key is rebindable from the Mods page.',
    ],
    keys: 'E S T B F D G O R N V for units, W E S D X C R for structures — all rebindable.',
  },
  {
    id: 'LadderReporter',
    name: 'Ladder Reporter',
    version: '0.3.0',
    summary: 'Reports your ranked results automatically, and lets the ladder start your game for you.',
    detail: [
      'Play a ranked 1v1 and the result posts itself to the SanctuaryDB ladder when the game ends — no screenshots, nothing to fill in, nothing to confirm. It only ever reports two-player Steam lobbies that match an open ladder game; skirmish, LAN, team games and anything you are only spectating are recognised and left alone.',
      'It also removes the lobby step. When you and your opponent both have the mod and both have the game sitting in the main menu, matching in the queue drops you both straight into the game — map, factions, slots and host are all picked for you, and the game brings its own window back to the front if it was buried. If either of you is missing the mod, the queue falls back to hosting it manually as before.',
      'Nobody needs the mod to play ranked, and it only ever answers the SanctuaryDB page in your own browser, on your own machine.',
    ],
  },
  {
    id: 'ReplayManager',
    name: 'Replay Manager',
    version: '0.2.0',
    summary: 'Watch the game’s replays from any seat, fog-free, with everyone’s economy.',
    detail: [
      'The game records every match and plays them back from the main menu. This turns that playback into something you can study: switch to any player’s point of view or watch every army at once, lift the fog of war, and read every army’s alloy and energy side by side — income, spend, net, and the totals for the whole game.',
      'Full transport controls: pause, speed from a tenth to sixteen times, jump a minute either way, and a seek bar. There is also a toggle that hides the total length and the seek bar, for watching a game without the timeline telling you when it ends.',
      'Rewinding costs a restart of the replay — there is nothing to seek backwards from — so going back takes a few seconds. Replays are tied to the game build they were recorded on, and the game greys out the ones that no longer match.',
    ],
    keys: 'F7 shows and hides the panel.',
  },
  {
    id: 'CameraUtilities',
    name: 'Camera Utilities',
    version: '0.1.2',
    summary: 'Strip the overlays off the picture, for screenshots and cinematics.',
    detail: [
      'Switch off, one at a time: strategic icons, intel and radar rings, weapon range rings, build and assist circles, the order lines drawn for whatever is selected, the ghost outlines of buildings you have queued, the markers on empty alloy spots, health bars, and the whole HUD.',
      'The interesting setting is strategic icons “when far”: they stay while you are zoomed out and drop away as you dive in, so you get the icons where you want them and a clean shot where you do not. You pick the height, with the live camera height shown next to the setting so you can judge it against the shot you are framing.',
      'It also unlocks how far out units keep being drawn. The game stops drawing them past a certain distance, which is why a zoomed-out battle turns into nothing but icons; raise it and the models keep going. That one setting only takes effect from the next match or replay, since the distances are baked in as the map loads.',
    ],
    keys: 'F4 opens the panel in a match.',
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
