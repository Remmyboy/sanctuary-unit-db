// The mod download card on the Play page: what the Ladder Reporter does and
// the two downloads it takes, numbered in install order, as on the /mods
// page. The standalone zip and the everything zip are one line underneath,
// for the few who want one or the other. The zips are release assets on the
// open-source sanctuary-mods repo, and the versions come from the shared
// catalogue in src/lib/mods.ts — so bumping one there is the whole deploy,
// and this card can never disagree with the /mods page.

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { copyText } from '../lib/clipboard';
import { ENGINE_PATH, EVERYTHING_HREF, managerHref, mod, sourceHref, standaloneHref } from '../lib/mods';

const MANAGER = mod('ModManager');
const REPORTER = mod('LadderReporter');

export function ReporterCard() {
  const [copied, setCopied] = useState(false);

  return (
    <div className="queue-widget reporter-card" id="reporter">
      <h2>Auto-reporting</h2>
      <p className="dim">
        With the Ladder Reporter installed, your ranked 1v1s start themselves when you&rsquo;re matched, and
        the result posts here when the game ends.
      </p>

      <ol className="mod-downloads">
        <li>
          <div>
            <span className="mod-step-num" aria-hidden="true">
              1
            </span>
            <strong>Mod Manager</strong> <span className="dim">v{MANAGER.version}</span>
            <p className="dim">
              What every mod runs on, and a Mods page in the game menu. Already have it? Skip to 2.
            </p>
          </div>
          <a className="dl-btn" href={standaloneHref(MANAGER)}>
            Download the Mod Manager
          </a>
        </li>
        <li>
          <div>
            <span className="mod-step-num" aria-hidden="true">
              2
            </span>
            <strong>Ladder Reporter</strong> <span className="dim">v{REPORTER.version}</span>
            <p className="dim">Starts your matched games and reports the results. Nothing to set up.</p>
          </div>
          <a className="dl-btn" href={managerHref(REPORTER)}>
            Download the Ladder Reporter
          </a>
        </li>
      </ol>

      <div className="reporter-install">
        <p>
          Extract both into your game&rsquo;s <code>engine</code> folder, so <code>winhttp.dll</code> sits
          next to <code>Sanctuary.exe</code>, then launch the game and play ranked.
        </p>
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
          Want every mod? <a href={EVERYTHING_HREF}>Download everything</a> in one zip instead &mdash; see{' '}
          <Link to="/mods">what&rsquo;s in it</Link>. Only want this one, without the Mod Manager? Take the{' '}
          <a href={standaloneHref(REPORTER)}>standalone Ladder Reporter</a>.
        </p>
        <p className="hint">
          It only reports Steam lobby 1v1s that match an open ladder game &mdash; skirmish, LAN, observing and
          casual games are ignored. It&rsquo;s open source:{' '}
          <a href={sourceHref(REPORTER)} target="_blank" rel="noreferrer">
            read the code
          </a>
          .
        </p>
      </div>
    </div>
  );
}
