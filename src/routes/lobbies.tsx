// Open custom-game lobbies, live from Steam's server list — the same list the
// game's Multiplayer browser shows (src/lib/lobbies.ts has how and why). It
// reads the CDN-cached /api/lobbies, shared by every viewer, and a hidden tab
// doesn't ask at all. Degrades to "can't reach Steam" when there's no key
// (the static e2e build) rather than claiming nobody is hosting.

import { useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { isFull, joinHref, loadLobbies, mapLabel, type Lobby, type LobbyList } from '../lib/lobbies';
import { useNow } from '../lib/use-now';

// The list is cached for 20 s (a further 40 s stale) at the CDN, so asking
// more often than this would mostly get the same copy back.
const POLL_MS = 30_000;

// Past this many seats a row of pips stops being readable at a glance.
const MAX_PIPS = 16;

export const Route = createFileRoute('/lobbies')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Lobbies — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Open custom-game lobbies in Sanctuary: Shattered Sun, live from Steam — join from the browser.',
      },
    ],
  }),
  component: LobbiesPage,
});

function LobbiesPage() {
  // undefined until the first answer; null when even /api/lobbies failed.
  const [list, setList] = useState<LobbyList | null | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let id: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      if (!document.hidden) void loadLobbies().then((l) => alive.current && setList(l));
      id = setTimeout(tick, POLL_MS);
    };
    const onVisible = () => {
      if (document.hidden) return;
      if (id) clearTimeout(id);
      tick();
    };
    tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive.current = false;
      if (id) clearTimeout(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const reachable = !!list?.ok;
  const lobbies = reachable ? list.lobbies : [];
  const open = lobbies.filter((l) => !isFull(l)).length;

  return (
    <>
      <div className="toolbar">
        <span className="toolbar-summary">
          Open lobbies
          {reachable && ` · ${open === 0 ? 'none open right now' : `${open} open now`}`}
        </span>
        {reachable && <Updated at={list.fetchedAt} />}
      </div>
      <main className="lobbies">
        <p className="lobbies-intro dim">
          Custom games waiting for players, from Steam's server list — the same list the game's Multiplayer
          browser shows. A lobby drops off once its game starts.
        </p>

        {list === undefined ? (
          <p className="empty">Asking Steam…</p>
        ) : !reachable ? (
          <p className="empty">Steam's server list can't be reached right now. Try again in a minute.</p>
        ) : lobbies.length === 0 ? (
          <p className="empty">
            Nobody is hosting right now. Host a game from the Multiplayer menu and it shows up here within a
            minute.
          </p>
        ) : (
          <ul className="lobby-list">
            {lobbies.map((l) => (
              <LobbyRow key={l.id} lobby={l} />
            ))}
          </ul>
        )}

        {lobbies.length > 0 && (
          <p className="lobbies-note dim">
            <strong>Join</strong> opens Sanctuary through Steam and takes you into that lobby. You need the
            same version as the host; a different code after the <code>#</code> usually means one of you is
            running Lua mods.
          </p>
        )}
      </main>
    </>
  );
}

function LobbyRow({ lobby: l }: { lobby: Lobby }) {
  const full = isFull(l);
  return (
    <li className="lobby-row" data-full={full || undefined}>
      <div className="lobby-main">
        <span className="lobby-name">{l.name}</span>
        {l.host && <span className="lobby-host dim">hosted by {l.host}</span>}
      </div>
      <span className="lobby-map" title={l.map}>
        {mapLabel(l.map) || '—'}
      </span>
      <span className="lobby-seats" aria-label={`${l.players} of ${l.maxPlayers} players`}>
        {l.maxPlayers > 0 && l.maxPlayers <= MAX_PIPS && (
          <span className="lobby-pips" aria-hidden="true">
            {Array.from({ length: l.maxPlayers }, (_, i) => (
              <span key={i} data-on={i < l.players || undefined} />
            ))}
          </span>
        )}
        <span className="lobby-count">
          {l.players}/{l.maxPlayers}
        </span>
      </span>
      <span className="lobby-version dim" title="Game version # Lua checksum — it has to match yours to join">
        {l.version || '—'}
      </span>
      {full ? (
        <span className="btn lobby-join" aria-disabled="true">
          Full
        </span>
      ) : (
        <a className="btn primary lobby-join" href={joinHref(l)}>
          Join
        </a>
      )}
    </li>
  );
}

// How old the list is — the CDN copy can be up to a minute old, so say so
// rather than implying it's this second's.
function Updated({ at }: { at: string }) {
  const now = useNow();
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  const ago = s < 5 ? 'just now' : s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`;
  return <span className="lobbies-updated">Updated {ago}</span>;
}
