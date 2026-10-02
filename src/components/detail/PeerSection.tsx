import { FACTION_COLOURS } from '../../lib/faction-colours';
import { fmt, isCommander, shortName } from '../../lib/format';
import { ordinal, peerGroupName, peerRows, peersOf } from '../../lib/scale';
import type { Unit } from '../../lib/types';
import { Section } from './parts';

// The unit against the ones it actually competes with — same domain and tier,
// signed off and in the game. Each strip runs from the lowest to the highest
// of them; the ringed dot is this unit, the rest are clickable peers.
export function PeerSection({
  unit: u,
  units,
  byId,
  onOpen,
}: {
  unit: Unit;
  units: Unit[];
  byId: Map<string, Unit>;
  onOpen: (id: string) => void;
}) {
  const peers = peersOf(u, units);
  const rows = peerRows(u, peers);
  if (!rows.length) return null;
  // Peers share a class as well as a tier: tanks against combat units,
  // engineers against engineers, commanders against each other.
  const who = peerGroupName(u);

  return (
    <Section title={`Against ${isCommander(u) ? 'the other ' : 'other '}${who}`}>
      <div className="peers">
        {rows.map((row) => {
          const span = row.max - row.min || 1;
          const pos = (v: number) => `${((v - row.min) / span) * 100}%`;
          return (
            <div className="peer-row" key={row.metric.key}>
              <span className="peer-label">{row.metric.label}</span>
              <span className="peer-track" aria-hidden="true">
                {row.points
                  .filter((p) => !p.self)
                  .map((p) => {
                    const o = byId.get(p.id)!;
                    return (
                      <button
                        type="button"
                        tabIndex={-1}
                        key={p.id}
                        className="peer-dot"
                        style={
                          { left: pos(p.value), '--fc': FACTION_COLOURS[o.faction] } as React.CSSProperties
                        }
                        title={`${o.name ?? shortName(o)} — ${fmt(p.value)}${row.metric.unit ? ` ${row.metric.unit}` : ''}`}
                        onClick={() => onOpen(p.id)}
                      />
                    );
                  })}
                <span className="peer-dot self" style={{ left: pos(row.value) }} />
              </span>
              <span className="peer-val">
                {fmt(row.value)}
                <small>
                  {ordinal(row.rank)}
                  {row.metric.better === 'low' ? ' cheapest' : ''} of {row.of}
                </small>
              </span>
            </div>
          );
        })}
      </div>
      <p className="hint footnote">
        Among {peers.length} other signed-off {who}. Each bar runs lowest to highest; hover a dot for the
        unit, click to open it.
      </p>
    </Section>
  );
}
