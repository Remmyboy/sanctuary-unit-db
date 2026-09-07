// How often the match room should ask the server about its match. Only the
// auto-launch phases change under the player faster than they can act: the
// countdown and the launch handshake, where the poll also carries the mod's
// presence that the launch gate reads. Everything else — a manual game
// being played, a result waiting on the other side, a dispute — is minutes
// of nothing, and a settled match is record.

import type { MatchView } from './ladder-types';

export const FAST_MS = 5000;
export const SLOW_MS = 30_000;

export const isOpen = (m: MatchView): boolean =>
  m.status === 'in_progress' || m.status === 'reported' || m.status === 'disputed';

// Null means stop polling.
export function pollDelay(m: MatchView | null | undefined): number | null {
  if (m === undefined) return FAST_MS; // not loaded yet: keep trying
  if (m === null || !isOpen(m)) return null;
  if (m.status === 'in_progress' && (m.mmStatus === 'countdown' || m.mmStatus === 'launch')) return FAST_MS;
  return SLOW_MS;
}

// A hidden tab skips its slow polls — the page can't be looked at, and
// browsers throttle those timers anyway — but never a fast one: during the
// countdown and launch the player is alt-tabbed into the game, and this
// poll is what tells the site their game is still there.
export const shouldPoll = (delay: number | null, hidden: boolean): boolean =>
  delay !== null && (delay === FAST_MS || !hidden);
