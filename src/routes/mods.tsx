// The mods page: every mod in the sanctuary-mods repo, sold on what it does
// for your game. The quickest install comes first — everything in one zip —
// then the pick-and-choose route as two steps: the Mod Manager, then the mods
// you want. There's no way to run a mod without the manager: other mods'
// Standalone zips each carried an old copy of the loader, so they were
// dropped (see standaloneHref). The catalogue lives in src/lib/mods.ts,
// shared with the Play page's download card, so a version bump moves both.
// Gameplay mods (Zone Control, Phantom-X) sit under the steps, in a section of
// their own: the host picks them per match, so they aren't part of either step.

import { Link, createFileRoute } from '@tanstack/react-router';
import { ModGallery, hasShots } from '../components/ModGallery';
import { CopyPath, StepHead } from '../components/ModInstall';
import { HeadStat, PageHead } from '../components/PageHead';
import {
  EVERYTHING_HREF,
  GAMEPLAY_MODS,
  MODS,
  MODS_REPO,
  managerHref,
  mod,
  releaseNotes,
  sourceHref,
  standaloneHref,
  type Mod,
} from '../lib/mods';

export const Route = createFileRoute('/mods')({
  head: () => ({
    meta: [
      { title: 'Mods — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Free, open-source mods for Sanctuary: Shattered Sun — a mini-map and economy HUD, build hotkeys, idle engineers, fog-free replays, the ladder reporter, and the Zone Control and Phantom-X game modes.',
      },
    ],
  }),
  component: ModsPage,
});

const MANAGER = mod('ModManager');
const ADD_ONS = MODS.filter((m) => m !== MANAGER);

