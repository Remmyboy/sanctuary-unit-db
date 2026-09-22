// The mods page: every mod in the sanctuary-mods repo, sold on what it does
// for your game. It reads as two steps — install the Mod Manager, then add
// the mods you want — because that is the install nearly everyone wants, and
// the Standalone zips are tucked into each card's footer for the few who only
// want one mod. The catalogue lives in src/lib/mods.ts, shared with the Play
// page's download card, so a version bump moves both.

import { useState, type ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { copyText } from '../lib/clipboard';
import {
  ENGINE_PATH,
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
      <div className="toolbar">
        <span className="toolbar-summary">
          Mods · {MODS.length} for Sanctuary: Shattered Sun, free and open source
        </span>
        <a className="toolbar-link" href={MODS_REPO} target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
      </div>
      <main className="mods-page">
        <header className="mods-hero">
          <h1>Mods for Sanctuary: Shattered Sun</h1>
          <p>
            A mini-map, a proper economy readout, one-key building, idle alerts, fog-free replays and more
            &mdash; free and open source. None of them change the game&rsquo;s rules, so you can still play
            online with anyone, modded or not.
          </p>
        </header>

        <section className="mods-step" aria-labelledby="mods-step-1">
          <StepHead n={1} id="mods-step-1">
            Install the Mod Manager
          </StepHead>
          <ModCard mod={MANAGER} href={standaloneHref(MANAGER)} label="Download the Mod Manager" featured>
            <div className="mods-where">
              <p>
                Extract the zip into your game&rsquo;s <code>engine</code> folder, so <code>winhttp.dll</code>{' '}
                sits next to <code>Sanctuary.exe</code>. It&rsquo;s usually here:
              </p>
              <CopyPath />
            </div>
          </ModCard>
        </section>

        <section className="mods-step" aria-labelledby="mods-step-2">
          <StepHead n={2} id="mods-step-2">
            Add the mods you want
          </StepHead>
          <p className="mods-step-text">
            Each <strong>Download</strong> below is a small zip. Extract it into the same <code>engine</code>{' '}
            folder and launch the game &mdash; it&rsquo;s on. Switch it off or change its settings from{' '}
            <strong>Mods</strong> in the game menu, or <kbd>F8</kbd> mid-match.
          </p>
          <p className="mods-step-text hint">
            Only want one mod, without the Mod Manager? Take its <strong>Standalone zip</strong> from the foot
            of its card instead &mdash; it has everything it needs built in.
          </p>
          <div className="mod-list">
            {ADD_ONS.map((m) => (
              <ModCard key={m.id} mod={m} href={managerHref(m)} label="Download" />
            ))}
          </div>
        </section>

        <p className="mods-remove hint">
          To remove the lot, delete <code>engine\winhttp.dll</code>, <code>engine\BepInEx\</code> and{' '}
          <code>engine\SanctuaryMods\</code> &mdash; Steam&rsquo;s file check never knows they were there.
        </p>
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
  featured = false,
  children,
}: {
  mod: Mod;
  href: string;
  label: string;
  /** The Mod Manager: step 1, so it stands out, and its only zip is the
   *  Standalone, which is already the main button. */
  featured?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className={featured ? 'mod-entry featured' : 'mod-entry'} id={mod.id}>
      <header className="mod-entry-head">
        <div>
          <h3>
            {mod.name} <span className="mod-version">v{mod.version}</span>
          </h3>
          <p className="mod-tagline">{mod.tagline}</p>
        </div>
        <a className="dl-btn" href={href} aria-label={featured ? undefined : `Download ${mod.name}`}>
          {label}
        </a>
      </header>

      {children}

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
          {!featured && (
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
