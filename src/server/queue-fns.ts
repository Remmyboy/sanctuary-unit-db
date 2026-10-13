// The site's queue server functions: the Play page's join and leave, the
// app-wide queue watch's 5-second status poll, the map pools and the
// leaderboard. The queue itself (pairing, the heartbeat, the status query)
// lives in queue.ts, shared with the game's own endpoint (api.mm.queue.ts).

import { createServerFn } from '@tanstack/react-start';
import { sql } from './db';
import { requirePlayer } from './player';
import { factionsInput, heartbeatQueue, joinQueue, leaveQueue, playStatus, sweepDueMatches } from './queue';
import { LADDER_MAPS, type LadderMap } from '../lib/ladder-maps';
import { MODES, isLeaderboardMode, isMode, type LeaderboardMode, type Mode } from '../lib/ladder-modes';
import { parseModSignal, type Faction, type ModSignal } from '../lib/mm';
import type { LeaderboardRow, PlayStatus } from '../lib/ladder-types';

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

const modeInput = (data: unknown): { mode: Mode } => {
  const d = data as { mode?: unknown } | null;
  if (!isMode(d?.mode)) throw new Error('mode required');
  return { mode: d.mode };
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
    await joinQueue(me.playerId, data.mode, data.factions, data.mod);
    return playStatus(me.playerId);
  });

export const queueLeave = createServerFn({ method: 'POST' })
  .validator(modeInput)
  .handler(async ({ data }): Promise<PlayStatus> => {
    const me = await requirePlayer();
    await leaveQueue(me.playerId, [data.mode]);
    return playStatus(me.playerId);
  });

export const queueStatus = createServerFn({ method: 'POST' })
  .validator((data: unknown): { mod: ModSignal | null } => ({ mod: modInput(data) }))
  .handler(async ({ data }): Promise<PlayStatus> => {
    const me = await requirePlayer();
    await heartbeatQueue(me.playerId, data.mod);
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
