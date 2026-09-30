import type { ReactNode } from 'react';
import type { Unit, Weapon } from '../lib/types';
import type { LoadedData } from '../lib/data';
import { STATUS_LABELS } from '../lib/board';
import { builderName, duration, fmt, resourceName, shortName, splitCamel } from '../lib/format';
import { consumes, economyRole, produces, upgradeChain, type UpgradeStep } from '../lib/economy';
import {
  MAP_SIZE,
  crossMapSeconds,
  flightSeconds,
  ordinal,
  peerRows,
  peersOf,
  speedRank,
  swingSeconds,
  topSpeedSeconds,
  turnAroundSeconds,
} from '../lib/scale';
import { FACTION_COLOURS, UnitIcon } from './UnitIcon';
import { FactionEmblem } from './FactionEmblem';
import { beamLabel } from './UnitCard';

interface DetailPanelProps {
  unit: Unit;
  loaded: LoadedData;
  onOpen: (id: string) => void;
  onClose: () => void;
  /** Adds or drops this unit from the board's comparison picks. */
  compare?: { picked: boolean; full: boolean; onToggle: () => void };
}

export function DetailPanel({ unit: u, loaded, onOpen, onClose, compare }: DetailPanelProps) {
  const { byId, iconManifest, previews, renders } = loaded;

  return (
    <>
      <aside
        className="detail"
        aria-live="polite"
        style={{ '--fc': FACTION_COLOURS[u.faction] } as React.CSSProperties}
      >
        {/* A dossier header: the unit's render on a faction-lit stage, over the
            faction's emblem, with its name set huge and faint behind. Most
            units have a 384px render from the developers; the rest fall back
            to the game's 64px thumbnail, upscaled and shown a little smaller
            so the softness shows less. Units with neither get their icon on
            the same stage. */}
        <div className="detail-stage">
          <FactionEmblem faction={u.faction} className="detail-stage-emblem" />
          <span className="detail-stage-faction" aria-hidden="true">
            {u.faction}
          </span>
          {renders.has(u.id) ? (
            <img
              className="detail-render hd"
              src={`/renders/${u.id}.webp`}
              alt={u.name ?? u.displayName}
              width={170}
              height={170}
              decoding="async"
            />
          ) : previews.has(u.id) ? (
            <img
              className="detail-render"
              src={`/previews/${u.id}.png`}
              alt={u.name ?? u.displayName}
              width={150}
              height={150}
              decoding="async"
            />
          ) : (
            <UnitIcon
              icon={u.icon}
              faction={u.faction}
              manifest={iconManifest}
              size={88}
              muted={u.status === 'no-model'}
            />
          )}
          <button type="button" className="detail-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="detail-head">
          <UnitIcon
            icon={u.icon}
            faction={u.faction}
            manifest={iconManifest}
            size={40}
            muted={u.status === 'no-model'}
          />
          <div>
            <h2>{u.name ?? shortName(u)}</h2>
            <div className="sub2">
              {u.displayName} · <code>{u.id}</code>
            </div>
          </div>
          {compare && (
            <button
              type="button"
              className="detail-compare"
              aria-pressed={compare.picked}
              disabled={!compare.picked && compare.full}
              title={!compare.picked && compare.full ? 'Comparison is full' : undefined}
              onClick={compare.onToggle}
            >
              {compare.picked ? '✓ Comparing' : '+ Compare'}
            </button>
          )}
        </div>

        <div className="badges">
          <span
            className="badge"
            style={{ color: FACTION_COLOURS[u.faction], borderColor: `${FACTION_COLOURS[u.faction]}66` }}
          >
            {u.faction}
          </span>
          {u.tier ? <span className="badge">Tier {u.tier}</span> : null}
          <span className="badge">{u.domain}</span>
          {u.role ? <span className="badge">{u.role}</span> : null}
          {u.status !== 'in-game' && (
            <span className="badge warn">
              {STATUS_LABELS[u.status]}
              {u.statusReason ? ` — ${u.statusReason}` : ''}
            </span>
          )}
        </div>

        <Section title="Cost & core">
          <dl className="statgrid">
            <Stat label="Alloy" value={<span className="alloy-val">{fmt(u.cost.alloys)}</span>} />
            <Stat label="Energy" value={<span className="energy-val">{fmt(u.cost.energy)}</span>} />
            <Stat label="Build time" value={fmt(u.buildTime)} />
            <Stat
              label="Health"
              value={
                <>
                  {fmt(u.health)}
                  {u.healthRegen ? (
                    <small title="Regenerated every second, always"> +{fmt(u.healthRegen)}/s</small>
                  ) : null}
                </>
              }
            />
            {u.dps ? <Stat label="DPS" value={fmt(u.dps)} /> : null}
            {u.maxRange ? <Stat label="Range" value={u.maxRange} /> : null}
            {u.movement?.speed ? (
              <Stat
                label="Speed"
                value={
                  <>
                    {fmt(u.movement.speed)}
                    <small> u/s</small>
                  </>
                }
              />
            ) : null}
          </dl>
        </Section>

        <PeerSection unit={u} units={loaded.data.units} onOpen={onOpen} />
        <EconomySection unit={u} />
        <AdjacencySection unit={u} />
        <WeaponsSection unit={u} />
        <ShieldSection unit={u} />
        <MobilitySection unit={u} units={loaded.data.units} />
        <BuildSection unit={u} byId={byId} iconManifest={iconManifest} onOpen={onOpen} />
        <UpgradeSection unit={u} byId={byId} iconManifest={iconManifest} onOpen={onOpen} />

        <Section title="Tags">
          <div className="unit-links">
            {u.tags.map((t) => (
              <span className="badge" key={t}>
                {t}
              </span>
            ))}
          </div>
        </Section>
      </aside>
      <div className="scrim" onClick={onClose} />
    </>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="section">
    <h3>{title}</h3>
    {children}
  </div>
);

const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

// Storage is a capacity, not a rate — no "/s".
const amounts = (obj: Record<string, number | undefined>) =>
  Object.entries(obj)
    .map(([k, v]) => `${fmt(v)} ${resourceName(k)}`)
    .join(', ');

// Coloured per resource, since an ongoing rate is read at a glance far more
// often than it is read carefully.
const rateLine = (r: { alloys: number; energy: number }) => (
  <>
    {r.alloys ? <span className="alloy-val">{fmt(r.alloys)}/s alloy</span> : null}
    {r.alloys && r.energy ? ' · ' : null}
    {r.energy ? <span className="energy-val">{fmt(r.energy)}/s energy</span> : null}
  </>
);

// A converter is not a producer with upkeep — the game only scales production
// against consumption when both blocks exist, so the output is what the input
// buys. Showing them as two independent lines inverts that, which is why the
// Alloy Furnace gets a conversion line instead of a Produces/Upkeep pair.
function EconomySection({ unit: u }: { unit: Unit }) {
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
        <p className="hint" style={{ margin: '8px 0 0' }}>
          A converter's output scales with how well its input is met — starve the energy and the alloy falls
          with it.
        </p>
      )}
    </Section>
  );
}

