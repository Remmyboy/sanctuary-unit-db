import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { loadData, unitArt, type LoadedData } from '../lib/data';
import { compareTable, parseCompare } from '../lib/compare';
import { str } from '../lib/search';
import { useCopyFeedback } from '../lib/use-copy-feedback';
import { duration, fmt, shortName } from '../lib/format';
import { MAP_SIZE, moveClass, type MoveClass } from '../lib/scale';
import type { Unit } from '../lib/types';
import { UnitIcon } from '../components/UnitIcon';
import { FACTION_COLOURS } from '../lib/faction-colours';
import { FactionEmblem } from '../components/FactionEmblem';
import { GameVersion } from '../components/GameVersion';
import { PageHead } from '../components/PageHead';
import { WeaponBlock } from '../components/DetailPanel';
import { ChaseSim } from '../components/ChaseSim';

// Units side by side: a column each, a row per stat, the best value in each
// row lit. The picks come from the Units board's compare mode and live in the
// URL (?units=a,b,c), so a comparison is a link that can be shared.
interface CompareSearch {
  units?: string;
}

export const Route = createFileRoute('/compare')({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): CompareSearch => ({
    units: str(raw.units),
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

  const { copied, copy } = useCopyFeedback();

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
            <button type="button" className="linkish" onClick={() => copy(window.location.href)}>
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
          <>
            <CompareTable units={units} loaded={loaded} ids={joined} onRemove={remove} />
            <ChaseSim units={units} loaded={loaded} />
            <Legend units={loaded.data.units} />
          </>
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
                {row.values.map((v, i) => {
                  const note = v == null ? null : row.note?.(units[i]);
                  return (
                    <td key={units[i].id} className={row.best.has(i) ? 'best' : undefined}>
                      {v == null ? (
                        <span className="compare-none">—</span>
                      ) : (
                        <>
                          <span className={row.cls ? `cmp-val ${row.cls}` : 'cmp-val'}>
                            {row.format ? row.format(v) : fmt(v)}
                            {row.unit}
                          </span>
                          {note && <span className="cmp-note">{note}</span>}
                          {row.scale != null && (
                            <span className="cmp-bar" aria-hidden="true">
                              <i style={{ width: `${Math.max(0, (v / row.scale) * 100)}%` }} />
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
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

// The units every number is in, since the game never says. Kept short: one
// line per kind of figure, each with a yardstick a player already has.
function Legend({ units }: { units: Unit[] }) {
  // Measured from the signed-off roster, so the ranges follow the next patch.
  const range = (cls: MoveClass) => {
    const speeds = units
      .filter((u) => u.status === 'in-game' && moveClass(u) === cls)
      .map((u) => u.movement!.speed);
    return speeds.length ? `${fmt(Math.min(...speeds))}–${fmt(Math.max(...speeds))}` : '—';
  };
  return (
    <section className="compare-legend" aria-labelledby="legend-title">
      <h2 id="legend-title">Reading the numbers</h2>
      <dl>
        <dt>Distance</dt>
        <dd>
          Game units. One is about the length of a T1 tank; a ranked 1v1 map is {MAP_SIZE} across. Range,
          vision, radar and sonar are radii.
        </dd>
        <dt>Speed</dt>
        <dd>
          Game units per second. Ground units run {range('ground')}, ships {range('naval')} and aircraft{' '}
          {range('air')} — so 3.5 against 2.2 is the difference between crossing a {MAP_SIZE} map in{' '}
          {duration(MAP_SIZE / 3.5)} and {duration(MAP_SIZE / 2.2)}.
        </dd>
        <dt>DPS</dt>
        <dd>
          Sustained damage per second with the target held in the sights and every shot landing. Rate of fire
          is the game's own: its timers count down in 0.1s ticks, so some reloads fire a tick late (1s every
          1.1s, 0.5s every 0.6s) while others (2s, 3s) are exact — timed in game to match.
        </dd>
        <dt>Build time</dt>
        <dd>
          Build-power-seconds: divide by the builder's build power for real seconds (a T1 engineer has 5).
        </dd>
        <dt>Bars</dt>
        <dd>Each figure against the largest in its row; the lit one is best.</dd>
      </dl>
    </section>
  );
}

// The sharp developer render where there is one, else the game's thumbnail,
// else the strategic icon.
function Render({ unit: u, loaded }: { unit: Unit; loaded: LoadedData }) {
  const art = unitArt(u, loaded);
  return (
    <span className="compare-render">
      {art ? (
        <img src={art.src} alt="" width={88} height={88} decoding="async" />
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
