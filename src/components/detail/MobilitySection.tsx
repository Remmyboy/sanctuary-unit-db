import type { ReactNode } from 'react';
import { duration, fmt } from '../../lib/format';
import { MAP_SIZE, crossMapSeconds, speedRank, topSpeedSeconds, turnAroundSeconds } from '../../lib/scale';
import type { Unit } from '../../lib/types';
import { KV, Section } from './parts';

// What each movement type can cross, from the devs' own notes on MovementType
// in templateExplainations.lua.
const MOVEMENT_TYPES: Record<string, string> = {
  Gunship: 'Gunship — hovers, lands anywhere',
  Hover: 'Hover — land and water surface',
  LegsLand: 'Legs — land only',
  LegsSeabed: 'Legs — land and seabed',
  LegsAmphibious: 'Legs — land and water surface',
  Plane: 'Plane — keeps moving, lands on airfields',
  TracksLand: 'Tracks — land only',
  TracksSeabed: 'Tracks — land and seabed',
  TracksAmphibious: 'Tracks — land and water surface',
  WaterSurface: 'Ship',
  UnderWater: 'Submarine',
};

const MOVE_CLASS_NOUN = { ground: 'ground units', air: 'aircraft', naval: 'ships' } as const;

// Raw figures first, then what they mean in play: a speed of 3.5 says nothing
// until it's "crosses a ranked map in 2½ minutes, quicker than most tanks".
export function MobilitySection({ unit: u, units }: { unit: Unit; units: Unit[] }) {
  const lines: Array<[string, ReactNode]> = [];
  const m = u.movement;
  if (m?.speed) {
    const cross = crossMapSeconds(m.speed);
    const rank = speedRank(u, units);
    lines.push([
      'Speed',
      <>
        <strong>{fmt(m.speed)} u/s</strong>
        {cross != null && (
          <span className="dim">
            {' '}
            · crosses a {MAP_SIZE} map in {duration(cross)}
          </span>
        )}
        {rank && (
          <span className="kv-sub">
            faster than {Math.round(rank.share * 100)}% of {MOVE_CLASS_NOUN[rank.cls]} in the game
          </span>
        )}
      </>,
    ]);
    if (m.minSpeed) {
      lines.push(['Stall speed', <>{fmt(m.minSpeed)} u/s — can't hover, circles instead</>]);
    }
    const top = topSpeedSeconds(u);
    if (m.acceleration) {
      lines.push([
        'Acceleration',
        <>
          {fmt(m.acceleration)} u/s²
          {top != null && <span className="dim"> · top speed in {fmt(top, 1)}s</span>}
        </>,
      ]);
    }
    const turn = turnAroundSeconds(u);
    if (m.rotationSpeed) {
      lines.push([
        'Turn rate',
        <>
          {fmt(m.rotationSpeed)}°/s
          {turn != null && <span className="dim"> · turns about in {fmt(turn, 1)}s</span>}
        </>,
      ]);
    }
    if (m.type) lines.push(['Movement', MOVEMENT_TYPES[m.type] ?? m.type]);
  }
  if (u.vision) lines.push(['Vision', u.vision]);
  if (u.radar) lines.push(['Radar', u.radar]);
  if (u.sonar) lines.push(['Sonar', u.sonar]);
  if (u.transportSlots) lines.push(['Transport slots', u.transportSlots]);
  if (u.footprint) lines.push(['Footprint', `${u.footprint.x} × ${u.footprint.y}`]);
  if (!lines.length) return null;

  return (
    <Section title="Mobility & intel">
      <dl className="kv">
        {lines.map(([k, v]) => (
          <KV key={k} k={k} v={v} />
        ))}
      </dl>
      <p className="hint footnote">
        Distances are game units: one is about the length of a T1 tank, and a ranked 1v1 map is {MAP_SIZE}{' '}
        across. Vision, radar and range are radii.
      </p>
    </Section>
  );
}
