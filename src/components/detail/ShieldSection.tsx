import { fmt } from '../../lib/format';
import type { Unit } from '../../lib/types';
import { KV, Section } from './parts';

export function ShieldSection({ unit: u }: { unit: Unit }) {
  if (!u.shields.length) return null;
  return (
    <Section title="Shields">
      {u.shields.map((s, i) => (
        <dl className="kv" key={i}>
          <KV k={s.name} v={`${fmt(s.max)} hp`} />
          {s.radius ? <KV k="Radius" v={s.radius} /> : null}
          {s.regen ? <KV k="Regen" v={`${s.regen}/s after ${s.regenDelay ?? 0}s`} /> : null}
        </dl>
      ))}
    </Section>
  );
}
