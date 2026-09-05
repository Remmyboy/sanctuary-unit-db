// The Play page used to redirect off whatever the shared status last said.
// Nothing polls it while you're in a match, so "Play again" read a status
// still naming the game you'd just finished and sent you back into it. The
// fix has two halves and both live here: every answer is stamped with when
// it arrived, and the match room retires a settled match from the state.

import { describe, expect, it, vi } from 'vitest';
import { MODES } from './ladder-modes';
import type { PlayStatus, QueueModeStatus } from './ladder-types';

// The module talks to the server on a timer; none of that is under test.
vi.mock('../server/queue-fns', () => ({ queueStatus: vi.fn() }));

const idle: QueueModeStatus = {
  inQueue: false,
  queuedSeconds: null,
  searchRadius: null,
  waiting: 0,
  needed: 2,
};

const answer = (matchId: string | null): PlayStatus => ({
  matchId,
  settlingMatchId: null,
  queues: Object.fromEntries(MODES.map((m) => [m, idle])) as PlayStatus['queues'],
  liveGames: 0,
  mod: null,
  factions: [],
});

// State is module-level, so each case gets its own copy of the module.
const fresh = async () => {
  vi.resetModules();
  return import('./queue-watch');
};

describe('queue-watch', () => {
  it('has nothing to say before the first answer', async () => {
    const watch = await fresh();
    expect(watch.queueSnapshot().fetchedAt).toBeNull();
  });

  it('stamps each answer, so a page can tell this visit from the cache', async () => {
    const watch = await fresh();
    const before = Date.now();
    watch.applyStatus(answer(null));
    expect(watch.queueSnapshot().fetchedAt).toBeGreaterThanOrEqual(before);
  });

  it('retires a settled match, so Play again no longer leads back into it', async () => {
    const watch = await fresh();
    watch.applyStatus(answer('m1'));
    watch.clearOpenMatch('m1');
    expect(watch.queueSnapshot().status?.matchId).toBeNull();
  });

  it('leaves an open match alone when some other match settles', async () => {
    const watch = await fresh();
    watch.applyStatus(answer('m2'));
    watch.clearOpenMatch('m1');
    expect(watch.queueSnapshot().status?.matchId).toBe('m2');
  });
});
