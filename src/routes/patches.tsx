// What each game patch changed, unit by unit. Pick a patch from the timeline,
// or any two builds to see everything that moved between them, folded into
// one list: the old number, the new one, and whether that's a buff or a nerf.
//
// The data is public/data/patches.json, written by scripts/patches.js at each
// refresh; the words are src/lib/patches.ts and src/lib/patch-notes.ts.

import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { loadData, type LoadedData } from '../lib/data';
import { str } from '../lib/search';
import { builderName } from '../lib/format';
import { FACTION_COLOURS, FACTION_ORDER } from '../lib/faction-colours';
import { FactionEmblem } from '../components/FactionEmblem';
import { HeadStat, PageHead } from '../components/PageHead';
import { UnitIcon } from '../components/UnitIcon';
import { PATCH_NOTES } from '../lib/patch-notes';
import {
  DOMAIN_ORDER,
  PATCHES_URL,
  buildKey,
  buildName,
  buildTimeline,
  day,
  describe,
  foldPatches,
  patchesBetween,
  unitKind,
  unitLabel,
  unitVerdict,
  type ChangeLine,
  type Patch,
  type PatchUnitInfo,
} from '../lib/patches';
import type { PatchesFile } from '../lib/patch-diff';

type VerdictFilter = 'buff' | 'nerf';

interface PatchesSearch {
  from?: string;
  to?: string;
  faction?: string;
  domain?: string;
  verdict?: VerdictFilter;
  q?: string;
}

export const Route = createFileRoute('/patches')({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): PatchesSearch => ({
    from: str(raw.from),
    to: str(raw.to),
    faction: str(raw.faction),
    domain: str(raw.domain),
    verdict: raw.verdict === 'buff' || raw.verdict === 'nerf' ? raw.verdict : undefined,
    q: str(raw.q),
  }),
  head: () => ({
    meta: [
      { title: 'Game patches — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Every Sanctuary: Shattered Sun Playtest patch, unit by unit: what changed, the old number and the new one, and whether it was a buff or a nerf. Compare any two builds.',
      },
    ],
  }),
  loader: async () => {
    const [loaded, file] = await Promise.all([
      loadData(),
      fetch(PATCHES_URL).then((r) => {
        if (!r.ok) throw new Error(`${PATCHES_URL} returned ${r.status}`);
        return r.json() as Promise<PatchesFile>;
      }),
    ]);
    return { loaded, patches: file.patches };
  },
  component: PatchesPage,
});

interface Row {
  unit: PatchUnitInfo;
  lines: ChangeLine[];
  verdict: ReturnType<typeof unitVerdict>;
}

