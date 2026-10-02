import type { Unit } from '../lib/types';
import { unitArt, type LoadedData } from '../lib/data';
import { STATUS_LABELS } from '../lib/board';
import { fmt, isCommander, shortName } from '../lib/format';
import { UnitIcon } from './UnitIcon';
import { FACTION_COLOURS } from '../lib/faction-colours';
import { FactionEmblem } from './FactionEmblem';
import { AdjacencySection } from './detail/AdjacencySection';
import { BuildSection } from './detail/BuildSection';
import { EconomySection } from './detail/EconomySection';
import { MobilitySection } from './detail/MobilitySection';
import { PeerSection } from './detail/PeerSection';
import { ShieldSection } from './detail/ShieldSection';
import { UpgradeSection } from './detail/UpgradeSection';
import { WeaponsSection } from './detail/WeaponsSection';
import { Section, Stat } from './detail/parts';

interface DetailPanelProps {
  unit: Unit;
  loaded: LoadedData;
  onOpen: (id: string) => void;
  onClose: () => void;
  /** Adds or drops this unit from the board's comparison picks. */
  compare?: { picked: boolean; full: boolean; onToggle: () => void };
}

export function DetailPanel({ unit: u, loaded, onOpen, onClose, compare }: DetailPanelProps) {
  const { byId, iconManifest } = loaded;
  const art = unitArt(u, loaded);

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
          {art ? (
            <img
              className={art.hd ? 'detail-render hd' : 'detail-render'}
              src={art.src}
              alt={u.name ?? u.displayName}
              width={art.hd ? 170 : 150}
              height={art.hd ? 170 : 150}
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
          <span className="badge badge-faction">{u.faction}</span>
          {isCommander(u) ? (
            <span className="badge">Commander</span>
          ) : u.tier ? (
            <span className="badge">Tier {u.tier}</span>
          ) : null}
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

        <PeerSection unit={u} units={loaded.data.units} byId={byId} onOpen={onOpen} />
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
