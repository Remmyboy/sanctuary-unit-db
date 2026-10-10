// Download a match's replay: a redirect to a short-lived presigned R2 URL,
// so the bytes come straight from Cloudflare (free egress) and save under
// the game's own file name. Public, like finished match pages.
//
//   GET /api/replays/{matchId}  → 302 | 404

import { createFileRoute } from '@tanstack/react-router';
import { loadReplay } from '../server/match-uploads';
import { isUuid } from '../server/mm';
import { downloadUrl, storageConfigured } from '../server/storage';
import { DOWNLOAD_URL_TTL_S } from '../lib/match-replay';

const notFound = () =>
  new Response('No replay for this match.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const Route = createFileRoute('/api/replays/$matchId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!isUuid(params.matchId) || !storageConfigured()) return notFound();
        const replay = await loadReplay(params.matchId);
        if (!replay || replay.status !== 'ready') return notFound();
        const url = await downloadUrl(replay.object_key, replay.file_name, DOWNLOAD_URL_TTL_S);
        return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
      },
    },
  },
});
