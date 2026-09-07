// The admin's mod test bench: drives your own LadderReporter through the
// local bridge with synthetic matches, so most of the auto-launch path can
// be exercised by one person from the browser instead of the BepInEx log.
// Nothing here touches the server — the match objects never exist on the
// site, which is also why the mod's session-id and event posts for them
// come back 404 (it logs that once and carries on).
//
// What one player can test: the bridge and CORS path end to end, the
// countdown overlay, leaving a lobby or closing a replay, lobby creation and
// seating, the window restore, and every host-side abort and timeout. The
// joiner path needs a real lobby to join and the start needs an opponent
// seated, so those stay two-player.

import { useEffect, useState } from 'react';
import { FACTIONS, type Faction, type MmStatus, type ModMatch } from '../lib/mm';
import { enableBridge, pushMatch, useModBridge, watchBridge } from '../lib/mod-bridge';
import { adminMapPools } from '../server/admin-fns';
import type { LadderMapRow, Me } from '../lib/ladder-types';

// A Steam id that is nobody: the other seat in a synthetic match.
const FAKE_OPPONENT = '76561199999999999';

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-test-${Math.random().toString(16).slice(2, 10)}`;

const other = (f: Faction): Faction => FACTIONS.find((x) => x !== f) ?? f;

export function ModTestBench({ me }: { me: Me }) {
  const bridge = useModBridge();
  const [maps, setMaps] = useState<LadderMapRow[] | null>(null);
  const [role, setRole] = useState<'host' | 'joiner'>('host');
  const [mapName, setMapName] = useState('');
  const [faction, setFaction] = useState<Faction>('EDA');
  const [sessionId, setSessionId] = useState('');
  const [matchId, setMatchId] = useState(newId);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => watchBridge(), []);
  useEffect(() => {
    adminMapPools()
      .then((rows) => {
        const pool = rows.filter((r) => r.mode === '1v1' && r.enabled);
        setMaps(pool);
        setMapName((m) => m || pool.find((r) => r.path)?.name || pool[0]?.name || '');
      })
      .catch(() => setMaps([]));
  }, []);

  const map = maps?.find((m) => m.name === mapName) ?? null;
  const host = role === 'host' ? me.steamId : FAKE_OPPONENT;
  const joiner = role === 'host' ? FAKE_OPPONENT : me.steamId;

  const build = (status: MmStatus): ModMatch => ({
    id: matchId,
    mode: 'auto',
    status,
    host,
    joiner,
    opponent: { steamId: FAKE_OPPONENT, name: 'Test opponent' },
    map: map?.path ?? null,
    mapName: map?.name ?? 'Test map',
    factions: { [me.steamId]: faction, [FAKE_OPPONENT]: other(faction) },
    slots: { [host]: 1, [joiner]: 2 },
    sessionId: role === 'joiner' && sessionId.trim() ? sessionId.trim() : null,
    countdownEndsAt: status === 'countdown' ? new Date(Date.now() + 10_000).toISOString() : null,
    cancelledBy: status === 'cancelled' ? FAKE_OPPONENT : null,
    reason: status === 'failed' ? 'test bench: failed' : null,
  });

  const note = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 30));

  const push = async (status: MmStatus | null) => {
    const m = status === null ? null : build(status);
    const ok = await pushMatch(m);
    note(`${status ?? 'stand down'} → ${ok ? 'mod took it' : 'mod did not answer'}`);
  };

  const status = bridge.status;

  return (
    <div className="dispute test-bench">
      <p className="hint">
        Pushes made-up matches to the mod running on this PC. The site never sees them: the mod's session-id
        and event posts for a test match come back 404, which it logs once. Countdown → Launch → Cancel on the
        same id walks one match through; New id starts another.
      </p>

      <p>
        <strong>Mod:</strong>{' '}
        {!bridge.enabled ? (
          <>
            not connected —{' '}
            <button type="button" className="linkish" onClick={enableBridge}>
              Connect to Sanctuary
            </button>
          </>
        ) : !bridge.probed ? (
          'looking…'
        ) : !status ? (
          'not reachable'
        ) : (
          <>
            {status.modVersion ?? '?'} · game {status.gameVersion ?? '?'} · state{' '}
            <strong>{status.state}</strong>
            {status.match ? (
              <>
                {' '}
                · match <code>{status.match.id.slice(0, 8)}</code> {status.match.status} /{' '}
                <strong>{status.match.phase}</strong>
              </>
            ) : (
              ' · no match'
            )}
          </>
        )}
      </p>

      <div className="bench-fields">
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as 'host' | 'joiner')}>
            <option value="host">host (I create the lobby)</option>
            <option value="joiner">joiner (I join a session id)</option>
          </select>
        </label>
        <label>
          Map
          <select value={mapName} onChange={(e) => setMapName(e.target.value)} disabled={maps === null}>
            {(maps ?? []).map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
                {m.path ? '' : ' (no path)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Faction
          <select value={faction} onChange={(e) => setFaction(e.target.value as Faction)}>
            {FACTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        {role === 'joiner' && (
          <label>
            Session id
            <input
              value={sessionId}
              placeholder="host's game-server id"
              onChange={(e) => setSessionId(e.target.value)}
            />
          </label>
        )}
        <label>
          Match id
          <code>{matchId.slice(0, 8)}</code>{' '}
          <button type="button" className="linkish" onClick={() => setMatchId(newId())}>
            New id
          </button>
        </label>
      </div>

      <div className="match-actions">
        <button type="button" className="btn primary" disabled={!status} onClick={() => push('countdown')}>
          Countdown
        </button>
        <button type="button" className="btn primary" disabled={!status} onClick={() => push('launch')}>
          Launch
        </button>
        <button type="button" className="btn" disabled={!status} onClick={() => push('cancelled')}>
          Cancel
        </button>
        <button type="button" className="btn" disabled={!status} onClick={() => push('failed')}>
          Fail
        </button>
        <button type="button" className="btn" disabled={!status} onClick={() => push(null)}>
          Stand down
        </button>
      </div>

      {log.length > 0 && (
        <ul className="bench-log">
          {log.map((line, i) => (
            <li key={i} className="dim">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
