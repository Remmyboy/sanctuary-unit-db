import type { Unit, Weapon } from '../lib/types';
import { fmt, shortName } from '../lib/format';
import { economyRole, netRate } from '../lib/economy';
import { FACTION_COLOURS, UnitIcon } from './UnitIcon';

interface UnitCardProps {
  unit: Unit;
  iconManifest: Set<string>;
  /** Defined only while picking units to compare: the card becomes a toggle. */
  picked?: boolean;
  onOpen: (id: string) => void;
}

export function UnitCard({ unit: u, iconManifest, picked, onOpen }: UnitCardProps) {
  // Only no-model units get dimmed — an in-progress unit has real art and real
  // numbers, it just isn't switched on, so it keeps its colour and says why.
  const muted = u.status === 'no-model';
  return (
    <button
      type="button"
      className={`card ${muted ? 'unplayable' : ''}`}
      aria-pressed={picked}
      style={{ '--fc': FACTION_COLOURS[u.faction] } as React.CSSProperties}
      onClick={() => onOpen(u.id)}
    >
      {picked !== undefined && <span className="pick-mark" aria-hidden="true" />}
      <span className="card-top">
        <span className="card-icon">
          <UnitIcon icon={u.icon} faction={u.faction} manifest={iconManifest} size={32} muted={muted} />
        </span>
        <span className="who">
          <h4>
            {u.name ?? shortName(u)}
            {u.status === 'in-progress' && (
              <span className="wip" title={u.statusReason ?? 'Not enabled'}>
                WIP
              </span>
            )}
          </h4>
          <small>{u.displayName}</small>
        </span>
      </span>
      {/* Labelled readouts rather than a run of suffixed numbers, so the
          four figures scan down a column of cards. */}
      <span className="stat-row">
        <Readout label="Alloy" value={fmt(u.cost.alloys)} cls="alloy-val" />
        <Readout label="Energy" value={fmt(u.cost.energy)} cls="energy-val" />
        <Readout label="HP" value={fmt(u.health)} />
        {u.dps ? <Readout label="DPS" value={fmt(u.dps)} /> : null}
      </span>
      <RateLine unit={u} />
      <WeaponLines unit={u} />
    </button>
  );
}

function Readout({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <span className="readout">
      <i>{label}</i>
      <b className={cls}>{value}</b>
    </span>
  );
}

// The standing cost or income, which the build cost above says nothing about —
// a T3 Shield is 600 alloy once and 250 energy every second after that. Shown
// as the net, so a converter reads as the trade it actually is.
function RateLine({ unit: u }: { unit: Unit }) {
  if (!economyRole(u)) return null;
  const net = netRate(u);
  const parts: Array<[number, string, string]> = [
    [net.alloys, 'a/s', 'alloy-val'],
    [net.energy, 'e/s', 'energy-val'],
  ];

  return (
    <span className="rate-row">
      {parts
        .filter(([v]) => v !== 0)
        .map(([v, unit, cls]) => (
          <span className={v > 0 ? cls : 'bad'} key={unit}>
            {v > 0 ? '+' : '−'}
            {fmt(Math.abs(v))}
            <i>{unit}</i>
          </span>
        ))}
    </span>
  );
}

// One line per distinct weapon. Grouping means even the heaviest units top out
// at four, so every weapon fits without the card running away.
function WeaponLines({ unit: u }: { unit: Unit }) {
  if (!u.weapons.length) return null;

  return (
    <span className="wlines">
      {u.weapons.map((w, i) => {
        const bits = [
          w.damage > 0 ? `${fmt(w.damage)} dmg` : 'impact',
          `${w.rangeMax} rng`,
          w.isBeam
            ? beamLabel(w).replace(' beam', '')
            : w.projectileSpeed
              ? `${fmt(w.projectileSpeed)} spd`
              : null,
        ].filter(Boolean);

        return (
          <span className="wline" key={i}>
            {w.count > 1 ? <b>×{w.count}</b> : null}
            {bits.join(' · ')}
          </span>
        );
      })}
    </span>
  );
}

// Continuous beams damage every tick while held on target; pulse beams land a
// single tick per reload; burst beams land beamLifetime ticks per reload.
export function beamLabel(w: Weapon): string {
  if (w.beamMode === 'continuous') return 'continuous beam';
  if (w.beamMode === 'burst') return `${w.beamLifetime}-tick beam`;
  return 'pulse beam';
}
