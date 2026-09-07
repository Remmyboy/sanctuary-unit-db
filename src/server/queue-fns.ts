// The matchmaking queues — one per mode, and a player may wait in several at
// once. The 5-second queueStatus poll is the engine of the whole system: it
// is the heartbeat that keeps entries alive, it sweeps overdue auto-confirms,
// and it runs a pairing pass for every mode the caller is queued in — so
// matches form and finalise with no cron and no long-running process.
//
// Round trips are the cost that matters (docs/local-bridge.md): each poll
// is a Vercel function that waits on the database, so the status is one
// query, and the heartbeat bump and the pairing passes are one each.

import { createServerFn } from '@tanstack/react-start';
import { sql } from './db';
import { requirePlayer } from './player';
import { recordPresence } from './presence';
import { LIVE_GAMES_SQL, WAITING_SQL, toCounts } from './queue-counts';
import { LADDER_MAPS, type LadderMap } from '../lib/ladder-maps';
import {
  MODES,
  isLeaderboardMode,
  isMode,
  playersNeeded,
  type LeaderboardMode,
  type Mode,
} from '../lib/ladder-modes';
import { searchRadius } from '../lib/matchmaking';
import {
  FACTIONS,
  isFaction,
  isLaunchable,
  parseModSignal,
  type Faction,
  type ModSignal,
  type ModState,
} from '../lib/mm';
import type { LeaderboardRow, ModPresence, PlayStatus, QueueModeStatus } from '../lib/ladder-types';

// A player's unfinished matches, in one pass. Two different things live in
// here: the game they are in *right now*, which is the only thing that stops
// them queueing (pair_queue in 0011 has to agree — change both together),
// and the most recent result still settling, which does not. A reported
// result waits 15 minutes for the other side and a dispute waits on an
// admin; neither is a reason to keep someone off the ladder when their
// opponent has simply gone offline. The Play page points at the settling one
// so confirm/dispute is still a click away.
const UNFINISHED_SQL = `
  select json_agg(json_build_object('match_id', mp.match_id, 'status', m.status) order by m.created_at desc)
  from match_participants mp
  join matches m on m.id = mp.match_id
  where mp.player_id = $1
    and m.status in ('in_progress', 'reported', 'disputed')`;

interface UnfinishedRow {
  match_id: string;
  status: string;
}

const splitUnfinished = (rows: UnfinishedRow[] | null) => ({
  matchId: rows?.find((r) => r.status === 'in_progress')?.match_id ?? null,
  settlingMatchId: rows?.find((r) => r.status !== 'in_progress')?.match_id ?? null,
});

async function unfinishedFor(
  playerId: string,
): Promise<{ matchId: string | null; settlingMatchId: string | null }> {
  const [row] = await sql().unsafe<{ rows: UnfinishedRow[] | null }[]>(`select (${UNFINISHED_SQL}) as rows`, [
    playerId,
  ]);
  return splitUnfinished(row?.rows ?? null);
}

// The seed pools, for the pairing statement's fallback: an emptied admin
// pool falls back to the seed list rather than leaving a mode unplayable.
const SEED_POOLS = JSON.stringify(
  Object.fromEntries(MODES.map((m) => [m, LADDER_MAPS[m].map((x) => x.name)])),
);

// A pairing pass per mode, in one statement. The live pool comes from
// ladder_maps (curated on the admin page); the seed list stands in when it
// is empty.
async function pairModes(modes: Mode[]): Promise<void> {
  if (modes.length === 0) return;
  await sql()`
    select (select count(*) from pair_queue(m.mode, coalesce(
      (select array_agg(l.name order by l.name) from ladder_maps l where l.mode = m.mode and l.enabled),
      (select array_agg(x.name) from json_array_elements_text(${SEED_POOLS}::json -> m.mode) as x(name))
    ))) as paired
    from unnest(${sql().array(modes)}::text[]) as m(mode)`;
}

// The live pool for a mode, curated on the admin page. An emptied pool
// falls back to the seed list rather than leaving a mode unplayable.
async function poolFor(mode: Mode): Promise<LadderMap[]> {
  const rows = await sql()<{ name: string; size: number }[]>`
    select name, size from ladder_maps where mode = ${mode} and enabled order by name`;
  return rows.length > 0 ? rows : LADDER_MAPS[mode];
}

