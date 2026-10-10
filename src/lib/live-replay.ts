// Live replays (docs/live-replays.md): the shapes LadderReporter sends while
// it streams a game, the checks on them, and the rules for what a viewer may
// have yet. Pure, so it is unit tested; the database and R2 half is
// src/server/live-replays.ts.

import { safeReplayName } from './match-replay';

// How far behind the game viewers are held. Server side: a chunk younger
// than this is not handed out, whatever the client asks for.
export const LIVE_DELAY_S = 60;
// The mod sends a chunk about every 15 s, usually tens of KB. The first one
// is bigger: a game's opening frame is the whole starting state, up to
// 1.7 MB on the stock maps seen (The Forge). A chunk is capped just under
// Vercel's 4.5 MB request body limit, and a stream at about twice the
// biggest replay seen (a 34.6 MB four-player game on a 1024 map).
export const CHUNK_MAX_BYTES = 4 * 1024 * 1024;
export const STREAM_MAX_BYTES = 64 * 1024 * 1024;
export const SIDECAR_MAX_BYTES = 256 * 1024;
// A live stream that hasn't sent a chunk for this long is over: the game
// crashed, or the connection went, without a goodbye.
export const STALE_S = 180;
// Ended streams can still be watched (from the start) for a day, then the
// prune deletes them.
export const KEEP_ENDED_H = 24;
export const CHUNK_URL_TTL_S = 10 * 60;
// Chunks listed per viewer poll; the mod asks again from the next one.
export const CHUNKS_PER_POLL = 60;

// Who is in the game, from the streaming player's lobby. Steam ids are left
// out on purpose: a live page needs names, not accounts.
export interface LivePlayer {
  name: string;
  team: number;
  kind: 'player' | 'ai' | 'observer';
}

export interface LiveStart {
  mapPath: string;
  gameVersion: string;
  buildId: number | null;
  fileName: string;
  players: LivePlayer[];
  sidecar: Record<string, unknown> | null;
}

const KINDS = ['player', 'ai', 'observer'] as const;
const posInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;

// Lobby names are free text; keep them short and printable.
const cleanName = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = [...v]
    .filter((c) => c >= ' ' && c !== '\u007f' && c !== '<' && c !== '>')
    .join('')
    .trim()
    .slice(0, 40);
  return s.length > 0 ? s : null;
};

export function parseLiveStart(raw: unknown): LiveStart | string {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return 'body';
  if (typeof d.mapPath !== 'string' || !/\.sanmap$/i.test(d.mapPath) || d.mapPath.length > 260)
    return 'mapPath';
  if (typeof d.gameVersion !== 'string' || d.gameVersion.length === 0 || d.gameVersion.length > 100) {
    return 'gameVersion';
  }
  if (typeof d.fileName !== 'string' || d.fileName.length === 0) return 'fileName';
  const buildId = d.buildId === undefined || d.buildId === null || d.buildId === 0 ? null : d.buildId;
  if (buildId !== null && !posInt(buildId)) return 'buildId';
  if (!Array.isArray(d.players) || d.players.length > 16) return 'players';
  const players: LivePlayer[] = [];
  for (const p of d.players as unknown[]) {
    const q = p as Record<string, unknown> | null;
    const name = cleanName(q?.name);
    const kind = KINDS.find((k) => k === q?.kind);
    const team = q?.team;
    if (!name || !kind || typeof team !== 'number' || !Number.isInteger(team) || team < -1 || team > 16) {
      return 'players';
    }
    players.push({ name, team, kind });
  }
  const sidecar = d.sidecar === undefined || d.sidecar === null ? null : d.sidecar;
  if (sidecar !== null && (typeof sidecar !== 'object' || Array.isArray(sidecar))) return 'sidecar';
  return {
    mapPath: d.mapPath,
    gameVersion: d.gameVersion,
    buildId: buildId as number | null,
    fileName: safeReplayName(d.fileName),
    players,
    sidecar: sidecar as Record<string, unknown> | null,
  };
}

// A chunk is whole network frames, as the game writes them: `100`, an int32
// length, that many bytes. The first chunk opens with the recording's
// header (an int32 length, then the header). Anything else would break
// every viewer's playback, so it is refused at the door.
export function checkChunk(bytes: Uint8Array, first: boolean): string | null {
  if (bytes.length === 0) return 'empty';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  if (first) {
    if (bytes.length < 4) return 'no header';
    const header = view.getInt32(0, true);
    if (header <= 0 || header > 64 * 1024 || 4 + header > bytes.length) return 'bad header';
    pos = 4 + header;
  } else if (bytes.length < 5) {
    return 'no frame';
  }
  while (pos < bytes.length) {
    if (pos + 5 > bytes.length) return `torn frame at ${pos}`;
    if (bytes[pos] !== 100) return `not a frame at ${pos}`;
    const length = view.getInt32(pos + 1, true);
    if (length < 0 || pos + 5 + length > bytes.length) return `torn frame at ${pos}`;
    pos += 5 + length;
  }
  return null;
}

export const liveChunkKey = (streamId: string, seq: number) =>
  `live/${streamId}/${String(seq).padStart(6, '0')}.bin`;

// Over, by the uploader's word or by going quiet.
export const streamOver = (status: string, lastChunkAt: Date, now: Date) =>
  status === 'ended' || now.getTime() - lastChunkAt.getTime() > STALE_S * 1000;

// The newest moment a chunk may have arrived and still be handed out now.
export const releasedBefore = (now: Date) => new Date(now.getTime() - LIVE_DELAY_S * 1000);

// ---- what the pages and the mod see ------------------------------------------

export interface LiveListRow {
  id: string;
  mapName: string;
  players: LivePlayer[];
  startedAt: string;
  live: boolean;
  watchableFrom: string; // when the first chunk is (or was) handed out: started + delay
}

export interface LiveStreamView extends LiveListRow {
  gameVersion: string;
  buildId: number | null;
  modded: boolean;
  endedAt: string | null;
}

// "Maps/The_Forge/The_Forge.sanmap" → "The Forge" for display.
export const liveMapName = (path: string) =>
  (path.split(/[\\/]/).pop() ?? '')
    .replace(/\.sanmap$/i, '')
    .replace(/^~/, '')
    .replace(/_/g, ' ');

// Players grouped by team, observers left out, for "A vs B" lines.
export function liveTeams(players: LivePlayer[]): LivePlayer[][] {
  const teams = new Map<number, LivePlayer[]>();
  for (const p of players) {
    if (p.kind === 'observer') continue;
    const list = teams.get(p.team) ?? [];
    list.push(p);
    teams.set(p.team, list);
  }
  return [...teams.entries()].sort(([a], [b]) => a - b).map(([, list]) => list);
}
