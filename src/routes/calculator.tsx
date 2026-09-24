import { useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { loadData } from '../lib/data';
import { builderName, duration, fmt, resourceName, shortName } from '../lib/format';
import {
  buildResult,
  buildable,
  canAssist,
  commanderOf,
  economyResult,
  expandQueue,
  isCommander,
  isConsumer,
  isProducer,
  packRows,
  shown,
  simulateQueue,
  unpackRows,
  type CountedRow,
  type QueueResult,
  type Stock,
} from '../lib/calc';
import { copyText } from '../lib/clipboard';
import type { Faction, ResourceRates, Unit } from '../lib/types';
import { FACTION_COLOURS, FACTION_ORDER, UnitIcon } from '../components/UnitIcon';
import { GameVersion } from '../components/GameVersion';
import { PageHead } from '../components/PageHead';

// The whole setup lives in the URL — same params as the pre-framework site
// (t / p / a / e, plus f for the faction lens), so a build can be shared or
// bookmarked. Nothing is pre-chosen; an absent param just means "none yet".
// The build-order mode adds m=q, its queue (q), its builder (b) and a
// starting stockpile (s, "alloy:energy"; absent means full storage). It
// shares the assists (a) and economy (e) with the single-build mode.
interface CalcSearch {
  t?: string;
  p?: string;
  a?: string;
  e?: string;
  f?: string;
  m?: string;
  q?: string;
  b?: string;
  s?: string;
}

const str = (v: unknown): string | undefined => {
  const s = v == null ? '' : String(v);
  return s ? s : undefined;
};

export const Route = createFileRoute('/calculator')({
  ssr: false,
  validateSearch: (raw: Record<string, unknown>): CalcSearch => ({
    t: str(raw.t),
    p: str(raw.p),
    a: str(raw.a),
    e: str(raw.e),
    f: str(raw.f),
    m: str(raw.m),
    q: str(raw.q),
    b: str(raw.b),
    s: str(raw.s),
  }),
  head: () => ({
    meta: [
      { title: 'Calculator — SanctuaryDB' },
      {
        name: 'description',
        content:
          "Build time, resource drain and economy planning for Sanctuary: Shattered Sun, using the game's own formulas.",
      },
    ],
  }),
  loader: () => loadData(),
  component: CalculatorPage,
});

type PanelKind = 'target' | 'queue' | 'assist' | 'econ' | 'drain';
type RowKey = 'a' | 'e' | 'q';

/* ---------------- naming & detail lines ---------------- */

const label = (u: Unit): string => u.name ?? shortName(u);

const byTierName = (a: Unit, b: Unit) => (a.tier ?? 0) - (b.tier ?? 0) || label(a).localeCompare(label(b));

// "T2 · EDA · 3,200a · 48,000e" — the sub line under a pickable unit.
const subLine = (u: Unit): string =>
  [u.tier ? `T${u.tier}` : null, u.faction, `${fmt(u.cost.alloys, 0)}a · ${fmt(u.cost.energy, 0)}e`]
    .filter(Boolean)
    .join(' · ');

const rateBits = (o: ResourceRates | null, sign: string): string | null => {
  const bits = Object.entries(o ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${sign}${fmt(v)} ${resourceName(k)}/s`);
  return bits.length ? bits.join(' ') : null;
};

// "+18 energy/s · −2 alloy/s · 500 energy store" — what a structure does.
const econDetail = (u: Unit): string =>
  [
    rateBits(u.production, '+'),
    rateBits(u.upkeep, '−'),
    u.storage
      ? Object.entries(u.storage)
          .filter(([, v]) => v)
          .map(([k, v]) => `${fmt(v, 0)} ${resourceName(k)} store`)
          .join(' ')
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

const econSub = (u: Unit): string =>
  `${[u.tier ? `T${u.tier}` : null, u.faction].filter(Boolean).join(' ')} · ${econDetail(u)}`;

// Ids and internal names are searchable too, since people quote them; so are
// "T2" and the faction, which the old combobox labels used to carry.
const haystacks = new WeakMap<Unit, string>();
const haystack = (u: Unit): string => {
  let h = haystacks.get(u);
  if (!h) {
    h = [u.name, u.displayName, u.internalName, u.id, u.role, u.tier ? `T${u.tier}` : null, u.faction]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    haystacks.set(u, h);
  }
  return h;
};

/* ---------------- page ---------------- */

function CalculatorPage() {
  const { data, byId, iconManifest } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const patch = (p: Partial<CalcSearch>) =>
    navigate({ search: (prev: CalcSearch) => ({ ...prev, ...p }), replace: true });

  const [panel, setPanel] = useState<PanelKind | null>(null);
  const togglePanel = (kind: PanelKind) => setPanel(panel === kind ? null : kind);

  // Step 1 — the faction lens. Narrows the target/assist pools; what's already
  // chosen survives it, so a shared cross-faction setup stays intact.
  const shownUnits = useMemo(() => data.units.filter(shown), [data]);
  const faction = search.f && FACTION_ORDER.includes(search.f as Faction) ? (search.f as Faction) : undefined;
  const pool = useMemo(
    () => (faction ? shownUnits.filter((u) => u.faction === faction) : shownUnits),
    [shownUnits, faction],
  );
  const targetPool = useMemo(() => pool.filter(buildable).sort(byTierName), [pool]);
  const assistPool = useMemo(() => pool.filter(canAssist), [pool]);

  // Step 2 — the target. Nothing is pre-chosen: the page starts empty and a
  // stale URL id simply shows the empty state again.
  const targetId = search.t && byId.has(search.t) && buildable(byId.get(search.t)!) ? search.t : null;
  const target = targetId ? byId.get(targetId) : undefined;

  // Step 3 — one-tap builder chips, lowest tier first. The tier prefix matters:
  // factions have same-named engineers at several tiers. builtBy is fresh
  // construction only; the structure this target upgrades from can also start
  // it — by turning into it in place — so it joins the chips, marked as the
  // upgrade path rather than pretending a factory builds a sibling factory.
  const upgradeSourceOf = useMemo(() => {
    const m = new Map<string, Unit>();
    for (const u of data.units) if (u.upgradesTo) m.set(u.upgradesTo, u);
    return m;
  }, [data]);
  const builders = useMemo(() => {
    if (!target) return [];
    const list = target.builtBy.map((id) => byId.get(id)).filter((u): u is Unit => Boolean(u));
    const upFrom = upgradeSourceOf.get(target.id);
    if (upFrom && shown(upFrom) && (upFrom.buildPower ?? 0) > 0) list.push(upFrom);
    return list.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (a.buildPower ?? 0) - (b.buildPower ?? 0));
  }, [target, byId, upgradeSourceOf]);
  const primary = (search.p && builders.find((u) => u.id === search.p)) || builders[0] || undefined;

  const assists = useMemo(() => unpackRows(search.a, byId), [search.a, byId]);

  // Economy pools follow the target's faction (cross-faction economy is
  // irrelevant), falling back to the faction chip.
  const econFaction: Faction | undefined = target?.faction ?? faction;
  const econBase = useMemo(
    () => (econFaction ? shownUnits.filter((u) => u.faction === econFaction) : pool),
    [shownUnits, econFaction, pool],
  );
  const producerPool = useMemo(() => econBase.filter(isProducer), [econBase]);
  const consumerPool = useMemo(() => econBase.filter(isConsumer), [econBase]);

  const economy = useMemo(() => unpackRows(search.e, byId), [search.e, byId]);

  const writeRows = (key: RowKey, next: CountedRow[]) => patch({ [key]: packRows(next) });

  const addRow = (key: RowKey, rows: CountedRow[], id: string) => {
    const hit = rows.find((r) => r.id === id);
    const next = hit
      ? rows.map((r) => (r.id === id ? { ...r, count: r.count + 1 } : r))
      : [...rows, { id, count: 1 }];
    writeRows(key, next);
    setPanel(null);
  };

  const bumpRow = (key: RowKey, rows: CountedRow[], i: number, delta: number) =>
    writeRows(
      key,
      rows.map((r, j) => (j === i ? { ...r, count: r.count + delta } : r)).filter((r) => r.count >= 1),
    );

  const dropRow = (key: RowKey, rows: CountedRow[], i: number) =>
    writeRows(
      key,
      rows.filter((_, j) => j !== i),
    );

  const build = buildResult(target, primary, assists, byId);
  const econ = economyResult(economy, byId);

  // Build-order mode. The queue is ordered and may repeat a unit (generator,
  // extractor, generator…), so picking the unit that's already last bumps
  // that row, anything else appends a new one.
  const queueMode = search.m === 'q';
  const queueRows = useMemo(() => unpackRows(search.q, byId), [search.q, byId]);
  const addToQueue = (id: string) => {
    const last = queueRows[queueRows.length - 1];
    writeRows(
      'q',
      last?.id === id
        ? queueRows.map((r, i) => (i === queueRows.length - 1 ? { ...r, count: r.count + 1 } : r))
        : [...queueRows, { id, count: 1 }],
    );
    setPanel(null);
  };
  const moveQueueRow = (i: number) =>
    writeRows(
      'q',
      queueRows.map((r, j) => (j === i - 1 ? queueRows[i] : j === i ? queueRows[i - 1] : r)),
    );

  // Builders are the units that can put build power into a construction —
  // commander, engineers, engineering stations — from the faction chip or,
  // for a shared link without one, the linked builder's own faction.
  const queueFaction: Faction | undefined = faction ?? (search.b ? byId.get(search.b)?.faction : undefined);
  const commander = commanderOf(shownUnits, queueFaction);
  const queueBuilders = useMemo(
    () =>
      queueFaction
        ? shownUnits
            .filter((u) => u.faction === queueFaction && canAssist(u))
            .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (a.buildPower ?? 0) - (b.buildPower ?? 0))
        : [],
    [shownUnits, queueFaction],
  );
  const queueBuilder =
    (search.b && queueBuilders.find((u) => u.id === search.b)) ||
    queueBuilders.find((u) => u.id === commander?.id) ||
    queueBuilders[0] ||
    undefined;
  const queuePool = useMemo(
    () => (queueBuilder ? shownUnits.filter((u) => buildable(u) && u.builtBy.includes(queueBuilder.id)) : []),
    [shownUnits, queueBuilder],
  );

  // Every game starts with a commander, so its income and storage are always
  // in the starting economy; the economy column adds what's already built.
  // A commander added there by hand would count twice, so it's left out.
  const startRows = useMemo(() => economy.filter((r) => !isCommander(byId.get(r.id)!)), [economy, byId]);
  const startEconomy = useMemo(
    () => (commander ? [{ id: commander.id, count: 1 }, ...startRows] : startRows),
    [commander, startRows],
  );
  const startEcon = economyResult(startEconomy, byId);
  const startCap: Stock = { alloys: startEcon.alloysStore, energy: startEcon.energyStore };
  const startStock: Stock = useMemo(() => {
    const [a, e] = (search.s ?? '').split(':').map(Number);
    return {
      alloys: Number.isFinite(a) && search.s ? a : startCap.alloys,
      energy: Number.isFinite(e) && search.s ? e : startCap.energy,
    };
  }, [search.s, startCap.alloys, startCap.energy]);
  const setStartStock = (next: Stock) =>
    patch({
      s:
        next.alloys === startCap.alloys && next.energy === startCap.energy
          ? undefined
          : `${next.alloys}:${next.energy}`,
    });

  // Rows the builder can't start (a shared link, or the builder changed
  // since) are flagged in the list and left out rather than built anyway.
  const queue = useMemo(
    () => expandQueue(queueRows, byId).filter((u) => queueBuilder && u.builtBy.includes(queueBuilder.id)),
    [queueRows, byId, queueBuilder],
  );
  const plan = useMemo(
    () => simulateQueue(queue, queueBuilder, assists, startEconomy, startStock, byId),
    [queue, queueBuilder, assists, startEconomy, startStock, byId],
  );

  // Sharing: the auto-selected builder chip is the one piece of state derived
  // rather than picked, and it could drift after a game patch. Copy link pins
  // every current selection into the URL before putting it on the clipboard,
  // so the recipient sees exactly this setup.
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    setPanel(null);
    await navigate({
      search: {
        t: targetId ?? undefined,
        p: primary?.id,
        a: packRows(assists),
        e: packRows(economy),
        f: faction,
        m: search.m,
        q: packRows(queueRows),
        b: queueMode ? queueBuilder?.id : search.b,
        s: search.s,
      },
      replace: true,
    });
    if (await copyText(window.location.href)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    // On refusal the address bar still holds the pinned URL, so copying by
    // hand works regardless.
  };

  return (
    <>
      <PageHead eyebrow="Database" title="Build Calculator">
        How long a build takes, what it drains, and whether your economy keeps up — worked from the game's own
        formulas. The setup lives in the URL, so copy the link to share it.
      </PageHead>
      <div className="toolbar">
        <span className="toolbar-summary">
          {queueMode
            ? plan
              ? `${queue.length} build${queue.length === 1 ? '' : 's'} · ${fmt(plan.power)} build power · ${
                  Number.isFinite(plan.finish) ? duration(plan.finish) : 'never finishes'
                }`
              : 'Build order planning'
            : build
              ? `${label(build.target)} · ${fmt(build.power)} build power · ${duration(build.seconds)}`
              : 'Build time, drain and economy planning'}
        </span>
        <span className="toolbar-controls">
          <GameVersion game={data.meta.game} generatedAt={data.meta.generatedAt} />
          <button type="button" className="linkish" onClick={copyLink}>
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setPanel(null);
              navigate({ search: {}, replace: true });
            }}
          >
            Reset
          </button>
        </span>
      </div>

      <main className="calc">
        <section className="calc-col">
          <div className="mode-row" role="group" aria-label="Calculator mode">
            <button
              type="button"
              aria-pressed={!queueMode}
              onClick={() => {
                setPanel(null);
                patch({ m: undefined });
              }}
            >
              Single build
            </button>
            <button
              type="button"
              aria-pressed={queueMode}
              onClick={() => {
                setPanel(null);
                patch({ m: 'q' });
              }}
            >
              Build order
            </button>
          </div>

          <h2>{queueMode ? 'Build order' : 'Build'}</h2>

          <div className="calc-step">
            <b>1</b>Faction
          </div>
          <div className="chip-row">
            {FACTION_ORDER.map((fc) => (
              <button
                type="button"
                className="fac-chip"
                key={fc}
                aria-pressed={(queueMode ? queueFaction : faction) === fc}
                // In build-order mode the builder decides the faction too, so
                // it's cleared with the chip or the old faction would linger.
                onClick={() => {
                  setPanel(null);
                  if (queueMode) patch({ f: queueFaction === fc ? undefined : fc, b: undefined });
                  else patch({ f: faction === fc ? undefined : fc });
                }}
              >
                <span className="dot" style={{ background: FACTION_COLOURS[fc] ?? '#888' }} />
                {fc}
              </button>
            ))}
          </div>

          {queueMode ? (
            <>
              <div className="calc-step">
                <b>2</b>Who builds it?
              </div>
              {!queueFaction && <div className="col-empty">Pick a faction first.</div>}
              <div className="chip-row">
                {queueBuilders.map((u) => (
                  <button
                    type="button"
                    className="builder-chip"
                    key={u.id}
                    aria-pressed={u.id === queueBuilder?.id}
                    onClick={() => patch({ b: u.id })}
                  >
                    {(u.tier && !isCommander(u) ? `T${u.tier} ` : '') + label(u)}{' '}
                    <small>{fmt(u.buildPower)} bp</small>
                  </button>
                ))}
              </div>

              <div className="calc-step">
                <b>3</b>Queue, in order
              </div>
              {queueBuilder && queueRows.length === 0 && (
                <div className="col-empty">Nothing queued — add the first build.</div>
              )}
              <StepperList
                rows={queueRows}
                byId={byId}
                iconManifest={iconManifest}
                numbered
                detail={(u) =>
                  queueBuilder && !u.builtBy.includes(queueBuilder.id)
                    ? `${label(queueBuilder)} can't build this — skipped`
                    : `${fmt(u.cost.alloys, 0)}a · ${fmt(u.cost.energy, 0)}e · ${fmt(u.buildTime, 0)} build time`
                }
                onBump={(i, d) => bumpRow('q', queueRows, i, d)}
                onDrop={(i) => dropRow('q', queueRows, i)}
                onMoveUp={moveQueueRow}
              />
              {queueBuilder && (
                <button type="button" className="add-btn" onClick={() => togglePanel('queue')}>
                  + Add to queue
                </button>
              )}
              {panel === 'queue' && (
                <PickerPanel
                  units={queuePool}
                  subFor={subLine}
                  placeholder={`Search what ${queueBuilder ? label(queueBuilder) : 'it'} can build…`}
                  listMax={264}
                  iconManifest={iconManifest}
                  onPick={(u) => addToQueue(u.id)}
                  onClose={() => setPanel(null)}
                />
              )}
            </>
          ) : (
            <>
              <div className="calc-step">
                <b>2</b>What are you building?
              </div>
              <button
                type="button"
                className="select-btn"
                aria-expanded={panel === 'target'}
                onClick={() => togglePanel('target')}
              >
                {target ? (
                  <>
                    <UnitIcon icon={target.icon} faction={target.faction} manifest={iconManifest} size={36} />
                    <span className="select-who">
                      <span className="select-name">{label(target)}</span>
                      <small>{subLine(target)}</small>
                    </span>
                  </>
                ) : (
                  <span className="select-empty">Pick a unit or structure…</span>
                )}
                <span className="caret">▾</span>
              </button>
              {panel === 'target' && (
                <PickerPanel
                  units={targetPool}
                  subFor={subLine}
                  placeholder="Search buildable units…"
                  listMax={264}
                  iconManifest={iconManifest}
                  // A new target invalidates the builder choice — its builtBy list
                  // is a different set, so fall back to that list's first chip.
                  onPick={(u) => {
                    patch({ t: u.id, p: undefined });
                    setPanel(null);
                  }}
                  onClose={() => setPanel(null)}
                />
              )}

              <div className="calc-step">
                <b>3</b>Who starts it?
              </div>
              {!target && <div className="col-empty">Pick a build target first.</div>}
              <div className="chip-row">
                {builders.map((u) => (
                  <button
                    type="button"
                    className="builder-chip"
                    key={u.id}
                    aria-pressed={u.id === primary?.id}
                    title={
                      u.upgradesTo === target?.id ? `Upgrades in place into ${label(target)}` : undefined
                    }
                    onClick={() => patch({ p: u.id })}
                  >
                    {(u.tier ? `T${u.tier} ` : '') + label(u)}{' '}
                    <small>
                      {u.upgradesTo === target?.id ? 'upgrade · ' : ''}
                      {fmt(u.buildPower)} bp
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="calc-step">
            <b>4</b>Assisted by <span className="opt">(optional)</span>
          </div>
          {assists.length === 0 && <div className="col-empty">None — the builder works alone.</div>}
          <StepperList
            rows={assists}
            byId={byId}
            iconManifest={iconManifest}
            detail={(u) => `${fmt(u.buildPower)} bp each`}
            onBump={(i, d) => bumpRow('a', assists, i, d)}
            onDrop={(i) => dropRow('a', assists, i)}
          />
          <button type="button" className="add-btn" onClick={() => togglePanel('assist')}>
            + Add assisting unit
          </button>
          {panel === 'assist' && (
            <PickerPanel
              units={assistPool}
              subFor={(u) => `${subLine(u)} · ${fmt(u.buildPower)} bp`}
              placeholder="Search assisting units…"
              listMax={220}
              iconManifest={iconManifest}
              onPick={(u) => addRow('a', assists, u.id)}
              onClose={() => setPanel(null)}
            />
          )}
        </section>

        <section className="calc-col">
          <h2>{queueMode ? 'Starting economy' : 'Economy'}</h2>
          {queueMode ? (
            <>
              {commander ? (
                <div className="stepper-list">
                  <div className="stepper">
                    <UnitIcon
                      icon={commander.icon}
                      faction={commander.faction}
                      manifest={iconManifest}
                      size={24}
                    />
                    <span className="who">
                      <span>{label(commander)}</span>
                      <small>{econDetail(commander)}</small>
                    </span>
                    <span className="stepper-note">always there</span>
                  </div>
                </div>
              ) : (
                <div className="col-empty">Pick a faction — every game starts from its commander.</div>
              )}
              <div className="calc-step">
                Already built <span className="opt">(optional)</span>
              </div>
              <StepperList
                rows={startRows}
                byId={byId}
                iconManifest={iconManifest}
                detail={econDetail}
                onBump={(i, d) => bumpRow('e', startRows, i, d)}
                onDrop={(i) => dropRow('e', startRows, i)}
              />
            </>
          ) : (
            <>
              {economy.length === 0 && (
                <div className="col-empty">No structures — add your generators and extractors.</div>
              )}
              <StepperList
                rows={economy}
                byId={byId}
                iconManifest={iconManifest}
                detail={econDetail}
                onBump={(i, d) => bumpRow('e', economy, i, d)}
                onDrop={(i) => dropRow('e', economy, i)}
              />
            </>
          )}
          <div className="add-btns">
            <button type="button" className="add-btn" onClick={() => togglePanel('econ')}>
              + Add generator / extractor
            </button>
            <button type="button" className="add-btn secondary" onClick={() => togglePanel('drain')}>
              + Energy users…
            </button>
          </div>
          {panel === 'econ' && (
            <PickerPanel
              units={queueMode ? producerPool.filter((u) => !isCommander(u)) : producerPool}
              subFor={econSub}
              placeholder="Search economy structures…"
              listMax={264}
              iconManifest={iconManifest}
              onPick={(u) => addRow('e', queueMode ? startRows : economy, u.id)}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === 'drain' && (
            <PickerPanel
              units={consumerPool}
              subFor={econSub}
              placeholder="Search energy users…"
              explainer="Structures that consume alloy or energy — usually not needed, add only if they're part of your base."
              listMax={220}
              iconManifest={iconManifest}
              onPick={(u) => addRow('e', queueMode ? startRows : economy, u.id)}
              onClose={() => setPanel(null)}
            />
          )}

          {queueMode && commander && (
            <>
              <div className="calc-step">Starting stockpile</div>
              <div className="stock-inputs">
                {(['alloys', 'energy'] as const).map((k) => (
                  <label key={k}>
                    <span className={k === 'alloys' ? 'alloy-val' : 'energy-val'}>{resourceName(k)}</span>
                    <input
                      type="number"
                      min={0}
                      max={startCap[k]}
                      step={k === 'alloys' ? 50 : 500}
                      value={startStock[k]}
                      onChange={(e) =>
                        setStartStock({
                          ...startStock,
                          [k]: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        })
                      }
                    />
                    <small>of {fmt(startCap[k], 0)} storage</small>
                  </label>
                ))}
              </div>
            </>
          )}

          {queueMode && plan && plan.steps.length > 0 && (
            <>
              <h2 className="section-gap">Timeline</h2>
              <Timeline plan={plan} />
            </>
          )}
        </section>

        <aside className="calc-rail">
          <div className="rail-inner">
            {queueMode ? (
              <QueueReadout plan={plan} />
            ) : (
              <>
                <h2>Can I afford it?</h2>
                <Verdict build={build} econ={econ} hasEconomy={economy.length > 0} />

                {build && (
                  <>
                    <h2>Build readout</h2>
                    <div className="rgrid">
                      <div>
                        <div className="rk">Time</div>
                        <div className="rv">{duration(build.seconds)}</div>
                      </div>
                      <div>
                        <div className="rk">Build power</div>
                        <div className="rv">
                          {fmt(build.power)}
                          {build.assistPower
                            ? ` (${fmt(build.primary.buildPower)}+${fmt(build.assistPower)})`
                            : ''}
                        </div>
                      </div>
                      <div>
                        <div className="rk">Alloy/s</div>
                        <div className="rv alloy-val">{fmt(build.alloysPerSec)}</div>
                      </div>
                      <div>
                        <div className="rk">Energy/s</div>
                        <div className="rv energy-val">{fmt(build.energyPerSec)}</div>
                      </div>
                      <div>
                        <div className="rk">Total alloy</div>
                        <div className="rv alloy-val">{fmt(build.target.cost.alloys, 0)}</div>
                      </div>
                      <div>
                        <div className="rk">Total energy</div>
                        <div className="rv energy-val">{fmt(build.target.cost.energy, 0)}</div>
                      </div>
                    </div>
                  </>
                )}

                {economy.length > 0 && (
                  <>
                    <h2>Economy readout</h2>
                    <div className="rgrid tight">
                      <div>
                        <div className="rk">Net alloy/s</div>
                        <Net v={econ.alloysNet} />
                      </div>
                      <div>
                        <div className="rk">Net energy/s</div>
                        <Net v={econ.energyNet} />
                      </div>
                    </div>
                    <div className="rlines">
                      <div>
                        Gross {fmt(econ.alloysIn)} alloy/s · {fmt(econ.energyIn)} energy/s
                      </div>
                      <div>
                        Upkeep {fmt(econ.alloysOut)} alloy/s · {fmt(econ.energyOut)} energy/s
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      </main>
    </>
  );
}

const Net = ({ v }: { v: number }) => (
  <div className={`rv ${v < 0 ? 'bad' : 'good'}`}>
    {v > 0 ? '+' : ''}
    {fmt(v)}
  </div>
);

/* ---------------- pieces ---------------- */

function StepperList({
  rows,
  byId,
  iconManifest,
  detail,
  numbered,
  onBump,
  onDrop,
  onMoveUp,
}: {
  rows: CountedRow[];
  byId: Map<string, Unit>;
  iconManifest: Set<string>;
  detail: (u: Unit) => string;
  /** Ordered lists (the build queue) show position and tier, and can be reordered. */
  numbered?: boolean;
  onBump: (i: number, delta: number) => void;
  onDrop: (i: number) => void;
  onMoveUp?: (i: number) => void;
}) {
  if (!rows.length) return null;
  return (
    <div className="stepper-list">
      {rows.map((row, i) => {
        const u = byId.get(row.id)!;
        return (
          // The queue can hold the same unit in several rows, so the id alone
          // isn't a unique key there.
          <div className="stepper" key={`${row.id}:${i}`}>
            {numbered && <span className="stepper-pos">{i + 1}</span>}
            <UnitIcon icon={u.icon} faction={u.faction} manifest={iconManifest} size={24} />
            <span className="who">
              <span>{numbered ? builderName(u) : label(u)}</span>
              <small>{detail(u)}</small>
            </span>
            <span className="stepper-controls">
              {onMoveUp && (
                <button
                  type="button"
                  className="drop"
                  aria-label="Move earlier"
                  title="Move earlier"
                  disabled={i === 0}
                  onClick={() => onMoveUp(i)}
                >
                  ↑
                </button>
              )}
              <button type="button" aria-label="Fewer" onClick={() => onBump(i, -1)}>
                −
              </button>
              <b>{row.count}</b>
              <button type="button" aria-label="More" onClick={() => onBump(i, 1)}>
                +
              </button>
              <button type="button" className="drop" aria-label="Remove" onClick={() => onDrop(i)}>
                ×
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Inline dropdown panel: search on top, scrolling icon rows below. Keyboard
// follows the old combobox conventions — arrows move, Enter picks, Escape
// closes — and a click anywhere outside closes it.
function PickerPanel({
  units,
  subFor,
  placeholder,
  explainer,
  listMax,
  iconManifest,
  onPick,
  onClose,
}: {
  units: Unit[];
  subFor: (u: Unit) => string;
  placeholder: string;
  explainer?: string;
  listMax: number;
  iconManifest: Set<string>;
  onPick: (u: Unit) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const mount = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // mousedown, not click — it fires before the opener button's own click, so
  // switching panels closes this one without the two toggles cancelling out.
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!mount.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [onClose]);

  useEffect(() => {
    listRef.current?.querySelector('.picker-item.active')?.scrollIntoView({ block: 'nearest' });
  });

  const needle = q.trim().toLowerCase();
  const rows = units
    .filter((u) => !needle || haystack(u).includes(needle))
    .sort(byTierName)
    .slice(0, 80);
  const activeIdx = Math.min(active, rows.length - 1);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % Math.max(rows.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (rows[activeIdx]) onPick(rows[activeIdx]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="picker" ref={mount} onKeyDown={onKeyDown}>
      {explainer && <div className="picker-note">{explainer}</div>}
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded="true"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
      />
      <div className="picker-list" style={{ maxHeight: listMax }} ref={listRef}>
        {rows.length ? (
          rows.map((u, i) => (
            <button
              type="button"
              key={u.id}
              className={`picker-item${i === activeIdx ? ' active' : ''}`}
              onClick={() => onPick(u)}
            >
              <UnitIcon icon={u.icon} faction={u.faction} manifest={iconManifest} size={26} />
              <span className="who">
                <span>{label(u)}</span>
                <small>{subFor(u)}</small>
              </span>
            </button>
          ))
        ) : (
          <p className="picker-empty">No matches</p>
        )}
      </div>
    </div>
  );
}

// A build order's answer: when it's done, what it cost, and what it did to the
// stockpile — the three things you'd ask of an opening.
function QueueReadout({ plan }: { plan: QueueResult | null }) {
  if (!plan)
    return (
      <>
        <h2>When is it done?</h2>
        <div className="verdict">
          <span className="verdict-label">Build order</span>
          <span className="verdict-big">—</span>
          <p className="verdict-note">Pick a faction and builder, then queue what to build.</p>
        </div>
      </>
    );

  const done = Number.isFinite(plan.finish);
  const stalled = done && plan.finish > plan.ideal + 0.05;
  const res = [
    ['alloys', 'alloy-val'],
    ['energy', 'energy-val'],
  ] as const;

  return (
    <>
      <h2>When is it done?</h2>
      <div className="verdict">
        <span className="verdict-label">Build order done at</span>
        <span className={`verdict-big ${!done || stalled ? 'bad' : 'good'}`}>
          {done ? duration(plan.finish) : 'never'}
        </span>
        {stalled && <span className="verdict-vs">vs {duration(plan.ideal)} with resources to spare</span>}
        <p className="verdict-note">
          {!done
            ? `Stuck on ${plan.stuck ? builderName(plan.stuck) : 'a build'} — the stockpile is empty and nothing is coming in.`
            : stalled
              ? 'The stockpile ran dry, so builds slowed to what income could pay for.'
              : 'Never short — income and stockpile covered every build at full speed.'}
        </p>
      </div>

      <h2>Total cost</h2>
      <div className="rgrid">
        {res.map(([k, cls]) => (
          <div key={k}>
            <div className="rk">{resourceName(k)}</div>
            <div className={`rv ${cls}`}>{fmt(plan.cost[k], 0)}</div>
          </div>
        ))}
      </div>

      <h2>Stockpile</h2>
      <div className="rgrid">
        {res.map(([k, cls]) => (
          <div key={k}>
            <div className="rk">{resourceName(k)} at end</div>
            <div className={`rv ${cls}`}>{fmt(plan.end[k], 0)}</div>
            <div className="rsub">
              from {fmt(plan.start[k], 0)} · lowest {fmt(plan.low[k], 0)}
            </div>
          </div>
        ))}
      </div>

      <h2>Economy after</h2>
      <div className="rgrid tight">
        {res.map(([k]) => (
          <div key={k}>
            <div className="rk">Net {resourceName(k)}/s</div>
            <Net v={plan.income[k]} />
          </div>
        ))}
      </div>
      <div className="rlines">
        <div>
          Storage {fmt(plan.cap.alloys, 0)} alloy · {fmt(plan.cap.energy, 0)} energy
        </div>
        <div>{fmt(plan.power)} build power · walking between builds not counted</div>
      </div>
    </>
  );
}

// One row per build: when it finished, how much it was held up, and the
// stockpile left behind — where an opening goes wrong is usually visible here.
function Timeline({ plan }: { plan: QueueResult }) {
  return (
    <table className="qtable">
      <thead>
        <tr>
          <th>#</th>
          <th>Build</th>
          <th>Done</th>
          <th className="alloy-val">Alloy</th>
          <th className="energy-val">Energy</th>
        </tr>
      </thead>
      <tbody>
        {plan.steps.map((s, i) => {
          const lost = s.end - s.start - s.ideal;
          return (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                {builderName(s.unit)}
                {lost > 0.05 && <small className="bad"> +{duration(lost)} stalled</small>}
              </td>
              <td>{duration(s.end)}</td>
              <td>{fmt(s.after.alloys, 0)}</td>
              <td>{fmt(s.after.energy, 0)}</td>
            </tr>
          );
        })}
        {plan.stuck && (
          <tr>
            <td>{plan.steps.length + 1}</td>
            <td>
              {builderName(plan.stuck)} <small className="bad">stuck</small>
            </td>
            <td>never</td>
            <td>—</td>
            <td>—</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// The useful question isn't the cost, it's whether the economy sustains it — a
// build drawing more than net income stalls and stretches out. The rail leads
// with that answer as one big figure, backed by a sustain bar per resource.
function Verdict({
  build,
  econ,
  hasEconomy,
}: {
  build: ReturnType<typeof buildResult>;
  econ: ReturnType<typeof economyResult>;
  hasEconomy: boolean;
}) {
  if (!build)
    return (
      <div className="verdict">
        <span className="verdict-label">Verdict</span>
        <span className="verdict-big">—</span>
        <p className="verdict-note">Pick something to build and who builds it.</p>
      </div>
    );

  if (!hasEconomy)
    return (
      <div className="verdict">
        <span className="verdict-label">Unconstrained build time</span>
        <span className="verdict-big">{duration(build.seconds)}</span>
        <p className="verdict-note">Add economy structures to see whether the drain is sustainable.</p>
      </div>
    );

  const bars = (
    [
      ['Alloy', build.alloysPerSec, econ.alloysNet],
      ['Energy', build.energyPerSec, econ.energyNet],
    ] as const
  ).map(([resource, need, have]) => {
    const ok = have >= need;
    return {
      resource,
      ok,
      status: ok ? 'sustained' : have > 0 ? 'stalls' : 'no income',
      text: `needs ${fmt(need)}/s · net ${fmt(have)}/s`,
      pct: `${need > 0 ? Math.min(100, Math.max(0, (have / need) * 100)) : 100}%`,
    };
  });

  const worst = Math.max(
    econ.alloysNet > 0 ? build.alloysPerSec / econ.alloysNet : Infinity,
    econ.energyNet > 0 ? build.energyPerSec / econ.energyNet : Infinity,
  );
  const real = worst > 1 ? build.seconds * worst : build.seconds;
  // With no income of a needed resource the build never finishes, which reads
  // better than the em dash a non-finite duration would produce.
  const realLabel = Number.isFinite(real) ? duration(real) : 'never';

  return (
    <div className="verdict">
      <span className="verdict-label">At this income</span>
      <span className={`verdict-big ${worst > 1 ? 'bad' : 'good'}`}>{realLabel}</span>
      {worst > 1 && Number.isFinite(real) ? (
        <span className="verdict-vs">vs {duration(build.seconds)} unconstrained</span>
      ) : null}
      {bars.map((bar) => (
        <div className="vbar" key={bar.resource}>
          <div className="vbar-head">
            <span>
              {bar.resource} <em className={bar.ok ? 'good' : 'bad'}>{bar.status}</em>
            </span>
            <span className="figures">{bar.text}</span>
          </div>
          <div className="vbar-track">
            <div className={`vbar-fill ${bar.ok ? 'ok' : 'no'}`} style={{ width: bar.pct }} />
          </div>
        </div>
      ))}
    </div>
  );
}
