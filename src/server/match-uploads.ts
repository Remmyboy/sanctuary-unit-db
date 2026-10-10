// What LadderReporter uploads after a ranked game (docs/replays-and-stats-plan.md):
// stats rows, replay reservations in R2, and the lazy prune of replays whose
// game build is long gone. Server only.

import { sql } from './db';
import { deleteObject, objectSize, storageConfigured } from './storage';
import { statsAgree, statsDurationS, type MatchStatsView, type StatsUpload } from '../lib/match-stats';
import {
  PENDING_TAKEOVER_MIN,
  replayKeys,
  type MatchReplayView,
  type ReplaySlotRequest,
  type ReplayStatus,
} from '../lib/match-replay';

// The match an upload names, with who played it — or null when it doesn't
// exist. Uploads are refused for cancelled matches.
export interface UploadTarget {
  status: string;
  createdAt: Date;
  mapPath: string | null;
  players: { playerId: string; steamId: string }[];
}

export async function loadUploadTarget(matchId: string): Promise<UploadTarget | null> {
  const rows = await sql()<
    { status: string; created_at: Date; map_path: string | null; player_id: string; steam_id: string }[]
  >`
    select m.status, m.created_at, m.map_path, mp.player_id, p.steam_id
    from matches m
    join match_participants mp on mp.match_id = m.id
    join players p on p.id = mp.player_id
    where m.id = ${matchId}`;
  if (rows.length === 0) return null;
  return {
    status: rows[0].status,
    createdAt: rows[0].created_at,
    mapPath: rows[0].map_path,
    players: rows.map((r) => ({ playerId: r.player_id, steamId: r.steam_id })),
  };
}

// ---- stats ------------------------------------------------------------------

// Upserts the caller's upload. Only the first uploader's timeline is kept: a
// second copy only serves to confirm the totals.
export async function saveStats(matchId: string, uploaderId: string, s: StatsUpload): Promise<void> {
  await sql()`
    insert into match_stats (match_id, uploader_id, format, mod_version, build_id, tick_rate, end_tick, armies, timeline)
    values (${matchId}, ${uploaderId}, ${s.format}, ${s.modVersion}, ${s.buildId}, ${s.tickRate}, ${s.endTick},
            ${sql().json(s.armies as never)},
            case when exists (select 1 from match_stats where match_id = ${matchId} and uploader_id <> ${uploaderId})
                 then null else ${sql().json(s.timeline as never)}::jsonb end)
    on conflict (match_id, uploader_id) do update set
      format = excluded.format, mod_version = excluded.mod_version, build_id = excluded.build_id,
      tick_rate = excluded.tick_rate, end_tick = excluded.end_tick, armies = excluded.armies,
      timeline = coalesce(excluded.timeline, match_stats.timeline)`;
}

interface StatsRow {
  format: number;
  build_id: string | null; // bigint
  tick_rate: number;
  end_tick: number;
  armies: StatsUpload['armies'];
  timeline: StatsUpload['timeline'] | null;
}

export async function loadStatsView(matchId: string): Promise<MatchStatsView | null> {
  const rows = await sql()<StatsRow[]>`
    select format, build_id, tick_rate, end_tick, armies, timeline
    from match_stats where match_id = ${matchId}
    order by created_at, uploader_id`;
  const first = rows.find((r) => r.timeline) ?? rows[0];
  if (!first) return null;
  const s = {
    format: first.format,
    buildId: first.build_id === null ? null : Number(first.build_id),
    tickRate: first.tick_rate,
    endTick: first.end_tick,
    armies: first.armies,
    timeline: first.timeline ?? { intervalS: 5, t: [], series: {} },
  };
  const other = rows.find((r) => r !== first);
  return {
    ...s,
    durationS: statsDurationS(s),
    uploads: rows.length,
    confirmed: other !== undefined && statsAgree(first, other),
  };
}

// ---- replays ----------------------------------------------------------------

interface ReplayRow {
  match_id: string;
  uploader_id: string;
  object_key: string;
  sidecar_key: string | null;
  file_name: string;
  size_bytes: number;
  sidecar_bytes: number;
  build_id: string | null;
  status: ReplayStatus;
  created_at: Date;
}

export async function loadReplay(matchId: string): Promise<ReplayRow | null> {
  const [row] = await sql()<ReplayRow[]>`select * from match_replays where match_id = ${matchId}`;
  return row ?? null;
}

export function toReplayView(r: ReplayRow | null): MatchReplayView | null {
  if (!r) return null;
  const young = Date.now() - r.created_at.getTime() < PENDING_TAKEOVER_MIN * 60_000;
  // A pending row nobody is finishing is noise, not an "uploading" promise.
  if (r.status === 'pending' && !young) return null;
  return {
    status: r.status,
    sizeBytes: r.size_bytes,
    buildId: r.build_id === null ? null : Number(r.build_id),
    fileName: r.file_name,
    uploading: r.status === 'pending',
  };
}

export type SlotResult =
  | { kind: 'reserved'; objectKey: string; sidecarKey: string | null }
  | { kind: 'stored' }
  | { kind: 'busy'; retryAfterS: number };

