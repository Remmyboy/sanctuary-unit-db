import { useEffect, useId, useLayoutEffect, useRef } from 'react';
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
import { BalanceChanges } from './BalanceToggle';
import { BALANCE_PATCH_NAME } from '../lib/balance-patch';

interface DetailPanelProps {
  unit: Unit;
  loaded: LoadedData;
  onOpen: (id: string) => void;
  onClose: () => void;
  /** Adds or drops this unit from the board's comparison picks. */
  compare?: { picked: boolean; full: boolean; onToggle: () => void };
}

// True for a click on the dialog's backdrop: the event lands on the dialog
// itself, outside its box. (A click on its own padding lands on it too, but
// inside the box.)
const onBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
  if (e.target !== e.currentTarget) return false;
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

export function DetailPanel({ unit: u, loaded, onOpen, onClose, compare }: DetailPanelProps) {
  const { byId, iconManifest } = loaded;
  const art = unitArt(u, loaded);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedBackdrop = useRef(false);

  // A modal dialog for as long as it's mounted: showModal() lifts it into the
  // top layer and makes the page behind inert, and focus moves to the drawer
  // itself — so a screen reader starts at its title and Tab reaches the close
  // button next, without a focus ring appearing on it when the drawer opens.
  // Unmounting hands focus back to whatever opened it. A layout effect, so
  // the drawer is never painted closed. The URL stays the source of truth for
  // whether it's open, so Escape and the backdrop ask the board to close it
  // rather than closing the dialog directly.
  useLayoutEffect(() => {
    const d = dialog.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    d.showModal();
    d.focus();
    return () => {
      d.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Opening another unit from inside the drawer can unmount the control that
  // was used (a peer dot, a build chip), which drops focus to the page; put
  // it back on the drawer instead.
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.contains(document.activeElement)) d.focus();
  }, [u.id]);

  return (
    <dialog
      ref={dialog}
      className="detail"
      tabIndex={-1}
      aria-labelledby={titleId}
      style={{ '--fc': FACTION_COLOURS[u.faction] } as React.CSSProperties}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Pressed and released on the backdrop, so dragging a text selection
      // out of the drawer doesn't close it.
      onMouseDown={(e) => {
        pressedBackdrop.current = onBackdrop(e);
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && onBackdrop(e)) onClose();
      }}
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
          <h2 id={titleId}>{u.name ?? shortName(u)}</h2>
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

      {u.balance && (
        <Section title={`${BALANCE_PATCH_NAME} changes`}>
          <BalanceChanges changes={u.balance} meta={loaded.data.meta} />
        </Section>
      )}

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
    </dialog>
  );
}
