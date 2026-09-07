// "Is anything happening?" — how many are waiting in each queue and how many
// games are on. The same answer for every viewer, so it is served from
// /api/queue-counts behind the CDN cache rather than computed per visitor;
// the signed-in status poll folds the same numbers in for players who are
// queued. Server only.

import { sql } from './db';
import { MODES, type Mode } from '../lib/ladder-modes';
import type { QueueCounts } from '../lib/ladder-types';

// Live entries only: stale ones are swept by pairing passes, but the count
// is read by visitors who never trigger one.
export const WAITING_SQL = `
  select json_object_agg(mode, n) from (
    select mode, count(*)::int as n from queue_entries
    where heartbeat_at > now() - interval '90 seconds'
    group by mode
  ) q`;

export const LIVE_GAMES_SQL = `
  select count(*)::int from matches where status in ('in_progress', 'reported', 'disputed')`;

export function toCounts(
  waiting: Partial<Record<Mode, number>> | null,
  liveGames: number | null,
): QueueCounts {
  const w = { '1v1': 0, '2v2': 0, '3v3': 0 } as Record<Mode, number>;
  for (const m of MODES) w[m] = waiting?.[m] ?? 0;
  return { waiting: w, liveGames: liveGames ?? 0 };
}

export async function countQueues(): Promise<QueueCounts> {
  const [row] = await sql().unsafe<{ waiting: Record<Mode, number> | null; live_games: number }[]>(
    `select (${WAITING_SQL}) as waiting, (${LIVE_GAMES_SQL}) as live_games`,
  );
  return toCounts(row?.waiting ?? null, row?.live_games ?? 0);
}
