// The public queue counts, read from the CDN-cached /api/queue-counts rather
// than a server function, so many viewers share one answer. Null when the
// backend is unreachable (the static e2e build): the UI shows dashes.

import type { QueueCounts } from './ladder-types';

export async function fetchQueueCounts(): Promise<QueueCounts | null> {
  try {
    const res = await fetch('/api/queue-counts');
    if (!res.ok) return null;
    return (await res.json()) as QueueCounts;
  } catch {
    return null;
  }
}
