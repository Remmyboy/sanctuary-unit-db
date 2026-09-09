// How alive the queues are, for anyone: the Play page before you queue, the
// signed-out Play page, the ladder sidebar. One answer for every viewer, so
// the CDN holds it for thirty seconds and a room full of tabs costs one
// function call per region — the point being that nothing about "3 in
// queue" needs a database query per person per five seconds.
//
//   GET /api/queue-counts
//   → { waiting: { '1v1': n, '2v2': n, '3v3': n }, liveGames: n }
//
// No sweep here: this is decoration, and every real poll sweeps.

import { createFileRoute } from '@tanstack/react-router';
import { countQueues } from '../server/queue-counts';

export const Route = createFileRoute('/api/queue-counts')({
  server: {
    handlers: {
      GET: async () => {
        const counts = await countQueues();
        return new Response(JSON.stringify(counts), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=90',
          },
        });
      },
    },
  },
});
