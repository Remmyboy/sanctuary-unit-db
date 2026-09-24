// The mods page: every mod in the sanctuary-mods repo, sold on what it does
// for your game. The quickest install comes first — everything in one zip —
// then the pick-and-choose route as two steps: the Mod Manager, then the mods
// you want. The Standalone zips are tucked into each card's footer for the
// few who only want one mod. The catalogue lives in src/lib/mods.ts, shared
// with the Play page's download card, so a version bump moves both.

import { useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { copyText } from '../lib/clipboard';
import { HeadStat, PageHead } from '../components/PageHead';
import {
  ENGINE_PATH,
  EVERYTHING_HREF,
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
          'Free, open-source mods for Sanctuary: Shattered Sun — a mini-map and economy HUD, build hotkeys, idle engineers, fog-free replays and the ladder reporter.',
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
        anyone, modded or not.
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
            <p className="mods-step-text hint">
              Only want one mod, without the Mod Manager? Take its <strong>Standalone zip</strong> from the
              foot of its card instead &mdash; it has everything it needs built in.
            </p>
            <div className="mod-list">
              {ADD_ONS.map((m) => (
                <ModCard key={m.id} mod={m} href={managerHref(m)} label="Download" standalone />
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function StepHead({ n, id, children }: { n: number; id: string; children: ReactNode }) {
  return (
    <div className="mods-step-head">
      <span className="mods-step-num" aria-hidden="true">
        {n}
      </span>
      <h2 id={id}>{children}</h2>
    </div>
  );
}

function CopyPath() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="install-path">
      <code>{ENGINE_PATH}</code>
      <button
        type="button"
        className="linkish"
        onClick={async () => {
          if (await copyText(ENGINE_PATH)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}

function ModCard({
  mod,
  href,
  label,
  standalone = false,
}: {
  mod: Mod;
  href: string;
  label: string;
  /** Offer the Standalone zip in the footer. Not for the Mod Manager, whose
   *  Standalone is already its main button. */
  standalone?: boolean;
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
        <a className={standalone ? 'dl-btn ghost' : 'dl-btn'} href={href} aria-label={`Download ${mod.name}`}>
          {label}
        </a>
      </header>

      <ul className="mod-features">
        {mod.features.map((f) => (
          <li key={f.title}>
            <strong>{f.title}</strong>
            {f.text}
          </li>
        ))}
      </ul>

      <footer className="mod-entry-foot">
        {mod.keys && <span className="mod-keys">{mod.keys}</span>}
        <span className="mod-links">
          {standalone && (
            <a
              href={standaloneHref(mod)}
              title="This mod with everything it needs, for using it without the Mod Manager"
            >
              Standalone zip
            </a>
          )}
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
