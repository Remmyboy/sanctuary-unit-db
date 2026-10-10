import { STALL_EPSILON, type QueueResult } from '../../lib/calc';
import { builderName, duration, fmt } from '../../lib/format';

// One row per build: when it finished, how much it was held up, and the
// stockpile left behind — where an opening goes wrong is usually visible here.
export function Timeline({ plan }: { plan: QueueResult }) {
  return (
    <table className="qtable">
      <thead>
        <tr>
          <th>#</th>
          <th>Build</th>
          <th>Done</th>
          <th className="alloy-val">Alloy</th>
          <th className="energy-val">Energy</th>
        </tr>
      </thead>
      <tbody>
        {plan.steps.map((s, i) => {
          const lost = s.end - s.start - s.ideal;
          return (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                {builderName(s.unit)}
                {lost > STALL_EPSILON && <small className="bad"> +{duration(lost)} stalled</small>}
              </td>
              <td>{duration(s.end)}</td>
              <td>{fmt(s.after.alloys, 0)}</td>
              <td>{fmt(s.after.energy, 0)}</td>
            </tr>
          );
        })}
        {plan.stuck && (
          <tr>
            <td>{plan.steps.length + 1}</td>
            <td>
              {builderName(plan.stuck)} <small className="bad">stuck</small>
            </td>
            <td>never</td>
            <td>—</td>
            <td>—</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
