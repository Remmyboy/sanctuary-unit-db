// What a watching game polls (docs/live-replays.md): the stream's header
// facts and the chunks from `from` on that are past the delay, each with a
// short-lived R2 URL. Public, like the live page; no sign-in needed to watch.
//
//   GET /api/live/{id}?from=n
//   → { id, gameVersion, mapPath, fileName, sidecar, delayS, chunks: [{ seq, sizeBytes, url }],
//       complete, startsInS } | 404

import { createFileRoute } from '@tanstack/react-router';
import { viewerPoll } from '../server/live-replays';
import { bad, isUuid } from '../server/mm';
import { storageConfigured } from '../server/storage';

export const Route = createFileRoute('/api/live/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isUuid(params.id) || !storageConfigured()) return bad(404, 'No such stream.');
        const raw = new URL(request.url).searchParams.get('from') ?? '0';
        if (!/^\d{1,6}$/.test(raw)) return bad(400, 'Bad from.');
        const poll = await viewerPoll(params.id, Number(raw));
        if (!poll) return bad(404, 'No such stream.');
        return new Response(JSON.stringify(poll), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      },
    },
  },
});
