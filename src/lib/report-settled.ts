// A LadderReporter report that arrives after its match was already settled
// (POST /api/report). With both players running the mod this is the usual
// case for the second report: the loser's concession applies at once and
// completes the match a moment before the winner's client gets there.
//
// The late report changes nothing. It is answered so the mod still learns
// the match id it attaches its stats and replay uploads to.

// How long after settling a report may still find its match when it names
// no matchId. A game ends when it's reported, so a late report is seconds
// behind; the window only has to rule out an old match between the same pair.
export const SETTLED_WINDOW_HOURS = 2;

export type SettledStatus = 'completed' | 'disputed';

export type SettledAnswer = { status: 200; outcome: 'applied' | 'disputed' } | { status: 409; error: string };

// - completed, same winner: it agrees with what is recorded → 'applied'.
// - completed, other winner: 409. A completed match has had its ratings
//   applied, and a dispute only freezes a match before that point
//   (apply_match_result runs from 'reported' alone); un-applying ratings is
//   an admin's call (admin_delete_match), not something a client's word
//   should trigger. The contradiction is answered, not acted on.
// - disputed: already frozen for an admin, whatever this report says.
export function answerSettled(
  status: SettledStatus,
  recordedWinnerTeam: number | null,
  claimedWinnerTeam: number,
): SettledAnswer {
  if (status === 'disputed') return { status: 200, outcome: 'disputed' };
  if (recordedWinnerTeam !== null && recordedWinnerTeam === claimedWinnerTeam) {
    return { status: 200, outcome: 'applied' };
  }
  return { status: 409, error: 'Contradicts the recorded result of this match.' };
}
