// End-of-match stats from LadderReporter, when the player opted in
// (docs/matchmaking-api.md, src/lib/match-stats.ts). Either participant may
// upload; a second upload that agrees marks the stats confirmed.
//
//   POST /api/mm/match/{id}/stats  { format: 1, armies, timeline, … }  → { ok: true }

import { createFileRoute } from '@tanstack/react-router';
import { loadUploadTarget, saveStats } from '../server/match-uploads';
import { authenticate, bad, isUuid, json, readJsonCapped } from '../server/mm';
import { parseStatsUpload, STATS_MAX_BYTES } from '../lib/match-stats';

export const Route = createFileRoute('/api/mm/match/$id/stats')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await authenticate(request);
        if (!me) return bad(401, 'Session expired or unknown — mint a new one.');
        if (!isUuid(params.id)) return bad(404, 'No such match.');

        const read = await readJsonCapped(request, STATS_MAX_BYTES);
        if ('status' in read)
          return bad(read.status, read.status === 413 ? 'Stats too large.' : 'Body is not JSON.');

        const match = await loadUploadTarget(params.id);
        if (!match || !match.players.some((p) => p.playerId === me.playerId))
          return bad(404, 'No such match.');
        if (match.status === 'cancelled') return bad(404, 'The match was cancelled.');

        const stats = parseStatsUpload(
          read.body,
          match.players.map((p) => p.steamId),
        );
        if (typeof stats === 'string') return bad(400, `Malformed stats: ${stats}.`);

        await saveStats(params.id, me.playerId, stats);
        return json(200, { ok: true });
      },
    },
  },
});
