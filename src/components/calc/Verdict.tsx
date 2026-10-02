import { incomeLimited, type BuildResult, type EconomyResult } from '../../lib/calc';
import { duration, fmt } from '../../lib/format';

// The useful question isn't the cost, it's whether the economy sustains it — a
// build drawing more than net income stalls and stretches out. The rail leads
// with that answer as one big figure, backed by a sustain bar per resource.
export function Verdict({
  build,
  econ,
  hasEconomy,
}: {
  build: BuildResult | null;
  econ: EconomyResult;
  hasEconomy: boolean;
}) {
  if (!build)
    return (
      <div className="verdict">
        <span className="verdict-label">Verdict</span>
        <span className="verdict-big">—</span>
        <p className="verdict-note">Pick something to build and who builds it.</p>
      </div>
    );

  if (!hasEconomy)
    return (
      <div className="verdict">
        <span className="verdict-label">Unconstrained build time</span>
        <span className="verdict-big">{duration(build.seconds)}</span>
        <p className="verdict-note">Add economy structures to see whether the drain is sustainable.</p>
      </div>
    );

  const bars = (
    [
      ['Alloy', build.alloysPerSec, econ.alloysNet],
      ['Energy', build.energyPerSec, econ.energyNet],
    ] as const
  ).map(([resource, need, have]) => {
    const ok = have >= need;
    return {
      resource,
      ok,
      status: ok ? 'sustained' : have > 0 ? 'stalls' : 'no income',
      text: `needs ${fmt(need)}/s · net ${fmt(have)}/s`,
      pct: `${need > 0 ? Math.min(100, Math.max(0, (have / need) * 100)) : 100}%`,
    };
  });

  const { stretch, seconds: real } = incomeLimited(build, econ);
  // With no income of a needed resource the build never finishes, which reads
  // better than the em dash a non-finite duration would produce.
  const realLabel = Number.isFinite(real) ? duration(real) : 'never';

  return (
    <div className="verdict">
      <span className="verdict-label">At this income</span>
      <span className={`verdict-big ${stretch > 1 ? 'bad' : 'good'}`}>{realLabel}</span>
      {stretch > 1 && Number.isFinite(real) ? (
        <span className="verdict-vs">vs {duration(build.seconds)} unconstrained</span>
      ) : null}
      {bars.map((bar) => (
        <div className="vbar" key={bar.resource}>
          <div className="vbar-head">
            <span>
              {bar.resource} <em className={bar.ok ? 'good' : 'bad'}>{bar.status}</em>
            </span>
            <span className="figures">{bar.text}</span>
          </div>
          <div className="vbar-track">
            <div className={`vbar-fill ${bar.ok ? 'ok' : 'no'}`} style={{ width: bar.pct }} />
          </div>
        </div>
      ))}
    </div>
  );
}
