// Zone Control: a game mode, so unlike the add-ons on /mods it needs three
// things before anyone can play — the Mod Manager, the mod and its map on
// every player's machine, and the host switching it on in the lobby with that
// map picked. The page walks those steps first, then shows the board and the
// rules, and ends with the people who made the original for Forged Alliance.
//
// Versions and download links come from src/lib/mods.ts; the rules' numbers
// from src/lib/zone-control.ts, which copies them from the mod's balance.lua.

import { Link, createFileRoute } from '@tanstack/react-router';
import { CopyPath, StepHead } from '../components/ModInstall';
import { HeadStat, PageHead } from '../components/PageHead';
import {
  MODS_REPO,
  ZONE_CONTROL,
  ZONE_CONTROL_MAP,
  mod,
  releaseNotes,
  sourceHref,
  standaloneHref,
  zoneControlHref,
} from '../lib/mods';
import { LEVELS, LOBBY_OPTIONS, MAP_RELEASE_HREF, ORIGINAL_MAPS_HREF, SHOPS } from '../lib/zone-control';

export const Route = createFileRoute('/zone-control')({
  head: () => ({
    meta: [
      { title: 'Zone Control — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Forged Alliance’s Zone Control for Sanctuary: Shattered Sun — no commanders, no building, every zone you hold sends you units. The mod and its 8-player map in one download.',
      },
    ],
  }),
  component: ZoneControlPage,
});

const MANAGER = mod('ModManager');

