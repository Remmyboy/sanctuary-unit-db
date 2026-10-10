import { upgradeChain, type UpgradeStep } from '../../lib/economy';
import { builderName, duration, fmt, shortName } from '../../lib/format';
import type { Unit } from '../../lib/types';
import { UnitIcon } from '../UnitIcon';
import { KV, Section, Stat, rateLine } from './parts';

// An upgrade is charged the target's full build price with no rebate for the
// structure it replaces, and the structure raises the replacement itself — so
// the price and the wall-clock time both belong here, next to the target,
// rather than being left for the reader to look up on the next unit's page.
export function UpgradeSection({
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

      <dl className="statgrid then">
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

      <dl className="kv then">
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

      <p className="hint footnote">
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
