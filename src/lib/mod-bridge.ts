// The local bridge to the LadderReporter mod (docs/local-bridge.md). The mod
// listens on 127.0.0.1 inside the game; this module asks it what the game is
// doing and hands it the match to launch. Nothing here touches Vercel: the
// answers ride along inside the polls the page already makes.
//
// Opt-in. The first request to 127.0.0.1 makes Chrome (and Safari) ask the
// player whether this site may connect to devices on their local network,
// so nothing here speaks to the mod until the player has pressed "Connect
// to Sanctuary" on the Play page, and that choice is remembered per browser.
// Players without the mod never see the prompt.
//
// Module-level like the queue watch: the probe runs while any page wants it
// (the Play page, a queued player on any page, a 1v1 match room) and the
// last answer is what the site polls report. A failed probe means "no mod
// visible", which the server never treats as news — a momentary blip must
// not look like a closed game.

import { useSyncExternalStore } from 'react';
import { MOD_BRIDGE_PORT, isModState, type ModMatch, type ModSignal, type ModState } from './mm';

const BASE = `http://127.0.0.1:${MOD_BRIDGE_PORT}`;
const ENABLED_KEY = 'sdb.bridge';
const PROBE_MS = 2000;
// After this many straight failures the probe slows right down: the game
// is not running, or the browser said no. A dismissed permission prompt
// must not come back every two seconds.
const BACKOFF_AFTER = 5;
const SLOW_PROBE_MS = 15_000;
const TIMEOUT_MS = 1500;

// What the mod is currently acting on, for the admin test bench and for
// debugging; the site's own record stays the authority.
export interface BridgeMatch {
  id: string;
  status: string;
  phase: string;
}

export interface BridgeStatus {
  modVersion: string | null;
  gameVersion: string | null;
  state: ModState;
  match: BridgeMatch | null;
}

export interface BridgeState {
  // Whether the player has opted in on this browser.
  enabled: boolean;
  // Whether a probe has run since enabling: the UI says "looking" before that.
  probed: boolean;
  // The mod's last word, or null when it can't be reached.
  status: BridgeStatus | null;
}

const canFetch = () => typeof window !== 'undefined' && typeof fetch === 'function';

const readEnabled = (): boolean => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
};

const writeEnabled = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, '1');
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Blocked storage: the choice still holds for this page's lifetime.
  }
};

let state: BridgeState = { enabled: readEnabled(), probed: false, status: null };
let watchers = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let failures = 0;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function parseMatch(v: unknown): BridgeMatch | null {
  const d = v as { id?: unknown; status?: unknown; phase?: unknown } | null;
  if (!d || typeof d !== 'object' || typeof d.id !== 'string') return null;
  return { id: d.id, status: str(d.status) ?? '', phase: str(d.phase) ?? '' };
}

function parseStatus(v: unknown): BridgeStatus | null {
  const d = v as { state?: unknown; modVersion?: unknown; gameVersion?: unknown; match?: unknown } | null;
  if (!d || typeof d !== 'object' || !isModState(d.state)) return null;
  return {
    state: d.state,
    modVersion: str(d.modVersion),
    gameVersion: str(d.gameVersion),
    match: parseMatch(d.match),
  };
}

const sameMatch = (a: BridgeMatch | null, b: BridgeMatch | null): boolean =>
  a === b || (a !== null && b !== null && a.id === b.id && a.status === b.status && a.phase === b.phase);

const same = (a: BridgeStatus | null, b: BridgeStatus | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.state === b.state &&
    a.modVersion === b.modVersion &&
    a.gameVersion === b.gameVersion &&
    sameMatch(a.match, b.match));

// Only a change is news: the probe answers every two seconds and the same
// answer must not re-render anything.
function set(status: BridgeStatus | null): void {
  failures = status ? 0 : failures + 1;
  if (state.probed && same(state.status, status)) return;
  state = { ...state, status, probed: true };
  emit();
}

// One probe. Every failure — no listener, the browser refusing to reach the
// local network, a slow answer — is the same "not visible".
export async function probe(): Promise<BridgeStatus | null> {
  if (!canFetch()) return null;
  try {
    const res = await fetch(`${BASE}/status`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return parseStatus(await res.json());
  } catch {
    return null;
  }
}

function tick(): void {
  if (inFlight) return;
  inFlight = true;
  void probe()
    .then(set)
    .finally(() => {
      inFlight = false;
      arm();
    });
}

const wanted = () => state.enabled && watchers > 0 && canFetch();

// Queues the next probe; the delay stretches once the mod has gone quiet.
function arm(): void {
  if (timer !== null || !wanted()) return;
  const delay = failures >= BACKOFF_AFTER ? SLOW_PROBE_MS : PROBE_MS;
  timer = setTimeout(() => {
    timer = null;
    if (wanted()) tick();
  }, delay);
}

function stop(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

function schedule(): void {
  if (wanted()) {
    if (timer === null && !inFlight) tick();
  } else {
    stop();
  }
}

// A page that wants the mod watched. Returns the release function. Does
// nothing until the player has opted in.
export function watchBridge(): () => void {
  watchers++;
  schedule();
  return () => {
    watchers--;
    schedule();
  };
}

// The "Connect to Sanctuary" click. Probes straight away.
export function enableBridge(): void {
  writeEnabled(true);
  failures = 0;
  state = { enabled: true, probed: false, status: null };
  emit();
  schedule();
}

// Forget the choice and stop talking to 127.0.0.1.
export function disableBridge(): void {
  writeEnabled(false);
  stop();
  failures = 0;
  state = { enabled: false, probed: false, status: null };
  emit();
}

// The Retry link: one probe now, whatever the back-off says.
export function retryBridge(): void {
  if (!state.enabled) return;
  failures = 0;
  stop();
  tick();
}

// What the site polls carry: the mod's state and versions, or null when the
// page can't see one.
export function bridgeSignal(): ModSignal | null {
  const s = state.status;
  return s ? { state: s.state, modVersion: s.modVersion, gameVersion: s.gameVersion } : null;
}

// Hands the mod the match it should be acting on — or null, which is "stand
// down" (the match ended, or you're not in one). Idempotent on the mod's
// side, so the match room sends it on every poll. Failures are the mod's
// absence, not an error the page can act on. Never before opting in: this
// request would raise the browser's prompt just like the probe.
export async function pushMatch(match: ModMatch | null): Promise<boolean> {
  if (!state.enabled || !canFetch()) return false;
  try {
    const res = await fetch(`${BASE}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(match),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const bridgeSnapshot = (): BridgeState => state;

export function useModBridge(): BridgeState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    bridgeSnapshot,
    bridgeSnapshot,
  );
}
