// The gameplay mods page: Zone Control, Phantom-X and Unit Restrictions, the
// mods that change the match itself. Unlike the UI mods on /mods, one only runs when the
// lobby's host switches it on, and everyone in the match needs the same copy.
// The Mod Manager is the one step they share, so it comes first; after that
// each mode is a single card holding everything about it — download, set-up,
// rules, options and the people who made the Forged Alliance original — so
// the page reads one mode at a time.
//
// Versions and download links come from src/lib/mods.ts; the rules' numbers
// from src/lib/zone-control.ts, src/lib/phantom-x.ts and
// src/lib/unit-restrictions.ts, which copy them from each mod's own files. This page replaced /zone-control, which redirects here.

import { Link, createFileRoute } from '@tanstack/react-router';
import { ModCard } from '../components/ModCard';
import { CopyPath, StepHead } from '../components/ModInstall';
import { HeadStat, PageHead } from '../components/PageHead';
import {
  GAMEPLAY_MODS,
  MODS_REPO,
  PHANTOM_X,
  UNIT_RESTRICTIONS,
  ZONE_CONTROL,
  ZONE_CONTROL_MAP,
  mod,
  sourceHref,
  standaloneHref,
} from '../lib/mods';
import { LOBBY_OPTIONS as PX_OPTIONS } from '../lib/phantom-x';
import { LOBBY_OPTIONS as UR_OPTIONS } from '../lib/unit-restrictions';
import { LEVELS, LOBBY_OPTIONS, MAP_RELEASE_HREF, ORIGINAL_MAPS_HREF, SHOPS } from '../lib/zone-control';

export const Route = createFileRoute('/gameplay-mods')({
  head: () => ({
    meta: [
      { title: 'Gameplay Mods — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Gameplay mods for Sanctuary: Shattered Sun — Forged Alliance’s Zone Control and Phantom-X, rebuilt for Sanctuary, and Unit Restrictions. How to install them, switch them on in a lobby, and how each one plays.',
      },
    ],
  }),
  component: GameplayModsPage,
});

const MANAGER = mod('ModManager');

// Each mode's set-up and rules, under its card's features.
const GUIDES: Record<string, () => React.JSX.Element> = {
  [ZONE_CONTROL.id]: ZoneControlGuide,
  [PHANTOM_X.id]: PhantomXGuide,
  [UNIT_RESTRICTIONS.id]: UnitRestrictionsGuide,
};

