import { fmt, splitCamel } from '../../lib/format';
import { flightSeconds, swingSeconds } from '../../lib/scale';
import type { Unit, Weapon } from '../../lib/types';
import { beamLabel } from '../UnitCard';
import { KV, Section } from './parts';

export function WeaponsSection({ unit: u }: { unit: Unit }) {
  const death = u.deathExplosion ? (
    <dl className="kv then">
      <KV
        k="Death explosion"
        v={`${fmt(u.deathExplosion.damage)} dmg${u.deathExplosion.radius ? ` · ${u.deathExplosion.radius} radius` : ''}`}
      />
    </dl>
  ) : null;

  if (!u.weapons.length) return death ? <Section title="Weapons">{death}</Section> : null;

  return (
    <Section title="Weapons">
      {u.weapons.map((w, i) => (
        <WeaponBlock weapon={w} key={i} />
      ))}
      {death}
    </Section>
  );
}

// One fact in a weapon's line, with the reasoning on hover where the plain
// figure needs it.
type Fact = [text: string, title?: string];

const FactLine = ({ facts, className }: { facts: Fact[]; className: string }) => (
  <div className={className}>
    {facts.map(([text, title], i) => (
      <span key={text} title={title} className={title ? 'has-tip' : undefined}>
        {i > 0 ? ' · ' : ''}
        {text}
      </span>
    ))}
  </div>
);

export function WeaponBlock({ weapon: w }: { weapon: Weapon }) {
  // Facts are only listed when the weapon actually has them, so a beam doesn't
  // show an empty speed and a single-shot gun doesn't show a salvo of one.
  // A continuous beam ignores reload entirely — it damages every tick it holds
  // the target — so listing a reload next to it would be actively misleading.
  //
  // Rate of fire is the real volley-to-volley time, not the template's reload:
  // the game's timers count down in 0.1s ticks, and some reloads (1s, 0.5s, 5s)
  // land a tick late while others (2s, 3s) come out exact.
  const cadence: Fact | null =
    w.beamMode === 'continuous' || !w.cycleTime
      ? null
      : [
          `fires every ${fmt(w.cycleTime)}s`,
          w.cycleTime !== w.reloadTime
            ? `The template says ${fmt(w.reloadTime)}s, but the game's timers count down in 0.1s ticks and only fire once they reach zero — in practice every ${fmt(w.cycleTime)}s.`
            : undefined,
        ];
  const flight = flightSeconds(w);
  const shot: Fact | null = w.isBeam
    ? [beamLabel(w)]
    : w.projectileSpeed
      ? w.homing
        ? [
            `homing missile, ${fmt(w.projectileSpeed)} u/s at launch`,
            'Steered onto its target every tick, and accelerates after launch — it doesn’t miss a moving target the way a shell can.',
          ]
        : [
            `${fmt(w.projectileSpeed)} u/s shot, ≈${fmt(flight, 1)}s to max range`,
            'Straight-line flight time at launch speed. A unit that moves out of the way in that time is missed; artillery arcs take longer still.',
          ]
      : null;
  const facts = [
    cadence,
    [`${w.rangeMax} range${w.rangeMin ? ` (min ${w.rangeMin})` : ''}`] as Fact,
    w.damageRadius ? ([`${w.damageRadius} splash radius`] as Fact) : null,
    shot,
    w.shotsPerCycle > 1 ? ([`${w.shotsPerCycle} shots a volley`] as Fact) : null,
    w.salvoDelay ? ([`${w.salvoDelay}s apart`] as Fact) : null,
  ].filter((f): f is Fact => f != null);

  // A weapon with no traverse controller is bolted facing forward — worth
  // saying outright, since it changes how the unit has to be positioned.
  const swing = swingSeconds(w);
  const aim = [
    w.traverseSpeed
      ? ([`${fmt(w.traverseSpeed)}°/s traverse`, `Swings half a turn in ${fmt(swing, 1)}s`] as Fact)
      : (['fixed mount', 'No turret — the whole unit has to turn to aim'] as Fact),
    w.elevationSpeed ? ([`${fmt(w.elevationSpeed)}°/s elevation`] as Fact) : null,
    w.traverseArc != null && w.traverseSpeed
      ? ([`${w.traverseArc}° arc${w.traverseArc >= 360 ? '' : ' (limited)'}`] as Fact)
      : null,
  ].filter((f): f is Fact => f != null);

  return (
    <div className="weapon">
      <div className="weapon-top">
        {w.count > 1 ? <span className="wcount">×{w.count}</span> : null}
        <strong>{weaponLabel(w)}</strong>
        {w.dpsTotal != null ? (
          <span className="wdps">{fmt(w.dpsTotal)} dps</span>
        ) : (
          <span
            className="wdps"
            title="The template gives the game nothing to fire — no muzzle bones, or a projectile that isn't in the build"
          >
            dps unknown
          </span>
        )}
      </div>
      <FactLine facts={facts} className="weapon-facts" />
      <FactLine facts={aim} className="weapon-facts aim" />
      {w.targets.length ? <div className="weapon-targets">Hits {w.targets.join(', ')}</div> : null}
    </div>
  );
}

// Damage of 0 comes from a template that hands damage to a "damage collider"
// (the Phoenix's cluster). No game code reads that field, and the projectile is
// spawned with the weapon's own damage — zero — so as shipped it does nothing.
function weaponLabel(w: Weapon): string {
  const kind = w.isBeam ? 'Beam' : w.category ? splitCamel(w.category) : null;
  if (w.damage <= 0) return `${kind ?? 'Weapon'} · no damage as shipped`;
  return kind ? `${fmt(w.damage)} dmg · ${kind}` : `${fmt(w.damage)} dmg`;
}
