// The Replays page: every finished ranked game, newest first, without a word
// about who won. Public, like finished match pages. The game itself (map,
// players, replay, then the result and stats behind a reveal) is the match
// view, loaded with matchGet.

import { createServerFn } from '@tanstack/react-start';
import { sql } from './db';
import type { Mode } from '../lib/ladder-modes';
import type { ReplayListPage, ReplayListPlayer, ReplayListRow } from '../lib/ladder-types';

const PAGE = 30;

export const replayList = createServerFn({ method: 'POST' })
  .validator((data: unknown): { page: number; withReplay: boolean } => {
    const d = data as { page?: unknown; withReplay?: unknown } | null;
    const page = typeof d?.page === 'number' && Number.isInteger(d.page) && d.page >= 0 ? d.page : 0;
    return { page: Math.min(page, 200), withReplay: d?.withReplay === true };
  })
  .handler(async ({ data }): Promise<ReplayListPage> => {
    const matches = await sql()<
      {
        id: string;
        mode: Mode;
        map_name: string;
        completed_at: Date;
        size_bytes: number | null;
        file_name: string | null;
        has_stats: boolean;
      }[]
    >`
      select m.id, m.mode, m.map_name, m.completed_at, r.size_bytes, r.file_name,
             exists (select 1 from match_stats s where s.match_id = m.id) as has_stats
      from matches m
      left join match_replays r on r.match_id = m.id and r.status = 'ready'
      where m.status = 'completed'
        and (${!data.withReplay} or r.match_id is not null)
      order by m.completed_at desc
      limit ${PAGE + 1} offset ${data.page * PAGE}`;

    const shown = matches.slice(0, PAGE);
    const teams = new Map<string, Map<number, ReplayListPlayer[]>>();
    if (shown.length > 0) {
      const players = await sql()<
        { match_id: string; team: number; steam_id: string; persona_name: string }[]
      >`
        select mp.match_id, mp.team, p.steam_id, coalesce(p.display_name, p.persona_name) as persona_name
        from match_participants mp join players p on p.id = mp.player_id
        where mp.match_id in ${sql()(shown.map((m) => m.id))}
        order by mp.team, lower(coalesce(p.display_name, p.persona_name))`;
      for (const p of players) {
        const byTeam = teams.get(p.match_id) ?? new Map<number, ReplayListPlayer[]>();
        const list = byTeam.get(p.team) ?? [];
        list.push({ steamId: p.steam_id, personaName: p.persona_name });
        byTeam.set(p.team, list);
        teams.set(p.match_id, byTeam);
      }
    }

    const rows: ReplayListRow[] = shown.map((m) => ({
      matchId: m.id,
      mode: m.mode,
      mapName: m.map_name,
      completedAt: m.completed_at.toISOString(),
      teams: [...(teams.get(m.id)?.entries() ?? [])].sort(([a], [b]) => a - b).map(([, list]) => list),
      replay:
        m.size_bytes !== null && m.file_name !== null
          ? { sizeBytes: m.size_bytes, fileName: m.file_name }
          : null,
      hasStats: m.has_stats,
    }));
    return { rows, hasMore: matches.length > PAGE };
  });
