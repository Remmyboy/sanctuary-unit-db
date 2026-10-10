// Everything the calculator page shows, derived from the URL. The page itself
// is only layout: this works out the pools, the picks, both modes' results and
// the edits that write back to the search params.

import { useMemo, useState } from 'react';
import {
  buildResult,
  buildable,
  canAssist,
  commanderOf,
  economyResult,
  expandQueue,
  isConsumer,
  isStorage,
  isProducer,
  packRows,
  shown,
  simulateQueue,
  unpackRows,
  type CountedRow,
  type Stock,
} from '../../lib/calc';
import type { LoadedData } from '../../lib/data';
import type { Balance } from '../../lib/balance-patch';
import { FACTION_ORDER } from '../../lib/faction-colours';
import { isCommander } from '../../lib/format';
import type { Faction, Unit } from '../../lib/types';
import { useCopyFeedback } from '../../lib/use-copy-feedback';
import { byTierName } from './names';

// The whole setup lives in the URL — same params as the pre-framework site
// (t / p / a / e, plus f for the faction lens), so a build can be shared or
// bookmarked. Nothing is pre-chosen; an absent param just means "none yet".
// The build-order mode adds m=q, its queue (q), its builder (b) and a
// starting stockpile (s, "alloy:energy"; absent means full storage). It
// shares the assists (a) and economy (e) with the single-build mode.
export interface CalcSearch {
  t?: string;
  p?: string;
  a?: string;
  e?: string;
  f?: string;
  m?: string;
  q?: string;
  b?: string;
  s?: string;
  /** Work from a balance mod's numbers; absent means the game's. */
  balance?: Balance;
}

/** Replaces the search params (the route's navigate, with replace: true). */
export type SetCalcSearch = (next: (prev: CalcSearch) => CalcSearch) => Promise<void>;

export type PanelKind = 'target' | 'queue' | 'assist' | 'econ' | 'drain' | 'storage';
export type RowKey = 'a' | 'e' | 'q';

// Builder chips run lowest tier first, then weakest first within a tier.
const byTierPower = (a: Unit, b: Unit) =>
  (a.tier ?? 0) - (b.tier ?? 0) || (a.buildPower ?? 0) - (b.buildPower ?? 0);

export function useCalculatorState({ data, byId }: LoadedData, search: CalcSearch, setSearch: SetCalcSearch) {
  const patch = (p: Partial<CalcSearch>) => setSearch((prev) => ({ ...prev, ...p }));

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
    return list.sort(byTierPower);
  }, [target, byId, upgradeSourceOf]);
  const primary = (search.p && builders.find((u) => u.id === search.p)) || builders[0] || undefined;

  const assists = useMemo(() => unpackRows(search.a, byId), [search.a, byId]);

  // Build-order mode's faction comes from the faction chip or, for a shared
  // link without one, the linked builder's own faction.
  const queueMode = search.m === 'q';
  const queueFaction: Faction | undefined = faction ?? (search.b ? byId.get(search.b)?.faction : undefined);

  // Economy pools follow the target's faction (cross-faction economy is
  // irrelevant), falling back to the faction chip; a build order uses its own.
  const econFaction: Faction | undefined = queueMode ? queueFaction : (target?.faction ?? faction);
  const econBase = useMemo(
    () => (econFaction ? shownUnits.filter((u) => u.faction === econFaction) : pool),
    [shownUnits, econFaction, pool],
  );
  const producerPool = useMemo(() => econBase.filter(isProducer), [econBase]);
  const consumerPool = useMemo(() => econBase.filter(isConsumer), [econBase]);
  const storagePool = useMemo(() => econBase.filter(isStorage), [econBase]);

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
  // commander, engineers, engineering stations — of the build order's faction.
  const commander = commanderOf(shownUnits, queueFaction);
  const queueBuilders = useMemo(
    () =>
      queueFaction
        ? shownUnits.filter((u) => u.faction === queueFaction && canAssist(u)).sort(byTierPower)
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
  const { copied, copy } = useCopyFeedback();
  const copyLink = async () => {
    setPanel(null);
    await setSearch(() => ({
      t: targetId ?? undefined,
      p: primary?.id,
      a: packRows(assists),
      e: packRows(economy),
      f: faction,
      m: search.m,
      q: packRows(queueRows),
      b: queueMode ? queueBuilder?.id : search.b,
      s: search.s,
      balance: search.balance,
    }));
    await copy(window.location.href);
    // On refusal the address bar still holds the pinned URL, so copying by
    // hand works regardless.
  };

  const reset = () => {
    setPanel(null);
    setSearch(() => ({ balance: search.balance }));
  };

  return {
    patch,
    panel,
    setPanel,
    togglePanel,
    faction,
    targetPool,
    assistPool,
    target,
    builders,
    primary,
    assists,
    queueMode,
    queueFaction,
    producerPool,
    consumerPool,
    storagePool,
    economy,
    addRow,
    bumpRow,
    dropRow,
    build,
    econ,
    queueRows,
    addToQueue,
    moveQueueRow,
    commander,
    queueBuilders,
    queueBuilder,
    queuePool,
    startRows,
    startCap,
    startStock,
    setStartStock,
    queue,
    plan,
    copied,
    copyLink,
    reset,
  };
}
