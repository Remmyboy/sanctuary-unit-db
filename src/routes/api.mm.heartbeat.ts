// The mod's 5-second heartbeat, which doubles as its poll. It records what
// the game is doing (only `menu` is launchable), runs the lazy sweep so
// countdowns and timeouts fire even when nobody has the site open, and
// answers with the player's current match.
//
// Being retired: docs/local-bridge.md moves presence into the polls the
// browser already makes, and the match object onto the page's local
// connection to the mod. This route stays until every player has the
// bridged mod, so the two writers share recordPresence.
//
// This is a capability signal, not a gate: queueing happens on the site and
// works with no mod at all. The heartbeat only decides whether a pair gets
// the `auto` flow.
//
// Three round trips: the token, the presence write, then sweep + queued +
// match. The mod treats a heartbeat older than 15 s as "not launchable", so
// this has to stay fast — anything over 1.5 s is logged.
//
//   POST /api/mm/heartbeat  { state, gameVersion?, modVersion? }
//   → { queued, match }

import { createFileRoute } from '@tanstack/react-router';
import { sql } from '../server/db';
import { authenticate, bad, currentModMatch, json, logSlow, readJson } from '../server/mm';
import { recordPresence } from '../server/presence';
import { parseModSignal } from '../lib/mm';

export const Route = createFileRoute('/api/mm/heartbeat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const me = await authenticate(request);
        if (!me) return bad(401, 'Session expired or unknown — mint a new one.');

        const body = await readJson(request);
        if (!body) return bad(400, 'Body is not JSON.');
        const mod = parseModSignal(body);
        if (!mod) return bad(400, 'state must be menu, lobby, loading or ingame.');

        // Presence first, on its own, so the sweep that follows sees this
        // heartbeat when a countdown is hitting zero right now.
        await recordPresence(me.playerId, mod);

        const [{ queued }] = await sql()<{ queued: boolean }[]>`
          select sweep_all(), exists (
            select 1 from queue_entries
            where player_id = ${me.playerId} and heartbeat_at > now() - interval '90 seconds'
          ) as queued`;

        const match = await currentModMatch(me.playerId, me.steamId);
        logSlow('heartbeat', startedAt, `${me.personaName} ${mod.state}`);
        return json(200, { queued, match });
      },
    },
  },
});
