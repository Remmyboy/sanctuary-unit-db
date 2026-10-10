// The UI mods page: every client-side mod in the sanctuary-mods repo, sold on
// what it does for your game. The quickest install comes first — everything in one zip —
// then the pick-and-choose route as two steps: the Mod Manager, then the mods
// you want. There's no way to run a mod without the manager: other mods'
// Standalone zips each carried an old copy of the loader, so they were
// dropped (see standaloneHref). The catalogue lives in src/lib/mods.ts,
// shared with the Play page's download card, so a version bump moves both.
// Once installed, the Mod Manager updates the rest itself from the game's
// Mods page, so the rail says so: this page is for the first install.
// Gameplay mods (Zone Control, Phantom-X, Unit Restrictions) have a page of their own,
// /gameplay-mods: the host picks them per match, so they install differently.

import { Link, createFileRoute } from '@tanstack/react-router';
import { ModCard } from '../components/ModCard';
import { CopyPath, LINUX_LAUNCH_OPTIONS, StepHead } from '../components/ModInstall';
import { HeadStat, PageHead } from '../components/PageHead';
import { EVERYTHING_HREF, MODS, MODS_REPO, managerHref, mod, standaloneHref } from '../lib/mods';

export const Route = createFileRoute('/mods')({
  head: () => ({
    meta: [
      { title: 'UI Mods — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Free, open-source UI mods for Sanctuary: Shattered Sun — a mini-map and economy HUD, build hotkeys, idle engineers, fog-free replays and the ladder reporter.',
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
        title="UI Mods"
        art="mods"
        aside={<HeadStat value={MODS.length} label="Free mods" />}
      >
        A mini-map, a proper economy readout, one-key building, idle alerts, fog-free replays and more &mdash;
        free and open source. None of them change the game&rsquo;s rules, so you can still play online with
        anyone, modded or not &mdash; and when you want something different, there are{' '}
        <Link to="/gameplay-mods">gameplay mods</Link>.
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

          <section className="mods-updates" aria-labelledby="mods-updates">
            <h2 id="mods-updates">Update from the game</h2>
            <p>
              Already installed? A red number on <strong>Mods</strong> in the main menu means updates are
              waiting: open it and hit <strong>Update All</strong>. Settings are kept.
            </p>
            <p className="hint">On Mod Manager 0.13.0 or older, download it once more by hand first.</p>
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

          <div className="mods-where">
            <h2>On Linux?</h2>
            <p>
              Set the launch options. In Steam, go to <strong>Sanctuary</strong> &rarr;{' '}
              <strong>Properties</strong> &rarr; <strong>General</strong> &rarr;{' '}
              <strong>Launch Options</strong> and enter:
            </p>
            <CopyPath text={LINUX_LAUNCH_OPTIONS} />
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
        </div>
      </main>
    </>
  );
}
