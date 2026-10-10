import { resourceName } from '../../lib/format';
import type { Unit } from '../../lib/types';
import { KV, Section } from './parts';

// Structures pass bonuses to whatever is built touching them. Only the granting
// side is in the templates, so this is shown on the generator/extractor rather
// than on the factory that benefits.
export function AdjacencySection({ unit: u }: { unit: Unit }) {
  if (!u.adjacency?.effects?.length) return null;

  return (
    <Section title="Adjacency bonus">
      <dl className="kv">
        {u.adjacency.effects.map((e, i) => (
          <KV
            key={i}
            k={e.label}
            v={
              <>
                <strong className="good">
                  {e.percent < 0 ? '' : '+'}
                  {e.percent}%
                </strong>{' '}
                {resourceName(e.resource)} · to adjacent{' '}
                {e.targets.map((t) => t.replace(/_/g, ' ').toLowerCase()).join(' or ')}
              </>
            }
          />
        ))}
      </dl>
      <p className="hint">
        Applies to structures built directly against this one, and stacks per adjacent source.
      </p>
    </Section>
  );
}
