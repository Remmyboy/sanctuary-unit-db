// The mods page: every mod in the sanctuary-mods repo, in terms of what it
// does to your game. Deliberately scannable — a line and a few bullets each,
// with the repo one click away for anyone who wants the detail. The catalogue
// lives in src/lib/mods.ts, shared with the Play page's download card, so a
// version bump moves both.

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { copyText } from '../lib/clipboard';
import {
  ENGINE_PATH,
  MODS,
  MODS_REPO,
  hasManagerZip,
  managerHref,
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
          'Free, open-source mods for Sanctuary: Shattered Sun — economy HUD, build hotkeys, replay tools, idle engineers and the ladder reporter.',
      },
    ],
  }),
  component: ModsPage,
});

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
        <p className="mods-intro">
          Quality-of-life mods for the playtest. They change what you see, not how the game plays — so you can
          still join a lobby with people who have none of them, and nothing here touches your game files.
        </p>

        <Install />

        <div className="mod-list">
          {MODS.map((m) => (
            <ModEntry key={m.id} mod={m} />
          ))}
        </div>
      </main>
    </>
  );
}

// Which of the two zips to take is the one thing worth explaining up front,
// since picking the wrong one is the only way to get this wrong.
function Install() {
  const [copied, setCopied] = useState(false);

  return (
    <section className="queue-widget mods-install">
      <h2>Installing them</h2>
      <p className="mods-choice">
        <strong>Standalone</strong> is a mod plus everything it needs to run — take that if it&rsquo;s the
        only mod you want. <strong>For the Mod Manager</strong> is the mod on its own, for an install that
        already has the <a href="#ModManager">Mod Manager</a>.
      </p>
      <ol className="mods-steps">
        <li>
          Extract the zip into your Sanctuary <code>engine</code> folder, so it sits next to{' '}
          <code>Sanctuary.exe</code>. Both kinds go in the same place.
        </li>
        <li>
          Launch the game. With the Mod Manager there is a <strong>Mods</strong> entry in the menu sidebar (
          <kbd>F8</kbd> too), listing everything you have dropped in with a switch each.
        </li>
      </ol>
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
      <p className="hint">
        Yours moves with your Steam library. To undo the lot, delete <code>engine\winhttp.dll</code>,{' '}
        <code>engine\BepInEx\</code> and <code>engine\SanctuaryMods\</code> — Steam&rsquo;s file check never
        knows they were there.
      </p>
    </section>
  );
}

function ModEntry({ mod }: { mod: Mod }) {
  return (
    <article className="mod-entry" id={mod.id}>
      <header className="mod-entry-head">
        <div>
          <h2>
            {mod.name} <span className="mod-version">v{mod.version}</span>
          </h2>
          <p className="mod-summary">{mod.summary}</p>
        </div>
        <div className="mod-entry-dl">
          <a className="dl-btn" href={standaloneHref(mod)}>
            Download · Standalone
          </a>
          {/* The Mod Manager is the loader, so it has nothing to plug into. */}
          {hasManagerZip(mod) && (
            <a className="dl-mini" href={managerHref(mod)}>
              for the Mod Manager
            </a>
          )}
        </div>
      </header>

      <ul className="mod-points">
        {mod.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>

      <footer className="mod-entry-foot">
        {mod.keys && <span className="mod-keys">{mod.keys}</span>}
        <span className="mod-links">
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