function ModsPage() {
  return (
    <>
      <PageHead
        eyebrow="Modding"
        title="Mods"
        art="mods"
        aside={<HeadStat value={MODS.length} label="Free mods" />}
      >
        A mini-map, a proper economy readout, one-key building, idle alerts, fog-free replays and more &mdash;
        free and open source. None of them change the game&rsquo;s rules, so you can still play online with
        anyone, modded or not &mdash; and when you want something different, there are{' '}
        <a href="#gameplay-mods">gameplay mods</a> like <Link to="/zone-control">Zone Control</Link> and
        Phantom-X.
      </PageHead>
      <div className="toolbar">
        <span className="toolbar-summary">
          {MODS.length} mods for Sanctuary: Shattered Sun, free and open source
        </span>
        <a className="toolbar-link" href={MODS_REPO} target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
      </div>
      {/* Two columns: the catalogue on the left, and on the right the quickest
          install and where every zip goes, kept in view while you browse. On
          a narrow screen the right column comes first. */}
      <main className="mods-page">
        <aside className="mods-aside">
          <section className="mods-everything" aria-labelledby="mods-everything">
            <div>
              <p className="mods-everything-kicker">Quickest install</p>
              <h2 id="mods-everything">Get everything</h2>
              <p>
                The Mod Manager and all {ADD_ONS.length} mods in one zip. Extract it, launch the game, and
                every mod is on &mdash; switch off any you don&rsquo;t want from <strong>Mods</strong> in the
                game menu, or <kbd>F8</kbd> mid-match.
              </p>
            </div>
            <a className="dl-btn" href={EVERYTHING_HREF} download>
              Download everything
            </a>
          </section>

          <div className="mods-where">
            <h2>Where the zips go</h2>
            <p>
              Every zip here installs the same way: extract it into your game&rsquo;s <code>engine</code>{' '}
              folder, so <code>winhttp.dll</code> sits next to <code>Sanctuary.exe</code>. It&rsquo;s usually
              here:
            </p>
            <CopyPath />
          </div>

          <p className="mods-remove hint">
            To remove the lot, delete <code>engine\winhttp.dll</code>, <code>engine\BepInEx\</code> and{' '}
            <code>engine\SanctuaryMods\</code> &mdash; Steam&rsquo;s file check never knows they were there.
          </p>
        </aside>

        <div className="mods-main">
          <p className="mods-or">or pick and choose</p>

          <section className="mods-step" aria-labelledby="mods-step-1">
            <StepHead n={1} id="mods-step-1">
              Install the Mod Manager
            </StepHead>
            <ModCard mod={MANAGER} href={standaloneHref(MANAGER)} label="Download the Mod Manager" />
          </section>

          <section className="mods-step" aria-labelledby="mods-step-2">
            <StepHead n={2} id="mods-step-2">
              Add the mods you want
            </StepHead>
            <p className="mods-step-text">
              Each <strong>Download</strong> below is a small zip for the same <code>engine</code> folder.
              Launch the game and it&rsquo;s on &mdash; switch it off or change its settings from{' '}
              <strong>Mods</strong> in the game menu, or <kbd>F8</kbd> mid-match.
            </p>
            <div className="mod-list">
              {ADD_ONS.map((m) => (
                <ModCard key={m.id} mod={m} href={managerHref(m)} label="Download" addOn />
              ))}
            </div>
          </section>

          {/* Not a third step: a gameplay mod changes the match, so it's the
              host's pick in the lobby rather than something you just switch
              on — and so not in the everything zip either. */}
          <section className="mods-modes" id="gameplay-mods" aria-labelledby="mods-modes">
            <h2 id="mods-modes" className="mods-or">
              gameplay mods
            </h2>
            <p className="mods-step-text">
              A gameplay mod changes the match itself, so the host switches it on in the lobby&rsquo;s{' '}
              <strong>Mods</strong> panel, and everyone playing needs the same copy. Outside those lobbies the
              game stays vanilla. They need the Mod Manager above, and aren&rsquo;t in the everything zip.
            </p>
            <div className="mod-list">
              {GAMEPLAY_MODS.map((g) => (
                <ModCard key={g.mod.id} mod={g.mod} href={g.href} label={g.label} addOn page={g.page} />
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function ModCard({
  mod,
  href,
  label,
  addOn = false,
  page,
}: {
  mod: Mod;
  href: string;
  label: string;
  /** One of the mods that go on top of the Mod Manager: a quieter download
   *  button, so the manager's stays the one that reads as step one. */
  addOn?: boolean;
  /** A page of its own on this site, for a mod with more to explain. */
  page?: '/zone-control';
}) {
  return (
    <article className="mod-entry" id={mod.id}>
      <header className="mod-entry-head">
        <span className="mod-glyph" aria-hidden="true">
          {monogram(mod.name)}
        </span>
        <div className="mod-entry-title">
          <h3>
            {mod.name} <span className="mod-version">v{mod.version}</span>
          </h3>
          <p className="mod-tagline">{mod.tagline}</p>
        </div>
        <a className={addOn ? 'dl-btn ghost' : 'dl-btn'} href={href} aria-label={`Download ${mod.name}`}>
          {label}
        </a>
      </header>

      {/* With screenshots, they sit beside the features; without, the
          features take the card's full width. */}
      <div className={hasShots(mod.id) ? 'mod-body has-shots' : 'mod-body'}>
        <ModGallery modId={mod.id} name={mod.name} />
        <ul className="mod-features">
          {mod.features.map((f) => (
            <li key={f.title}>
              <strong>{f.title}</strong>
              {f.text}
            </li>
          ))}
        </ul>
      </div>

      {mod.credit && <p className="mod-credit">{mod.credit}</p>}

      <footer className="mod-entry-foot">
        {mod.keys && <span className="mod-keys">{mod.keys}</span>}
        <span className="mod-links">
          {page && <Link to={page}>How it plays and how to set it up</Link>}
          <a href={sourceHref(mod)} target="_blank" rel="noreferrer">
            Source
          </a>
          <a href={releaseNotes(mod)} target="_blank" rel="noreferrer">
            Release notes
          </a>
        </span>
      </footer>
    </article>
  );
}

// Two letters for a mod's tile: the initials of its first two words, or the
// first two letters of a one-word name ("Mod Manager" → MM, "Minimap" → MI).
function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}
