// Game units, made readable. The templates measure every distance in game
// units and every speed in game units per second (templateExplainations.lua),
// which is exact but tells a player nothing: is 3.5 fast? These turn the raw
// figures into things you can picture — how long to cross a map, to reach top
// speed, to turn around, for a shell to land — and rank a unit against the
// ones it actually competes with. Pure, so the panel and the compare page
// agree to the digit.

import type { Unit, Weapon } from './types';
import { isCommander, tierKey } from './format';

/**
 * The yardstick: a map this many game units across. Most of the ranked 1v1
 * pool is 512 (src/lib/ladder-maps.ts), and the other pool sizes, 256 and
 * 1024, are exactly half and double it, so the time scales cleanly.
 */
export const MAP_SIZE = 512;

/** Seconds to drive straight across a MAP_SIZE map at top speed. */
export const crossMapSeconds = (speed: number | null | undefined): number | null =>
  speed && speed > 0 ? MAP_SIZE / speed : null;

/** Seconds from a standstill to top speed (acceleration is in units/s²). */
export const topSpeedSeconds = (u: Unit): number | null => {
  const m = u.movement;
  return m?.speed && m.acceleration ? m.speed / m.acceleration : null;
};

/** Seconds to turn to face the other way (rotationSpeed is °/s). */
export const turnAroundSeconds = (u: Unit): number | null => {
  const r = u.movement?.rotationSpeed;
  return r ? 180 / r : null;
};

/**
 * Seconds for a shot to cover the weapon's full range in a straight line at
 * its launch speed. A lower bound: artillery lobs further than that and
 * missiles accelerate after launch, but it ranks weapons the right way round
 * and says why a fast target can walk out from under a slow shell.
 */
export const flightSeconds = (w: Weapon): number | null =>
  !w.isBeam && w.projectileSpeed && w.rangeMax ? w.rangeMax / w.projectileSpeed : null;

/** Seconds for the turret to swing half a turn onto a target behind it. */
export const swingSeconds = (w: Weapon): number | null => (w.traverseSpeed ? 180 / w.traverseSpeed : null);

/** How the unit moves, coarsely — the pool its speed is fairly ranked in. */
export type MoveClass = 'ground' | 'air' | 'naval';

export function moveClass(u: Unit): MoveClass | null {
  const t = u.movement?.type;
  if (!t || !u.movement?.speed) return null;
  if (t === 'Plane' || t === 'Gunship') return 'air';
  if (t === 'WaterSurface' || t === 'UnderWater') return 'naval';
  return 'ground';
}

/**
 * The share of `pool` strictly below `value`, counting ties as half — so the
 * middle of a crowd of equals reads 50%, not 0% or 100%.
 */
function percentile(value: number, pool: number[]): number {
  if (!pool.length) return 0;
  const below = pool.filter((v) => v < value).length;
  const equal = pool.filter((v) => v === value).length;
  return (below + equal / 2) / pool.length;
}

/** "faster than 72% of ground units" — or null when there's nothing to rank against. */
export function speedRank(u: Unit, units: Unit[]): { share: number; cls: MoveClass; of: number } | null {
  const cls = moveClass(u);
  if (!cls) return null;
  const pool = units
    .filter((o) => o.id !== u.id && o.status === 'in-game' && moveClass(o) === cls)
    .map((o) => o.movement!.speed);
  return pool.length ? { share: percentile(u.movement!.speed, pool), cls, of: pool.length } : null;
}

// DPS split by what the weapon can shoot at. A weapon with no target list is
// unrestricted and counts for both; LandedAir (planes parked on a pad) is a
// ground target in practice, but only anti-air carries it, so it stays air.
const hitsSurface = (w: Weapon) =>
  !w.targets.length || w.targets.some((t) => t === 'Land' || t === 'WaterSurface');
const hitsAir = (w: Weapon) => !w.targets.length || w.targets.includes('Air');

const dpsWhere = (u: Unit, pick: (w: Weapon) => boolean): number | null => {
  const ws = u.weapons.filter(pick);
  if (!ws.length || ws.every((w) => w.dpsTotal == null)) return null;
  return ws.reduce((n, w) => n + (w.dpsTotal ?? 0), 0) || null;
};

/** DPS from the weapons that can hit land and sea-surface targets. */
export const surfaceDps = (u: Unit) => dpsWhere(u, hitsSurface);
/** DPS from the weapons that can hit aircraft. */
export const airDps = (u: Unit) => dpsWhere(u, hitsAir);

/** The weapon a unit leads with: highest DPS, ties to the longer reach. */
export function mainWeapon(u: Unit): Weapon | null {
  return (
    u.weapons.slice().sort((a, b) => (b.dpsTotal ?? 0) - (a.dpsTotal ?? 0) || b.rangeMax - a.rangeMax)[0] ??
    null
  );
}

// ---------- peers ----------

export interface PeerMetric {
  key: string;
  label: string;
  value: (u: Unit) => number | null;
  /** Which way is good. Cost is the one where less wins. */
  better: 'high' | 'low';
  unit?: string;
}

