// One live game (docs/live-replays.md): who is playing where, whether it is
// still going, and "Watch in game", which hands the stream to LadderReporter
// over the local bridge. The mod downloads the chunks from the site itself
// and plays them with the game's replay player; the site only ever hands out
// chunks older than the delay, so a viewer is always that far behind.

import { useEffect, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { LiveTeams } from '../components/LiveTeams';
import { copyText } from '../lib/clipboard';
import { formatPlayed } from '../lib/match-replay';
import { formatDelay, LIVE_DELAY_S, type LiveStreamView } from '../lib/live-replay';
import { useModBridge, watchBridge, watchLive, type BridgeWatch } from '../lib/mod-bridge';
import { useNow } from '../lib/use-now';
import { liveGet } from '../server/live-fns';

export const Route = createFileRoute('/live_/$streamId')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Live game — SanctuaryDB' }] }),
  component: LiveView,
});

const POLL_MS = 15_000;

function LiveView() {
  const { streamId } = Route.useParams();
  return <LiveGame key={streamId} streamId={streamId} />;
}

type Watch =
  { kind: 'idle' } | { kind: 'sending' } | { kind: 'started' } | { kind: 'failed'; error: string | null };

function LiveGame({ streamId }: { streamId: string }) {
  const [stream, setStream] = useState<LiveStreamView | null | undefined>(undefined);
  const [watch, setWatch] = useState<Watch>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const now = useNow();
  const bridge = useModBridge();
  const started = watch.kind === 'started';

  // Once the game has the stream, follow it through the bridge's status.
  useEffect(() => (started ? watchBridge() : undefined), [started]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      liveGet({ data: { id: streamId } })
        .then((s) => {
          if (!alive) return;
          setStream(s);
          // An ended stream doesn't change any more.
          if (s && s.live) timer = setTimeout(load, POLL_MS);
        })
        .catch(() => {
          if (!alive) return;
          setStream((prev) => (prev === undefined ? null : prev));
          timer = setTimeout(load, POLL_MS);
        });
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [streamId]);

  if (stream === undefined) return <main className="match-room" />;
  if (stream === null) {
    return (
      <main className="match-room">
        <Link to="/live" className="linkish back">
          ← Live games
        </Link>
        <p className="empty">
          This stream isn't here — it may have ended more than a day ago, or the site isn't reachable.{' '}
          <Link to="/live">Back to live games</Link>
        </p>
      </main>
    );
  }

  const waitS = Math.ceil((new Date(stream.watchableFrom).getTime() - now) / 1000);
  const onWatch = () => {
    setWatch({ kind: 'sending' });
    void watchLive(stream.id).then((r) =>
      setWatch(r.ok ? { kind: 'started' } : { kind: 'failed', error: r.error }),
    );
  };
  const onCopy = () => void copyText(window.location.href).then((ok) => ok && setCopied(true));

  return (
    <main className="match-room live-view">
      <Link to="/live" className="linkish back">
        ← Live games
      </Link>

      <div className="match-map">
        <div>
          <div className="rk">
            {stream.live ? <span className="live-dot">Live</span> : 'Ended'} · started{' '}
            {formatPlayed(stream.startedAt)}
          </div>
          <h1>{stream.mapName}</h1>
          <p className="replay-players live-players">
            <LiveTeams row={stream} />
          </p>
        </div>
      </div>

      <div className="replay-panel">
        {/* The mod only takes a stream in the menu (or over a replay, which
            it closes); in a game or a lobby it refuses. */}
        {!started && (
          <p className="replay-help live-before">
            <strong>Before you press Watch in game,</strong> open Sanctuary and leave it on the main menu.
          </p>
        )}
        <div className="replay-row">
          <button
            type="button"
            className="btn primary"
            disabled={watch.kind === 'sending' || waitS > 0}
            onClick={onWatch}
          >
            {watch.kind === 'sending' ? 'Starting…' : 'Watch in game'}
          </button>
          <button type="button" className="btn" onClick={onCopy}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          {waitS > 0 && <span className="dim">Watchable in {waitS} s</span>}
        </div>
        {started && <WatchState watching={bridge.status?.watching ?? null} streamId={stream.id} />}
        {watch.kind === 'failed' && (
          <p className="replay-warn">
            {watch.error ??
              "Couldn't reach your game. Open Sanctuary with LadderReporter 0.5.0 or newer and go to the main menu, then try again. If your browser asks, allow this site to connect to your local network."}
          </p>
        )}
        <p className="replay-help">
          {stream.live
            ? `You watch ${formatDelay(LIVE_DELAY_S)} behind the players, in your own game, with the LadderReporter mod. `
            : 'The game is over; it can still be watched from the start for a day. '}
          It needs the same game version as the streaming player
          {stream.modded ? ' and the same gameplay mods' : ''}.
        </p>
      </div>
    </main>
  );
}

// What the game says it is doing with the stream, from the bridge's status.
function WatchState({ watching, streamId }: { watching: BridgeWatch | null; streamId: string }) {
  if (watching?.id === streamId && watching.phase === 'failed') {
    return <p className="replay-warn">Your game couldn't play it: {watching.error ?? 'see its log.'}</p>;
  }
  const line =
    watching?.id !== streamId
      ? 'Starting in your game…'
      : watching.phase === 'waiting'
        ? 'Your game is waiting for the first part of the stream to come out of the delay…'
        : watching.phase === 'loading'
          ? 'Loading in your game…'
          : watching.phase === 'over'
            ? 'Playing in your game; the whole game is in.'
            : 'Playing in your game.';
  return (
    <p className="replay-help">
      {line} It plays from the beginning; speed it up with the replay controls to catch up.
    </p>
  );
}
