// The copy buttons' "Copied ✓": true for a moment after a copy lands. A
// refused copy changes nothing, so a button never claims one that didn't
// happen — and whatever was to be copied is still on screen to copy by hand.

import { useState } from 'react';
import { copyText } from './clipboard';

const SHOW_MS = 1500;

export function useCopyFeedback(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), SHOW_MS);
    }
  };
  return { copied, copy };
}
