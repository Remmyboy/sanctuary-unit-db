import { STALL_EPSILON, type QueueResult } from '../../lib/calc';
import { builderName, duration, fmt, resourceName } from '../../lib/format';
import { Net } from './Net';

// A build order's answer: when it's done, what it cost, and what it did to the
// stockpile — the three things you'd ask of an opening.
export function QueueReadout({ plan }: { plan: QueueResult | null }) {
  if (!plan)
    return (
      <>
        <h2>When is it done?</h2>
        <div className="verdict">
          <span className="verdict-label">Build order</span>
          <span className="verdict-big">—</span>
          <p className="verdict-note">Pick a faction and builder, then queue what to build.</p>
        </div>
      </>
    );

  const done = Number.isFinite(plan.finish);
  const stalled = done && plan.finish > plan.ideal + STALL_EPSILON;
  const res = [
    ['alloys', 'alloy-val'],
    ['energy', 'energy-val'],
  ] as const;

  return (
    <>
      <h2>When is it done?</h2>
      <div className="verdict">
        <span className="verdict-label">Build order done at</span>
        <span className={`verdict-big ${!done || stalled ? 'bad' : 'good'}`}>
          {done ? duration(plan.finish) : 'never'}
        </span>
        {stalled && <span className="verdict-vs">vs {duration(plan.ideal)} with resources to spare</span>}
        <p className="verdict-note">
          {!done
            ? `Stuck on ${plan.stuck ? builderName(plan.stuck) : 'a build'} — the stockpile is empty and nothing is coming in.`
            : stalled
              ? 'The stockpile ran dry, so builds slowed to what income could pay for.'
              : 'Never short — income and stockpile covered every build at full speed.'}
        </p>
      </div>

      <h2>Total cost</h2>
      <div className="rgrid">
        {res.map(([k, cls]) => (
          <div key={k}>
            <div className="rk">{resourceName(k)}</div>
            <div className={`rv ${cls}`}>{fmt(plan.cost[k], 0)}</div>
          </div>
        ))}
      </div>

      <h2>Stockpile</h2>
      <div className="rgrid">
        {res.map(([k, cls]) => (
          <div key={k}>
            <div className="rk">{resourceName(k)} at end</div>
            <div className={`rv ${cls}`}>{fmt(plan.end[k], 0)}</div>
            <div className="rsub">
              from {fmt(plan.start[k], 0)} · lowest {fmt(plan.low[k], 0)}
            </div>
          </div>
        ))}
      </div>

      <h2>Economy after</h2>
      <div className="rgrid tight">
        {res.map(([k]) => (
          <div key={k}>
            <div className="rk">Net {resourceName(k)}/s</div>
            <Net v={plan.income[k]} />
          </div>
        ))}
      </div>
      <div className="rlines">
        <div>
          Storage {fmt(plan.cap.alloys, 0)} alloy · {fmt(plan.cap.energy, 0)} energy
        </div>
        <div>{fmt(plan.power)} build power · walking between builds not counted</div>
      </div>
    </>
  );
}
