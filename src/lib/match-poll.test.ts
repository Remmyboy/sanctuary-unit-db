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
    ...over,
  }) as MatchView;

describe('pollDelay', () => {
  it('keeps trying until the match has loaded', () => {
    expect(pollDelay(undefined)).toBe(FAST_MS);
  });

  it('stops for a match that could not be loaded', () => {
    expect(pollDelay(null)).toBeNull();
  });

  it('is fast through the auto-launch countdown and launch', () => {
    expect(pollDelay(match({ mmMode: 'auto', mmStatus: 'countdown' }))).toBe(FAST_MS);
    expect(pollDelay(match({ mmMode: 'auto', mmStatus: 'launch' }))).toBe(FAST_MS);
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