const PEER_METRICS: PeerMetric[] = [
  { key: 'health', label: 'Health', value: (u) => u.health || null, better: 'high' },
  { key: 'dps', label: 'DPS', value: (u) => u.dps || null, better: 'high' },
  { key: 'range', label: 'Range', value: (u) => u.maxRange || null, better: 'high' },
  { key: 'speed', label: 'Speed', value: (u) => u.movement?.speed || null, better: 'high', unit: 'u/s' },
  { key: 'vision', label: 'Vision', value: (u) => u.vision || null, better: 'high' },
  { key: 'buildPower', label: 'Build power', value: (u) => u.buildPower || null, better: 'high' },
  { key: 'alloy', label: 'Alloy cost', value: (u) => u.cost.alloys || null, better: 'low' },
];

/**
 * What a unit is for, coarsely — the class it's fairly weighed within. A tank
 * against an engineer on DPS says nothing, so peers share a class as well as
 * a tier. Built from the role the game itself assigns through each unit's
 * strategic icon, with the thin roles folded together so a class has enough
 * members at each tier to rank: artillery fights alongside direct fire, the
 * energy side of the economy ("Plasma") sits with the alloy side, and a
 * transmitter is intel.
 */
export type UnitClass =
  | 'commander'
  | 'combat'
  | 'antiAir'
  | 'antiNaval'
  | 'engineer'
  | 'intel'
  | 'shield'
  | 'economy'
  | 'factory'
  | 'other';

function unitClass(u: Unit): UnitClass {
  if (isCommander(u)) return 'commander';
  switch (u.role) {
    case 'Direct Fire':
    case 'Artillery':
      return 'combat';
    case 'Anti-Air':
      return 'antiAir';
    case 'Anti-Naval':
      return 'antiNaval';
    case 'Engineer':
      return 'engineer';
    case 'Intel':
    case 'Transmitter':
      return 'intel';
    case 'Shield':
      return 'shield';
    case 'Economy':
    case 'Plasma':
      return 'economy';
    // Factories wear the icon of what they build.
    case 'Air':
    case 'Land':
    case 'Naval':
      return 'factory';
  }
  // A handful of big units have no icon symbol; an armed one is a fighter.
  return u.dps ? 'combat' : 'other';
}

// "T1 combat units", "T2 anti-air defences": the class, in the domain's words.
const CLASS_NOUNS: Record<UnitClass, Partial<Record<string, string>> & { default: string }> = {
  commander: { default: 'commanders' },
  combat: {
    Air: 'strike aircraft',
    Naval: 'warships',
    Structure: 'defences',
    default: 'combat units',
  },
  antiAir: { Air: 'fighters', Structure: 'anti-air defences', default: 'anti-air units' },
  antiNaval: { Structure: 'anti-naval defences', default: 'anti-naval units' },
  engineer: { Structure: 'engineering stations', default: 'engineers' },
  intel: { Structure: 'intel structures', default: 'scouts' },
  shield: { Structure: 'shields', default: 'shield units' },
  economy: { default: 'economy structures' },
  factory: { default: 'factories' },
  other: { Structure: 'structures', default: 'units' },
};

/** The peer group's name: "T1 combat units", "T3 engineering stations", "commanders". */
export function peerGroupName(u: Unit): string {
  const cls = unitClass(u);
  const noun = CLASS_NOUNS[cls][u.domain] ?? CLASS_NOUNS[cls].default;
  return cls === 'commander' ? noun : `T${u.tier} ${noun}`;
}

export interface PeerRow {
  metric: PeerMetric;
  value: number;
  /** Every peer with a value, this unit included, low to high. */
  points: { id: string; value: number; self: boolean }[];
  min: number;
  max: number;
  /** 1-based, best first — so "1st of 8" always means the best. */
  rank: number;
  of: number;
}

/**
 * The units a unit is really weighed against: same domain, tier and class,
 * signed off and in the game — a T1 tank against the other T1 combat units,
 * never against the engineers or the anti-air. A metric is only ranked among
 * the peers that have it, and dropped where they all tie.
 */
export function peersOf(u: Unit, units: Unit[]): Unit[] {
  const cls = unitClass(u);
  return units.filter(
    (o) =>
      o.id !== u.id &&
      o.status === 'in-game' &&
      o.domain === u.domain &&
      tierKey(o) === tierKey(u) &&
      unitClass(o) === cls,
  );
}

export function peerRows(u: Unit, peers: Unit[]): PeerRow[] {
  return PEER_METRICS.flatMap((metric) => {
    const value = metric.value(u);
    if (value == null) return [];
    const points = [
      { id: u.id, value, self: true },
      ...peers.flatMap((p) => {
        const v = metric.value(p);
        return v == null ? [] : [{ id: p.id, value: v, self: false }];
      }),
    ].sort((a, b) => a.value - b.value);
    // Nothing to weigh against on its own, or when every peer ties.
    if (points.length < 3 || points[0].value === points[points.length - 1].value) return [];
    const better = points.filter((p) =>
      metric.better === 'high' ? p.value > value : p.value < value,
    ).length;
    return [
      {
        metric,
        value,
        points,
        min: points[0].value,
        max: points[points.length - 1].value,
        rank: better + 1,
        of: points.length,
      },
    ];
  });
}

export const ordinal = (n: number): string => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
};
