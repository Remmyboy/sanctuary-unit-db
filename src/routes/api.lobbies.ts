// The open custom-game lobbies, for anyone: the same list the game's lobby
// browser reads, fetched from Steam here because the Web API needs our key
// (see src/lib/lobbies.ts for why that works with no mod).
//
//   GET /api/lobbies
//   → { ok, fetchedAt, lobbies: [{ id, appId, name, host, map, players,
//                                  maxPlayers, version, dedicated }] }
//
// One answer for every viewer, so the CDN holds it for twenty seconds: a page
// full of viewers costs one function call per region per twenty seconds, and
// nothing at all while nobody is looking. A failed Steam lookup is cached
// briefly so it recovers quickly. Public and CORS-open like /api/game-version,
// so a Discord bot can poll it too.

import { createFileRoute } from '@tanstack/react-router';
import { listLobbies } from '../server/lobbies';

export const Route = createFileRoute('/api/lobbies')({
  server: {
    handlers: {
      GET: async () => {
        const list = await listLobbies();
        return new Response(JSON.stringify(list), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': list.ok
              ? 'public, max-age=0, s-maxage=20, stale-while-revalidate=40'
              : 'public, max-age=0, s-maxage=5',
          },
        });
      },
    },
  },
});