function GameplayModsPage() {
  return (
    <>
      <PageHead
        eyebrow="Modding"
        title="Gameplay Mods"
        art="ladder"
        aside={<HeadStat value={GAMEPLAY_MODS.length} label="Gameplay mods" />}
      >
        Forged Alliance classics and lobby rules, rebuilt for Sanctuary. A gameplay mod changes the match
        itself: the host switches it on in the lobby, everyone playing gets the same rules, and every other
        lobby stays vanilla.
      </PageHead>
      <div className="toolbar">
        <span className="toolbar-summary">
          {GAMEPLAY_MODS.length} gameplay mods for Sanctuary: Shattered Sun, free and open source
        </span>
        <a className="toolbar-link" href={MODS_REPO} target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
      </div>

      <main className="mods-page gm-page">
        <aside className="mods-aside">
          <section className="mods-everything" aria-labelledby="gm-get">
            <div>
              <p className="mods-everything-kicker">Start here</p>
              <h2 id="gm-get">Mod Manager {MANAGER.version}</h2>
              <p>
                Gameplay mods run on the Mod Manager, which puts a <strong>Mods</strong> panel in every lobby.
                Everyone in the match needs it, at {MANAGER.version} or later.
              </p>
            </div>
            <a className="dl-btn" href={standaloneHref(MANAGER)}>
              Download the Mod Manager
            </a>
          </section>

          <div className="mods-where">
            <h2>Where the zips go</h2>
            <p>
              Your game&rsquo;s <code>engine</code> folder, the same place as every other mod. It&rsquo;s
              usually here:
            </p>
            <CopyPath />
            <p className="gm-tree">
              Inside it, they land in:
              <br />
              <code>SanctuaryMods\ZoneControl\</code>
              <br />
              <code>SanctuaryMods\PhantomX\</code>
              <br />
              <code>SanctuaryMods\UnitRestrictions\</code>
              <br />
              <code>Sanctuary_Data\Maps\Zone_Control_for_FAF_8P_V2\</code> (the map)
            </p>
          </div>

          <p className="mods-remove hint">
            Everyone in the match needs the same copies. To remove one, delete its folder.
          </p>
        </aside>

        <div className="mods-main">
          <section className="mods-step" aria-labelledby="gm-step-1">
            <StepHead n={1} id="gm-step-1">
              Get the latest Mod Manager
            </StepHead>
            <p className="mods-step-text">
              New to mods? Extract the Mod Manager&rsquo;s zip into your <code>engine</code> folder. Already
              have an older one? Extract this over the top, then restart the game once.
            </p>
            <p className="gm-step-actions">
              <a className="dl-btn" href={standaloneHref(MANAGER)}>
                Download the Mod Manager {MANAGER.version}
              </a>
              <Link to="/mods" className="gm-more">
                What else it does, and the UI mods
              </Link>
            </p>
          </section>

          <section className="mods-step" aria-labelledby="gm-step-2">
            <StepHead n={2} id="gm-step-2">
              Pick a mod
            </StepHead>
            <p className="mods-step-text">
              Each one below has everything in one place: the download, how to switch it on, and how it plays.
              Everyone in the match needs the same copy.
            </p>
            <nav className="gm-jump" aria-label="Gameplay mods on this page">
              {GAMEPLAY_MODS.map((g) => (
                <a key={g.mod.id} href={`#${g.mod.id}`}>
                  <strong>{g.mod.name}</strong>
                  <span>{g.mod.tagline}</span>
                </a>
              ))}
            </nav>
          </section>

          <div className="gm-mods">
            {GAMEPLAY_MODS.map((g) => {
              const Guide = GUIDES[g.mod.id];
              return (
                <ModCard key={g.mod.id} mod={g.mod} href={g.href} label={g.label}>
                  <Guide />
                </ModCard>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}

function ZoneControlGuide() {
  return (
    <div className="gm-guide">
      <section className="gm-section" aria-labelledby="zc-setup">
        <h4 id="zc-setup" className="gm-heading">
          Set it up
        </h4>
        <ol className="gm-steps">
          <li>
            Extract the zip into your <code>engine</code> folder. It holds the mod and its map, and lands both
            where the game looks for them. It needs Mod Manager 0.13.0 or later, for every player.
          </li>
          <li>
            Host a lobby and pick the map <strong>{ZONE_CONTROL_MAP}</strong>.
          </li>
          <li>
            Open <strong>Mods</strong> in the lobby, beside Settings. Switch on <strong>Zone Control</strong>{' '}
            and set its options.
          </li>
          <li>
            Start. The game waits until every player has the same copy, and says who&rsquo;s missing it.
          </li>
        </ol>
        <p className="mods-step-text hint">
          On any other map, Zone Control says so and the match plays normally.
        </p>
      </section>

      <section className="gm-section" aria-labelledby="zc-map">
        <h4 id="zc-map" className="gm-heading">
          The map
        </h4>
        <figure className="zc-map">
          <img
            src="/zone-control/map.png"
            width={512}
            height={512}
            loading="lazy"
            alt={`${ZONE_CONTROL_MAP} from above: a diamond of 53 square zones with eight numbered starts around its rim, each with a dark base square beside it`}
          />
          <figcaption>
            <p className="zc-map-name">{ZONE_CONTROL_MAP}</p>
            <ul className="zc-legend">
              <li>
                <span className="zc-swatch zc-swatch-zone" aria-hidden="true" />
                <strong>53 zones</strong>
                Each square is a zone, guarded by a turret until someone takes it.
              </li>
              <li>
                <span className="zc-swatch zc-swatch-start" aria-hidden="true">
                  1
                </span>
                <strong>8 starts</strong>
                You begin holding the zone with your number.
              </li>
              <li>
                <span className="zc-swatch zc-swatch-base" aria-hidden="true" />
                <strong>8 bases</strong>
                The dark square on the rim beside your start. Your shops and upgrader stand here, and your
                artillery once you earn it.
              </li>
            </ul>
            <p className="zc-map-note">
              The original Forged Alliance map, converted with free-to-share textures. Any mix of teams, up to
              eight players.
            </p>
          </figcaption>
        </figure>
      </section>

      <section className="gm-section" aria-labelledby="zc-rules">
        <h4 id="zc-rules" className="gm-heading">
          The rules
        </h4>
        <ul className="mod-features gm-rules">
          <li>
            <strong>No commanders, no building</strong>
            Your army is your territory. Every zone you hold sends you a unit every few seconds.
          </li>
          <li>
            <strong>Take a zone</strong>
            Destroy its turret, then hold it with 5 or more units, and more than anyone else. It becomes
            yours, with a turret of your own.
          </li>
          <li>
            <strong>Hold on to it</strong>
            Lost a zone? Walk 10 of your units back in with no enemies there and it&rsquo;s yours again.
          </li>
          <li>
            <strong>Last team standing</strong>
            Lose every zone and you&rsquo;re out. The last team with zones left wins.
          </li>
          <li>
            <strong>Kills earn money and levels</strong>
            Each kill pays, and more for a turret or a higher-level enemy. Enough kills and you level up.
          </li>
          <li>
            <strong>Levels bring bigger units</strong>
            Pumas, then Jackals, then Kodiaks, each level tougher than the last. From level 4, heroes and
            artillery (below).
          </li>
          <li>
            <strong>Shop from your base</strong>
            Move your base&rsquo;s upgrader onto a shop, or tell it to assist one, to buy. Attack upgrades
            make your units hit harder and last longer; defence upgrades toughen the turrets on your zones.
          </li>
          <li>
            <strong>Kamikazes</strong>A Kodiak with its guns off and a lot of armour. Send it into a crowd:
            three seconds after it dies, it blows up and wrecks everything nearby.
          </li>
        </ul>
      </section>

      <section className="gm-section" aria-labelledby="zc-levels">
        <h4 id="zc-levels" className="gm-heading">
          Levels
        </h4>
        <p className="mods-step-text">
          Heroes walk out of the zone you hold nearest your start. Artillery stands in your base, can&rsquo;t
          be destroyed, and reaches the whole map.
        </p>
        <div className="gm-table-wrap">
          <table className="gm-table">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Kills</th>
                <th scope="col">Insanity</th>
                <th scope="col">Your zones send</th>
                <th scope="col">And you get</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => (
                <tr key={l.level}>
                  <th scope="row">{l.level}</th>
                  <td className="num">{l.kills ? l.kills.toLocaleString('en') : '—'}</td>
                  <td className="num">{l.insane || '—'}</td>
                  <td>{l.units}</td>
                  <td>{l.bonus ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="gm-pair">
        <section className="gm-section" aria-labelledby="zc-shops">
          <h4 id="zc-shops" className="gm-heading">
            The shops
          </h4>
          <p className="mods-step-text hint">
            Told apart by their buildings. Each one costs more than the last; the banner lists the prices.
          </p>
          <table className="gm-table">
            <thead>
              <tr>
                <th scope="col">Building</th>
                <th scope="col">Sells</th>
                <th scope="col">Price</th>
              </tr>
            </thead>
            <tbody>
              {SHOPS.map((s) => (
                <tr key={s.looks}>
                  <th scope="row">{s.looks}</th>
                  <td>{s.sells}</td>
                  <td>{s.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="gm-section" aria-labelledby="zc-options">
          <h4 id="zc-options" className="gm-heading">
            Lobby options
          </h4>
          <p className="mods-step-text hint">The host sets these in the lobby&rsquo;s Mods panel.</p>
          <Options options={LOBBY_OPTIONS} />
        </section>
      </div>

      <section className="gm-section gm-credits" aria-labelledby="zc-credits">
        <h4 id="zc-credits" className="gm-heading">
          Made for Forged Alliance first
        </h4>
        <p>
          Zone Control is <strong>johnie102</strong>&rsquo;s game mode for Supreme Commander: Forged Alliance.
          The map is by <strong>Saya</strong>, <strong>AngryZealot</strong> and <strong>johnie102</strong>,
          with edits by <strong>Kasper</strong>; the eight-player version is johnie102&rsquo;s. The Forged
          Alliance Forever community has kept it playable ever since.
        </p>
        <p>
          This is a port. The rules and numbers follow johnie102&rsquo;s V2 wherever Sanctuary&rsquo;s units
          allow, and every change is noted beside the original&rsquo;s value in the mod&rsquo;s source. All
          credit for the idea goes to them. Thank you.
        </p>
        <p className="gm-credit-links">
          <a href={ORIGINAL_MAPS_HREF} target="_blank" rel="noreferrer">
            The original maps, on FAF&rsquo;s GitLab ↗
          </a>
          <a href={MAP_RELEASE_HREF} target="_blank" rel="noreferrer">
            The converted map ↗
          </a>
          <a href={sourceHref(ZONE_CONTROL)} target="_blank" rel="noreferrer">
            The mod&rsquo;s source ↗
          </a>
        </p>
      </section>
    </div>
  );
}

function PhantomXGuide() {
  return (
    <div className="gm-guide">
      <section className="gm-section" aria-labelledby="px-setup">
        <h4 id="px-setup" className="gm-heading">
          Set it up
        </h4>
        <ol className="gm-steps">
          <li>
            Extract the zip into your <code>engine</code> folder. It needs Mod Manager 0.13.0 or later, for
            every player.
          </li>
          <li>Host a lobby on any map. It&rsquo;s best with three or more players.</li>
          <li>
            Open <strong>Mods</strong> in the lobby, beside Settings. Switch on <strong>Phantom-X</strong> and
            set its options.
          </li>
          <li>
            Start. The game waits until every player has the same copy, and says who&rsquo;s missing it.
          </li>
        </ol>
      </section>

      <section className="gm-section" aria-labelledby="px-rules">
        <h4 id="px-rules" className="gm-heading">
          The rules
        </h4>
        <ul className="mod-features gm-rules">
          <li>
            <strong>Everyone starts allied</strong>
            Whatever the lobby&rsquo;s teams, and nobody shares resources.
          </li>
          <li>
            <strong>Phantoms, chosen in secret</strong>A few minutes in (8 by default), some players become
            phantoms: by a vote on how many, or a set number. Volunteers are more likely to be picked.
          </li>
          <li>
            <strong>Fed by everyone else</strong>
            Phantoms get extra storage and a share of the innocents&rsquo; combined income &mdash; more, the
            fewer innocents they&rsquo;re still allied with.
          </li>
          <li>
            <strong>Who wins</strong>A phantom wins by being the last one standing. The innocents win by
            killing every phantom.
          </li>
          <li>
            <strong>Paladins</strong>
            Innocents with a smaller share of the phantom bonus. A phantom can pay alloys to mark a suspected
            paladin and take its bonus away.
          </li>
          <li>
            <strong>Reveals</strong>
            Phantoms (or paladins, or both) are revealed at set times, to everyone or only to some. A
            player&rsquo;s role can be shown when they die.
          </li>
          <li>
            <strong>Phantom against phantom</strong>
            When only phantoms are left they turn on each other, and each gets back a share of the cost of
            what it kills.
          </li>
          <li>
            <strong>The Phantom-X panel</strong>
            Your role, your bonus and the timers, and every player with buttons to break or offer alliances
            (both sides have to offer peace), mark a paladin, vote and volunteer. Drag it, resize it, or fold
            it away.
          </li>
          <li>
            <strong>No peeking</strong>
            Each player&rsquo;s game is sent only what their role lets them know, and the host checks every
            request against the player who sent it.
          </li>
        </ul>
      </section>

      <section className="gm-section" aria-labelledby="px-options">
        <h4 id="px-options" className="gm-heading">
          Lobby options
        </h4>
        <p className="mods-step-text hint">
          The host sets these in the lobby&rsquo;s Mods panel. The defaults are the original&rsquo;s.
        </p>
        <Options options={PX_OPTIONS} columns />
      </section>

      <section className="gm-section gm-credits" aria-labelledby="px-credits">
        <h4 id="px-credits" className="gm-heading">
          Made for Forged Alliance first
        </h4>
        <p>
          Phantom-X is <strong>Novaprim3</strong>, <strong>Duck_42</strong>, <strong>mead</strong>,{' '}
          <strong>SpikeyNoob</strong> and <strong>Fichom</strong>&rsquo;s mod for Supreme Commander: Forged
          Alliance. This is a port of faf-phantomx v268. All credit for the idea goes to them. Thank you.
        </p>
        <p>
          AIs don&rsquo;t play the roles: they stay allied until someone breaks with them, and always accept
          peace. The original&rsquo;s meteors aren&rsquo;t included. So far it&rsquo;s been played against
          AIs, not yet in a match with several human players.
        </p>
        <p className="gm-credit-links">
          <a href={sourceHref(PHANTOM_X)} target="_blank" rel="noreferrer">
            The mod&rsquo;s source ↗
          </a>
        </p>
      </section>
    </div>
  );
}

function UnitRestrictionsGuide() {
  return (
    <div className="gm-guide">
      <section className="gm-section" aria-labelledby="ur-setup">
        <h4 id="ur-setup" className="gm-heading">
          Set it up
        </h4>
        <ol className="gm-steps">
          <li>
            Extract the zip into your <code>engine</code> folder. It needs Mod Manager 0.12.0 or later, for
            every player in the lobby.
          </li>
          <li>Host a lobby on any map.</li>
          <li>
            Open <strong>Mods</strong> in the lobby, beside Settings. Switch on{' '}
            <strong>Unit Restrictions</strong>, flip the sections you want gone, and open{' '}
            <strong>Choose restricted units</strong> for the rest.
          </li>
          <li>
            Start. The game waits until every player has the same copy, and says who&rsquo;s missing it.
          </li>
        </ol>
      </section>

      <section className="gm-section" aria-labelledby="ur-picker">
        <h4 id="ur-picker" className="gm-heading">
          The unit picker
        </h4>
        <ul className="mod-features gm-rules">
          <li>
            <strong>A grid per section</strong>
            Land, air, naval and structures. A column per faction, and a row per kind of unit under its tech
            level, each with its strategic icon and name.
          </li>
          <li>
            <strong>As narrow or as wide as you like</strong>
            Click a unit to restrict it alone, or a kind, a faction or a tech level to restrict all of it.
            Factories and their upgrades are there too.
          </li>
          <li>
            <strong>Faction mods included</strong>
            The list holds the game&rsquo;s units and those of any faction mod picked for the match.
          </li>
        </ul>
      </section>

      <section className="gm-section" aria-labelledby="ur-options">
        <h4 id="ur-options" className="gm-heading">
          Lobby options
        </h4>
        <p className="mods-step-text hint">
          The host sets these in the lobby&rsquo;s Mods panel. Everything starts unrestricted.
        </p>
        <Options options={UR_OPTIONS} />
      </section>

      <section className="gm-section" aria-labelledby="ur-notes">
        <h4 id="ur-notes" className="gm-heading">
          Good to know
        </h4>
        <p>
          This is the first release. The lobby side is tested; the restrictions themselves haven&rsquo;t yet
          been played in a match, and the AI may keep trying to build what it can&rsquo;t.
        </p>
        <p className="gm-credit-links">
          <a href={sourceHref(UNIT_RESTRICTIONS)} target="_blank" rel="noreferrer">
            The mod&rsquo;s source ↗
          </a>
        </p>
      </section>
    </div>
  );
}

function Options({
  options,
  columns = false,
}: {
  options: { label: string; value: string; text: string }[];
  /** Two columns, for a list long enough to need them. */
  columns?: boolean;
}) {
  return (
    <dl className={columns ? 'gm-options gm-options-cols' : 'gm-options'}>
      {options.map((o) => (
        <div key={o.label}>
          <dt>
            {o.label} <span>{o.value}</span>
          </dt>
          <dd>{o.text}</dd>
        </div>
      ))}
    </dl>
  );
}
