// Live replays (docs/live-replays.md): streams LadderReporter opens while a
// game runs, the chunks it appends, and what viewers are handed — only chunks
// older than LIVE_DELAY_S, decided here by the database clock. Server only.

import { sql } from './db';
import { deleteObject, presign, putObject, storageConfigured } from './storage';
import {
  checkChunk,
  CHUNK_URL_TTL_S,
  CHUNKS_PER_POLL,
  KEEP_ENDED_H,
  LIVE_DAILY_MAX_BYTES,
  LIVE_DELAY_S,
  liveChunkKey,
  liveMapName,
  STALE_S,
  STREAM_MAX_BYTES,
  streamOver,
  type LiveListRow,
  type LivePlayer,
  type LiveStart,
  type LiveStreamView,
} from '../lib/live-replay';

interface StreamRow {
  id: string;
  uploader_id: string;
  map_path: string;
  game_version: string;
  build_id: string | null; // bigint
  file_name: string;
  players: LivePlayer[];
  sidecar: Record<string, unknown> | null;
  status: 'live' | 'ended';
  chunks: number;
  bytes: string; // bigint
  started_at: Date;
  last_chunk_at: Date;
  ended_at: Date | null;
}

async function loadStream(id: string): Promise<StreamRow | null> {
  const [row] = await sql()<StreamRow[]>`select * from live_streams where id = ${id}`;
  return row ?? null;
}

// ---- the streaming player --------------------------------------------------

// What the caller has streamed in the last day, for LIVE_DAILY_MAX_BYTES:
// every Steam account with the mod can stream, so R2 needs a per-player cap.
export async function overDailyQuota(uploaderId: string): Promise<boolean> {
  const [row] = await sql()<{ bytes: string }[]>`
    select coalesce(sum(bytes), 0)::bigint as bytes from live_streams
    where uploader_id = ${uploaderId} and started_at > now() - interval '1 day'`;
  return Number(row.bytes) >= LIVE_DAILY_MAX_BYTES;
}

// A new stream for the caller. One at a time: anything they still had live
// is over (a crash, then a new game).
export async function startStream(uploaderId: string, s: LiveStart): Promise<string> {
  await sql()`
    update live_streams set status = 'ended', ended_at = now()
    where uploader_id = ${uploaderId} and status = 'live'`;
  const [row] = await sql()<{ id: string }[]>`
    insert into live_streams (uploader_id, map_path, game_version, build_id, file_name, players, sidecar)
    values (${uploaderId}, ${s.mapPath}, ${s.gameVersion}, ${s.buildId}, ${s.fileName},
            ${sql().json(s.players as never)}, ${s.sidecar === null ? null : sql().json(s.sidecar as never)})
    returning id`;
  return row.id;
}

export type AppendResult =
  | { kind: 'ok'; next: number }
  | { kind: 'none' }
  | { kind: 'over' }
  | { kind: 'gap'; next: number }
  | { kind: 'full' }
  | { kind: 'bad'; message: string };

