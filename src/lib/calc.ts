// The calculator's maths and option pools. Follows the formulas the game
// documents in templateExplainations.lua:
//
//   buildTime / buildPower                       = seconds to build
//   resDrain(per tick) = cost / (buildTime / buildPower)
//
// Who can build what is not a free choice: a target's `builtBy` list comes from
// resolving every builder's canBuild tag expression, so a T1 air factory simply
// cannot start a T4 bot. Assisting is separate — any unit with the Assist order
// and build power can pour into someone else's build, including one it could
// never have started itself, so those two roles are picked from different pools.

import type { Unit } from './types';

export interface CountedRow {
  id: string;
  count: number;
}

export const shown = (u: Unit) => u.status !== 'no-model';
export const buildable = (u: Unit) => u.builtBy.length > 0 && u.buildTime > 0;
export const canAssist = (u: Unit) => u.canAssist && (u.buildPower ?? 0) > 0;

// The economy picker's split: generators/extractors are what almost every
// setup needs, while upkeep-only structures (shields, radar, factories idling)
// are the secondary "energy users" pool.
export const isProducer = (u: Unit) => (u.production?.alloys ?? 0) > 0 || (u.production?.energy ?? 0) > 0;
export const isConsumer = (u: Unit) =>
  !isProducer(u) && ((u.upkeep?.alloys ?? 0) > 0 || (u.upkeep?.energy ?? 0) > 0);

/* ---------------- maths ---------------- */

export interface BuildResult {
  target: Unit;
  primary: Unit;
  power: number;
  assistPower: number;
  seconds: number;
  alloysPerSec: number;
  energyPerSec: number;
}

export function buildResult(
  target: Unit | undefined,
  primary: Unit | undefined,
  assists: CountedRow[],
  byId: Map<string, Unit>,
): BuildResult | null {
  if (!target || !primary) return null;

  const assistPower = assists.reduce((sum, row) => sum + (byId.get(row.id)?.buildPower ?? 0) * row.count, 0);
  const total = (primary.buildPower ?? 0) + assistPower;
  if (total <= 0) return null;

  const seconds = target.buildTime / total;
  return {
    target,
    primary,
    power: total,
    assistPower,
    seconds,
    alloysPerSec: target.cost.alloys / seconds,
    energyPerSec: target.cost.energy / seconds,
  };
}

export interface EconomyResult {
  alloysIn: number;
  energyIn: number;
  alloysOut: number;
  energyOut: number;
  alloysStore: number;
  energyStore: number;
  alloysNet: number;
  energyNet: number;
}

export function economyResult(economy: CountedRow[], byId: Map<string, Unit>): EconomyResult {
  const t = { alloysIn: 0, energyIn: 0, alloysOut: 0, energyOut: 0, alloysStore: 0, energyStore: 0 };
  for (const row of economy) {
    const u = byId.get(row.id);
    if (!u) continue;
    t.alloysIn += (u.production?.alloys ?? 0) * row.count;
    t.energyIn += (u.production?.energy ?? 0) * row.count;
    t.alloysOut += (u.upkeep?.alloys ?? 0) * row.count;
    t.energyOut += (u.upkeep?.energy ?? 0) * row.count;
    t.alloysStore += (u.storage?.alloys ?? 0) * row.count;
    t.energyStore += (u.storage?.energy ?? 0) * row.count;
  }
  return { ...t, alloysNet: t.alloysIn - t.alloysOut, energyNet: t.energyIn - t.energyOut };
}

/* ---------------- build order ---------------- */
// A queue of builds worked one after another by the same builder (plus any
// assists), starting from a stockpile. Unlike a single build, the economy
// moves while it runs: every finished generator or extractor adds its income
// from that moment on, and a finished factory or storage raises the cap. So
// this steps through time rather than solving a formula.
//
// Stalling follows what the drain formula implies: each tick a build wants
// cost / (buildTime / buildPower) of each resource, and when the stockpile
// can't cover that, progress slows to the fraction it can. Walking between
// build sites is not modelled.

export const TICKS_PER_SEC = 10;
// A queue that can't finish inside four hours of game time is treated as
// never finishing — it's stuck, not slow.
const MAX_TICKS = 4 * 3600 * TICKS_PER_SEC;

export interface Stock {
  alloys: number;
  energy: number;
}

export interface QueueStep {
  unit: Unit;
  /** Game seconds from the start of the queue. */
  start: number;
  end: number;
  /** How long it would take with resources to spare. */
  ideal: number;
  after: Stock;
}

export interface QueueResult {
  steps: QueueStep[];
  power: number;
  /** Infinity when some build can never finish. */
  finish: number;
  ideal: number;
  cost: Stock;
  start: Stock;
  end: Stock;
  low: Stock;
  /** Net income and storage once everything is built. */
  income: Stock;
  cap: Stock;
  /** The build the queue got stuck on, when it never finishes. */
  stuck: Unit | null;
}

