// One chunk of a live replay: whole network frames, in order, straight after
// the last one (docs/live-replays.md). The body is the raw bytes. Small, so
// the function stores it in R2 itself rather than handing out an upload URL.
//
//   POST /api/mm/live/{id}/chunk/{seq}  <bytes>
//   → { next } | 409 { error, next } (send `next` instead) | 410 (the stream is over)

import { createFileRoute } from '@tanstack/react-router';
import { appendChunk } from '../server/live-replays';
import { authenticate, bad, isUuid, json } from '../server/mm';
import { storageConfigured } from '../server/storage';
import { CHUNK_MAX_BYTES } from '../lib/live-replay';

export const Route = createFileRoute('/api/mm/live_/$id/chunk/$seq')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await authenticate(request);
        if (!me) return bad(401, 'Session expired or unknown — mint a new one.');
        if (!isUuid(params.id)) return bad(404, 'No such stream.');
        if (!/^\d{1,6}$/.test(params.seq)) return bad(400, 'Bad chunk number.');
        if (!storageConfigured()) return bad(503, 'Replay storage is not set up.');

        if (Number(request.headers.get('content-length') ?? 0) > CHUNK_MAX_BYTES)
          return bad(413, 'Chunk too large.');
        const body = new Uint8Array(await request.arrayBuffer());
        if (body.length > CHUNK_MAX_BYTES) return bad(413, 'Chunk too large.');

        const r = await appendChunk(params.id, me.playerId, Number(params.seq), body);
        switch (r.kind) {
          case 'ok':
            return json(200, { next: r.next });
          case 'none':
            return bad(404, 'No such stream of yours.');
          case 'over':
            return bad(410, 'The stream is over.');
          case 'gap':
            return json(409, { error: `Expected chunk ${r.next}.`, next: r.next });
          case 'full':
            return bad(413, 'The stream is at its size limit.');
          case 'bad':
            return bad(400, `Not whole replay frames: ${r.message}.`);
        }
      },
    },
  },
});
