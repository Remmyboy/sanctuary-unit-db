// The streaming player left the game: the stream is over once viewers reach
// its last chunk (docs/live-replays.md).
//
//   POST /api/mm/live/{id}/end  {}  → { ok: true }

import { createFileRoute } from '@tanstack/react-router';
import { endStream } from '../server/live-replays';
import { authenticate, bad, isUuid, json } from '../server/mm';

export const Route = createFileRoute('/api/mm/live_/$id/end')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await authenticate(request);
        if (!me) return bad(401, 'Session expired or unknown — mint a new one.');
        if (!isUuid(params.id)) return bad(404, 'No such stream.');
        if (!(await endStream(params.id, me.playerId))) return bad(404, 'No such stream of yours.');
        return json(200, { ok: true });
      },
    },
  },
});
