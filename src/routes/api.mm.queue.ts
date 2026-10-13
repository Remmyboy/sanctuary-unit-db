// The in-game queue: LadderReporter (0.6+) queues the player itself, from a
// panel in the game's main menu or because the Play page handed it the
// click over the local bridge (docs/local-bridge.md, POST /queue). One
// endpoint does join, leave and the 5-second heartbeat, so a queued game
// costs exactly what a queued browser tab does — and the tab, seeing the
// game hold the queue, stops polling and shows the game's answer instead.
//
//   POST /api/mm/queue  { join?: Mode[], leave?: Mode[], factions?: Faction[], mod?: ModSignal }
//   → { status: PlayStatus, match: ModMatch | null, open: OpenMatch | null }
//
// `match` is the 1v1 the mod launches (the same object the match room pushes
// over the bridge), so a game queued from its own menu needs no browser tab
// at all. `open` is any game the player is in, team modes included, so the
// game can say who hosts it.

import { createFileRoute } from '@tanstack/react-router';
import { sql } from '../server/db';
import { authenticate, bad, json, loadModMatch, logSlow, readJson } from '../server/mm';
import { factionsInput, heartbeatQueue, joinQueue, leaveQueue, playStatus } from '../server/queue';
import { MODES, isMode, type Mode } from '../lib/ladder-modes';
import { parseModSignal } from '../lib/mm';

// A game the player is in right now, as the in-game panel shows it.
interface OpenMatch {
  id: string;
  mode: Mode;
  mapName: string;
  auto: boolean;
  host: { steamId: string; name: string };
}

const modesInput = (v: unknown): Mode[] | null => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every(isMode)) return null;
  return MODES.filter((m) => v.includes(m));
};

async function loadOpen(matchId: string): Promise<OpenMatch | null> {
  const [row] = await sql()<
    { id: string; mode: Mode; map_name: string; mm_mode: string; steam_id: string; name: string }[]
  >`
    select m.id, m.mode, m.map_name, m.mm_mode, p.steam_id, coalesce(p.display_name, p.persona_name) as name
    from matches m join players p on p.id = m.host_player_id
    where m.id = ${matchId}`;
  return row
    ? {
        id: row.id,
        mode: row.mode,
        mapName: row.map_name,
        auto: row.mm_mode === 'auto',
        host: { steamId: row.steam_id, name: row.name },
      }
    : null;
}

export const Route = createFileRoute('/api/mm/queue')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const me = await authenticate(request);
        if (!me) return bad(401, 'Session expired or unknown — mint a new one.');

        const body = await readJson(request);
        if (!body) return bad(400, 'Body is not JSON.');
        const join = modesInput(body.join);
        const leave = modesInput(body.leave);
        if (!join || !leave) return bad(400, `join and leave are lists of ${MODES.join(', ')}.`);
        const mod = parseModSignal(body.mod);

        // Leave first, so a body naming a mode in both ends up queued in it.
        await leaveQueue(me.playerId, leave);
        if (join.length > 0) {
          const factions = factionsInput(body.factions);
          for (const mode of join) await joinQueue(me.playerId, mode, factions, mod);
        }
        await heartbeatQueue(me.playerId, mod);

        const status = await playStatus(me.playerId);
        const open = status.matchId ? await loadOpen(status.matchId) : null;
        const match = open?.mode === '1v1' ? await loadModMatch(open.id, me.steamId) : null;
        logSlow('queue', startedAt, `join=${join.join(',')} leave=${leave.join(',')}`);
        return json(200, { status, match, open });
      },
    },
  },
});
