// The mod catalogue behind /mods, /gameplay-mods, /balance-patch and the Play page's download card.
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
    version: '0.15.0',
    tagline:
      'A Mods page in the game menu for switching mods on and off and keeping them up to date, and a Mods panel in the lobby for the host’s gameplay mods.',
    features: [
      {
        title: 'A switch for every mod',
        text: 'Turn any mod on or off from the menu, or mid-match with F8. It takes effect straight away, with no restart.',
      },
      {
        title: 'Updates in one click',
        text: 'A red number on the Mods icon in the main menu says when your SanctuaryDB mods have updates. Click Update, or Update All, and they install and reload on the spot, with your settings kept.',
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
        title: 'Gameplay mods, picked by the host',
        text: 'The host switches on the mods for the match in the lobby’s Mods panel, and Start waits until everyone has the same copies. Every lobby starts vanilla, so you can still join anyone.',
      },
      {
        title: 'Play against community AIs',
        text: 'Drop an AI author’s folder in as it is, and the host can give each AI seat its own AI from the lobby. Plain “AI” is still the game’s own.',
      },
      {
        title: 'Spots a bad install',
        text: 'A zip nobody extracted, or a mod one folder too deep, shows up on the Mods page with what’s wrong.',
      },
    ],
    keys: 'F8 opens it, in the menu or mid-match',
  },
  {
    id: 'SanctuaryHud',
    name: 'SanctuaryDB HUD',
    version: '0.16.1',
    tagline:
      'A mini-map, a proper economy readout, reclaim values, build timers, alerts and post-match stats.',
    features: [
      {
        title: 'A mini-map',
        text: 'The one thing the game is missing. Fog where you can’t see, every contact you can, and click or drag to move the camera.',
      },
      {
        title: 'Your economy at a glance',
        text: 'Alloy and energy stored, in, out and net per second, how long until you run dry, how fast your builds really go when you stall, and what a full store is wasting.',
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
      {
        title: 'The whole match, afterwards',
        text: 'When the game ends, a stats window for every army: score, resources gathered, spent and wasted, units built, lost and killed, with charts over time.',
      },
      {
        title: 'Quit from the result screen',
        text: 'A Quit button beside the result and the match stats takes you straight back to the menu.',
      },
      {
        title: 'Every panel your size',
        text: 'Drag the grip in a panel’s corner to resize it: the economy strip, commander, bottom panels or mini-map. Each one remembers its size.',
      },
      {
        title: 'Optional extras',
        text: 'Switch on the ones you want: cursors that show what a right-click will do, waypoints and rally points you can drag, a build queue you reorder by dragging, Ctrl-A for every unit of the selected types, Delete asking for a second press before it blows up your commander, and a match clock.',
      },
    ],
    keys: 'F10 shows and hides it · F2 the mini-map · F3 the match stats',
  },
  {
    id: 'EcoManager',
    name: 'Eco Manager',
    version: '0.9.1',
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
      {
        title: 'Sized to fit',
        text: 'Drag the grip in either panel’s corner to make it bigger or smaller. It stays that size next match.',
      },
    ],
  },
  {
    id: 'IdleEngineers',
    name: 'Idle Engineers',
    version: '0.7.1',
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
        text: 'It disappears completely when nothing is idle. Put it wherever you like, drag its corner to the size you want, and lock it there.',
      },
    ],
  },
  {
    id: 'BuildHotkeys',
    name: 'Build Hotkeys',
    version: '0.5.1',
    tagline:
      'One key per kind of unit, the same on every faction, and the game’s own keys wherever you want them.',
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
        text: 'Pause and repeat-build your selection, and Escape stops your factories, as in FAF. The pause menu can move to a key you won’t hit by accident.',
      },
      {
        title: 'Move any of the game’s keys',
        text: 'Every game action — orders, control groups, camera, chat, game speed — listed with its key. Type a new one, swap two, or unbind it. Take the mod out and the game’s own keys come back exactly.',
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
    version: '0.4.0',
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
        title: 'Your stats and replay on the match page',
        text: 'Switch on uploads and every ranked game’s stats and replay land on its ladder page, for anyone to look through or download. Off until you choose.',
      },
      {
        title: 'Nothing to set up',
        text: 'Install it and play ranked. It only ever touches two-player Steam lobbies that match an open ladder game.',
      },
    ],
  },
  {
    id: 'ReplayManager',
    name: 'Replay Manager',
    version: '0.5.1',
    tagline: 'Watch replays properly: any player’s view, no fog, every economy.',
    features: [
      {
        title: 'Any seat, no fog',
        text: 'Watch through any player’s eyes, or every army at once with the fog lifted.',
      },
      {
        title: 'Compare economies',
        text: 'Every army’s economy side by side, with whole-game totals, so you can see where it was won. Click a column to sort by it.',
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
    version: '0.2.1',
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
        text: 'Every switch is on a small in-game panel, so you never have to leave the match. It stays up even with the whole HUD switched off.',
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

/** Self-contained: the mod plus BepInEx and the loader it runs on. Only the
 *  Mod Manager's is offered — it's the one base install, and the loader has
 *  no release of its own any more; it ships inside this zip. Other mods
 *  stopped shipping a Standalone with Mod Manager 0.7.0, and their older ones
 *  each carry a copy of the loader that would downgrade it if extracted
 *  after the manager. */
export const standaloneHref = (m: Mod): string =>
  `${MODS_REPO}/releases/download/${releaseTag(m)}/${releaseTag(m)}-Standalone.zip`;

/** Just the mod itself, for an install that already has the Mod Manager —
 *  zipped as a folder so it drops into the same place as everything else.
 *  The Mod Manager has one too (the manager and the loader, without
 *  BepInEx), but nothing here offers it: the manager is what you start from,
 *  so its link is always the Standalone. */
export const managerHref = (m: Mod): string =>
  `${MODS_REPO}/releases/download/${releaseTag(m)}/${releaseTag(m)}-ModManager.zip`;

/** Gameplay mods change the match itself, so they aren't UI mods: the lobby
 *  host switches one on and everyone playing needs the same copy. They stay
 *  out of MODS, and so out of the everything zip, which is the set you can
 *  just switch on; /gameplay-mods lists them, with how each one plays.
 *
 *  Zone Control is played on its own map, so its download carries the map
 *  too. */
export const ZONE_CONTROL: Mod = {
  id: 'ZoneControl',
  name: 'Zone Control',
  version: '0.5.1',
  tagline:
    'Forged Alliance’s Zone Control: no commanders, no building — every zone you hold sends you units.',
  features: [
    {
      title: 'Take the map zone by zone',
      text: 'Destroy a zone’s turret, then hold it with more units than anyone else. Lose every zone and you’re out.',
    },
    {
      title: 'Kills buy power',
      text: 'Levels bring better units, T4 heroes and artillery in your base; money buys upgrades and kamikazes.',
    },
  ],
};

export const ZONE_CONTROL_MAP = 'Zone Control for FAF 8P V2';

/** The mod and its map in one zip, laid out to extract straight into
 *  `engine`. The release's -ModManager.zip is the mod alone, for someone who
 *  already has the map. */
export const zoneControlHref = (): string =>
  `${MODS_REPO}/releases/download/${releaseTag(ZONE_CONTROL)}/${releaseTag(ZONE_CONTROL)}-WithMap.zip`;

/** Phantom-X is Lua only, with no map: its release's -ModManager.zip is the
 *  whole download, and it plays on any map. Its panel is drawn by the Mod API,
 *  and since 0.2.1 its host side runs on the API's Lua helpers, which is why
 *  it needs Mod Manager 0.13.0. Zone Control 0.5.1 needs the same. */
export const PHANTOM_X: Mod = {
  id: 'PhantomX',
  name: 'Phantom-X',
  version: '0.2.1',
  tagline:
    'Supreme Commander’s Phantom-X: everyone starts allied, until some of you secretly become phantoms.',
  features: [
    {
      title: 'Trust nobody',
      text: 'A few minutes in, phantoms are chosen in secret and fed a share of everyone else’s income. The last one standing wins.',
    },
    {
      title: 'Hunt them down',
      text: 'The innocents win by killing every phantom. Paladins hunt with a smaller bonus, which a phantom can pay to take away.',
    },
    {
      title: 'Alliances on a panel',
      text: 'Break or offer alliances, vote, volunteer and mark suspects from one panel, with notices when roles are revealed.',
    },
    {
      title: 'The whole story in the replay',
      text: 'Watch the match back and the panel shows everyone’s role, with a switch to keep the spoilers hidden.',
    },
    {
      title: 'Set it up your way',
      text: 'How many phantoms, when they’re picked, their bonus, paladins and reveals: 13 lobby options, with the original’s defaults.',
    },
    {
      title: 'Any map, three or more',
      text: 'Best with three or more players. AIs stay allied until someone breaks with them.',
    },
  ],
};

/** Unit Restrictions is Lua only too, with no map. Its unit picker in the
 *  lobby is the Mod API's, which is why it needs Mod Manager 0.12.0. */
export const UNIT_RESTRICTIONS: Mod = {
  id: 'UnitRestrictions',
  name: 'Unit Restrictions',
  version: '0.1.1',
  tagline: 'Take units out of the match: a whole section like air, or just one faction’s tank.',
  features: [
    {
      title: 'Switch off a whole section',
      text: 'No land, no air, no naval or no experimentals, one switch each. Engineers and commanders always stay, and so do the factories that build them.',
    },
    {
      title: 'Pick units from a grid',
      text: 'A column per faction and a row per kind of unit. Restrict just the EDA Puma, every T1 tank, or a whole faction or tech level in one click.',
    },
    {
      title: 'Everyone sees the list',
      text: 'Other players open the same grid in the lobby, so nobody finds out mid-match that their favourite unit is gone.',
    },
    {
      title: 'Gone from every build menu',
      text: 'Restricted units can’t be built, and the host turns one down if anything queues it anyway, AI included.',
    },
  ],
};

/** Remmy's Balance Patch is Lua only too: its release's -ModManager.zip is
 *  the whole download. Unlike the modes above it changes the units rather
 *  than the rules, so it has a page of its own, /balance-patch, listing every
 *  change, and the unit database can show its numbers. The version here must
 *  match src/lib/balance-patch.json, the change list the site was built from
 *  (`npm run balance-patch`); a test checks they agree. */
export const BALANCE_PATCH: Mod = {
  id: 'BalancePatch',
  name: 'Remmy’s Balance Patch',
  version: '0.1.0',
  tagline:
    'A community balance pass for Sanctuary: a faster, map-driven early game, bombers, artillery and anti-air that hit moving targets, shields that stop aircraft, and fixes for units that shot the ground.',
  features: [
    {
      title: 'Expanding matters',
      text: 'Commanders earn less, while T1 extractors and generators make more, so the map is worth taking. Upgrading a factory to T2 takes longer, so rushing T2 off the start doesn’t pay.',
    },
    {
      title: 'Shots that hit moving targets',
      text: 'Artillery, bombers, anti-air and the EDA and Guardian commanders’ missiles aim where a target is going, not where it was.',
    },
    {
      title: 'Engineers you can raid',
      text: 'Engineers have less than half their health, so a raid on an expansion pays off.',
    },
    {
      title: 'Land costs alloy, air costs energy',
      text: 'Land and naval units cost more alloy and less energy for the same total, and Chosen aircraft cost what the other factions’ do.',
    },
    {
      title: 'T2 beats its cost in T1',
      text: 'The Chosen Jager toned down, the other T2 raiders brought up, and the three T1 tanks and T1 artillery brought level.',
    },
    {
      title: 'Bugs fixed',
      text: 'One broken bomber no longer freezes other units’ targeting, aircraft can’t fire from inside a shield at what it covers, and the Chosen T2 point defence stops shooting the ground.',
    },
    {
      title: 'Every section is a switch',
      text: 'Nine lobby options, all on by default. The host can turn off any part of the patch, from the economy to the fixes.',
    },
  ],
};

/** Every gameplay mod on /gameplay-mods, in the order shown. */
export const GAMEPLAY_MODS: { mod: Mod; href: string; label: string }[] = [
  { mod: ZONE_CONTROL, href: zoneControlHref(), label: 'Download mod + map' },
  { mod: PHANTOM_X, href: managerHref(PHANTOM_X), label: 'Download' },
  { mod: UNIT_RESTRICTIONS, href: managerHref(UNIT_RESTRICTIONS), label: 'Download' },
  { mod: BALANCE_PATCH, href: managerHref(BALANCE_PATCH), label: 'Download' },
];
