// Install furniture shared by /mods and /gameplay-mods: the numbered step
// heading, and the engine path (or any one-liner) with a copy button. Both pages install into
// the same folder the same way, so they say it the same way.

import { useState, type ReactNode } from 'react';
import { copyText } from '../lib/clipboard';
import { ENGINE_PATH } from '../lib/mods';

export function StepHead({ n, id, children }: { n: number; id: string; children: ReactNode }) {
  return (
    <div className="mods-step-head">
      <span className="mods-step-num" aria-hidden="true">
        {n}
      </span>
      <h2 id={id}>{children}</h2>
    </div>
  );
}

export function CopyPath({ text = ENGINE_PATH }: { text?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="install-path">
      <code>{text}</code>
      <button
        type="button"
        className="linkish"
        onClick={async () => {
          if (await copyText(text)) {
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

/** Proton runs Sanctuary under Wine, which loads its own winhttp.dll ahead of
 *  the loader's; this override makes it take the one in the engine folder. */
export const LINUX_LAUNCH_OPTIONS = 'WINEDLLOVERRIDES="winhttp=n,b" %command%';
