// Games being streamed live by players who opted in (LadderReporter's
// Live.Stream), and ones that ended in the last day — still watchable from
// the start. Watching happens in the game: each row opens the stream's page,
// whose button hands the stream to the mod (live_.$streamId.tsx).

import { useEffect, useState } from 'react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageHead } from '../components/PageHead';
import { formatPlayed } from '../lib/match-replay';
import { LiveTeams } from '../components/LiveTeams';
import { formatDelay, LIVE_DELAY_S, type LiveListRow } from '../lib/live-replay';
import { liveList } from '../server/live-fns';

export const Route = createFileRoute('/live')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Live games — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Watch Sanctuary: Shattered Sun games as they are played, in your own game, three minutes behind.',
      },
    ],
  }),
  component: LivePage,
});

const POLL_MS = 30_000;

function LivePage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<LiveListRow[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const load = () =>
      liveList()
        .then((r) => alive && setRows(r))
        .catch(() => alive && setRows((prev) => (prev === undefined ? null : prev)));
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const open = (id: string) => void navigate({ to: '/live/$streamId', params: { streamId: id } });

  return (
    <>
      <PageHead art="replays" eyebrow="Multiplayer" title="Live games">
        Games players are streaming right now, {formatDelay(LIVE_DELAY_S)} behind. Open one and press Watch in
        game: it plays in Sanctuary like a replay that keeps going.
      </PageHead>
      <main className="replays">
        {rows === undefined ? null : rows === null ? (
          <p className="empty">Live games aren't reachable right now — they'll be back shortly.</p>
        ) : rows.length === 0 ? (
          <p className="empty">
            Nobody is streaming right now. Players can switch on Live.Stream in LadderReporter's settings.
          </p>
        ) : (
          <table className="lb-table replay-table">
            <thead>
              <tr>
                <th />
                <th>Players</th>
                <th>Map</th>
                <th>Started</th>
                <th aria-label="View" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="row-link"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('a, button')) open(r.id);
                  }}
                >
                  <td>
                    {r.live ? <span className="live-dot">Live</span> : <span className="dim">Ended</span>}
                  </td>
                  <td className="replay-players">
                    <LiveTeams row={r} />
                  </td>
                  <td className="replay-map" title={r.mapName}>
                    {r.mapName}
                  </td>
                  <td className="dim">{formatPlayed(r.startedAt)}</td>
                  <td>
                    <Link to="/live/$streamId" params={{ streamId: r.id }} className="linkish">
                      Watch →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
