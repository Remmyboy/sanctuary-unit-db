import { useState, type ReactNode } from 'react';
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
              <PeerTrack
                peers={row.points.filter((p) => !p.self)}
                label={`${row.metric.label} of the other ${who}`}
                byId={byId}
                onOpen={onOpen}
                pos={pos}
                tip={(name, v) => `${name} — ${fmt(v)}${row.metric.unit ? ` ${row.metric.unit}` : ''}`}
              >
                <span className="peer-dot self" aria-hidden="true" style={{ left: pos(row.value) }} />
              </PeerTrack>
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

// One strip's peer dots, which open the peer they stand for. A strip is a
// single tab stop, so a dozen dots a row don't flood the tab order: the left
// and right arrows step through them lowest to highest (Home/End jump to the
// ends) and Enter opens one. Each dot is named for a screen reader as its
// tooltip is.
function PeerTrack({
  peers,
  label,
  byId,
  onOpen,
  pos,
  tip,
  children,
}: {
  peers: { id: string; value: number }[];
  label: string;
  byId: Map<string, Unit>;
  onOpen: (id: string) => void;
  pos: (v: number) => string;
  tip: (name: string, value: number) => string;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(0);
  const at = Math.min(current, peers.length - 1);

  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    // Left/right only: up and down keep scrolling the drawer.
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? peers.length - 1
          : step
            ? Math.min(peers.length - 1, Math.max(0, at + step))
            : null;
    if (next === null) return;
    e.preventDefault();
    setCurrent(next);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button.peer-dot')[next]?.focus();
  };

  return (
    <span className="peer-track" role="group" aria-label={label} onKeyDown={onKeyDown}>
      {peers.map((p, i) => {
        const o = byId.get(p.id)!;
        const text = tip(o.name ?? shortName(o), p.value);
        return (
          <button
            type="button"
            tabIndex={i === at ? 0 : -1}
            key={p.id}
            className="peer-dot"
            style={{ left: pos(p.value), '--fc': FACTION_COLOURS[o.faction] } as React.CSSProperties}
            title={text}
            aria-label={text}
            onFocus={() => setCurrent(i)}
            onClick={() => onOpen(p.id)}
          />
        );
      })}
      {children}
    </span>
  );
}
