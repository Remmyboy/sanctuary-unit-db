// The mod download card on the Play page: what the LadderReporter does, the
// three ways to get it, and the install steps, always open (the maps page
// uses the same box collapsed). The zips are release assets on the
// open-source sanctuary-mods repo, and the versions come from the shared
// catalogue in src/lib/mods.ts — so bumping one there is the whole deploy,
// and this card can never disagree with the /mods page.

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { copyText } from '../lib/clipboard';
import { ENGINE_PATH, managerHref, mod, sourceHref, standaloneHref } from '../lib/mods';

const MANAGER = mod('ModManager');
const REPORTER = mod('LadderReporter');

const DOWNLOADS = {
  modManager: standaloneHref(MANAGER),
  reporterForModManager: managerHref(REPORTER),
  reporterStandalone: standaloneHref(REPORTER),
};

export function ReporterCard() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="queue-widget reporter-card" id="reporter">
      <h2>Auto-reporting</h2>
      <p className="dim">
        Install the LadderReporter mod to automatically start your game when you match an opponent, and to log
        the result when you finish — automatically.
      </p>

      <ul className="mod-downloads">
        <li>
          <div>
            <strong>Mod Manager</strong>
            <p className="dim">
              Everything you need to start modding Sanctuary: a Mods page in the main menu, and it loads any
              mod in the <code>SanctuaryMods</code> folder.
            </p>
          </div>
          <a className="dl-btn" href={DOWNLOADS.modManager}>
            Download · v{MANAGER.version}
          </a>
        </li>
        <li>
          <div>
            <strong>LadderReporter</strong> <span className="dim">for the Mod Manager</span>
            <p className="dim">
              Just the mod: auto-launches the game when you're matched and reports the result. Needs the Mod
              Manager.
            </p>
          </div>
          <a className="dl-btn" href={DOWNLOADS.reporterForModManager}>
            Download · v{REPORTER.version}
          </a>
        </li>
        <li>
          <div>
            <strong>LadderReporter</strong> <span className="dim">standalone</span>
            <p className="dim">The same mod with everything it needs to run, without the Mod Manager.</p>
          </div>
          <a className="dl-btn" href={DOWNLOADS.reporterStandalone}>
            Download · v{REPORTER.version}
          </a>
        </li>
      </ul>

      <div className="install install-static">
        <h3>How to install it</h3>
        <ol>
          <li>
            Extract the zip into your Sanctuary <code>engine</code> folder, so <code>winhttp.dll</code> sits
            next to <code>Sanctuary.exe</code>.
          </li>
          <li>Launch the game and play ranked — matches start themselves and results appear here.</li>
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
          The mod only reports Steam lobby 1v1s that match an open ladder game — skirmish, LAN, observing and
          casual games are ignored.
        </p>
        <p className="hint">
          It's open source —{' '}
          <a href={sourceHref(REPORTER)} target="_blank" rel="noreferrer">
            check out the source code here
          </a>
          . Same repo has <Link to="/mods">more mods for Sanctuary</Link>.
        </p>
      </div>
    </div>
  );
}
