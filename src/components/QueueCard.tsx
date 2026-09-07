// One queue on the Play page. The count line ("3 in queue · need 4") is the
// honest signal of whether a game is likely soon, so it's always shown —
// signed in or not. The 1v1 card also carries the auto-launch bits: which
// factions you'll accept, and whether your game is ready to be launched.

import type { Mode } from '../lib/ladder-modes';
import { searchRadius } from '../lib/matchmaking';
import { FACTIONS, isLaunchableState, type Faction, type ModState } from '../lib/mm';
import { disableBridge, enableBridge, retryBridge, type BridgeState } from '../lib/mod-bridge';
import { useNow } from '../lib/use-now';
import type { ModPresence, QueueModeStatus } from '../lib/ladder-types';

const elapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const BLURB: Record<Mode, string> = {
  '1v1': 'Head to head against the nearest-rated opponent in queue.',
  '2v2': 'Solo queue — four players, split into the most even teams by rating.',
  '3v3': 'Solo queue — six players, split into the most even teams by rating.',
};

// What follows "Auto-launch ready" or "Game seen", per state. The mod (0.3+)
// leaves a lobby or closes a replay itself when the match launches.
const STATE_NOTE: Record<ModState, string> = {
  menu: "if your opponent's is too, the game starts itself.",
  lobby: "game seen in a lobby — you'll be taken out of it for the match.",
  replay: "game seen in a replay — it'll be closed for the match.",
  loading: 'loading a game — back to the main menu to auto-launch.',
  ingame: 'in a game — back to the main menu to auto-launch.',
};

// The game on this PC, as far as the page can tell (docs/local-bridge.md).
//
// The page only starts looking once the player asks it to: the first
// request to 127.0.0.1 is what makes Chrome ask whether this site may reach
// devices on the local network, so the button says what that prompt is for
// before it appears, and players without the mod never see it.
//
// Until every player has the bridged mod, the server's last word — an older
// mod's heartbeat, as the status poll reports it — stands in whenever the
// page itself sees nothing.
function LaunchState({ bridge, serverMod }: { bridge: BridgeState; serverMod: ModPresence | null }) {
  const seen = bridge.status
    ? { state: bridge.status.state, ready: isLaunchableState(bridge.status.state) }
    : serverMod
      ? { state: serverMod.state, ready: serverMod.launchable }
      : null;

  if (seen) {
    return (
      <p className="launch-state" data-ready={seen.ready || undefined}>
        {seen.ready ? (
          <>
            <strong>Auto-launch ready</strong> — {STATE_NOTE[seen.state]}
          </>
        ) : (
          <>Game seen {STATE_NOTE[seen.state]}</>
        )}
      </p>
    );
  }

  if (!bridge.enabled) {
    return (
      <div className="launch-state launch-connect">
        <button type="button" className="btn" onClick={enableBridge}>
          Connect to Sanctuary
        </button>
        <span>
          Lets this page see whether Sanctuary is open with the LadderReporter mod, and start your match in
          it. Your browser will ask whether this site can connect to devices on your local network: that is
          the permission for reaching the mod inside your game on this PC.
        </span>
      </div>
    );
  }

  if (!bridge.probed) {
    return <p className="launch-state">Looking for your game…</p>;
  }

  return (
    <p className="launch-state">
      Can't see your game — run Sanctuary with the LadderReporter mod. If your browser blocked the connection,
      allow it in this site's permissions.{' '}
      <button type="button" className="linkish" onClick={retryBridge}>
        Retry
      </button>{' '}
      ·{' '}
      <button type="button" className="linkish" onClick={disableBridge}>
        Stop looking
      </button>
    </p>
  );
}

export function QueueCard({
  mode,
  status,
  joinedAtMs,
  waiting,
  signedIn,
  blocked,
  busy,
  factions,
  bridge,
  serverMod,
  onFactions,
  onJoin,
  onLeave,
}: {
  mode: Mode;
  status: QueueModeStatus | null; // null when signed out or not loaded yet
  joinedAtMs: number | null; // local anchor derived from the last poll; see PlayPage
  waiting: number | null; // null until the first count arrives
  signedIn: boolean;
  blocked: boolean; // an open match to deal with first
  busy: boolean;
  factions: Faction[]; // 1v1 only: what an auto match may launch you as
  bridge: BridgeState; // 1v1 only: the local mod, as the page sees it
  serverMod: ModPresence | null; // 1v1 only: the mod as the last status poll reported it
  onFactions: (f: Faction[]) => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const inQueue = status?.inQueue ?? false;

  // The server says how long we've waited once per poll; the page anchors a
  // local start time on each answer and this ticks from it, so the timer
  // counts every second and re-syncs whenever the poll comes back.
  const now = useNow();
  const seconds = joinedAtMs === null ? 0 : Math.max(0, Math.floor((now - joinedAtMs) / 1000));

  const auto = mode === '1v1' && signedIn;

  return (
    <div className="queue-widget queue-card" data-active={inQueue || undefined}>
      <h2>Ranked {mode}</h2>
      <p className="queue-count">{waiting === null ? '—' : waiting} in queue</p>
      {inQueue && status ? (
        <>
          <p className="queue-pulse">
            Searching… <strong>{elapsed(seconds)}</strong>
          </p>
          <p className="dim">
            Matching within ±{searchRadius(seconds)} rating — the range widens the longer you wait. Browse the
            rest of the site meanwhile; just keep SanctuaryDB open in a tab.
          </p>
          {auto && (
            <p className="dim">
              Playing as {factions.length === FACTIONS.length ? 'any faction' : factions.join(' or ')}.
            </p>
          )}
          <button type="button" className="btn" disabled={busy} onClick={onLeave}>
            Leave queue
          </button>
        </>
      ) : (
        <>
          <p className="dim">{BLURB[mode]}</p>
          {auto && (
            <div className="faction-pick" aria-label="Factions you'll play as">
              {FACTIONS.map((f) => {
                const on = factions.includes(f);
                return (
                  <label key={f} className="faction-opt" data-on={on || undefined}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy}
                      onChange={() => {
                        const next = on ? factions.filter((x) => x !== f) : [...factions, f];
                        // Nothing ticked means anything goes — never a reason not to queue.
                        onFactions(next.length > 0 ? next : [...FACTIONS]);
                      }}
                    />
                    {f}
                  </label>
                );
              })}
            </div>
          )}
          {signedIn && (
            <button type="button" className="btn primary" disabled={busy || blocked} onClick={onJoin}>
              Find match
            </button>
          )}
        </>
      )}
      {auto && <LaunchState bridge={bridge} serverMod={serverMod} />}
    </div>
  );
}
