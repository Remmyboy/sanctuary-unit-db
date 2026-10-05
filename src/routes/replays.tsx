// Every finished ranked game, newest first, spoiler-free: who played, where
// and when, and the replay to download, but never who won. Opening a game
// shows it the same way, with the result and stats behind a reveal
// (replays_.$matchId.tsx). Public; degrades to its empty state when the
// backend is unreachable, like the ladder.

import { useEffect, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageHead } from '../components/PageHead';
import { formatBytes, formatPlayed } from '../lib/match-replay';
import { replayList } from '../server/replay-fns';
import type { ReplayListRow } from '../lib/ladder-types';

interface ReplaysSearch {
  only?: string; // 'replays': games with a replay to download
}

export const Route = createFileRoute('/replays')({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): ReplaysSearch => ({
    only: raw.only === 'replays' ? 'replays' : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Replays — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Replays of ranked Sanctuary: Shattered Sun games, spoiler-free: download a game and watch it before you see who won.',
      },
    ],
  }),
  component: ReplaysPage,
});

function ReplaysPage() {
  const { only } = Route.useSearch();
  const withReplay = only === 'replays';
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReplayListRow[] | null | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  // A new filter starts the list over.
  useEffect(() => {
    let alive = true;
    setRows(undefined);
    setPage(0);
    replayList({ data: { page: 0, withReplay } })
      .then((r) => {
        if (!alive) return;
        setRows(r.rows);
        setHasMore(r.hasMore);
      })
      .catch(() => alive && setRows(null));
    return () => {
      alive = false;
    };
  }, [withReplay]);

  const more = () => {
    setLoading(true);
    replayList({ data: { page: page + 1, withReplay } })
      .then((r) => {
        setRows((prev) => [...(prev ?? []), ...r.rows]);
        setHasMore(r.hasMore);
        setPage(page + 1);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoading(false));
  };

  const open = (matchId: string) => void navigate({ to: '/replays/$matchId', params: { matchId } });

  return (
    <>
      <PageHead art="replays" eyebrow="Multiplayer" title="Replays">
        Every ranked game, without spoilers. See who played and where, download the replay, and open a game to
        reveal the result and stats when you're ready.
      </PageHead>
      <div className="toolbar">
        <div className="chips" role="group" aria-label="Show">
          <Link to="/replays" search={{}} className="chip" aria-pressed={!withReplay}>
            All games
          </Link>
          <Link to="/replays" search={{ only: 'replays' }} className="chip" aria-pressed={withReplay}>
            With a replay
          </Link>
        </div>
      </div>
      <main className="replays">
        {rows === undefined ? null : rows === null ? (
          <p className="empty">Replays aren't reachable right now — they'll be back shortly.</p>
        ) : rows.length === 0 ? (
          <p className="empty">
            {withReplay
              ? 'No replays uploaded yet. Players can switch uploads on in LadderReporter.'
              : 'No ranked games played yet.'}
          </p>
        ) : (
          <>
            <table className="lb-table replay-table">
              <thead>
                <tr>
                  <th>Players</th>
                  <th>Map</th>
                  <th>Mode</th>
                  <th>Played</th>
                  <th>Replay</th>
                  <th aria-label="View" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.matchId}
                    className="row-link"
                    // The whole row opens the game; the links and the
                    // download inside it keep their own clicks.
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest('a, button')) open(r.matchId);
                    }}
                  >
                    <td className="replay-players">
                      {r.teams.map((team, i) => (
                        <span key={i}>
                          {i > 0 && <span className="vs"> vs </span>}
                          {team.map((p, j) => (
                            <span key={p.steamId}>
                              {j > 0 && ', '}
                              {p.personaName}
                            </span>
                          ))}
                        </span>
                      ))}
                    </td>
                    <td className="replay-map" title={r.mapName}>
                      {r.mapName}
                    </td>
                    <td className="dim">{r.mode}</td>
                    <td className="dim">{formatPlayed(r.completedAt)}</td>
                    <td>
                      {r.replay ? (
                        <a
                          className="btn replay-dl"
                          href={`/api/replays/${r.matchId}`}
                          download={r.replay.fileName}
                          title={formatBytes(r.replay.sizeBytes)}
                        >
                          Download
                        </a>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td>
                      <Link to="/replays/$matchId" params={{ matchId: r.matchId }} className="linkish">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <button type="button" className="btn replay-more" disabled={loading} onClick={more}>
                {loading ? 'Loading…' : 'Older games'}
              </button>
            )}
          </>
        )}
      </main>
    </>
  );
}
