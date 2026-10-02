import type { ReactNode } from 'react';
import { consumes, economyRole, produces } from '../../lib/economy';
import { fmt, resourceName } from '../../lib/format';
import type { Unit } from '../../lib/types';
import { KV, Section, rateLine } from './parts';

// Storage is a capacity, not a rate — no "/s".
const amounts = (obj: Record<string, number | undefined>) =>
  Object.entries(obj)
    .map(([k, v]) => `${fmt(v)} ${resourceName(k)}`)
    .join(', ');

// A converter is not a producer with upkeep — the game only scales production
// against consumption when both blocks exist, so the output is what the input
// buys. Showing them as two independent lines inverts that, which is why the
// Alloy Furnace gets a conversion line instead of a Produces/Upkeep pair.
export function EconomySection({ unit: u }: { unit: Unit }) {
  const role = economyRole(u);
  const lines: Array<[string, ReactNode]> = [];

  if (role === 'converter') {
    lines.push([
      'Converts',
      <>
        {rateLine(consumes(u))} → {rateLine(produces(u))}
      </>,
    ]);
  } else if (role === 'generator') {
    lines.push(['Produces', rateLine(produces(u))]);
  } else if (role === 'consumer') {
    lines.push(['Upkeep', rateLine(consumes(u))]);
  }

  if (u.storage) lines.push(['Storage', amounts(u.storage as Record<string, number>)]);

  // Build power is only a builder stat when there is something to build. On the
  // 33 structures whose build power exists purely to raise their own upgrade it
  // reads as a capability they don't have, so it moves to the upgrade block.
  if (u.buildPower && u.builds.length > 0) lines.push(['Build power', u.buildPower]);

  if (!lines.length) return null;

  return (
    <Section title="Economy">
      <dl className="kv">
        {lines.map(([k, v]) => (
          <KV key={k} k={k} v={v} />
        ))}
      </dl>
      {role === 'converter' && (
        <p className="hint footnote">
          A converter's output scales with how well its input is met — starve the energy and the alloy falls
          with it.
        </p>
      )}
    </Section>
  );
}
