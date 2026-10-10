import type { CountedRow } from '../../lib/calc';
import { builderName } from '../../lib/format';
import type { Unit } from '../../lib/types';
import { UnitIcon } from '../UnitIcon';
import { label } from './names';

export function StepperList({
  rows,
  byId,
  iconManifest,
  detail,
  numbered,
  onBump,
  onDrop,
  onMoveUp,
}: {
  rows: CountedRow[];
  byId: Map<string, Unit>;
  iconManifest: Set<string>;
  detail: (u: Unit) => string;
  /** Ordered lists (the build queue) show position and tier, and can be reordered. */
  numbered?: boolean;
  onBump: (i: number, delta: number) => void;
  onDrop: (i: number) => void;
  onMoveUp?: (i: number) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="stepper-list">
      {rows.map((row, i) => {
        const u = byId.get(row.id)!;
        return (
          // The queue can hold the same unit in several rows, so the id alone
          // isn't a unique key there.
          <div className="stepper" key={`${row.id}:${i}`}>
            {numbered && <span className="stepper-pos">{i + 1}</span>}
            <UnitIcon icon={u.icon} faction={u.faction} manifest={iconManifest} size={24} />
            <span className="who">
              <span>{numbered ? builderName(u) : label(u)}</span>
              <small>{detail(u)}</small>
            </span>
            <span className="stepper-controls">
              {onMoveUp && (
                <button
                  type="button"
                  className="drop"
                  aria-label="Move earlier"
                  title="Move earlier"
                  disabled={i === 0}
                  onClick={() => onMoveUp(i)}
                >
                  ↑
                </button>
              )}
              <button type="button" aria-label="Fewer" onClick={() => onBump(i, -1)}>
                −
              </button>
              <b>{row.count}</b>
              <button type="button" aria-label="More" onClick={() => onBump(i, 1)}>
                +
              </button>
              <button type="button" className="drop" aria-label="Remove" onClick={() => onDrop(i)}>
                ×
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
