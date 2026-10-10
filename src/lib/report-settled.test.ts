// The second of two auto-reports usually lands on a match the first one
// already completed (live, 2026-10-05: the winner's client got a 404 and
// uploaded nothing). These pin how such a late report is answered.

import { describe, expect, it } from 'vitest';
import { answerSettled } from './report-settled';

describe('answerSettled', () => {
  it('confirms a report that agrees with the recorded winner', () => {
    expect(answerSettled('completed', 1, 1)).toEqual({ status: 200, outcome: 'applied' });
    expect(answerSettled('completed', 2, 2)).toEqual({ status: 200, outcome: 'applied' });
  });

  it('refuses one that contradicts a completed match, without disputing it', () => {
    expect(answerSettled('completed', 1, 2)).toMatchObject({ status: 409 });
  });

  it('refuses when the completed match names no winner', () => {
    expect(answerSettled('completed', null, 1)).toMatchObject({ status: 409 });
  });

  it('answers disputed for a disputed match, whichever side the report takes', () => {
    expect(answerSettled('disputed', 1, 1)).toEqual({ status: 200, outcome: 'disputed' });
    expect(answerSettled('disputed', 1, 2)).toEqual({ status: 200, outcome: 'disputed' });
    expect(answerSettled('disputed', null, 2)).toEqual({ status: 200, outcome: 'disputed' });
  });
});
