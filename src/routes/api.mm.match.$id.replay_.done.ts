// The mod's upload to R2 finished: check the object is whole and publish it.
// A wrong size releases the reservation, so the next attempt starts over.
//
//   POST /api/mm/match/{id}/replay/done  {}  → { ok: true } | 409 { error }

import { createFileRoute } from '@tanstack/react-router';
import { completeReplay } from '../server/match-uploads';
import { authenticate, bad, isUuid, json } from '../server/mm';
import { storageConfigured } from '../server/storage';

export const Route = createFileRoute('/api/mm/match/$id/replay_/done')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await authenticate(request);
        if (!me) return bad(401, 'Session expired or unknown — mint a new one.');
        if (!isUuid(params.id)) return bad(404, 'No such match.');
        if (!storageConfigured()) return bad(503, 'Replay storage is not set up.');

        const done = await completeReplay(params.id, me.playerId);
        if (done.kind === 'none') return bad(404, 'No replay upload of yours is waiting for this match.');
        if (done.kind === 'mismatch') return bad(409, `Upload incomplete — ${done.message} Start again.`);
        return json(200, { ok: true });
      },
    },
  },
});
