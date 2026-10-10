// Side-by-side comparison: which stats line up in rows, which way is better,
// and the id list both the board's picks (?compare=) and the compare page
// (?units=) carry in the URL. Pure, so the page is just a renderer.

import type { Unit } from './types';
import { consumes, produces } from './economy';
import { duration, fmt } from './format';
import {
  MAP_SIZE,
  airDps,
  crossMapSeconds,
  flightSeconds,
  mainWeapon,
  surfaceDps,
  topSpeedSeconds,
  turnAroundSeconds,
} from './scale';

/** Enough to compare a slot across factions plus a couple more; any wider and columns get cramped. */
export const COMPARE_MAX = 6;

/** Comma-joined ids from the URL: deduped, capped, unknown ids dropped. */
export function parseCompare(raw: string | undefined, known?: (id: string) => boolean): string[] {
  const ids = [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return (known ? ids.filter(known) : ids).slice(0, COMPARE_MAX);
}

/** Add or remove one id; adding past COMPARE_MAX is a no-op. */
export function togglePick(ids: string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return ids.length >= COMPARE_MAX ? ids : [...ids, id];
}

export type Better = 'high' | 'low';

export interface CompareRow {
  label: string;
  value: (u: Unit) => number | null;
  better?: Better;
  /** Suffix after the number, e.g. "/s". */
  unit?: string;
  cls?: string;
  /** How to print the value, when a plain number won't do (durations). */
  format?: (n: number) => string;
  /** A second line under the figure: the raw number a derived one came from, or what it means. */
  note?: (u: Unit) => string | null;
  /** Drop the row when it would only repeat this one for every unit. */
  sameAs?: (u: Unit) => number | null;
}

export interface CompareSection {
  title: string;
  rows: CompareRow[];
}

const perAlloy = (n: number | null, u: Unit) => (n && u.cost.alloys > 0 ? (n / u.cost.alloys) * 100 : null);
const orNull = (n: number | null | undefined) => (n ? n : null);

// Every row is optional: a row only shows when at least one compared unit has
// a value for it, so comparing tanks doesn't list radar and storage.
const COMPARE_SECTIONS: CompareSection[] = [
  {
    title: 'Cost',
    rows: [
      { label: 'Alloy', value: (u) => u.cost.alloys, better: 'low', cls: 'alloy-val' },
      { label: 'Energy', value: (u) => u.cost.energy, better: 'low', cls: 'energy-val' },
      { label: 'Build time', value: (u) => u.buildTime, better: 'low' },
    ],
  },
  {
    title: 'Durability',
    rows: [
      { label: 'Health', value: (u) => u.health, better: 'high' },
      { label: 'Health regen', value: (u) => orNull(u.healthRegen), better: 'high', unit: '/s' },
      { label: 'Shields', value: (u) => orNull(u.shields.reduce((n, s) => n + s.max, 0)), better: 'high' },
      { label: 'HP per 100 alloy', value: (u) => perAlloy(u.health, u), better: 'high' },
    ],
  },
  {
    title: 'Combat',
    rows: [
      { label: 'DPS', value: (u) => orNull(u.dps), better: 'high' },
      // Split by what the guns can reach, so an AA battery and a tank don't
      // look interchangeable because their totals happen to match.
      { label: 'DPS vs ground & sea', value: surfaceDps, better: 'high', sameAs: (u) => orNull(u.dps) },
      { label: 'DPS vs air', value: airDps, better: 'high', sameAs: (u) => orNull(u.dps) },
      { label: 'DPS per 100 alloy', value: (u) => perAlloy(u.dps, u), better: 'high' },
      { label: 'Max range', value: (u) => orNull(u.maxRange), better: 'high' },
      // Neither faster nor slower fire is better in itself — a slow gun hits
      // harder — so the main weapon's cadence is shown but never lit.
      {
        label: 'Main gun fires every',
        value: (u) => mainWeapon(u)?.cycleTime ?? null,
        format: (n) => `${fmt(n, 1)}s`,
        note: (u) => {
          const w = mainWeapon(u);
          return w && w.cycleTime !== w.reloadTime ? `${fmt(w.reloadTime)}s reload` : null;
        },
      },
      {
        label: 'Shot speed',
        value: (u) => orNull(u.projectileSpeed),
        better: 'high',
        unit: ' u/s',
        note: (u) => {
          const w = u.weapons.find((x) => x.projectileSpeed === u.projectileSpeed && !x.isBeam);
          if (!w) return null;
          if (w.homing) return 'homing missile';
          const t = flightSeconds(w);
          return t ? `≈${fmt(t, 1)}s to max range` : null;
        },
      },
      { label: 'Death explosion', value: (u) => orNull(u.deathExplosion?.damage) },
    ],
  },
  {
    title: 'Economy',
    rows: [
      {
        label: 'Alloy produced',
        value: (u) => orNull(produces(u).alloys),
        better: 'high',
        unit: '/s',
        cls: 'alloy-val',
      },
      {
        label: 'Energy produced',
        value: (u) => orNull(produces(u).energy),
        better: 'high',
        unit: '/s',
        cls: 'energy-val',
      },
      {
        label: 'Alloy upkeep',
        value: (u) => orNull(consumes(u).alloys),
        better: 'low',
        unit: '/s',
        cls: 'alloy-val',
      },
      {
        label: 'Energy upkeep',
        value: (u) => orNull(consumes(u).energy),
        better: 'low',
        unit: '/s',
        cls: 'energy-val',
      },
      { label: 'Alloy storage', value: (u) => orNull(u.storage?.alloys), better: 'high', cls: 'alloy-val' },
      { label: 'Energy storage', value: (u) => orNull(u.storage?.energy), better: 'high', cls: 'energy-val' },
      { label: 'Build power', value: (u) => orNull(u.buildPower), better: 'high' },
    ],
  },
  {
    title: 'Mobility & intel',
    rows: [
      // The raw figures are exact but abstract; each row leads with what it
      // means in play and keeps the template value underneath.
      {
        label: 'Speed',
        value: (u) => orNull(u.movement?.speed),
        better: 'high',
        unit: ' u/s',
        note: (u) => {
          const t = crossMapSeconds(u.movement?.speed);
          return t ? `${MAP_SIZE} map in ${duration(t)}` : null;
        },
      },
      {
        label: 'Top speed in',
        value: topSpeedSeconds,
        better: 'low',
        format: (n) => `${fmt(n, 1)}s`,
        note: (u) => (u.movement?.acceleration ? `${fmt(u.movement.acceleration)} u/s²` : null),
      },
      {
        label: 'Turns about in',
        value: turnAroundSeconds,
        better: 'low',
        format: (n) => `${fmt(n, 1)}s`,
        note: (u) => (u.movement?.rotationSpeed ? `${fmt(u.movement.rotationSpeed)}°/s` : null),
      },
      { label: 'Vision', value: (u) => orNull(u.vision), better: 'high' },
      { label: 'Radar', value: (u) => orNull(u.radar), better: 'high' },
      { label: 'Sonar', value: (u) => orNull(u.sonar), better: 'high' },
      { label: 'Transport slots', value: (u) => orNull(u.transportSlots), better: 'high' },
    ],
  },
];

/** The sections and rows worth showing for these units, with each row's values. */
export function compareTable(units: Unit[]) {
  return COMPARE_SECTIONS.map((section) => ({
    title: section.title,
    rows: section.rows
      .map((row) => {
        const values = units.map((u) => row.value(u));
        const present = values.filter((v): v is number => v != null && v > 0);
        // What the bars are drawn against: the row's largest value, once
        // there are two to compare.
        const scale = present.length >= 2 ? Math.max(...present) : null;
        return { ...row, values, scale, best: bestIndexes(values, row.better) };
      })
      .filter((row) => row.values.some((v) => v != null))
      .filter((row) => !row.sameAs || row.values.some((v, i) => v !== row.sameAs!(units[i]))),
  })).filter((section) => section.rows.length);
}

/**
 * Which columns hold the row's best value. Nothing is marked when fewer than
 * two units have a value or they're all equal — a highlight on a tie says
 * nothing. Ties for best are all marked.
 */
export function bestIndexes(values: (number | null)[], better?: Better): Set<number> {
  const present = values.filter((v): v is number => v != null);
  if (!better || present.length < 2 || present.every((v) => v === present[0])) return new Set();
  const best = better === 'high' ? Math.max(...present) : Math.min(...present);
  return new Set(values.flatMap((v, i) => (v === best ? [i] : [])));
}
