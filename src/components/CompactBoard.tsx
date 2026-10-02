// The board's compact view: every unit as a small tile, the aligned rows
// turned sideways so each faction is a row and each slot a column (see
// compactBlocks). Tiles show the game's 64px render — exactly the size it was
// made for — with the strategic icon in the corner. Stats move to a readout
// strip that follows the pointer or keyboard focus, in place of tooltips that
// would clip at the blocks' edges; a click opens the usual detail panel.

import { Fragment, memo, useMemo, useState } from 'react';
import type { Faction, Unit } from '../lib/types';
import { compactBlocks, slotSpan, DOMAIN_NAMES, type Group, type SortKey } from '../lib/board';
import { fmt, shortName } from '../lib/format';
import { UnitIcon } from './UnitIcon';
import { FACTION_COLOURS } from '../lib/faction-colours';
import { FactionEmblem } from './FactionEmblem';

interface CompactBoardProps {
  groups: Group[];
  factions: Faction[];
  sort: SortKey;
  iconManifest: Set<string>;
  previews: Set<string>;
  selectedId?: string;
  /** Set while picking units to compare; each tile then shows whether it's picked. */
  picked?: Set<string>;
  onOpen: (id: string) => void;
}

export function CompactBoard(props: CompactBoardProps) {
  const { groups } = props;
  const [hovered, setHovered] = useState<Unit | null>(null);
  const byId = useMemo(() => new Map(groups.flatMap((g) => g.units).map((u) => [u.id, u])), [groups]);

  // Delegated, so a move between two tiles is one update rather than a
  // leave/enter pair, and the readout keeps the last unit while crossing gaps.
  const track = (e: React.SyntheticEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-unit]')?.dataset.unit;
    if (id && id !== hovered?.id) setHovered(byId.get(id) ?? null);
  };

  // Only the readout follows the pointer. The tiles are a memoised subtree
  // with none of the hover state in its props, so a hover re-renders the
  // strip and nothing else.
  return (
    <div className="compact-board" onPointerOver={track} onFocus={track}>
      <Readout unit={hovered} />
      <Blocks {...props} />
    </div>
  );
}

const Blocks = memo(function Blocks({
  groups,
  factions,
  sort,
  iconManifest,
  previews,
  selectedId,
  picked,
  onOpen,
}: CompactBoardProps) {
  const blocks = compactBlocks(groups, sort);
  return (
    <div className="cblocks">
      {blocks.map((block, i) => {
        const heading =
          block.domain && (i === 0 || blocks[i - 1].domain !== block.domain)
            ? DOMAIN_NAMES[block.domain]
            : null;
        return (
          <Fragment key={block.key}>
            {heading && <h2 className="domain-head">{heading}</h2>}
            <Block block={block.groups} label={block.label} factions={factions}>
              {(u) => (
                <Tile
                  unit={u}
                  iconManifest={iconManifest}
                  hasPreview={previews.has(u.id)}
                  selected={u.id === selectedId}
                  picked={picked?.has(u.id)}
                  onOpen={onOpen}
                />
              )}
            </Block>
          </Fragment>
        );
      })}
    </div>
  );
});

// One block: a grid with a row per faction and a column per slot position.
// Everything is placed explicitly, so a faction missing from a slot leaves a
// hole rather than letting its neighbours slide left out of alignment.
function Block({
  block,
  label,
  factions,
  children,
}: {
  block: Group[];
  label: string | null;
  factions: Faction[];
  children: (u: Unit) => React.ReactNode;
}) {
  let col = 1;
  const cells: React.ReactNode[] = [];
  for (const group of block) {
    const span = slotSpan(group, factions);
    factions.forEach((f, row) => {
      const units = group.byFaction[f] ?? [];
      for (let k = 0; k < span; k++) {
        const u = units[k];
        const place = { gridRow: row + 1, gridColumn: col + k };
        cells.push(
          u ? (
            <div className="ccell" key={u.id} style={place}>
              {children(u)}
            </div>
          ) : (
            <div
              className="ccell ccell-empty"
              key={`${group.key}-${f}-${k}`}
              style={place}
              aria-hidden="true"
            />
          ),
        );
      }
    });
    col += span;
  }

  return (
    <section className="cblock" aria-label={label ?? undefined}>
      {label && <span className="tier-pill">{label}</span>}
      <div className="cgrid" style={{ gridTemplateColumns: `repeat(${col - 1}, var(--tile))` }}>
        {cells}
      </div>
    </section>
  );
}

function Tile({
  unit: u,
  iconManifest,
  hasPreview,
  selected,
  picked,
  onOpen,
}: {
  unit: Unit;
  iconManifest: Set<string>;
  hasPreview: boolean;
  selected: boolean;
  picked?: boolean;
  onOpen: (id: string) => void;
}) {
  const muted = u.status === 'no-model';
  const name = u.name ?? shortName(u);
  return (
    <button
      type="button"
      className="tile"
      data-unit={u.id}
      data-status={u.status}
      aria-label={`${name}, ${u.faction} ${u.displayName}`}
      aria-current={selected || undefined}
      aria-pressed={picked}
      style={{ '--fc': FACTION_COLOURS[u.faction] } as React.CSSProperties}
      onClick={() => onOpen(u.id)}
    >
      {picked !== undefined && <span className="pick-mark" aria-hidden="true" />}
      {hasPreview ? (
        <>
          <img className="tile-render" src={`/previews/${u.id}.png`} alt="" loading="lazy" decoding="async" />
          <span className="tile-icon">
            <UnitIcon icon={u.icon} faction={u.faction} manifest={iconManifest} size={16} muted={muted} />
          </span>
        </>
      ) : (
        <UnitIcon icon={u.icon} faction={u.faction} manifest={iconManifest} size={30} muted={muted} />
      )}
    </button>
  );
}

// The strip above the tiles: what's under the pointer, in the card's terms.
function Readout({ unit: u }: { unit: Unit | null }) {
  if (!u) {
    return (
      <div className="creadout">
        <span className="creadout-hint">Point at a unit for its numbers · click for the full dossier</span>
      </div>
    );
  }
  return (
    <div className="creadout" style={{ '--fc': FACTION_COLOURS[u.faction] } as React.CSSProperties}>
      <FactionEmblem faction={u.faction} />
      <strong>{u.name ?? shortName(u)}</strong>
      <span className="creadout-sub">{u.displayName}</span>
      {u.status === 'in-progress' && <span className="wip">WIP</span>}
      <span className="creadout-stats">
        <Stat label="Alloy" value={fmt(u.cost.alloys)} cls="alloy-val" />
        <Stat label="Energy" value={fmt(u.cost.energy)} cls="energy-val" />
        <Stat label="HP" value={fmt(u.health)} />
        {u.dps ? <Stat label="DPS" value={fmt(u.dps)} /> : null}
        {u.maxRange ? <Stat label="Range" value={fmt(u.maxRange)} /> : null}
        {u.movement?.speed ? <Stat label="Speed" value={`${fmt(u.movement.speed)} u/s`} /> : null}
      </span>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <span className="creadout-stat">
      <i>{label}</i>
      <b className={cls}>{value}</b>
    </span>
  );
}
