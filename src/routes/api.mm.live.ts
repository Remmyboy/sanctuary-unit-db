// LadderReporter opens a live replay as a game starts, when the player opted
// in (docs/live-replays.md). The chunks follow on /api/mm/live/{id}/chunk/{seq}.
//
//   POST /api/mm/live  { mapPath, gameVersion, buildId, fileName, players, sidecar }
//   → { id, url, delayS }

import { createFileRoute } from '@tanstack/react-router';
import { startStream, pruneLive } from '../server/live-replays';
import { authenticate, bad, json, readJsonCapped } from '../server/mm';
import { storageConfigured } from '../server/storage';
import { LIVE_DELAY_S, parseLiveStart, SIDECAR_MAX_BYTES } from '../lib/live-replay';

export const Route = createFileRoute('/api/mm/live')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const me = await authenticate(request);
        if (!me) return bad(401, 'Session expired or unknown — mint a new one.');
        if (!storageConfigured())
          return json(503, { error: 'Replay storage is not set up.', retryAfterS: 3600 });

        const read = await readJsonCapped(request, SIDECAR_MAX_BYTES + 8 * 1024);
        if ('status' in read)
          return bad(read.status, read.status === 413 ? 'Too large.' : 'Body is not JSON.');
        const start = parseLiveStart(read.body);
        if (typeof start === 'string') return bad(400, `Malformed live stream: ${start}.`);

        await pruneLive().catch((e: Error) => console.warn(`[live] prune failed: ${e.message}`));
        const id = await startStream(me.playerId, start);
        return json(200, { id, url: `${new URL(request.url).origin}/live/${id}`, delayS: LIVE_DELAY_S });
      },
    },
  },
});
