// A chase between two groups on open ground: one side attacks, the other
// runs, stands, or walks in. It answers the questions a kiting fight turns
// on — does the chaser ever get in range, how long does that take, how much
// damage does the runner land first, and who is left at the end — from the
// units' own speed, acceleration, reach, health and DPS. Pure and stepped at a
// fixed rate, so the page can animate the very samples the summary is
// computed from.
//
// Each side is `count` copies of one unit in a loose block, a few abreast.
// Every unit fights for itself: it shoots the nearest enemy its guns reach, so
// the front of a group soaks the fire and falls first, and a unit only stops
// advancing once something is in its own range — the ones behind keep coming
// up until they can shoot too.

import type { Unit, Weapon } from './types';

export type Behaviour = 'flee' | 'hold' | 'advance';

/** Simulation step, seconds. Half a game tick: smooth enough to animate. */
export const STEP = 0.05;
/** Longest run, seconds. Past this a chase has long since been decided. */
export const MAX_SECONDS = 180;
/** Largest group per side: past this the picture is a blur and the maths is the same. */
export const MAX_COUNT = 20;
/** Closest two enemies get: roughly their bodies touching. */
const MIN_GAP = 1.5;

/** The targeting layer a unit presents, as weapons' layerTargetLimits name it. */
export function layerOf(u: Unit): string {
  if (u.domain === 'Air') return 'Air';
  if (u.movement?.type === 'UnderWater') return 'Water';
  if (u.domain === 'Naval') return 'WaterSurface';
  return 'Land';
}

const canHit = (w: Weapon, layer: string) => !w.targets.length || w.targets.includes(layer);

/** A turret that can point straight back — the only kind that fires while running away. */
const firesBehind = (w: Weapon) =>
  Boolean(w.traverseSpeed) && (w.traverseArc == null || w.traverseArc >= 360);

export interface Armament {
  /** Longest reach of the weapons that can hit this target at all. */
  reach: number;
  /** Their combined DPS. */
  dps: number;
  /** DPS from the ones that can also fire over the back while retreating. */
  dpsRetreating: number;
}

/** What `u` can bring to bear on `target`. */
export function armament(u: Unit, target: Unit): Armament {
  const layer = layerOf(target);
  const ws = u.weapons.filter((w) => canHit(w, layer) && (w.dpsTotal ?? 0) > 0);
  return {
    reach: ws.length ? Math.max(...ws.map((w) => w.rangeMax)) : 0,
    dps: ws.reduce((n, w) => n + (w.dpsTotal ?? 0), 0),
    dpsRetreating: ws.filter(firesBehind).reduce((n, w) => n + (w.dpsTotal ?? 0), 0),
  };
}

export interface ChaseSetup {
  chaser: Unit;
  target: Unit;
  behaviour: Behaviour;
  /** Distance between the two front ranks when both set off. */
  gap: number;
  chaserCount?: number;
  targetCount?: number;
}

/** One unit at one moment. */
export interface Body {
  x: number;
  y: number;
  hp: number;
  /** Index into the other side's bodies of what it's shooting, or -1. */
  shooting: number;
}

export interface Sample {
  t: number;
  chasers: Body[];
  targets: Body[];
  /** Front rank to front rank, among the living. */
  gap: number;
}

export interface ChaseResult {
  samples: Sample[];
  chaserArms: Armament;
  targetArms: Armament;
  chaserCount: number;
  targetCount: number;
  /** Spacing between neighbours in each block, for drawing. */
  chaserSpacing: number;
  targetSpacing: number;
  /** First moment any chaser's guns reach a target (0 if they start in reach). */
  chaserInRange: number | null;
  /** First moment any target's guns reach a chaser. */
  targetInRange: number | null;
  /** When runners that started inside the chasers' reach got clear of it for good. */
  escaped: number | null;
  /** Seconds each side had at least one gun firing, and the damage it did. */
  chaserFireTime: number;
  targetFireTime: number;
  damageToTarget: number;
  damageToChaser: number;
  /** When each unit fell, in order. */
  chaserLosses: number[];
  targetLosses: number[];
  /** When the last of a side fell. */
  chaserDies: number | null;
  targetDies: number | null;
}

const mobile = (u: Unit) => Boolean(u.movement?.speed);

// One axis, one unit: accelerate towards `want` (a signed speed), brake at once.
function stepVelocity(v: number, want: number, accel: number | null | undefined): number {
  if (!accel || Math.abs(want) <= Math.abs(v) || Math.sign(want) !== Math.sign(v || want)) return want;
  const next = v + Math.sign(want) * accel * STEP;
  return Math.abs(next) > Math.abs(want) ? want : next;
}

/** Neighbour spacing in a block: the unit's own footprint plus a little air. */
const spacingOf = (u: Unit) => Math.max(2, Math.max(u.footprint?.x ?? 1, u.footprint?.y ?? 1) + 1);