// Chunks arrive in order. A retry of one already stored is a success (its
// answer got lost); one past the next expected is refused with the number the
// mod should send instead.
export async function appendChunk(
  streamId: string,
  uploaderId: string,
  seq: number,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<AppendResult> {
  const s = await loadStream(streamId);
  if (!s || s.uploader_id !== uploaderId) return { kind: 'none' };
  if (seq < s.chunks) return { kind: 'ok', next: s.chunks };
  if (streamOver(s.status, s.last_chunk_at, new Date())) return { kind: 'over' };
  if (seq > s.chunks) return { kind: 'gap', next: s.chunks };
  if (Number(s.bytes) + bytes.length > STREAM_MAX_BYTES) return { kind: 'full' };
  const problem = checkChunk(bytes, seq === 0);
  if (problem) return { kind: 'bad', message: problem };

  await putObject(liveChunkKey(streamId, seq), bytes);
  const [row] = await sql()<{ chunks: number }[]>`
    with added as (
      insert into live_chunks (stream_id, seq, size_bytes) values (${streamId}, ${seq}, ${bytes.length})
      on conflict do nothing
      returning size_bytes)
    update live_streams set chunks = chunks + 1, bytes = bytes + added.size_bytes, last_chunk_at = now()
    from added where live_streams.id = ${streamId}
    returning chunks`;
  // Lost a race with a retry of the same chunk: it is stored either way.
  return { kind: 'ok', next: row?.chunks ?? seq + 1 };
}

export async function endStream(streamId: string, uploaderId: string): Promise<boolean> {
  const done = await sql()`
    update live_streams set status = 'ended', ended_at = coalesce(ended_at, now())
    where id = ${streamId} and uploader_id = ${uploaderId}
    returning id`;
  return done.length > 0;
}

// ---- viewers ---------------------------------------------------------------

const toListRow = (s: StreamRow, now: Date): LiveListRow => ({
  id: s.id,
  mapName: liveMapName(s.map_path),
  players: s.players,
  startedAt: s.started_at.toISOString(),
  live: !streamOver(s.status, s.last_chunk_at, now),
  watchableFrom: new Date(s.started_at.getTime() + LIVE_DELAY_S * 1000).toISOString(),
});

// Live games first, then the ones that ended recently enough to still watch.
export async function listStreams(): Promise<LiveListRow[]> {
  const rows = await sql()<StreamRow[]>`
    select * from live_streams
    where chunks > 0
      and coalesce(ended_at, last_chunk_at) > now() - (interval '1 hour' * ${KEEP_ENDED_H})
    order by started_at desc
    limit 60`;
  const now = new Date();
  const list = rows.map((r) => toListRow(r, now));
  return [...list.filter((r) => r.live), ...list.filter((r) => !r.live)];
}

export async function streamView(id: string): Promise<LiveStreamView | null> {
  const s = await loadStream(id);
  if (!s) return null;
  const over = streamOver(s.status, s.last_chunk_at, new Date());
  return {
    ...toListRow(s, new Date()),
    gameVersion: s.game_version,
    buildId: s.build_id === null ? null : Number(s.build_id),
    modded: s.sidecar !== null,
    endedAt: over ? (s.ended_at ?? s.last_chunk_at).toISOString() : null,
  };
}

export interface ViewerPoll {
  id: string;
  gameVersion: string;
  mapPath: string;
  fileName: string;
  sidecar: Record<string, unknown> | null;
  delayS: number;
  // Chunks from `from` on that are old enough to hand out, with URLs good
  // for CHUNK_URL_TTL_S.
  chunks: { seq: number; sizeBytes: number; url: string }[];
  // Nothing more will come: the stream is over and every chunk is out.
  complete: boolean;
  // Before the first chunk is out: how long until it is.
  startsInS: number | null;
}

export async function viewerPoll(id: string, from: number): Promise<ViewerPoll | null> {
  const s = await loadStream(id);
  if (!s) return null;
  // The database's clock decides what is old enough, not the caller's.
  const chunks = await sql()<{ seq: number; size_bytes: number }[]>`
    select seq, size_bytes from live_chunks
    where stream_id = ${id} and seq >= ${from}
      and created_at <= now() - (interval '1 second' * ${LIVE_DELAY_S})
    order by seq
    limit ${CHUNKS_PER_POLL}`;
  const [first] = await sql()<{ wait_s: number | null }[]>`
    select extract(epoch from (created_at + (interval '1 second' * ${LIVE_DELAY_S}) - now()))::float8 as wait_s
    from live_chunks where stream_id = ${id} and seq = 0`;
  const next = from + chunks.length;
  const over = streamOver(s.status, s.last_chunk_at, new Date());
  const complete = over && next >= s.chunks;
  // Not for a stream that ended before sending anything: that one is complete.
  const startsInS =
    from === 0 && chunks.length === 0 && !complete
      ? Math.max(1, Math.ceil(first?.wait_s ?? LIVE_DELAY_S))
      : null;
  return {
    id: s.id,
    gameVersion: s.game_version,
    mapPath: s.map_path,
    fileName: s.file_name,
    sidecar: s.sidecar,
    delayS: LIVE_DELAY_S,
    chunks: await Promise.all(
      chunks.map(async (c) => ({
        seq: c.seq,
        sizeBytes: c.size_bytes,
        url: await presign('GET', liveChunkKey(id, c.seq), CHUNK_URL_TTL_S),
      })),
    ),
    complete,
    startsInS,
  };
}

// ---- retention -------------------------------------------------------------

// A day after a stream ends (or goes quiet), its chunks and rows go. At most
// every 15 minutes, a bounded batch, from the start of a new stream: there is
// no cron, so the batch has to stay quick (it holds up the streamer's start).
// An hour of game is about 240 chunks. A finished game's real replay is the
// post-game upload, not this.
const PRUNE_EVERY = '15 minutes';
const PRUNE_OBJECTS = 400; // R2 deletes per run, at least one whole stream
const PRUNE_PARALLEL = 25;

export async function pruneLive(): Promise<void> {
  if (!storageConfigured()) return;
  const claimed = await sql()`
    update site_jobs set last_run_at = now()
    where name = 'live_prune' and last_run_at < now() - ${PRUNE_EVERY}::interval
    returning name`;
  if (claimed.length === 0) return;

  const due = await sql()<{ id: string; chunks: number }[]>`
    select id, chunks from live_streams
    where coalesce(ended_at, last_chunk_at) < now() - (interval '1 hour' * ${KEEP_ENDED_H})
      and (status = 'ended' or last_chunk_at < now() - (interval '1 second' * ${STALE_S}))
    order by started_at
    limit 50`;

  let budget = PRUNE_OBJECTS;
  for (const s of due) {
    if (budget <= 0) break;
    budget -= s.chunks;
    try {
      for (let seq = 0; seq < s.chunks; seq += PRUNE_PARALLEL) {
        const batch = [];
        for (let i = seq; i < Math.min(s.chunks, seq + PRUNE_PARALLEL); i++)
          batch.push(deleteObject(liveChunkKey(s.id, i)));
        await Promise.all(batch);
      }
    } catch (e) {
      console.warn(`[live] prune ${s.id}: ${(e as Error).message}`);
      continue;
    }
    await sql()`delete from live_streams where id = ${s.id}`;
  }
}