// The enabled pools, for the standings sidebar.
export const mapPools = createServerFn().handler(async (): Promise<Record<Mode, LadderMap[]>> => {
  const pools = {} as Record<Mode, LadderMap[]>;
  for (const mode of MODES) pools[mode] = await poolFor(mode);
  return pools;
});

// Overdue auto-confirms, plus auto-launch countdowns and timeouts.
const sweepDueMatches = () => sql()`select sweep_all()`;

// Times come back as epoch milliseconds rather than JSON-encoded timestamps,
// so nothing depends on how Postgres spells a fractional second.
interface StatusRow {
  unfinished: UnfinishedRow[] | null;
  mine: { mode: Mode; joined_ms: number; factions: Faction[] }[] | null;
  waiting: Partial<Record<Mode, number>> | null;
  live_games: number;
  mod: { state: ModState; seen_ms: number; mod_version: string | null } | null;
}

// Everything the Play page needs, in one query. The mod's last word counts
// for a minute: long enough to show "mod seen, but in a lobby", not so long
// it's stale.
async function playStatus(playerId: string): Promise<PlayStatus> {
  const [row] = await sql().unsafe<StatusRow[]>(
    `select
       (${UNFINISHED_SQL}) as unfinished,
       (select json_agg(json_build_object(
          'mode', mode, 'joined_ms', floor(extract(epoch from joined_at) * 1000), 'factions', factions))
        from queue_entries where player_id = $1) as mine,
       (${WAITING_SQL}) as waiting,
       (${LIVE_GAMES_SQL}) as live_games,
       (select json_build_object('state', state, 'seen_ms', floor(extract(epoch from seen_at) * 1000),
                                 'mod_version', mod_version)
        from mod_presence
        where player_id = $1 and seen_at > now() - interval '60 seconds') as mod`,
    [playerId],
  );
  const counts = toCounts(row?.waiting ?? null, row?.live_games ?? 0);
  const mine = row?.mine ?? [];
  const now = Date.now();

  let mod: ModPresence | null = null;
  if (row?.mod) {
    mod = {
      state: row.mod.state,
      seenAt: new Date(row.mod.seen_ms).toISOString(),
      launchable: isLaunchable(row.mod.seen_ms, row.mod.state, now),
      modVersion: row.mod.mod_version,
    };
  }

  const queues = {} as Record<Mode, QueueModeStatus>;
  for (const mode of MODES) {
    const entry = mine.find((m) => m.mode === mode);
    const queuedSeconds = entry ? Math.max(0, Math.floor((now - entry.joined_ms) / 1000)) : null;
    queues[mode] = {
      inQueue: entry !== undefined,
      queuedSeconds,
      searchRadius: queuedSeconds === null ? null : searchRadius(queuedSeconds),
      waiting: counts.waiting[mode],
      needed: playersNeeded(mode),
    };
  }
  return {
    ...splitUnfinished(row?.unfinished ?? null),
    queues,
    liveGames: counts.liveGames,
    mod,
    factions: mine.find((m) => m.mode === '1v1')?.factions ?? [...FACTIONS],
  };
}

const modeInput = (data: unknown): { mode: Mode } => {
  const d = data as { mode?: unknown } | null;
  if (!isMode(d?.mode)) throw new Error('mode required');
  return { mode: d.mode };
};

// What the player is willing to be launched as. Nothing valid means
// everything — a faction filter is never a reason not to queue.
const factionsInput = (v: unknown): Faction[] => {
  const picked = Array.isArray(v) ? [...new Set(v.filter(isFaction))] : [];
  return picked.length > 0 ? picked : [...FACTIONS];
};

// What the page can see of the local mod (docs/local-bridge.md); optional
// on every poll-shaped call.
const modInput = (data: unknown): ModSignal | null => parseModSignal((data as { mod?: unknown } | null)?.mod);

