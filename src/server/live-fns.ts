// The Live pages: games being streamed right now, and ones that ended
// recently enough to still watch. Public. Nothing here hands out replay
// bytes; the game fetches those from /api/live/{id}, held back by the delay.

import { createServerFn } from '@tanstack/react-start';
import { listStreams, streamView } from './live-replays';
import { isUuid } from './mm';
import type { LiveListRow, LiveStreamView } from '../lib/live-replay';

export const liveList = createServerFn({ method: 'GET' }).handler(async (): Promise<LiveListRow[]> =>
  listStreams(),
);

export const liveGet = createServerFn({ method: 'POST' })
  .validator((data: unknown): { id: string } => {
    const id = (data as { id?: unknown } | null)?.id;
    return { id: isUuid(id) ? id : '' };
  })
  .handler(async ({ data }): Promise<LiveStreamView | null> => (data.id ? streamView(data.id) : null));