function PatchesPage() {
  const { loaded, patches } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const timeline = buildTimeline(patches);
  const latest = patches[0];
  const fromKey = search.from ?? (latest ? buildKey(latest.from) : '');
  const toKey = search.to ?? (latest ? buildKey(latest.to) : '');
  const range = patchesBetween(patches, fromKey, toKey);
  const fromPoint = timeline.find((b) => b.key === fromKey);
  const toPoint = timeline.find((b) => b.key === toKey);

  const set = (next: Partial<PatchesSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true, resetScroll: false });
  const pickPatch = (p: Patch) => set({ from: buildKey(p.from), to: buildKey(p.to) });

  const nameOf = (id: string) => {
    const u = loaded.byId.get(id);
    return u ? builderName(u) : id;
  };
  const folded = foldPatches(range);
  const rows: Row[] = folded.changed
    .map((unit) => {
      const lines = unit.changes.map((c) => describe(c, unit, nameOf)).filter((l): l is ChangeLine => !!l);
      return { unit, lines, verdict: unitVerdict(lines) };
    })
    .filter((r) => r.lines.length);

  const q = search.q?.toLowerCase().trim();
  const matches = (u: PatchUnitInfo) =>
    (!search.faction || u.faction === search.faction) &&
    (!search.domain || u.domain === search.domain) &&
    (!q || [u.name, u.displayName, u.id].some((s) => s?.toLowerCase().includes(q)));
  // A unit both buffed and nerfed shows under either filter.
  const shown = rows.filter(
    (r) => matches(r.unit) && (!search.verdict || r.verdict === search.verdict || r.verdict === 'mixed'),
  );
  const added = search.verdict ? [] : folded.added.filter(matches);
  const removed = search.verdict ? [] : folded.removed.filter(matches);
  const filtered = !!(search.faction || search.domain || search.verdict || q);

  const count = (v: Row['verdict']) => rows.filter((r) => r.verdict === v).length;
  const single = range.length === 1 ? range[0] : null;
  const title = toPoint ? buildName(toPoint.build) : 'Game patches';

  return (
    <>
      <PageHead
        eyebrow="Database"
        title="Game patches"
        art="units"
        aside={
          <>
            <HeadStat value={patches.length} label="Patches" />
            <HeadStat
              value={rows.length + folded.added.length + folded.removed.length}
              label="Units changed"
            />
          </>
        }
      >
        Every Playtest update since late August, unit by unit: the number before, the number after, and
        whether it was a buff or a nerf. Pick a patch, or any two builds to see everything that changed
        between them.
      </PageHead>

      <div className="toolbar">
        <span className="toolbar-summary">
          {fromPoint && toPoint && range.length
            ? `${buildName(fromPoint.build)} → ${buildName(toPoint.build)} · ${range.length} patch${range.length === 1 ? '' : 'es'} · ${rows.length + folded.added.length + folded.removed.length} units`
            : 'Pick two builds'}
        </span>
        <div className="toolbar-controls pt-range">
          <label className="sortctl">
            From
            <select value={fromKey} onChange={(e) => set({ from: e.target.value })}>
              {timeline.slice(0, -1).map((b) => (
                <option key={b.key} value={b.key}>
                  {pointLabel(b.build)}
                </option>
              ))}
            </select>
          </label>
          <label className="sortctl">
            To
            <select value={toKey} onChange={(e) => set({ to: e.target.value })}>
              {timeline.slice(1).map((b) => (
                <option key={b.key} value={b.key}>
                  {pointLabel(b.build)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <main className="mods-page pt-page">
        <div className="mods-main">
          {!range.length ? (
            <div className="pt-empty">
              <p>
                <strong>“From” has to be an earlier build than “To”.</strong>
              </p>
              {latest && (
                <button type="button" className="chip" onClick={() => pickPatch(latest)}>
                  Show the latest patch
                </button>
              )}
            </div>
          ) : (
            <>
              <section className="pt-head" aria-labelledby="pt-title">
                <p className="pt-dates">
                  {single ? (
                    <>
                      {day(single.to.installedAt) ?? 'Date unknown'} · Steam build {single.to.buildId ?? '?'}
                    </>
                  ) : (
                    <>
                      {range.length} patches, {day(range[0].to.installedAt) ?? '?'} to{' '}
                      {day(range[range.length - 1].to.installedAt) ?? '?'}
                    </>
                  )}
                </p>
                <h2 id="pt-title" className="pt-title">
                  {single ? (
                    <>
                      {title}
                      {single.to.buildId != null && PATCH_NOTES[single.to.buildId] && (
                        <span>{PATCH_NOTES[single.to.buildId].title}</span>
                      )}
                    </>
                  ) : (
                    <>
                      {fromPoint && buildName(fromPoint.build)} → {title}
                    </>
                  )}
                </h2>
                <div className="pt-notes">
                  {[...range].reverse().map((p) => {
                    const note = p.to.buildId != null ? PATCH_NOTES[p.to.buildId] : undefined;
                    if (!note) return null;
                    return (
                      <div key={buildKey(p.to)} className="pt-note">
                        {!single && (
                          <h3>
                            {buildName(p.to)} <span>{day(p.to.installedAt)}</span>
                          </h3>
                        )}
                        <ul>
                          {note.notes.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="pt-filters" role="group" aria-label="Filter the changes">
                <div className="chips">
                  <Chip on={!search.faction} onClick={() => set({ faction: undefined })}>
                    All factions
                  </Chip>
                  {FACTION_ORDER.map((f) => (
                    <Chip key={f} on={search.faction === f} onClick={() => set({ faction: f })}>
                      <FactionEmblem faction={f} colour={FACTION_COLOURS[f]} />
                      {f}
                    </Chip>
                  ))}
                </div>
                <div className="chips">
                  <Chip on={!search.domain} onClick={() => set({ domain: undefined })}>
                    Everything
                  </Chip>
                  {DOMAIN_ORDER.map((d) => (
                    <Chip key={d} on={search.domain === d} onClick={() => set({ domain: d })}>
                      {d}
                    </Chip>
                  ))}
                </div>
                <div className="chips">
                  <Chip on={!search.verdict} onClick={() => set({ verdict: undefined })}>
                    All changes
                  </Chip>
                  <Chip on={search.verdict === 'buff'} onClick={() => set({ verdict: 'buff' })}>
                    Buffs <span className="pt-chip-n">{count('buff') + count('mixed')}</span>
                  </Chip>
                  <Chip on={search.verdict === 'nerf'} onClick={() => set({ verdict: 'nerf' })}>
                    Nerfs <span className="pt-chip-n">{count('nerf') + count('mixed')}</span>
                  </Chip>
                </div>
                <input
                  type="search"
                  className="pt-search"
                  placeholder="Find a unit"
                  aria-label="Find a unit"
                  defaultValue={search.q ?? ''}
                  onChange={(e) => set({ q: e.target.value || undefined })}
                />
              </div>

              <p className="pt-legend hint">
                <span className="pt-pct buff">buff</span> <span className="pt-pct nerf">nerf</span> Each line
                is the number before the patch, then after.
                {range.length > 1 &&
                  ' Over several patches, a number that changed and came back is left out.'}
              </p>

              {added.length > 0 && <UnitCards title="New units" units={added} loaded={loaded} />}
              {removed.length > 0 && <UnitCards title="Removed" units={removed} loaded={loaded} gone />}

              {DOMAIN_ORDER.map((d) => {
                const inDomain = shown.filter((r) => r.unit.domain === d).sort(byRoster);
                if (!inDomain.length) return null;
                return (
                  <section key={d} className="gm-section bp-section" aria-labelledby={`pt-${d}`}>
                    <h2 id={`pt-${d}`} className="gm-heading">
                      {d}
                      <span className="bp-count">
                        {inDomain.length} unit{inDomain.length === 1 ? '' : 's'}
                      </span>
                    </h2>
                    <div className="bp-rows" role="list">
                      {inDomain.map((r) => (
                        <UnitRow key={r.unit.id} row={r} loaded={loaded} />
                      ))}
                    </div>
                  </section>
                );
              })}

              {!shown.length && !added.length && !removed.length && (
                <p className="pt-none">
                  {filtered ? 'Nothing that matches the filters changed here.' : 'No unit changed here.'}
                </p>
              )}
            </>
          )}
        </div>

        <aside className="mods-aside">
          <nav className="bp-toc pt-timeline" aria-label="Patches">
            <h2>Patches</h2>
            <ol>
              {patches.map((p) => {
                const note = p.to.buildId != null ? PATCH_NOTES[p.to.buildId] : undefined;
                const active = range.length === 1 && range[0] === p;
                const n = p.changed.length + p.added.length + p.removed.length;
                return (
                  <li key={buildKey(p.to)}>
                    <button
                      type="button"
                      className={active ? 'pt-patch active' : 'pt-patch'}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => pickPatch(p)}
                    >
                      <span className="pt-patch-top">
                        <strong>{buildName(p.to)}</strong>
                        <span>{day(p.to.installedAt)}</span>
                      </span>
                      {note && <span className="pt-patch-title">{note.title}</span>}
                      <span className="pt-patch-n">
                        {n} unit{n === 1 ? '' : 's'}
                        {p.added.length ? ` · ${p.added.length} new` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            {timeline.length > 2 && (
              <button
                type="button"
                className="chip pt-all"
                aria-pressed={fromKey === timeline[0].key && toKey === timeline[timeline.length - 1].key}
                onClick={() => set({ from: timeline[0].key, to: timeline[timeline.length - 1].key })}
              >
                Everything since {buildName(timeline[0].build)}
              </button>
            )}
          </nav>
          <div className="mods-where pt-about">
            <h2>Where this comes from</h2>
            <p>
              Each patch is the game&rsquo;s own unit files, read before and after the update by the same
              extractor, so a change here is the game&rsquo;s. DPS is worked out the way the database works it
              out. Projectiles, flight patterns and the lobby aren&rsquo;t in the unit list; the notes above
              say what changed there.
            </p>
          </div>
        </aside>
      </main>
    </>
  );
}

const pointLabel = (b: Patch['to']) => {
  const d = day(b.installedAt);
  return d ? `${buildName(b)} · ${d}` : buildName(b);
};

const FACTION_RANK = new Map(FACTION_ORDER.map((f, i) => [f as string, i]));
function byRoster(a: Row, b: Row): number {
  return (
    (a.unit.tier ?? 9) - (b.unit.tier ?? 9) ||
    unitKind(a.unit).localeCompare(unitKind(b.unit)) ||
    (FACTION_RANK.get(a.unit.faction) ?? 9) - (FACTION_RANK.get(b.unit.faction) ?? 9)
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

function UnitName({ unit, loaded }: { unit: PatchUnitInfo; loaded: LoadedData }) {
  const style = { '--fc': FACTION_COLOURS[unit.faction] } as React.CSSProperties;
  return loaded.byId.has(unit.id) ? (
    <Link to="/" search={{ unit: unit.id }} className="pt-name" style={style}>
      {unitLabel(unit)}
    </Link>
  ) : (
    <span className="pt-name" style={style}>
      {unitLabel(unit)}
    </span>
  );
}

function UnitRow({ row: r, loaded }: { row: Row; loaded: LoadedData }) {
  return (
    <div className="bp-row pt-row" role="listitem">
      <div className="pt-who">
        <UnitIcon icon={r.unit.icon} faction={r.unit.faction} manifest={loaded.iconManifest} size={34} />
        <div>
          <div className="pt-who-top">
            <UnitName unit={r.unit} loaded={loaded} />
            {r.verdict && <span className={`pt-verdict ${r.verdict}`}>{VERDICT_WORDS[r.verdict]}</span>}
          </div>
          <span className="pt-kind">
            <FactionEmblem faction={r.unit.faction} colour={FACTION_COLOURS[r.unit.faction]} />
            {r.unit.name ? unitKind(r.unit) : r.unit.faction}
          </span>
        </div>
      </div>
      <ul className="bp-changes">
        {r.lines.map((l) => (
          <li key={l.key}>
            <span className="bp-label">{l.label}</span>
            <span className="bp-vals">
              <span className="bp-before">{l.before}</span>
              <span className="bp-arrow" aria-label="becomes">
                →
              </span>
              <span className="bp-after">{l.after}</span>
              {l.percent != null && l.percent !== 0 ? (
                <span className={`pt-pct ${l.verdict ?? ''}`}>
                  {l.percent > 0 ? '+' : '−'}
                  {Math.abs(l.percent)}%
                </span>
              ) : (
                l.verdict && <span className={`pt-pct ${l.verdict}`}>{l.verdict}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const VERDICT_WORDS = { buff: 'Buffed', nerf: 'Nerfed', mixed: 'Mixed' } as const;

function UnitCards({
  title,
  units,
  loaded,
  gone = false,
}: {
  title: string;
  units: PatchUnitInfo[];
  loaded: LoadedData;
  gone?: boolean;
}) {
  return (
    <section className="gm-section" aria-label={title}>
      <h2 className="gm-heading pt-cards-head">
        {title}
        <span className="bp-count">
          {units.length} unit{units.length === 1 ? '' : 's'}
        </span>
      </h2>
      <ul className={gone ? 'pt-cards gone' : 'pt-cards'}>
        {[...units]
          .sort(
            (a, b) =>
              DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) ||
              (a.tier ?? 9) - (b.tier ?? 9),
          )
          .map((u) => (
            <li key={u.id}>
              <UnitIcon
                icon={u.icon}
                faction={u.faction}
                manifest={loaded.iconManifest}
                size={34}
                muted={gone}
              />
              <div>
                <UnitName unit={u} loaded={loaded} />
                <span className="pt-kind">
                  <FactionEmblem faction={u.faction} colour={FACTION_COLOURS[u.faction]} />
                  {u.name ? unitKind(u) : u.faction}
                </span>
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
