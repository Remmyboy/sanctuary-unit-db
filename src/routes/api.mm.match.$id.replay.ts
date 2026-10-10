// Reserves the match's replay for upload and hands out presigned R2 URLs
// (docs/matchmaking-api.md). The file itself never passes through here — it
// is bigger than a function body may be — the mod PUTs it to R2 and then
// calls /replay/done. One replay per match: the second player is told it's
// already stored.
//
//   POST /api/mm/match/{id}/replay  { sizeBytes, sha256, gameVersion, buildId, mapPath, fileName, sidecarBytes }
//   → { upload: { url, sidecarUrl }, expiresAt } | { skip: 'stored' } | { retryAfterS }

import { createFileRoute } from '@tanstack/react-router';
import { loadUploadTarget, pruneReplays, reserveReplay } from '../server/match-uploads';
import { authenticate, bad, isUuid, json, readJsonCapped } from '../server/mm';
import { presign, storageConfigured } from '../server/storage';
import {
  mapStem,
  parseReplaySlot,
  REPLAY_MAX_BYTES,
  SIDECAR_MAX_BYTES,
  UPLOAD_URL_TTL_S,
} from '../lib/match-replay';

// A replay exists once the game has a result; until then (or after a
// cancel) there is nothing to attach it to.
const UPLOADABLE = ['reported', 'completed', 'disputed'];

export const Route = createFileRoute('/api/mm/match/$id/replay')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const me = await authenticate(request);
        if (!me) return bad(401, 'Session expired or unknown — mint a new one.');
        if (!isUuid(params.id)) return bad(404, 'No such match.');
        if (!storageConfigured())
          return json(503, { error: 'Replay storage is not set up.', retryAfterS: 3600 });

        const read = await readJsonCapped(request, 4096);
        if ('status' in read) return bad(400, 'Body is not JSON.');
        const slot = parseReplaySlot(read.body);
        if (typeof slot === 'string') return bad(400, `Malformed replay request: ${slot}.`);
        if (slot.sizeBytes > REPLAY_MAX_BYTES || slot.sidecarBytes > SIDECAR_MAX_BYTES) {
          return bad(413, 'Replay too large.');
        }

        const match = await loadUploadTarget(params.id);
        if (!match || !match.players.some((p) => p.playerId === me.playerId))
          return bad(404, 'No such match.');
        if (!UPLOADABLE.includes(match.status))
          return bad(404, 'The match has no result to attach a replay to.');
        // An auto match knows its map's path, so a replay of some other game
        // can't be attached to it by mistake. Manual matches only have a
        // display name, which isn't reliably the file name.
        if (match.mapPath && mapStem(match.mapPath) !== mapStem(slot.mapPath)) {
          return bad(400, 'The replay is of a different map.');
        }

        await pruneReplays().catch((e: Error) => console.warn(`[replays] prune failed: ${e.message}`));

        const result = await reserveReplay(params.id, match.createdAt, me.playerId, slot);
        if (result.kind === 'stored') return json(200, { skip: 'stored' });
        if (result.kind === 'busy') return json(200, { retryAfterS: result.retryAfterS });

        const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_S * 1000).toISOString();
        return json(200, {
          upload: {
            url: await presign('PUT', result.objectKey, UPLOAD_URL_TTL_S),
            sidecarUrl: result.sidecarKey ? await presign('PUT', result.sidecarKey, UPLOAD_URL_TTL_S) : null,
          },
          expiresAt,
        });
      },
    },
  },
});