function ZoneControlPage() {
  return (
    <>
      <PageHead
        eyebrow="Game mode"
        title="Zone Control"
        art="ladder"
        aside={
          <>
            <HeadStat value={53} label="Zones" />
            <HeadStat value={8} label="Players" />
          </>
        }
      >
        The Forged Alliance classic, rebuilt for Sanctuary. No commanders and no building: every zone you hold
        sends you units. Take the board zone by zone, and turn kills into heroes and artillery.
      </PageHead>
      <div className="toolbar">
        <span className="toolbar-summary">
          A gameplay mod and its map, in one zip &middot; v{ZONE_CONTROL.version}
        </span>
        <a className="toolbar-link" href={sourceHref(ZONE_CONTROL)} target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
      </div>

      <main className="mods-page zc-page">
        <aside className="mods-aside">
          <section className="mods-everything" aria-labelledby="zc-get">
            <div>
              <p className="mods-everything-kicker">Mod + map</p>
              <h2 id="zc-get">Get Zone Control</h2>
              <p>
                The Zone Control mod and the <strong>{ZONE_CONTROL_MAP}</strong> map in one zip. Extract it
                into your <code>engine</code> folder and both land where the game looks for them.
              </p>
            </div>
            <a className="dl-btn" href={zoneControlHref()}>
              Download Zone Control
            </a>
            <p className="zc-get-meta">
              v{ZONE_CONTROL.version} &middot; 15 MB &middot;{' '}
              <a href={releaseNotes(ZONE_CONTROL)} target="_blank" rel="noreferrer">
                Release notes
              </a>
            </p>
          </section>

          <div className="mods-where">
            <h2>Where the zip goes</h2>
            <p>
              Your game&rsquo;s <code>engine</code> folder, the same place as every other mod. It&rsquo;s
              usually here:
            </p>
            <CopyPath />
            <p className="zc-tree">
              <code>SanctuaryMods\ZoneControl\</code> the mod
              <br />
              <code>Sanctuary_Data\Maps\Zone_Control_for_FAF_8P_V2\</code> the map
            </p>
          </div>

          <p className="mods-remove hint">
            Everyone in the match needs the same zip. To remove it, delete those two folders.
          </p>
        </aside>

        <div className="mods-main">
          <section className="mods-step" aria-labelledby="zc-step-1">
            <StepHead n={1} id="zc-step-1">
              Get the latest Mod Manager
            </StepHead>
            <p className="mods-step-text">
              Zone Control runs on the <strong>Mod Manager {MANAGER.version}</strong>, which lets a
              lobby&rsquo;s host switch gameplay mods on. New to mods? Extract its zip into your{' '}
              <code>engine</code> folder. Already have an older one? Extract this over the top, then restart
              the game once.
            </p>
            <p className="zc-step-actions">
              <a className="dl-btn" href={standaloneHref(MANAGER)}>
                Download the Mod Manager {MANAGER.version}
              </a>
              <Link to="/mods" className="zc-more">
                What else it does, and more mods
              </Link>
            </p>
          </section>

          <section className="mods-step" aria-labelledby="zc-step-2">
            <StepHead n={2} id="zc-step-2">
              Add Zone Control to your Sanctuary mods
            </StepHead>
            <p className="mods-step-text">
              Extract the Zone Control zip into the same <code>engine</code> folder. It adds the mod to{' '}
              <code>SanctuaryMods</code>, where it shows up under <strong>Gameplay Mods</strong> on the Mods
              page, and puts the map in with the game&rsquo;s own. Everyone who plays needs this same zip.
            </p>
            <p className="zc-step-actions">
              <a className="dl-btn ghost" href={zoneControlHref()}>
                Download Zone Control {ZONE_CONTROL.version}
              </a>
            </p>
          </section>

          <section className="mods-step" aria-labelledby="zc-step-3">
            <StepHead n={3} id="zc-step-3">
              Turn it on with the Zone Control map
            </StepHead>
            <ol className="zc-steps">
              <li>
                Host a lobby and pick the map <strong>{ZONE_CONTROL_MAP}</strong>.
              </li>
              <li>
                Open <strong>Mods</strong> in the lobby, beside Settings. Switch on{' '}
                <strong>Zone Control</strong> and set its options.
              </li>
              <li>
                Start. The game waits until every player has the same copy, and says who&rsquo;s missing it.
              </li>
            </ol>
            <p className="mods-step-text hint">
              Every lobby starts without gameplay mods, so it&rsquo;s only on when the host picks it. On any
              other map, Zone Control says so and the match plays normally.
            </p>
          </section>

          <section className="zc-section" aria-labelledby="zc-map">
            <h2 id="zc-map" className="zc-heading">
              The map
            </h2>
            <figure className="zc-map">
              <img
                src="/zone-control/map.png"
                width={512}
                height={512}
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
                  The original Forged Alliance map, converted with free-to-share textures. Any mix of teams,
                  up to eight players.
                </p>
              </figcaption>
            </figure>
          </section>

          <section className="zc-section" aria-labelledby="zc-rules">
            <h2 id="zc-rules" className="zc-heading">
              How it plays
            </h2>
            <ul className="mod-features zc-rules">
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
                make your units hit harder and last longer; defence upgrades toughen the turrets on your
                zones.
              </li>
              <li>
                <strong>Kamikazes</strong>A Kodiak with its guns off and a lot of armour. Send it into a
                crowd: three seconds after it dies, it blows up and wrecks everything nearby.
              </li>
            </ul>
          </section>

          <section className="zc-section" aria-labelledby="zc-levels">
            <h2 id="zc-levels" className="zc-heading">
              Levels
            </h2>
            <p className="mods-step-text">
              Heroes walk out of the zone you hold nearest your start. Artillery stands in your base,
              can&rsquo;t be destroyed, and reaches the whole map.
            </p>
            <div className="zc-table-wrap">
              <table className="zc-table">
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

          <div className="zc-pair">
            <section className="zc-section" aria-labelledby="zc-shops">
              <h2 id="zc-shops" className="zc-heading">
                The shops
              </h2>
              <p className="mods-step-text hint">
                Told apart by their buildings. Each one costs more than the last; the banner lists the prices.
              </p>
              <table className="zc-table">
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

            <section className="zc-section" aria-labelledby="zc-options">
              <h2 id="zc-options" className="zc-heading">
                Lobby options
              </h2>
              <p className="mods-step-text hint">The host sets these in the lobby&rsquo;s Mods panel.</p>
              <dl className="zc-options">
                {LOBBY_OPTIONS.map((o) => (
                  <div key={o.label}>
                    <dt>
                      {o.label} <span>{o.value}</span>
                    </dt>
                    <dd>{o.text}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>

          <section className="zc-section zc-credits" aria-labelledby="zc-credits">
            <h2 id="zc-credits" className="zc-heading">
              Made for Forged Alliance first
            </h2>
            <p>
              Zone Control is <strong>johnie102</strong>&rsquo;s game mode for Supreme Commander: Forged
              Alliance. The map is by <strong>Saya</strong>, <strong>AngryZealot</strong> and{' '}
              <strong>johnie102</strong>, with edits by <strong>Kasper</strong>; the eight-player version is
              johnie102&rsquo;s. The Forged Alliance Forever community has kept it playable ever since.
            </p>
            <p>
              This is a port. The rules and numbers follow johnie102&rsquo;s V2 wherever Sanctuary&rsquo;s
              units allow, and every change is noted beside the original&rsquo;s value in the mod&rsquo;s
              source. All credit for the idea goes to them. Thank you.
            </p>
            <p className="zc-credit-links">
              <a href={ORIGINAL_MAPS_HREF} target="_blank" rel="noreferrer">
                The original maps, on FAF&rsquo;s GitLab ↗
              </a>
              <a href={MAP_RELEASE_HREF} target="_blank" rel="noreferrer">
                The converted map ↗
              </a>
              <a href={`${MODS_REPO}/tree/main/ZoneControl`} target="_blank" rel="noreferrer">
                The mod&rsquo;s source ↗
              </a>
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
