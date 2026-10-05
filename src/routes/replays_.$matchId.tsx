// One finished game from the Replays page, spoiler-free until asked: the
// map, the players and the replay first; the result, rating changes and
// match stats only after "Reveal result". The full match page
// (/ladder/match/$matchId) shows everything at once; this is the page for
// watching the replay before knowing how it ends.

import { useEffect, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { MapPreview } from '../components/MapPreview';
import { MatchStatsPanel, ReplayPanel } from '../components/MatchUploads';
import { formatPlayed } from '../lib/match-replay';
import { matchGet } from '../server/match-fns';
import type { MatchParticipant, MatchView } from '../lib/ladder-types';

export const Route = createFileRoute('/replays_/$matchId')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Replay — SanctuaryDB' }] }),
  component: ReplayView,
});

const byName = (a: MatchParticipant, b: MatchParticipant) =>
  a.personaName.localeCompare(b.personaName, undefined, { sensitivity: 'base' });

function ReplayView() {
  const { matchId } = Route.useParams();
  const [match, setMatch] = useState<MatchView | null | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let alive = true;
    setMatch(undefined);
    setRevealed(false);
    matchGet({ data: { matchId, mod: null } })
      .then((m) => alive && setMatch(m))
      .catch(() => alive && setMatch(null));
    return () => {
      alive = false;
    };
  }, [matchId]);

  if (match === undefined) return <main className="match-room" />;
  if (match === null || match.status !== 'completed') {
    return (
      <main className="match-room">
        <Link to="/replays" className="linkish back">
          ← Replays
        </Link>
        <p className="empty">
          {match === null
            ? "This game isn't here — it may not have finished, or the ladder isn't reachable."
            : 'This game has no result yet.'}{' '}
          <Link to="/replays">Back to the replays</Link>
        </p>
      </main>
    );
  }

  const teams = [...new Set(match.participants.map((p) => p.team))]
    .sort((a, b) => a - b)
    .map((team) => match.participants.filter((p) => p.team === team).sort(byName));
  // Who started where gives nothing away, so the preview keeps its markers.
  const starts = match.participants
    .filter((p) => p.slot !== null)
    .map((p) => ({ army: p.slot as number, name: p.personaName, avatarUrl: p.avatarUrl, you: false }));

  return (
    <main className="match-room replay-view">
      <Link to="/replays" className="linkish back">
        ← Replays
      </Link>

      <div className="match-map">
        <MapPreview name={match.mapName} starts={starts} />
        <div>
          <div className="rk">
            Ranked {match.mode} · {match.completedAt ? formatPlayed(match.completedAt) : 'map'}
          </div>
          <h1>{match.mapName}</h1>
        </div>
      </div>

      <div className="match-teams">
        {teams.map((players, i) => (
          <div key={i} className="team-col">
            <h3>Team {i + 1}</h3>
            {players.map((p) => (
              <div className="match-player" key={p.playerId}>
                {p.avatarUrl && <img src={p.avatarUrl} alt="" width={36} height={36} />}
                <div>
                  <Link to="/ladder/player/$steamId" params={{ steamId: p.steamId }}>
                    {p.personaName}
                  </Link>
                  {p.faction && <span className="assign">{p.faction}</span>}
                  {revealed && p.ratingDelta != null && p.ratingAfter != null && (
                    <div className="dim">
                      <strong className={p.ratingDelta >= 0 ? 'delta-up' : 'delta-down'}>
                        {p.ratingDelta >= 0 ? '+' : ''}
                        {p.ratingDelta}
                      </strong>{' '}
                      <strong className="lb-rating">{p.ratingAfter}</strong>
                    </div>
                  )}
                </div>
                {revealed && p.outcome && <span className={`outcome ${p.outcome}`}>{p.outcome}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <ReplayPanel matchId={match.id} replay={match.replay} canEnable={false} />
      {!match.replay && <p className="match-note">No replay was uploaded for this game.</p>}

      {revealed ? (
        <>
          {match.stats ? (
            <MatchStatsPanel stats={match.stats} participants={match.participants} />
          ) : (
            <p className="match-note">No stats were uploaded for this game.</p>
          )}
          <p className="match-note">
            <Link to="/ladder/match/$matchId" params={{ matchId: match.id }}>
              Full match page
            </Link>
          </p>
        </>
      ) : (
        <div className="spoiler-gate">
          <p>
            The result{match.stats ? ', rating changes and match stats are' : ' and rating changes are'}{' '}
            hidden so you can watch the replay first.
          </p>
          <button type="button" className="btn primary" onClick={() => setRevealed(true)}>
            Reveal result
          </button>
        </div>
      )}
    </main>
  );
}
