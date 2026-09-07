// The local bridge to the LadderReporter mod (docs/local-bridge.md). The mod
// listens on 127.0.0.1 inside the game; this module asks it what the game is
// doing and hands it the match to launch. Nothing here touches Vercel: the
// answers ride along inside the polls the page already makes.
//
// Module-level like the queue watch: the probe runs while any page wants it
// (the Play page, a queued player on any page, a 1v1 match room) and the
// last answer is what the site polls report. A failed probe means "no mod
// visible", which the server never treats as news — a momentary blip must
// not look like a closed game.

import { useSyncExternalStore } from 'react';
import { MOD_BRIDGE_PORT, isModState, type ModMatch, type ModSignal, type ModState } from './mm';

const BASE = `http://127.0.0.1:${MOD_BRIDGE_PORT}`;
const PROBE_MS = 2000;
const TIMEOUT_MS = 1500;

export interface BridgeStatus {
  modVersion: string | null;
  gameVersion: string | null;
  state: ModState;
}

export interface BridgeState {
  // null until the first probe answers either way; then the mod's last
  // word, or null when it can't be reached.
  status: BridgeStatus | null;
  // Whether a probe has ever run: the UI says nothing before that.
  probed: boolean;
}

let state: BridgeState = { status: null, probed: false };
let watchers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const canFetch = () => typeof window !== 'undefined' && typeof fetch === 'function';

function parseStatus(v: unknown): BridgeStatus | null {
  const d = v as { state?: unknown; modVersion?: unknown; gameVersion?: unknown } | null;
  if (!d || typeof d !== 'object' || !isModState(d.state)) return null;
  return {
    state: d.state,
    modVersion: typeof d.modVersion === 'string' ? d.modVersion : null,
    gameVersion: typeof d.gameVersion === 'string' ? d.gameVersion : null,
  };
}

const same = (a: BridgeStatus | null, b: BridgeStatus | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.state === b.state &&
    a.modVersion === b.modVersion &&
    a.gameVersion === b.gameVersion);

// Only a change is news: the probe answers every two seconds and the same
// answer must not re-render anything.
function set(status: BridgeStatus | null): void {
  if (state.probed && same(state.status, status)) return;
  state = { status, probed: true };
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
    });
}

function schedule(): void {
  const wanted = watchers > 0 && canFetch();
  if (wanted && timer === null) {
    tick();
    timer = setInterval(tick, PROBE_MS);
  } else if (!wanted && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

// A page that wants the mod watched. Returns the release function.
export function watchBridge(): () => void {
  watchers++;
  schedule();
  return () => {
    watchers--;
    schedule();
  };
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
// absence, not an error the page can act on.
export async function pushMatch(match: ModMatch | null): Promise<boolean> {
  if (!canFetch()) return false;
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

// Exported for the unit test only.
export const _reset = (): void => {
  state = { status: null, probed: false };
};
