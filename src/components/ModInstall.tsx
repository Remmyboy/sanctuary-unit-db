// Install furniture shared by /mods and /gameplay-mods: the numbered step
// heading, and the engine path with a copy button. Both pages install into
// the same folder the same way, so they say it the same way.

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

export function CopyPath() {
  const { copied, copy } = useCopyFeedback();

  return (
    <div className="install-path">
      <code>{ENGINE_PATH}</code>
      <button type="button" className="linkish" onClick={() => copy(ENGINE_PATH)}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  );
}
