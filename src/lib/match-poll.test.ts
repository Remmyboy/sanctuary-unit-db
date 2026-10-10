// The match room used to poll every 5 s for as long as the tab lived, a
// played game included — several hundred requests per player per match for
// a page nobody was looking at. The delay now follows the match.

import { describe, expect, it } from 'vitest';
import { FAST_MS, SLOW_MS, pollDelay, shouldPoll } from './match-poll';
import type { MatchView } from './ladder-types';

const match = (over: Partial<MatchView>): MatchView =>
  ({
    id: 'm',
    mode: '1v1',
    teamSize: 1,
    status: 'in_progress',
    mmMode: 'manual',
    mmStatus: 'manual',
    hostPlayerId: 'host',
    participants: [{ playerId: 'host' }, { playerId: 'joiner' }],
    mmEvents: [],
    ...over,
  }) as MatchView;

const started = (...players: string[]) =>
  players.map((playerId) => ({
    type: 'started' as const,
    playerId,
    personaName: playerId,
    detail: null,
    at: '',
  }));

describe('pollDelay', () => {
  it('keeps trying until the match has loaded', () => {
    expect(pollDelay(undefined)).toBe(FAST_MS);
  });

  it('stops for a match that could not be loaded', () => {
    expect(pollDelay(null)).toBeNull();
  });

  it('is fast through the auto-launch countdown and launch handshake', () => {
    expect(pollDelay(match({ mmMode: 'auto', mmStatus: 'countdown' }))).toBe(FAST_MS);
    expect(pollDelay(match({ mmMode: 'auto', mmStatus: 'launch' }))).toBe(FAST_MS);
    expect(pollDelay(match({ mmMode: 'auto', mmStatus: 'launch', mmEvents: started('host') }))).toBe(FAST_MS);
  });

  it('slows down once both games have started — the match stays in launch until its result', () => {
    expect(
      pollDelay(match({ mmMode: 'auto', mmStatus: 'launch', mmEvents: started('host', 'joiner') })),
    ).toBe(SLOW_MS);
  });

  it('is slow while a game is played or a result settles', () => {
    expect(pollDelay(match({}))).toBe(SLOW_MS);
    expect(pollDelay(match({ status: 'reported' }))).toBe(SLOW_MS);
    expect(pollDelay(match({ status: 'disputed' }))).toBe(SLOW_MS);
  });

  it('stops once the match is record', () => {
    expect(pollDelay(match({ status: 'completed', mmStatus: 'done' }))).toBeNull();
    expect(pollDelay(match({ status: 'cancelled', mmStatus: 'cancelled' }))).toBeNull();
  });

  it('keeps a slow poll on a fresh result while the mods may still be uploading', () => {
    const now = Date.parse('2026-10-05T12:00:00Z');
    const done = (minutesAgo: number, over: Partial<MatchView> = {}) =>
      match({
        status: 'completed',
        mmStatus: 'done',
        completedAt: new Date(now - minutesAgo * 60_000).toISOString(),
        stats: null,
        replay: null,
        ...over,
      });
    expect(pollDelay(done(2), now)).toBe(SLOW_MS);
    expect(pollDelay(done(2, { stats: {} as MatchView['stats'] }), now)).toBe(SLOW_MS); // replay to come
    expect(pollDelay(done(25), now)).toBeNull(); // nobody uploads this late
    const ready = { status: 'ready', uploading: false } as MatchView['replay'];
    expect(pollDelay(done(2, { stats: {} as MatchView['stats'], replay: ready }), now)).toBeNull();
    const uploading = { status: 'pending', uploading: true } as MatchView['replay'];
    expect(pollDelay(done(2, { stats: {} as MatchView['stats'], replay: uploading }), now)).toBe(SLOW_MS);
  });
});

describe('shouldPoll', () => {
  it('skips a slow poll in a hidden tab', () => {
    expect(shouldPoll(SLOW_MS, true)).toBe(false);
    expect(shouldPoll(SLOW_MS, false)).toBe(true);
  });

  it('never skips a fast one — the player is in the game during a launch', () => {
    expect(shouldPoll(FAST_MS, true)).toBe(true);
  });

  it('never polls a stopped match', () => {
    expect(shouldPoll(null, false)).toBe(false);
  });
});
