// The mod catalogue behind /mods and the Play page's download card.
//
// Every mod lives in the open-source sanctuary-mods repo and ships as release
// assets there, so the version below is the only thing that moves when one is
// cut — the download URLs, the release-notes links and both pages follow it.
// Keeping it here rather than in a component means the Play page and the mods
// page can never disagree about which version is current.
//
// The copy is a pitch, not a changelog: each feature says what a player gets
// and why they would want it. How a mod is built (which canvas it draws on,
// which hook it uses) and what a release fixed belong in the release notes,
// which are one click away on every card — so when a release lands, bump the
// version, and touch the features only if the mod can now do something new.

export const MODS_REPO = 'https://github.com/Remmyboy/sanctuary-mods';
export const SITE_REPO = 'https://github.com/Remmyboy/sanctuary-unit-db';

// The loader on its own: BepInEx, the loader and an empty SanctuaryMods
// folder. Not a mod anyone picks, so it has no card — it's the base the
// everything zip is built on. Each Standalone zip carries whichever loader
// was current when it was packed, so bump this when the loader gets a release
// of its own and the everything zip always has the newest.
export const LOADER_VERSION = '1.3.1';

/** Every mod in one zip, built by the site's own build from the releases
 *  named in this file (src/lib/mod-bundle.ts) and served as a static file,
 *  so it always holds exactly the versions the page shows. */
export const EVERYTHING_HREF = '/downloads/SanctuaryMods-Everything.zip';

// Where the game reads mods from. The install root moves with the branch and
// the Steam library, so this is the common default rather than a promise.
export const ENGINE_PATH =
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Sanctuary Shattered Sun Playtest\\engine';

export interface Feature {
  /** A few words, read on their own when someone skims. */
  title: string;
  /** One or two short sentences on what it does for you. */
  text: string;
}

export interface Mod {
  /** Repo folder and release-tag prefix — `SanctuaryHud`, `EcoManager`. */
  id: string;
  name: string;
  version: string;
  /** The pitch in one line, under the name. */
  tagline: string;
  features: Feature[];
  /** Its keys, in words, if it binds any — worth knowing before you install. */
  keys?: string;
}

