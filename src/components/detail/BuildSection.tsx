import { builderName } from '../../lib/format';
import type { Unit } from '../../lib/types';
import { UnitIcon } from '../UnitIcon';
import { KV } from './parts';

export function BuildSection({
  unit: u,
  byId,
  iconManifest,
  onOpen,
}: {
  unit: Unit;
  byId: Map<string, Unit>;
  iconManifest: Set<string>;
  onOpen: (id: string) => void;
}) {
  const chips = (ids: string[]) => (
    <div className="unit-links">
      {ids.map((id) => {
        const t = byId.get(id);
        if (!t) return null;
        return (
          <button type="button" className="unit-link" key={id} onClick={() => onOpen(id)}>
            <UnitIcon
              icon={t.icon}
              faction={t.faction}
              manifest={iconManifest}
              size={20}
              muted={t.status === 'no-model'}
            />
            {builderName(t)}
          </button>
        );
      })}
    </div>
  );

  // buildTime is in build-power-seconds, so the wall-clock time depends on
  // whichever builder is making it.
  const times = u.builtBy
    .map((id) => byId.get(id))
    .filter((b): b is Unit => Boolean(b?.buildPower))
    .map((b) => [builderName(b), `${(u.buildTime / b.buildPower!).toFixed(1)}s`] as const);

  if (!u.builtBy.length && !u.builds.length) return null;

  return (
    <div className="section">
      {u.builtBy.length > 0 && (
        <>
          <h3>Built by</h3>
          {chips(u.builtBy)}
          {times.length > 0 && (
            <dl className="kv then">
              {times.map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </dl>
          )}
        </>
      )}
      {u.builds.length > 0 && (
        <>
          <h3 className="then-group">Can build</h3>
          {chips(u.builds)}
        </>
      )}
    </div>
  );
}
