// The strip along the bottom of the Units page while picking units to
// compare: what's picked (each removable), and the way through to /compare.
// Shown whenever something is picked or compare mode is on, so a pick made
// from the detail panel is visible too.

import { Link } from '@tanstack/react-router';
import type { Unit } from '../lib/types';
import { COMPARE_MAX } from '../lib/compare';
import { shortName } from '../lib/format';
import { FACTION_COLOURS, UnitIcon } from './UnitIcon';

interface CompareTrayProps {
  units: Unit[];
  picking: boolean;
  iconManifest: Set<string>;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function CompareTray({ units, picking, iconManifest, onRemove, onClear }: CompareTrayProps) {
  const ready = units.length >= 2;
  const hint =
    units.length >= COMPARE_MAX
      ? `That's the most you can compare at once (${COMPARE_MAX}).`
      : picking
        ? units.length
          ? 'Click more units to add them, or click a picked one to drop it.'
          : 'Click units to pick them for comparison.'
        : null;

  return (
    <div className="compare-tray" role="region" aria-label="Units to compare">
      <div className="compare-tray-picks">
        {units.map((u) => (
          <span
            className="compare-pick"
            key={u.id}
            style={{ '--fc': FACTION_COLOURS[u.faction] } as React.CSSProperties}
          >
            <UnitIcon
              icon={u.icon}
              faction={u.faction}
              manifest={iconManifest}
              size={20}
              muted={u.status === 'no-model'}
            />
            <span className="compare-pick-name">{u.name ?? shortName(u)}</span>
            <button
              type="button"
              aria-label={`Remove ${u.name ?? shortName(u)}`}
              onClick={() => onRemove(u.id)}
            >
              ×
            </button>
          </span>
        ))}
        {hint && <span className="compare-tray-hint">{hint}</span>}
      </div>
      <div className="compare-tray-actions">
        {units.length > 0 && (
          <button type="button" className="linkish" onClick={onClear}>
            Clear
          </button>
        )}
        {ready ? (
          <Link to="/compare" search={{ units: units.map((u) => u.id).join(',') }} className="btn primary">
            Compare {units.length} →
          </Link>
        ) : (
          <span className="btn primary" aria-disabled="true">
            Pick {2 - units.length} more
          </span>
        )}
      </div>
    </div>
  );
}