export const queueJoin = createServerFn({ method: 'POST' })
  .validator((data: unknown): { mode: Mode; factions: Faction[]; mod: ModSignal | null } => ({
    ...modeInput(data),
    factions: factionsInput((data as { factions?: unknown }).factions),
    mod: modInput(data),
  }))
  .handler(async ({ data }): Promise<PlayStatus> => {
    const me = await requirePlayer();
    if ((await unfinishedFor(me.playerId)).matchId) return playStatus(me.playerId);
    // Presence before pairing: the join may complete the match on the spot,
    // and whether it goes auto turns on this.
    if (data.mod) await recordPresence(me.playerId, data.mod);

    // The rating snapshot the matchmaker balances on is this mode's.
    await sql()`select ensure_rating(${me.playerId}, ${data.mode})`;
    await sql()`
      insert into queue_entries (player_id, mode, rating, factions)
      select ${me.playerId}, ${data.mode}, rating, ${sql().array(data.factions)}::text[]
      from player_ratings where player_id = ${me.playerId} and mode = ${data.mode}
      on conflict (player_id, mode) do update set
        rating = excluded.rating, factions = excluded.factions, heartbeat_at = now()`;

    await pairModes([data.mode]);
    return playStatus(me.playerId);
  });

export const queueLeave = createServerFn({ method: 'POST' })
  .validator(modeInput)
  .handler(async ({ data }): Promise<PlayStatus> => {
    const me = await requirePlayer();
    await sql()`delete from queue_entries where player_id = ${me.playerId} and mode = ${data.mode}`;
    return playStatus(me.playerId);
  });

export const queueStatus = createServerFn({ method: 'POST' })
  .validator((data: unknown): { mod: ModSignal | null } => ({ mod: modInput(data) }))
  .handler(async ({ data }): Promise<PlayStatus> => {
    const me = await requirePlayer();

    if (data.mod) await recordPresence(me.playerId, data.mod);
    await sweepDueMatches();

    // Bump the heartbeat before pairing so these entries can't be swept as
    // stale by the very passes they trigger. Its own statement on purpose: a
    // function called from the same statement would not see the bump.
    const mine = await sql()<{ mode: Mode }[]>`
      update queue_entries set heartbeat_at = now()
      where player_id = ${me.playerId}
      returning mode`;
    await pairModes(mine.map((m) => m.mode));

    return playStatus(me.playerId);
  });

export const leaderboard = createServerFn()
  .validator((data: unknown): { mode: LeaderboardMode } => {
    const d = data as { mode?: unknown } | null;
    return { mode: isLeaderboardMode(d?.mode) ? d.mode : '1v1' };
  })
  .handler(async ({ data }): Promise<LeaderboardRow[]> => {
    await sweepDueMatches();
    interface Row {
      steam_id: string;
      persona_name: string;
      avatar_url: string | null;
      rating: number;
      games_played: number;
      wins: number;
      losses: number;
    }
    const rows =
      data.mode === 'overall'
        ? // Games-weighted across the modes each player has actually played.
          await sql()<Row[]>`
            select p.steam_id, coalesce(p.display_name, p.persona_name) as persona_name, p.avatar_url,
                   round(sum(pr.rating * pr.games_played)::numeric / sum(pr.games_played))::int as rating,
                   sum(pr.games_played)::int as games_played, sum(pr.wins)::int as wins, sum(pr.losses)::int as losses
            from player_ratings pr join players p on p.id = pr.player_id
            where pr.games_played > 0 and p.banned_at is null
            group by p.id
            order by rating desc, games_played desc
            limit 100`
        : await sql()<Row[]>`
            select p.steam_id, coalesce(p.display_name, p.persona_name) as persona_name, p.avatar_url,
                   pr.rating, pr.games_played, pr.wins, pr.losses
            from player_ratings pr join players p on p.id = pr.player_id
            where pr.mode = ${data.mode} and pr.games_played >= 1 and p.banned_at is null
            order by pr.rating desc, pr.games_played desc
            limit 100`;
    return rows.map((p, i) => ({
      rank: i + 1,
      steamId: p.steam_id,
      personaName: p.persona_name,
      avatarUrl: p.avatar_url,
      rating: p.rating,
      gamesPlayed: p.games_played,
      wins: p.wins,
      losses: p.losses,
    }));
  });
