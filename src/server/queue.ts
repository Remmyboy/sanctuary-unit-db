// The matchmaking queues — one per mode, and a player may wait in several at
// once. Shared by the two ways in: the site's own server functions
// (queue-fns.ts, the Play page and the app-wide queue watch) and the game's
// bearer endpoint (routes/api.mm.queue.ts, LadderReporter's in-game queue).
// Either way the 5-second status poll is the engine of the whole system: it
// is the heartbeat that keeps entries alive, it sweeps overdue auto-confirms,
// and it runs a pairing pass for every mode the caller is queued in — so
// matches form and finalise with no cron and no long-running process.
//
// Round trips are the cost that matters (docs/local-bridge.md): each poll
// is a Vercel function that waits on the database, so the status is one
// query, and the heartbeat bump and the pairing passes are one each.
// Server only.

import { sql } from './db';
import { recordPresence } from './presence';
import { LIVE_GAMES_SQL, WAITING_SQL, toCounts } from './queue-counts';
import { LADDER_MAPS } from '../lib/ladder-maps';
import { MODES, playersNeeded, type Mode } from '../lib/ladder-modes';
import { searchRadius } from '../lib/matchmaking';
import { FACTIONS, isFaction, type Faction, type ModSignal } from '../lib/mm';
import type { PlayStatus, QueueModeStatus } from '../lib/ladder-types';

// A player's unfinished matches, in one pass. Two different things live in
// here: the game they are in *right now*, which is the only thing that stops
// them queueing (pair_queue has to agree — the rule came in 0011, whose header
// calls this blockingMatchIdFor; live in 0013 — change both together),
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

// Overdue auto-confirms, plus auto-launch countdowns and timeouts.
export const sweepDueMatches = () => sql()`select sweep_all()`;

// Times come back as epoch milliseconds rather than JSON-encoded timestamps,
// so nothing depends on how Postgres spells a fractional second.
interface StatusRow {
  unfinished: UnfinishedRow[] | null;
  mine: { mode: Mode; joined_ms: number; factions: Faction[] }[] | null;
  waiting: Partial<Record<Mode, number>> | null;
  live_games: number;
}

// Everything the Play page (or the game's queue panel) needs, in one query.
export async function playStatus(playerId: string): Promise<PlayStatus> {
  const [row] = await sql().unsafe<StatusRow[]>(
    `select
       (${UNFINISHED_SQL}) as unfinished,
       (select json_agg(json_build_object(
          'mode', mode, 'joined_ms', floor(extract(epoch from joined_at) * 1000), 'factions', factions))
        from queue_entries where player_id = $1) as mine,
       (${WAITING_SQL}) as waiting,
       (${LIVE_GAMES_SQL}) as live_games`,
    [playerId],
  );
  const counts = toCounts(row?.waiting ?? null, row?.live_games ?? 0);
  const mine = row?.mine ?? [];
  const now = Date.now();

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
    factions: mine.find((m) => m.mode === '1v1')?.factions ?? [...FACTIONS],
  };
}

// What the player is willing to be launched as. Nothing valid means
// everything — a faction filter is never a reason not to queue.
export const factionsInput = (v: unknown): Faction[] => {
  const picked = Array.isArray(v) ? [...new Set(v.filter(isFaction))] : [];
  return picked.length > 0 ? picked : [...FACTIONS];
};

// Into one mode's queue, or a no-op while a game is on. Presence first: the
// join may complete the match on the spot, and whether it goes auto turns
// on it.
export async function joinQueue(
  playerId: string,
  mode: Mode,
  factions: Faction[],
  mod: ModSignal | null,
): Promise<void> {
  if ((await unfinishedFor(playerId)).matchId) return;
  if (mod) await recordPresence(playerId, mod);

  // The rating snapshot the matchmaker balances on is this mode's.
  await sql()`select ensure_rating(${playerId}, ${mode})`;
  await sql()`
    insert into queue_entries (player_id, mode, rating, factions)
    select ${playerId}, ${mode}, rating, ${sql().array(factions)}::text[]
    from player_ratings where player_id = ${playerId} and mode = ${mode}
    on conflict (player_id, mode) do update set
      rating = excluded.rating, factions = excluded.factions, heartbeat_at = now()`;

  await pairModes([mode]);
}

export async function leaveQueue(playerId: string, modes: Mode[]): Promise<void> {
  if (modes.length === 0) return;
  await sql()`delete from queue_entries where player_id = ${playerId} and mode = any(${sql().array(modes)}::text[])`;
}

// The heartbeat: presence, the sweep, a bump for every entry the player
// has, and a pairing pass for each of their modes.
export async function heartbeatQueue(playerId: string, mod: ModSignal | null): Promise<void> {
  if (mod) await recordPresence(playerId, mod);
  await sweepDueMatches();

  // Bump the heartbeat before pairing so these entries can't be swept as
  // stale by the very passes they trigger. Its own statement on purpose: a
  // function called from the same statement would not see the bump.
  const mine = await sql()<{ mode: Mode }[]>`
    update queue_entries set heartbeat_at = now()
    where player_id = ${playerId}
    returning mode`;
  await pairModes(mine.map((m) => m.mode));
}
