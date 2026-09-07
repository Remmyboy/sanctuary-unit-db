// App-wide queue state. The 5-second status poll is the queue heartbeat
// (entries older than 90 s are swept), so it can't belong to the Play page
// alone: a player browsing units while waiting would silently drop out. It
// lives here instead, module-level like the match alert, and runs only
// while the last answer said we're queued. A localStorage hint carries
// "queued" across a refresh or a new tab so the poll resumes before the
// first answer.
//
// It runs *only* while queued: an idle Play page reads the public counts
// from the CDN-cached endpoint instead, and one refresh on arrival is enough
// to learn about an open match. Each poll carries what the page can see of
// the local mod (docs/local-bridge.md), so the bridge is watched for as long
// as the poll runs.
//
// Not signed in, no session hint → nothing runs, which keeps the static
// build and anonymous visits free of requests.

import { useSyncExternalStore } from 'react';
import { hasSessionHint } from './auth';
import { MODES, type Mode } from './ladder-modes';
import { startMatchAlert } from './match-alert';
import { bridgeSignal, watchBridge } from './mod-bridge';
import { queueStatus } from '../server/queue-fns';
import type { PlayStatus } from './ladder-types';

const POLL_MS = 5000;
const QUEUED_HINT = 'sdb.queued';

export interface QueueState {
  status: PlayStatus | null;
  // When that status arrived. A page that opens on a cached answer can
  // tell it apart from one polled since — see the Play page redirect.
  fetchedAt: number | null;
  // Local "joined at" anchors derived from each answer, so timers tick
  // every second and re-sync on every poll.
  joinedAt: Record<Mode, number | null>;
  // A match that just formed from a queue we were in: the banner sends the
  // player there once, from wherever they are. Cleared by consumeNewMatch.
  newMatchId: string | null;
}

let state: QueueState = {
  status: null,
  fetchedAt: null,
  joinedAt: { '1v1': null, '2v2': null, '3v3': null },
  newMatchId: null,
};
let timer: ReturnType<typeof setInterval> | null = null;
let releaseBridge: (() => void) | null = null;
let inFlight = false;
let listening = false; // the storage listener is app-wide and installed once
// "We were in a queue" as of the last answer — or the join click itself,
// since the join may complete the match on the spot.
let wasQueued = false;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const readHint = (): boolean => {
  try {
    return localStorage.getItem(QUEUED_HINT) === '1';
  } catch {
    return false;
  }
};

const writeHint = (queued: boolean): void => {
  try {
    if (queued) localStorage.setItem(QUEUED_HINT, '1');
    else localStorage.removeItem(QUEUED_HINT);
  } catch {
    // Blocked storage: polling still works for this page's lifetime.
  }
};

export const isQueued = (s: PlayStatus | null): boolean => !!s && MODES.some((m) => s.queues[m].inQueue);

// Every status answer — from the poll, a join or a leave — comes through
// here so the whole app sees the same truth.
export function applyStatus(s: PlayStatus): void {
  const at = Date.now();
  const joinedAt = {} as Record<Mode, number | null>;
  for (const m of MODES) {
    const secs = s.queues[m].queuedSeconds;
    joinedAt[m] = secs == null ? null : at - secs * 1000;
  }
  const queued = isQueued(s);
  // Only a match produced by a queue we were in is news; an old open match
  // you're returning to isn't.
  const newMatchId = s.matchId && wasQueued ? s.matchId : null;
  if (newMatchId) startMatchAlert(newMatchId);
  wasQueued = queued;
  writeHint(queued);
  state = { status: s, fetchedAt: at, joinedAt, newMatchId: newMatchId ?? state.newMatchId };
  emit();
  schedule();
}

// The join click: the answer may already be the match.
export function markJoining(): void {
  wasQueued = true;
}

export function consumeNewMatch(): void {
  if (state.newMatchId === null) return;
  state = { ...state, newMatchId: null };
  emit();
}

// The match room, once the game it is showing has been played. Nothing polls
// the queue while you are in a match — you are not queued — so the last
// answer goes on naming that match for as long as the tab lives, and the
// Play page would send you straight back into it. This is no more than what
// the next poll would say, early.
export function clearOpenMatch(matchId: string): void {
  const s = state.status;
  if (!s || s.matchId !== matchId) return;
  state = { ...state, status: { ...s, matchId: null } };
  emit();
}

function poll(): void {
  if (inFlight || !hasSessionHint()) return;
  inFlight = true;
  queueStatus({ data: { mod: bridgeSignal() } })
    .then(applyStatus)
    .catch(() => {})
    .finally(() => {
      inFlight = false;
    });
}

// Runs while we believe we're queued. The bridge is watched for exactly as
// long, so every poll has the mod's latest word to carry.
function schedule(): void {
  const wanted = hasSessionHint() && (isQueued(state.status) || (state.status === null && readHint()));
  if (wanted && timer === null) {
    timer = setInterval(poll, POLL_MS);
    releaseBridge ??= watchBridge();
  } else if (!wanted && timer !== null) {
    clearInterval(timer);
    timer = null;
    releaseBridge?.();
    releaseBridge = null;
  }
}

// One answer now — the Play page on arrival, so it knows about an open
// match or a queue joined in another tab. Polling only continues if that
// answer says we're queued.
export function refreshQueue(): void {
  poll();
}

// Called once when the app mounts: if the last visit left us queued, pick
// the heartbeat straight back up. Another tab joining or leaving a queue
// flips the hint, and this tab follows it.
export function resumeQueueWatch(): void {
  if (state.status === null && readHint()) {
    wasQueued = true;
    poll();
    schedule();
  }
  if (typeof window !== 'undefined' && !listening) {
    listening = true;
    window.addEventListener('storage', (e) => {
      if (e.key !== QUEUED_HINT) return;
      if (e.newValue === '1') wasQueued = true;
      poll();
    });
  }
}

// The current answer outside React.
export const queueSnapshot = (): QueueState => state;

export function useQueueState(): QueueState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    queueSnapshot,
    queueSnapshot,
  );
}
