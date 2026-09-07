// The mods page: every mod in the sanctuary-mods repo, described in terms of
// what it does to your game rather than how it does it. The catalogue itself
// lives in src/lib/mods.ts, shared with the Play page's download card, so a
// version bump moves both.

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { copyText } from '../lib/clipboard';
import {
  ENGINE_PATH,
  MODS,
  MODS_REPO,
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
          Mods · {MODS.length} mods for Sanctuary: Shattered Sun, free and open source
        </span>
        <a className="toolbar-link" href={MODS_REPO} target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
      </div>
      <main className="mods-page">
        <p className="mods-intro">
          Small quality-of-life mods for the playtest: a readable economy readout, hotkeys that work the same
          on every faction, proper replay playback, and the mod that reports your ladder games for you. They
          change what you see, not how the game plays — so you can join a lobby with people who have none of
          them, and nothing here touches your game files or shows up in Steam&rsquo;s file check.
        </p>

        <Install />

        <div className="mod-list">
          {MODS.map((m) => (
            <ModEntry key={m.id} mod={m} />
          ))}
        </div>

        <p className="hint mods-footnote">
          Every mod is built from{' '}
          <a href={MODS_REPO} target="_blank" rel="noreferrer">
            sanctuary-mods
          </a>{' '}
          and released there — issues and pull requests welcome, and each release&rsquo;s notes say what
          changed.
        </p>
      </main>
    </>
  );
}

// Two zips per mod is the one thing worth explaining before the list, since
// picking the wrong one is the only way to get this wrong.
function Install() {
  const [copied, setCopied] = useState(false);

  return (
    <section className="queue-widget mods-install">
      <h2>Installing them</h2>
      <p className="dim">
        Every mod ships two downloads. Take <strong>Standalone</strong> for your first one — it carries
        everything the mod needs. After that, take <strong>for the Mod Manager</strong>, which is just the mod
        and turns up as a switch on the game&rsquo;s Mods page.
      </p>
      <ol className="mods-steps">
        <li>
          Download the <strong>Standalone</strong> zip of the <a href="#ModManager">Mod Manager</a> first.
        </li>
        <li>
          Extract it into your Sanctuary <code>engine</code> folder, so <code>winhttp.dll</code> ends up next
          to <code>Sanctuary.exe</code>.
        </li>
        <li>
          Start the game — there is now a <strong>Mods</strong> entry in the menu sidebar (or press{' '}
          <kbd>F8</kbd>).
        </li>
        <li>
          For every other mod, download its <strong>for the Mod Manager</strong> zip and extract it into the
          same <code>engine</code> folder. It appears on the Mods page, ready to switch on.
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
        That path is the usual one for the Steam playtest; yours moves with your Steam library. To remove
        everything again, delete <code>engine\winhttp.dll</code>, <code>engine\BepInEx\</code> and{' '}
        <code>engine\SanctuaryMods\</code> — none of them are game files, so Steam&rsquo;s &ldquo;verify
        integrity&rdquo; never notices they were there.
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
          <a className="dl-mini" href={managerHref(mod)}>
            for the Mod Manager
          </a>
        </div>
      </header>

      {mod.detail.map((para) => (
        <p key={para.slice(0, 40)} className="mod-para">
          {para}
        </p>
      ))}

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
