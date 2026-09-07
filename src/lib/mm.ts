// Auto-launch matchmaking: the shapes and constants shared by the mod-facing
// API (src/routes/api.mm.*), the ladder server functions and the UI. The
// timings are mirrored in supabase/migrations/0009_matchmaking.sql, where
// the sweep actually enforces them — change both together.

export const FACTIONS = ['EDA', 'Chosen', 'Guard'] as const;
export type Faction = (typeof FACTIONS)[number];

export const isFaction = (v: unknown): v is Faction =>
  typeof v === 'string' && (FACTIONS as readonly string[]).includes(v);

// What the mod says the game is doing. The mod (0.3+) can leave a lobby or
// close a replay by itself before launching, so those count as launchable;
// a game that is loading or being played does not. Mirrored in migration
// 0014 — change both together.
export const MOD_STATES = ['menu', 'lobby', 'loading', 'ingame', 'replay'] as const;
export type ModState = (typeof MOD_STATES)[number];

export const isModState = (v: unknown): v is ModState =>
  typeof v === 'string' && (MOD_STATES as readonly string[]).includes(v);

export const LAUNCHABLE_STATES: readonly ModState[] = ['menu', 'lobby', 'replay'];

export const isLaunchableState = (state: ModState | null): boolean =>
  state !== null && LAUNCHABLE_STATES.includes(state);

export const MM_EVENT_TYPES = ['lobby_created', 'joined', 'ready', 'started', 'failed', 'left'] as const;
export type MmEventType = (typeof MM_EVENT_TYPES)[number];

export const isMmEventType = (v: unknown): v is MmEventType =>
  typeof v === 'string' && (MM_EVENT_TYPES as readonly string[]).includes(v);

// What the browser relays about the local mod on each poll (see
// docs/local-bridge.md): the game's state and the versions, nothing more.
// Null means the page could not see a mod, which never clears presence — a
// momentary blip must not look like a closed game; staleness does that.
export interface ModSignal {
  state: ModState;
  modVersion: string | null;
  gameVersion: string | null;
}

const shortString = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? v.slice(0, max) : null;

// Validates a `mod` field from the client or the heartbeat body. Anything
// that is not a well-formed signal is null, never an error: a broken mod is
// the same as no mod.
export function parseModSignal(v: unknown): ModSignal | null {
  const d = v as { state?: unknown; modVersion?: unknown; gameVersion?: unknown } | null;
  if (!d || typeof d !== 'object' || !isModState(d.state)) return null;
  return {
    state: d.state,
    modVersion: shortString(d.modVersion, 40),
    gameVersion: shortString(d.gameVersion, 40),
  };
}

// The port the mod's local bridge listens on (docs/local-bridge.md). The
// page only ever tries the default; the mod's config knob is for testers.
export const MOD_BRIDGE_PORT = 27555;

// The Playtest on Steam — what the ladder is played on today (the server's
// ticket check in src/server/steam.ts accepts the full game too). Steam
// registers the steam:// scheme, so this link starts the game through the
// Steam client, mod included; without Steam it does nothing.
export const STEAM_APP_ID = 4511930;
export const STEAM_RUN_URL = `steam://run/${STEAM_APP_ID}`;

export type MmMode = 'auto' | 'manual';

// The lifecycle the mod sees. `manual` is this site's addition to the plan:
// an open match the mod must not launch (it just reports the result).
export type MmStatus = 'countdown' | 'launch' | 'cancelled' | 'failed' | 'done' | 'manual';

// The identity string the mod mints its Steam tickets with (LadderReporter's
// TicketIdentity); the session endpoint accepts exactly this.
export const TICKET_IDENTITY = 'sanctuarydb-ladder';

export const LAUNCHABLE_WINDOW_S = 15; // a heartbeat older than this means the game is gone
export const COUNTDOWN_S = 10;
// The gate at the end of the countdown is stricter than LAUNCHABLE_WINDOW_S
// and has no constant of its own: it wants a heartbeat since the match was
// made (see not_startable_reason in 0012). Ten seconds of countdown is one to
// two heartbeats, and 15 s of tolerance would pass a game closed the moment
// the match formed.
export const SESSION_TTL_H = 6;
export const TIMEOUT_SESSION_S = 20; // host must post the lobby's session id
export const TIMEOUT_JOIN_S = 30; // joiner must report `joined` after the session id
export const TIMEOUT_START_S = 60; // both must report `started` after launch

// A player is launchable while their last heartbeat is fresh and the game
// is somewhere the mod can launch from.
export function isLaunchable(seenAtMs: number | null, state: ModState | null, nowMs: number): boolean {
  if (seenAtMs === null || !isLaunchableState(state)) return false;
  return nowMs - seenAtMs < LAUNCHABLE_WINDOW_S * 1000;
}

// The match object the mod acts on — the shape /api/mm/heartbeat returns
// and the page pushes over the local bridge (docs/matchmaking-api.md, "The
// match object"). Client-safe: the match room carries one per 1v1.
export interface ModMatch {
  id: string;
  mode: MmMode;
  status: MmStatus;
  host: string;
  joiner: string;
  opponent: { steamId: string; name: string };
  map: string | null; // the game's map path; null on manual matches
  mapName: string;
  factions: Record<string, Faction>;
  slots: Record<string, number>;
  sessionId: string | null;
  countdownEndsAt: string | null;
  cancelledBy: string | null;
  reason: string | null;
}

export interface MmStatusSource {
  status: 'in_progress' | 'reported' | 'completed' | 'disputed' | 'cancelled';
  mmMode: MmMode;
  mmStatus: 'countdown' | 'launch' | 'cancelled' | 'failed' | null;
}

// The database only records the auto lifecycle (countdown → launch, and the
// two ways it ends early); everything else follows from the ladder status.
export function deriveMmStatus(m: MmStatusSource): MmStatus {
  if (m.status === 'completed') return 'done';
  if (m.status === 'cancelled') return m.mmStatus === 'failed' ? 'failed' : 'cancelled';
  if (m.mmMode === 'manual') return 'manual';
  if (m.mmStatus === 'countdown' || m.mmStatus === 'launch') return m.mmStatus;
  return 'manual';
}

// The events, in order, tell the match page how far the launch has got.
export function launchProgress(
  events: { type: MmEventType; playerId: string }[],
  hostId: string,
  joinerId: string,
): { lobbyCreated: boolean; joined: boolean; started: boolean } {
  const has = (type: MmEventType, playerId: string) =>
    events.some((e) => e.type === type && e.playerId === playerId);
  return {
    lobbyCreated: has('lobby_created', hostId),
    joined: has('joined', joinerId),
    started: has('started', hostId) && has('started', joinerId),
  };
}