// A game always starts with a commander: its income and storage are the base
// every build order grows from.
export const isCommander = (u: Unit) => /Commander$/.test(u.internalName ?? '');
export const commanderOf = (units: Unit[], faction: string | undefined) =>
  faction ? units.find((u) => u.faction === faction && isCommander(u)) : undefined;

/** Expand "id:count" rows into the individual builds, in order. */
export const expandQueue = (rows: CountedRow[], byId: Map<string, Unit>): Unit[] =>
  rows.flatMap((r) => {
    const u = byId.get(r.id);
    return u ? Array.from({ length: r.count }, () => u) : [];
  });

export function simulateQueue(
  queue: Unit[],
  builder: Unit | undefined,
  assists: CountedRow[],
  startEconomy: CountedRow[],
  startStock: Stock,
  byId: Map<string, Unit>,
): QueueResult | null {
  if (!builder || !queue.length) return null;
  const assistPower = assists.reduce((sum, row) => sum + (byId.get(row.id)?.buildPower ?? 0) * row.count, 0);
  const power = (builder.buildPower ?? 0) + assistPower;
  if (power <= 0) return null;

  const econ = economyResult(startEconomy, byId);
  const net = { alloys: econ.alloysNet, energy: econ.energyNet };
  const cap = { alloys: econ.alloysStore, energy: econ.energyStore };
  const start = {
    alloys: Math.min(Math.max(0, startStock.alloys), cap.alloys),
    energy: Math.min(Math.max(0, startStock.energy), cap.energy),
  };
  const stock = { ...start };
  const low = { ...start };
  const cost = { alloys: 0, energy: 0 };
  const steps: QueueStep[] = [];
  const workPerTick = power / TICKS_PER_SEC;
  let tick = 0;
  let ideal = 0;
  let stuck: Unit | null = null;

  for (const unit of queue) {
    const seconds = unit.buildTime / power;
    ideal += seconds;
    cost.alloys += unit.cost.alloys;
    cost.energy += unit.cost.energy;
    // Resource wanted per unit of build work, so a throttled tick spends in
    // exact proportion to the progress it makes.
    const perWork = { alloys: unit.cost.alloys / unit.buildTime, energy: unit.cost.energy / unit.buildTime };
    const begun = tick;
    let remaining = unit.buildTime;

    while (remaining > 1e-9) {
      if (tick >= MAX_TICKS) {
        stuck = unit;
        break;
      }
      stock.alloys = Math.min(cap.alloys, Math.max(0, stock.alloys + net.alloys / TICKS_PER_SEC));
      stock.energy = Math.min(cap.energy, Math.max(0, stock.energy + net.energy / TICKS_PER_SEC));

      const work = Math.min(workPerTick, remaining);
      const want = { alloys: perWork.alloys * work, energy: perWork.energy * work };
      const f = Math.min(
        1,
        want.alloys > 0 ? stock.alloys / want.alloys : 1,
        want.energy > 0 ? stock.energy / want.energy : 1,
      );
      // Nothing in the tank and nothing coming in: this build can't move.
      if (f <= 0 && ((want.alloys > 0 && net.alloys <= 0) || (want.energy > 0 && net.energy <= 0))) {
        stuck = unit;
        break;
      }
      stock.alloys -= want.alloys * f;
      stock.energy -= want.energy * f;
      remaining -= work * f;
      low.alloys = Math.min(low.alloys, stock.alloys);
      low.energy = Math.min(low.energy, stock.energy);
      tick++;
    }
    if (stuck) break;

    steps.push({
      unit,
      start: begun / TICKS_PER_SEC,
      end: tick / TICKS_PER_SEC,
      ideal: seconds,
      after: { ...stock },
    });
    net.alloys += (unit.production?.alloys ?? 0) - (unit.upkeep?.alloys ?? 0);
    net.energy += (unit.production?.energy ?? 0) - (unit.upkeep?.energy ?? 0);
    cap.alloys += unit.storage?.alloys ?? 0;
    cap.energy += unit.storage?.energy ?? 0;
  }

  return {
    steps,
    power,
    finish: stuck ? Infinity : tick / TICKS_PER_SEC,
    ideal,
    cost,
    start,
    end: { ...stock },
    low,
    income: net,
    cap,
    stuck,
  };
}

/* ---------------- URL packing ---------------- */
// Rows are kept in the URL as "id:count,id:count" so a build can be shared or
// bookmarked — same encoding the pre-framework site used.

export const packRows = (rows: CountedRow[]): string | undefined =>
  rows.length ? rows.map((r) => `${r.id}:${r.count}`).join(',') : undefined;

export const unpackRows = (raw: string | undefined, byId: Map<string, Unit>): CountedRow[] =>
  (raw ?? '')
    .split(',')
    .filter(Boolean)
    .map((chunk) => {
      const [id, count] = chunk.split(':');
      return { id, count: Math.max(1, Number(count) || 1) };
    })
    .filter((r) => byId.has(r.id));
