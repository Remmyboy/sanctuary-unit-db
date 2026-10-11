// Install furniture shared by /mods and /gameplay-mods: the numbered step
// heading, the engine path with a copy button, and the Linux launch options.
// Both pages install into the same folder the same way, so they say it the
// same way.

import type { ReactNode } from 'react';
import { ENGINE_PATH } from '../lib/mods';
import { useCopyFeedback } from '../lib/use-copy-feedback';

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
  const { copied, copy } = useCopyFeedback();

  return (
    <div className="install-path">
      <code>{text}</code>
      <button type="button" className="linkish" onClick={() => copy(text)}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}

/** Proton runs Sanctuary under Wine, which loads its own winhttp.dll ahead of
 *  the loader's; this override makes it take the one in the engine folder. */
const LINUX_LAUNCH_OPTIONS = 'WINEDLLOVERRIDES="winhttp=n,b" %command%';

export function LinuxLaunchOptions() {
  return (
    <div className="mods-where">
      <h2>On Linux?</h2>
      <p>
        Set the launch options. In Steam, go to <strong>Sanctuary</strong> &rarr; <strong>Properties</strong>{' '}
        &rarr; <strong>General</strong> &rarr; <strong>Launch Options</strong> and enter:
      </p>
      <CopyPath text={LINUX_LAUNCH_OPTIONS} />
    </div>
  );
}