interface Live {
  x: number;
  y: number;
  v: number;
  hp: number;
  file: number;
  shooting: number;
}

/**
 * A block `count` strong, a few abreast (the square root, rounded up), its
 * front rank at `front` and the rest stacked behind it, away from the enemy
 * (`back` is -1 for the chasers, +1 for the targets).
 */
function block(u: Unit, count: number, front: number, back: 1 | -1, spacing: number): Live[] {
  const files = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, i) => {
    const file = i % files;
    const rank = Math.floor(i / files);
    return {
      x: front + back * rank * spacing,
      y: (file - (files - 1) / 2) * spacing,
      v: 0,
      hp: u.health,
      file,
      shooting: -1,
    };
  });
}

const dist = (a: Live, b: Live) => Math.hypot(a.x - b.x, a.y - b.y);

/** The nearest living enemy within `reach`, or -1. */
function nearestInReach(me: Live, enemies: Live[], reach: number): number {
  let best = -1;
  let bestD = Infinity;
  enemies.forEach((e, i) => {
    if (e.hp <= 0) return;
    const d = dist(me, e);
    if (d <= reach && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

const snapshot = (side: Live[]): Body[] =>
  side.map(({ x, y, hp, shooting }) => ({ x, y, hp: Math.max(0, hp), shooting }));

/**
 * Both sides set off together from a standstill. A chaser closes until one
 * of its guns reaches an enemy and then holds that distance — an attack order
 * stops at range, it doesn't ram. Runners flee at full speed and can only
 * shoot back with turrets that turn all the way round; holders stand and
 * fire whatever reaches; advancers walk in and stop at their own range. Units
 * queue behind their own front rank rather than walking through it.
 *
 * Damage is DPS applied continuously while in reach, every shot landing, less
 * health regen; fire switches the moment a target falls, so none is wasted.
 * Turning to face, projectile flight, shields and terrain are ignored.
 */
export function simulateChase(setup: ChaseSetup): ChaseResult {
  const { chaser, target, gap } = setup;
  const chaserCount = clampCount(setup.chaserCount);
  const targetCount = clampCount(setup.targetCount);
  const chaserArms = armament(chaser, target);
  const targetArms = armament(target, chaser);
  const behave: Behaviour = mobile(target) ? setup.behaviour : 'hold';
  const targetDps = behave === 'flee' ? targetArms.dpsRetreating : targetArms.dps;
  const chaserSpacing = spacingOf(chaser);
  const targetSpacing = spacingOf(target);

  const chasers = block(chaser, chaserCount, 0, -1, chaserSpacing);
  const targets = block(target, targetCount, Math.max(gap, MIN_GAP), 1, targetSpacing);

  const r: ChaseResult = {
    samples: [],
    chaserArms,
    targetArms,
    chaserCount,
    targetCount,
    chaserSpacing,
    targetSpacing,
    chaserInRange: null,
    targetInRange: null,
    escaped: null,
    chaserFireTime: 0,
    targetFireTime: 0,
    damageToTarget: 0,
    damageToChaser: 0,
    chaserLosses: [],
    targetLosses: [],
    chaserDies: null,
    targetDies: null,
  };

  const alive = (side: Live[]) => side.filter((b) => b.hp > 0);
  // Once a side is wiped out the gap is frozen at its last value.
  let known = Math.max(gap, MIN_GAP);
  const frontGap = () => {
    const c = alive(chasers);
    const t = alive(targets);
    if (c.length && t.length) known = Math.min(...t.map((b) => b.x)) - Math.max(...c.map((b) => b.x));
    return known;
  };
  const anyInReach = () =>
    chaserArms.reach > 0 && alive(chasers).some((c) => nearestInReach(c, targets, chaserArms.reach) >= 0);
  const startsInReach = anyInReach();
  let settled = 0; // seconds nothing has changed, to end a decided run early
  let lastGap = frontGap();

  for (let i = 0; i * STEP <= MAX_SECONDS; i++) {
    const t = i * STEP;

    // Who shoots whom this step.
    for (const c of chasers) {
      c.shooting = c.hp > 0 && chaserArms.dps > 0 ? nearestInReach(c, targets, chaserArms.reach) : -1;
    }
    for (const b of targets) {
      b.shooting = b.hp > 0 && targetDps > 0 ? nearestInReach(b, chasers, targetArms.reach) : -1;
    }
    const chaserFiring = chasers.some((c) => c.shooting >= 0);
    const targetFiring = targets.some((b) => b.shooting >= 0);

    if (chaserFiring && r.chaserInRange == null) r.chaserInRange = t;
    if (targetFiring && r.targetInRange == null) r.targetInRange = t;
    if (startsInReach && r.escaped == null && r.targetDies == null && !anyInReach()) r.escaped = t;

    const gapNow = frontGap();
    r.samples.push({ t, chasers: snapshot(chasers), targets: snapshot(targets), gap: gapNow });
    if (r.chaserDies != null || r.targetDies != null) break;

    // Damage over this step, then regen, then who fell.
    if (chaserFiring) r.chaserFireTime += STEP;
    if (targetFiring) r.targetFireTime += STEP;
    for (const c of chasers) {
      if (c.shooting < 0) continue;
      targets[c.shooting].hp -= chaserArms.dps * STEP;
      r.damageToTarget += chaserArms.dps * STEP;
    }
    for (const b of targets) {
      if (b.shooting < 0) continue;
      chasers[b.shooting].hp -= targetDps * STEP;
      r.damageToChaser += targetDps * STEP;
    }
    regen(chasers, chaser);
    regen(targets, target);
    recordLosses(chasers, r.chaserLosses, t + STEP);
    recordLosses(targets, r.targetLosses, t + STEP);
    if (r.chaserLosses.length === chaserCount) r.chaserDies = t + STEP;
    if (r.targetLosses.length === targetCount) r.targetDies = t + STEP;

    // Movement. Chasers push on (+x) until something is in their own reach;
    // then they match the speed of what they're shooting, so a runner is
    // followed rather than lost.
    const cSpeed = chaser.movement!.speed;
    const cHold = chaserArms.reach > 0 ? chaserArms.reach * 0.97 : MIN_GAP;
    for (const c of chasers) {
      if (c.hp <= 0) continue;
      const near = nearestInReach(c, targets, cHold);
      const want = near >= 0 ? Math.max(0, Math.min(targets[near].v, cSpeed)) : cSpeed;
      c.v = stepVelocity(c.v, want, chaser.movement?.acceleration);
    }
    const tSpeed = target.movement?.speed ?? 0;
    const tHold = targetArms.reach > 0 ? targetArms.reach * 0.97 : MIN_GAP;
    for (const b of targets) {
      if (b.hp <= 0) continue;
      let want = 0;
      if (behave === 'flee') want = tSpeed;
      if (behave === 'advance') want = nearestInReach(b, chasers, tHold) >= 0 ? 0 : -tSpeed;
      b.v = stepVelocity(b.v, want, target.movement?.acceleration);
    }

    move(chasers, chaserSpacing, targets);
    move(targets, targetSpacing, chasers);

    // Stop once it's decided: nobody firing and the gap not closing for a
    // few seconds. A fight that never ends (regen outpacing damage) runs to
    // MAX_SECONDS.
    const g = frontGap();
    const closing = lastGap - g > 1e-6;
    lastGap = g;
    settled = !chaserFiring && !targetFiring && !closing ? settled + STEP : 0;
    if (settled >= 4 && t > 6) break;
  }

  return r;
}

function clampCount(n: number | undefined): number {
  return Math.min(MAX_COUNT, Math.max(1, Math.round(n ?? 1)));
}

function regen(side: Live[], u: Unit) {
  for (const b of side) if (b.hp > 0) b.hp = Math.min(u.health, b.hp + (u.healthRegen ?? 0) * STEP);
}

function recordLosses(side: Live[], losses: number[], t: number) {
  const dead = side.filter((b) => b.hp <= 0).length;
  while (losses.length < dead) losses.push(t);
}

/**
 * Advance a side by its velocities (+x is towards the targets' end). Nobody
 * walks through the living unit in front of it in its own file, or through
 * an enemy in its lane — it stops short instead, never stepping backwards.
 */
function move(side: Live[], spacing: number, enemies: Live[]) {
  const living = side.filter((b) => b.hp > 0);
  const foes = enemies.filter((e) => e.hp > 0);
  // Whoever leads in the direction of travel moves first, so each unit sees
  // where the one in front of it ended up.
  const dir = Math.sign(living.reduce((n, b) => n + b.v, 0)) || 1;
  living.sort((a, b) => dir * (b.x - a.x));
  for (const b of living) {
    const d = Math.sign(b.v);
    if (!d) continue;
    let x = b.x + b.v * STEP;
    for (const o of living) {
      if (o === b || o.file !== b.file || d * (o.x - b.x) <= 0) continue;
      x = d > 0 ? Math.min(x, o.x - spacing) : Math.max(x, o.x + spacing);
    }
    for (const e of foes) {
      if (Math.abs(e.y - b.y) > spacing || d * (e.x - b.x) <= 0) continue;
      x = d > 0 ? Math.min(x, e.x - MIN_GAP) : Math.max(x, e.x + MIN_GAP);
    }
    b.x = d > 0 ? Math.max(b.x, x) : Math.min(b.x, x);
  }
}

/**
 * A starting distance that sets the scene the user most likely means: a
 * runner kiting at the edge of its own reach, a holder just outside both
 * ranges, an advancer from further out.
 */
export function defaultGap(chaser: Unit, target: Unit, behaviour: Behaviour): number {
  const c = armament(chaser, target).reach;
  const t = armament(target, chaser).reach;
  if (behaviour === 'flee' && t > 0) return t;
  return Math.round(Math.max(c, t, 10) * 1.3);
}