// Ordered the way someone new reads them: the manager first, because the
// page's install steps start with it, then the ones you would want in a
// normal game, then the ladder mod, then the tools for watching and recording.
export const MODS: Mod[] = [
  {
    id: 'ModManager',
    name: 'Mod Manager',
    version: '0.6.1',
    tagline: 'A Mods page in the game menu, for switching mods on and off and changing their settings.',
    features: [
      {
        title: 'A switch for every mod',
        text: 'Turn any mod on or off from the menu, or mid-match with F8. It takes effect straight away, with no restart.',
      },
      {
        title: 'Settings in the game',
        text: 'Every option a mod has, as the game’s own switches and sliders. No config files to edit.',
      },
      {
        title: 'Every other mod is a small drop-in',
        text: 'It brings the loader the rest run on, so each mod after this is a small zip you extract and you’re done.',
      },
      {
        title: 'Lua mods too',
        text: 'Switch Lua mods on and off, with the lobby hash on show so you can check you match your friends.',
      },
    ],
    keys: 'F8 opens it, in the menu or mid-match',
  },
  {
    id: 'SanctuaryHud',
    name: 'SanctuaryDB HUD',
    version: '0.13.1',
    tagline: 'A mini-map, a proper economy readout, reclaim values, build timers and alerts.',
    features: [
      {
        title: 'A mini-map',
        text: 'The one thing the game is missing. Fog where you can’t see, every contact you can, and click or drag to move the camera.',
      },
      {
        title: 'Your economy at a glance',
        text: 'Alloy and energy stored, in, out and net per second, with a stall warning and how long until you run dry.',
      },
      {
        title: 'See what the wrecks are worth',
        text: 'Hold Left Alt and every wreck on screen shows its reclaim, added up when you zoom out.',
      },
      {
        title: 'Build timers',
        text: 'A countdown under everything you’re building. Orange means you’re stalling it; red means nothing is building it.',
      },
      {
        title: 'Alerts that matter',
        text: 'Your commander under attack, a key structure finished, a player dropping out — with optional voice packs.',
      },
      {
        title: 'Cleaner bottom panels',
        text: 'Only the orders and build options your selection really has, and a unit card you can read at a glance. One switch brings the originals back.',
      },
      {
        title: 'Find your commander',
        text: 'One click on the top-right button selects your commander and snaps the camera to it.',
      },
    ],
    keys: 'F10 shows and hides it · F2 the mini-map',
  },
  {
    id: 'EcoManager',
    name: 'Eco Manager',
    version: '0.7.3',
    tagline: 'See what’s eating your economy, and upgrade extractors without babysitting them.',
    features: [
      {
        title: 'What’s spending your resources',
        text: 'Your biggest builds in progress, alloy on one side and energy on the other, hungriest first. Click to select the builders, right-click to pause them.',
      },
      {
        title: 'Every extractor, by tier',
        text: 'A row of tiles per tier, with the ones mid-upgrade beside them. Click a tile to select that group.',
      },
      {
        title: 'Assist to upgrade',
        text: 'Order an engineer to assist a finished extractor and it starts the upgrade, instead of standing there doing nothing.',
      },
      {
        title: 'Upgrades that don’t stall you',
        text: 'Each upgrade waits, paused, until its engineer actually starts work — so queueing five at once won’t flatten your economy.',
      },
    ],
  },
  {
    id: 'IdleEngineers',
    name: 'Idle Engineers',
    version: '0.5.3',
    tagline: 'Never lose track of an engineer or factory with nothing to do.',
    features: [
      {
        title: 'Idle engineers, by tier',
        text: 'A tile for each tech tier with a count on it, and your commander on top. Click one to select that whole group.',
      },
      {
        title: 'Idle factories too',
        text: 'Every factory with an empty queue, underneath. Click the heading to select them all and queue up in one go.',
      },
      {
        title: 'Gone when you don’t need it',
        text: 'It disappears completely when nothing is idle. Put it wherever you like and lock it there.',
      },
    ],
  },
  {
    id: 'BuildHotkeys',
    name: 'Build Hotkeys',
    version: '0.3.3',
    tagline: 'One key per kind of unit, the same on every faction.',
    features: [
      {
        title: 'Same keys, every faction',
        text: 'E is an engineer, T a tank, W a factory — whoever you’re playing. Press again to step up the tiers.',
      },
      {
        title: 'Familiar to FA players',
        text: 'Follows Zulan’s hotbuild layout, which FA and FAF players already know. Shift queues five, Alt steps back.',
      },
      {
        title: 'Everything within reach',
        text: 'Shields, artillery, air and naval factories, tech centres and walls — everything the stock keys can’t reach.',
      },
      {
        title: 'Always know what you picked',
        text: 'A strip shows what each press chose, and the build buttons relabel themselves with your keys.',
      },
      {
        title: 'Order keys',
        text: 'X pauses and Z repeat-builds your selection, and Escape stops your factories, as in FAF. The pause menu can move to a key you won’t hit by accident.',
      },
      {
        title: 'Extractors snap at any zoom',
        text: 'Place one near a deposit and it snaps on, even zoomed right out. No more pixel-hunting.',
      },
    ],
    keys: 'Every key can be rebound',
  },
  {
    id: 'LadderReporter',
    name: 'Ladder Reporter',
    version: '0.3.4',
    tagline: 'Queue for a ranked 1v1 on the site, and the ladder does the rest.',
    features: [
      {
        title: 'Matches start themselves',
        text: 'Get paired with someone who also has it and both games make the lobby, take their seats and start. No hosting, no invites.',
      },
      {
        title: 'Results report themselves',
        text: 'When a ranked 1v1 ends, the result goes straight to the SanctuaryDB ladder.',
      },
      {
        title: 'Nothing to set up',
        text: 'No settings at all. It only ever touches two-player Steam lobbies that match an open ladder game.',
      },
    ],
  },
  {
    id: 'ReplayManager',
    name: 'Replay Manager',
    version: '0.4.3',
    tagline: 'Watch replays properly: any player’s view, no fog, every economy.',
    features: [
      {
        title: 'Any seat, no fog',
        text: 'Watch through any player’s eyes, or every army at once with the fog lifted.',
      },
      {
        title: 'Compare economies',
        text: 'Every army’s economy side by side, with whole-game totals, so you can see where it was won.',
      },
      {
        title: 'Full playback control',
        text: 'Pause, 0.25× to 16×, skip ahead a minute, restart. Or hide the timeline, so you can’t tell when it ends.',
      },
    ],
    keys: 'F7 shows and hides the panel',
  },
  {
    id: 'CameraUtilities',
    name: 'Camera Utilities',
    version: '0.1.2',
    tagline: 'A clean picture for screenshots, videos and casting.',
    features: [
      {
        title: 'Strip the screen bare',
        text: 'Switch off icons, range rings, order lines, planned buildings, health bars or the whole HUD, one at a time.',
      },
      {
        title: 'Icons only when you’re zoomed out',
        text: 'Strategic icons can stay for the wide view and drop away as you dive in for the close-up.',
      },
      {
        title: 'See the whole battle',
        text: 'Units stay drawn much further out, so a wide shot shows the armies instead of a sea of icons.',
      },
      {
        title: 'Change it mid-shot',
        text: 'Every switch is on a small in-game panel, so you never have to leave the match.',
      },
    ],
    keys: 'F4 opens the panel',
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

/** Self-contained: the mod plus BepInEx and the loader it runs on. For the
 *  Mod Manager this is the install everything else goes on top of; for any
 *  other mod it's the way to run that one without the manager. */
export const standaloneHref = (m: Mod): string =>
  `${MODS_REPO}/releases/download/${releaseTag(m)}/${releaseTag(m)}-Standalone.zip`;

/** Just the mod itself, for an install that already has the Mod Manager —
 *  zipped as a folder so it drops into the same place as everything else.
 *  The Mod Manager has one too (the manager alone, for an install that has
 *  the loader), but nothing here offers it: the manager is what you start
 *  from, so its link is always the Standalone. */
export const managerHref = (m: Mod): string =>
  `${MODS_REPO}/releases/download/${releaseTag(m)}/${releaseTag(m)}-ModManager.zip`;

export const loaderHref = (): string =>
  `${MODS_REPO}/releases/download/ModLoader-${LOADER_VERSION}/ModLoader-${LOADER_VERSION}.zip`;