const KV = ({ k, v }: { k: string; v: ReactNode }) => (
  <>
    <dt>{k}</dt>
    <dd>{v}</dd>
  </>
);

// Structures pass bonuses to whatever is built touching them. Only the granting
// side is in the templates, so this is shown on the generator/extractor rather
// than on the factory that benefits.
function AdjacencySection({ unit: u }: { unit: Unit }) {
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

function WeaponsSection({ unit: u }: { unit: Unit }) {
  const death = u.deathExplosion ? (
    <dl className="kv" style={{ marginTop: 8 }}>
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
  // the game's timers move in 0.1s ticks and usually land a tick late.
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

function ShieldSection({ unit: u }: { unit: Unit }) {
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

// What each movement type can cross, from the devs' own notes on MovementType
// in templateExplainations.lua.
const MOVEMENT_TYPES: Record<string, string> = {
  Gunship: 'Gunship — hovers, lands anywhere',
  Hover: 'Hover — land and water surface',
  LegsLand: 'Legs — land only',
  LegsSeabed: 'Legs — land and seabed',
  LegsAmphibious: 'Legs — land and water surface',
  Plane: 'Plane — keeps moving, lands on airfields',
  TracksLand: 'Tracks — land only',
  TracksSeabed: 'Tracks — land and seabed',
  TracksAmphibious: 'Tracks — land and water surface',
  WaterSurface: 'Ship',
  UnderWater: 'Submarine',
};

const MOVE_CLASS_NOUN = { ground: 'ground units', air: 'aircraft', naval: 'ships' } as const;

// Raw figures first, then what they mean in play: a speed of 3.5 says nothing
// until it's "crosses a ranked map in 2½ minutes, quicker than most tanks".
function MobilitySection({ unit: u, units }: { unit: Unit; units: Unit[] }) {
  const lines: Array<[string, ReactNode]> = [];
  const m = u.movement;
  if (m?.speed) {
    const cross = crossMapSeconds(m.speed);
    const rank = speedRank(u, units);
    lines.push([
      'Speed',
      <>
        <strong>{fmt(m.speed)} u/s</strong>
        {cross != null && (
          <span className="dim">
            {' '}
            · crosses a {MAP_SIZE} map in {duration(cross)}
          </span>
        )}
        {rank && (
          <span className="kv-sub">
            faster than {Math.round(rank.share * 100)}% of {MOVE_CLASS_NOUN[rank.cls]} in the game
          </span>
        )}
      </>,
    ]);
    if (m.minSpeed) {
      lines.push(['Stall speed', <>{fmt(m.minSpeed)} u/s — can't hover, circles instead</>]);
    }
    const top = topSpeedSeconds(u);
    if (m.acceleration) {
      lines.push([
        'Acceleration',
        <>
          {fmt(m.acceleration)} u/s²
          {top != null && <span className="dim"> · top speed in {fmt(top, 1)}s</span>}
        </>,
      ]);
    }
    const turn = turnAroundSeconds(u);
    if (m.rotationSpeed) {
      lines.push([
        'Turn rate',
        <>
          {fmt(m.rotationSpeed)}°/s
          {turn != null && <span className="dim"> · turns about in {fmt(turn, 1)}s</span>}
        </>,
      ]);
    }
    if (m.type) lines.push(['Movement', MOVEMENT_TYPES[m.type] ?? m.type]);
  }
  if (u.vision) lines.push(['Vision', u.vision]);
  if (u.radar) lines.push(['Radar', u.radar]);
  if (u.sonar) lines.push(['Sonar', u.sonar]);
  if (u.transportSlots) lines.push(['Transport slots', u.transportSlots]);
  if (u.footprint) lines.push(['Footprint', `${u.footprint.x} × ${u.footprint.y}`]);
  if (!lines.length) return null;

  return (
    <Section title="Mobility & intel">
      <dl className="kv">
        {lines.map(([k, v]) => (
          <KV key={k} k={k} v={v} />
        ))}
      </dl>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        Distances are game units: one is about the length of a T1 tank, and a ranked 1v1 map is {MAP_SIZE}{' '}
        across. Vision, radar and range are radii.
      </p>
    </Section>
  );
}

// The unit against the ones it actually competes with — same domain and tier,
// signed off and in the game. Each strip runs from the lowest to the highest
// of them; the ringed dot is this unit, the rest are clickable peers.
function PeerSection({
  unit: u,
  units,
  onOpen,
}: {
  unit: Unit;
  units: Unit[];
  onOpen: (id: string) => void;
}) {
  const peers = peersOf(u, units);
  const rows = peerRows(u, peers);
  if (!rows.length) return null;
  const byId = new Map(units.map((o) => [o.id, o]));
  const noun = u.domain === 'Structure' ? 'structures' : `${u.domain.toLowerCase()} units`;

  return (
    <Section title={`Against T${u.tier ?? '?'} ${noun}`}>
      <div className="peers">
        {rows.map((row) => {
          const span = row.max - row.min || 1;
          const pos = (v: number) => `${((v - row.min) / span) * 100}%`;
          return (
            <div className="peer-row" key={row.metric.key}>
              <span className="peer-label">{row.metric.label}</span>
              <span className="peer-track" aria-hidden="true">
                {row.points
                  .filter((p) => !p.self)
                  .map((p) => {
                    const o = byId.get(p.id)!;
                    return (
                      <button
                        type="button"
                        tabIndex={-1}
                        key={p.id}
                        className="peer-dot"
                        style={
                          { left: pos(p.value), '--fc': FACTION_COLOURS[o.faction] } as React.CSSProperties
                        }
                        title={`${o.name ?? shortName(o)} — ${fmt(p.value)}${row.metric.unit ? ` ${row.metric.unit}` : ''}`}
                        onClick={() => onOpen(p.id)}
                      />
                    );
                  })}
                <span className="peer-dot self" style={{ left: pos(row.value) }} />
              </span>
              <span className="peer-val">
                {fmt(row.value)}
                <small>
                  {ordinal(row.rank)}
                  {row.metric.better === 'low' ? ' cheapest' : ''} of {row.of}
                </small>
              </span>
            </div>
          );
        })}
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        Among {peers.length} other signed-off T{u.tier} {noun}. Each bar runs lowest to highest; hover a dot
        for the unit, click to open it.
      </p>
    </Section>
  );
}

function BuildSection({
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
            <dl className="kv" style={{ marginTop: 8 }}>
              {times.map(([k, v]) => (
                <KV key={k} k={k} v={v} />
              ))}
            </dl>
          )}
        </>
      )}
      {u.builds.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Can build</h3>
          {chips(u.builds)}
        </>
      )}
    </div>
  );
}

// An upgrade is charged the target's full build price with no rebate for the
// structure it replaces, and the structure raises the replacement itself — so
// the price and the wall-clock time both belong here, next to the target,
// rather than being left for the reader to look up on the next unit's page.
function UpgradeSection({
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
  const chain = upgradeChain(u, byId);
  const step = chain[0];
  if (!step) return null;
  const { to } = step;

  // Two steps from here to the top is common (T1 extractors, radar, factories),
  // and "what does the whole climb cost" is the question that actually gets
  // asked — so total the chain rather than making the reader open each tier.
  const whole = chain.length > 1 && {
    top: chain[chain.length - 1].to,
    alloys: chain.reduce((n, s) => n + s.alloys, 0),
    energy: chain.reduce((n, s) => n + s.energy, 0),
    seconds: chain.reduce((n, s) => n + s.seconds, 0),
  };

  return (
    <Section title="Upgrades to">
      <div className="unit-links">
        <button type="button" className="unit-link" onClick={() => onOpen(to.id)}>
          <UnitIcon
            icon={to.icon}
            faction={to.faction}
            manifest={iconManifest}
            size={20}
            muted={to.status === 'no-model'}
          />
          {builderName(to)}
        </button>
      </div>

      <dl className="statgrid" style={{ marginTop: 8 }}>
        <Stat label="Alloy" value={<span className="alloy-val">{fmt(step.alloys)}</span>} />
        <Stat label="Energy" value={<span className="energy-val">{fmt(step.energy)}</span>} />
        <Stat
          label="Time"
          value={
            <>
              {duration(step.seconds)}
              <small> alone</small>
            </>
          }
        />
      </dl>

      <dl className="kv" style={{ marginTop: 8 }}>
        <KV k="Drain" v={rateLine({ alloys: step.alloysPerSec, energy: step.energyPerSec })} />
        {step.deltas.length > 0 && <KV k="Changes" v={<Deltas step={step} />} />}
        {step.alloyPayback != null && (
          <KV k="Alloy payback" v={<span className="alloy-val">{duration(step.alloyPayback)}</span>} />
        )}
        {whole && (
          <KV
            k={`All the way to ${builderName(whole.top)}`}
            v={
              <>
                <span className="alloy-val">{fmt(whole.alloys)} alloy</span> ·{' '}
                <span className="energy-val">{fmt(whole.energy)} energy</span> · {duration(whole.seconds)}
              </>
            }
          />
        )}
      </dl>

      <p className="hint" style={{ margin: '8px 0 0' }}>
        Costs the full price of the {shortName(to).toLowerCase()} — there is no discount and nothing is
        refunded for the structure it replaces. It builds its own replacement at {fmt(step.power)} build
        power, which is what that time assumes; engineers can assist to cut it.
        {step.alloyPayback != null && ' Payback counts the alloy half of the price only.'}
      </p>
    </Section>
  );
}

const Deltas = ({ step }: { step: UpgradeStep }) => (
  <span className="deltas">
    {step.deltas.map((d) => (
      <span className="dline" key={d.label}>
        {d.label} <span className="dim">{fmt(d.from)}</span>
        {d.perSecond ? '/s' : ''} →{' '}
        <strong className={d.to > d.from ? 'good' : 'bad'}>
          {fmt(d.to)}
          {d.perSecond ? '/s' : ''}
        </strong>
      </span>
    ))}
  </span>
);