// Reserves the match's replay for the caller: a fresh row, their own earlier
// reservation (a retry), or someone else's that has sat pending too long.
// The key is fixed per match (from its creation date), so a takeover just
// overwrites whatever partial object the first attempt left.
export async function reserveReplay(
  matchId: string,
  matchCreatedAt: Date,
  uploaderId: string,
  r: ReplaySlotRequest,
): Promise<SlotResult> {
  const keys = replayKeys(matchId, matchCreatedAt);
  const sidecarKey = r.sidecarBytes > 0 ? keys.sidecar : null;
  const taken = await sql()`
    insert into match_replays (match_id, uploader_id, object_key, sidecar_key, file_name, size_bytes,
                               sidecar_bytes, sha256, game_version, build_id, map_path)
    values (${matchId}, ${uploaderId}, ${keys.object}, ${sidecarKey}, ${r.fileName}, ${r.sizeBytes},
            ${r.sidecarBytes}, ${r.sha256}, ${r.gameVersion}, ${r.buildId}, ${r.mapPath})
    on conflict (match_id) do update set
      uploader_id = excluded.uploader_id, object_key = excluded.object_key,
      sidecar_key = excluded.sidecar_key, file_name = excluded.file_name,
      size_bytes = excluded.size_bytes, sidecar_bytes = excluded.sidecar_bytes,
      sha256 = excluded.sha256, game_version = excluded.game_version,
      build_id = excluded.build_id, map_path = excluded.map_path,
      created_at = now(), ready_at = null
    where match_replays.status = 'pending'
      and (match_replays.uploader_id = excluded.uploader_id
           or match_replays.created_at < now() - interval '1 minute' * ${PENDING_TAKEOVER_MIN})
    returning match_id`;
  if (taken.length > 0) return { kind: 'reserved', objectKey: keys.object, sidecarKey };

  const existing = await loadReplay(matchId);
  if (!existing || existing.status !== 'pending') return { kind: 'stored' };
  const waited = (Date.now() - existing.created_at.getTime()) / 1000;
  return { kind: 'busy', retryAfterS: Math.max(60, Math.ceil(PENDING_TAKEOVER_MIN * 60 - waited)) };
}

export type DoneResult = { kind: 'ok' } | { kind: 'mismatch'; message: string } | { kind: 'none' };

// Confirms the caller's upload landed whole. A wrong size releases the
// reservation (and the object), so the next attempt starts clean.
export async function completeReplay(matchId: string, uploaderId: string): Promise<DoneResult> {
  const row = await loadReplay(matchId);
  if (!row || row.uploader_id !== uploaderId) return { kind: 'none' };
  if (row.status === 'ready') return { kind: 'ok' };
  if (row.status !== 'pending') return { kind: 'none' };

  const size = await objectSize(row.object_key);
  if (size !== row.size_bytes) {
    await deleteObject(row.object_key).catch(() => {});
    if (row.sidecar_key) await deleteObject(row.sidecar_key).catch(() => {});
    await sql()`delete from match_replays where match_id = ${matchId} and status = 'pending'`;
    return {
      kind: 'mismatch',
      message: size === null ? 'Nothing was uploaded.' : `Stored ${size} bytes, expected ${row.size_bytes}.`,
    };
  }
  // The sidecar is optional: a modded replay without it still downloads.
  let sidecarKey = row.sidecar_key;
  if (sidecarKey && (await objectSize(sidecarKey)) !== row.sidecar_bytes) {
    await deleteObject(sidecarKey).catch(() => {});
    sidecarKey = null;
  }
  await sql()`
    update match_replays set status = 'ready', ready_at = now(), sidecar_key = ${sidecarKey}
    where match_id = ${matchId} and status = 'pending'`;
  return { kind: 'ok' };
}

// ---- retention --------------------------------------------------------------

// A replay only plays on the game build it was recorded on, so it is kept
// until 30 days after a newer build shows up in uploads (and never less than
// 30 days). Unknown builds go after 90 days, and everything before R2's own
// 180-day lifecycle rule would take the object anyway. Pending rows a day old
// were abandoned. At most once an hour, a bounded batch, from the slot
// request — there is no cron.
const PRUNE_BATCH = 25;

export async function pruneReplays(): Promise<void> {
  if (!storageConfigured()) return;
  const claimed = await sql()`
    update site_jobs set last_run_at = now()
    where name = 'replay_prune' and last_run_at < now() - interval '1 hour'
    returning name`;
  if (claimed.length === 0) return;

  const due = await sql()<
    { match_id: string; object_key: string; sidecar_key: string | null; status: string }[]
  >`
    select r.match_id, r.object_key, r.sidecar_key, r.status from match_replays r
    where (r.status = 'pending' and r.created_at < now() - interval '1 day')
       or (r.status = 'ready' and (
             r.created_at < now() - interval '175 days'
          or (r.created_at < now() - interval '30 days' and (
                (r.build_id is null and r.created_at < now() - interval '90 days')
             or exists (select 1 from match_replays n
                        where n.build_id > r.build_id and n.created_at < now() - interval '30 days')))))
    order by r.created_at
    limit ${PRUNE_BATCH}`;

  for (const r of due) {
    try {
      await deleteObject(r.object_key);
      if (r.sidecar_key) await deleteObject(r.sidecar_key);
    } catch (e) {
      console.warn(`[replays] prune ${r.match_id}: ${(e as Error).message}`);
      continue;
    }
    if (r.status === 'pending') {
      await sql()`delete from match_replays where match_id = ${r.match_id} and status = 'pending'`;
    } else {
      await sql()`update match_replays set status = 'expired' where match_id = ${r.match_id}`;
    }
  }
}

// Before an admin deletes a match: its R2 objects, which the row cascade
// can't reach.
export async function deleteMatchReplay(matchId: string): Promise<void> {
  const row = await loadReplay(matchId);
  if (!row || !storageConfigured()) return;
  await deleteObject(row.object_key);
  if (row.sidecar_key) await deleteObject(row.sidecar_key);
}
