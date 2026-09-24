import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { loadData, type LoadedData } from '../lib/data';
import { compareTable, parseCompare } from '../lib/compare';
import { copyText } from '../lib/clipboard';
import { fmt, shortName } from '../lib/format';
import type { Unit } from '../lib/types';
import { FACTION_COLOURS, UnitIcon } from '../components/UnitIcon';
import { FactionEmblem } from '../components/FactionEmblem';
import { GameVersion } from '../components/GameVersion';
import { PageHead } from '../components/PageHead';
import { WeaponBlock } from '../components/DetailPanel';

// Units side by side: a column each, a row per stat, the best value in each
// row lit. The picks come from the Units board's compare mode and live in the
// URL (?units=a,b,c), so a comparison is a link that can be shared.
interface CompareSearch {
  units?: string;
}

export const Route = createFileRoute('/compare')({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): CompareSearch => ({
    units: raw.units == null ? undefined : String(raw.units) || undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Compare units — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Compare Sanctuary: Shattered Sun units side by side: cost, health, DPS, range, speed and more.',
      },
    ],
  }),
  loader: () => loadData(),
  component: ComparePage,
});

function ComparePage() {
  const loaded = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const ids = parseCompare(search.units, (id) => loaded.byId.has(id));
  const units = ids.map((id) => loaded.byId.get(id)!);
  const joined = ids.join(',') || undefined;
  const remove = (id: string) =>
    navigate({ search: { units: ids.filter((x) => x !== id).join(',') || undefined }, replace: true });

  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    if (await copyText(window.location.href)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <>
      <PageHead eyebrow="Database" title="Compare units" art="units">
        Side by side, with the best value in each row lit. The link carries the picks, so copy it to share the
        comparison.
      </PageHead>

      <div className="toolbar">
        <span>
          <Link to="/" search={{ compare: joined }} className="linkish">
            ← Units
          </Link>
          {units.length ? ` · ${units.length} unit${units.length === 1 ? '' : 's'}` : null}
        </span>
        <div className="toolbar-controls">
          <GameVersion game={loaded.data.meta.game} generatedAt={loaded.data.meta.generatedAt} />
          {units.length > 0 && (
            <button type="button" className="linkish" onClick={copyLink}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          )}
        </div>
      </div>

      <main className="compare-page">
        {units.length < 2 ? (
          <div className="empty">
            <p>
              {units.length ? 'Pick at least one more unit to compare.' : 'Nothing to compare yet.'} On the
              Units page, press <strong>Compare</strong> in the toolbar and click the units you want side by
              side.
            </p>
            <Link to="/" search={{ compare: joined }} className="btn primary">
              Pick units
            </Link>
          </div>
        ) : (
          <CompareTable units={units} loaded={loaded} ids={joined} onRemove={remove} />
        )}
      </main>
    </>
  );
}

function CompareTable({
  units,
  loaded,
  ids,
  onRemove,
}: {
  units: Unit[];
  loaded: LoadedData;
  ids: string | undefined;
  onRemove: (id: string) => void;
}) {
  const table = compareTable(units);
  const cols = units.length + 1;

  return (
    <div className="compare-wrap">
      <table className="compare-table">
        <thead>
          <tr>
            <th className="compare-corner" scope="col">
              <span className="sr-only">Stat</span>
            </th>
            {units.map((u) => (
              <th
                key={u.id}
                scope="col"
                className="compare-head"
                style={{ '--fc': FACTION_COLOURS[u.faction] } as React.CSSProperties}
              >
                <button
                  type="button"
                  className="compare-remove"
                  aria-label={`Remove ${u.name ?? shortName(u)}`}
                  onClick={() => onRemove(u.id)}
                >
                  ×
                </button>
                <Render unit={u} loaded={loaded} />
                <Link to="/" search={{ unit: u.id, compare: ids }} className="compare-name">
                  <FactionEmblem faction={u.faction} />
                  {u.name ?? shortName(u)}
                </Link>
                <span className="compare-sub">{u.displayName}</span>
              </th>
            ))}
          </tr>
        </thead>
        {table.map((section) => (
          <tbody key={section.title}>
            <tr className="compare-section">
              <th colSpan={cols} scope="colgroup">
                {section.title}
              </th>
            </tr>
            {section.rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {row.values.map((v, i) => (
                  <td key={units[i].id} className={row.best.has(i) ? 'best' : undefined}>
                    {v == null ? (
                      <span className="compare-none">—</span>
                    ) : (
                      <span className={row.cls}>
                        {fmt(v)}
                        {row.unit}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
        {units.some((u) => u.weapons.length) && (
          <tbody>
            <tr className="compare-section">
              <th colSpan={cols} scope="colgroup">
                Weapons
              </th>
            </tr>
            <tr className="compare-weapons">
              <th scope="row">Mounts</th>
              {units.map((u) => (
                <td key={u.id}>
                  {u.weapons.length ? (
                    u.weapons.map((w, i) => <WeaponBlock weapon={w} key={i} />)
                  ) : (
                    <span className="compare-none">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}

// The sharp developer render where there is one, else the game's thumbnail,
// else the strategic icon.
function Render({ unit: u, loaded }: { unit: Unit; loaded: LoadedData }) {
  const src = loaded.renders.has(u.id)
    ? `/renders/${u.id}.webp`
    : loaded.previews.has(u.id)
      ? `/previews/${u.id}.png`
      : null;
  return (
    <span className="compare-render">
      {src ? (
        <img src={src} alt="" width={88} height={88} decoding="async" />
      ) : (
        <UnitIcon
          icon={u.icon}
          faction={u.faction}
          manifest={loaded.iconManifest}
          size={48}
          muted={u.status === 'no-model'}
        />
      )}
    </span>
  );
}
