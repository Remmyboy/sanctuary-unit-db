// A chase between two units in a straight line on open ground: one attacks,
// the other runs, stands, or walks in. It answers the questions a kiting
// fight turns on — does the chaser ever get in range, how long does that take,
// and how much damage does the runner land first — from the units' own speed,
// acceleration, reach and DPS. Pure and stepped at a fixed rate, so the page
// can animate the very samples the summary is computed from.

import type { Unit, Weapon } from './types';

export type Behaviour = 'flee' | 'hold' | 'advance';

/** Simulation step, seconds. Half a game tick: smooth enough to animate. */
export const STEP = 0.05;
/** Longest run, seconds. Past this a chase has long since been decided. */
export const MAX_SECONDS = 180;
/** Closest two units get: roughly their bodies touching. */
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
  /** Distance between them when both set off. */
  gap: number;
}

export interface Sample {
  t: number;
  /** Positions along the line; the target starts ahead at `gap`. */
  chaserX: number;
  targetX: number;
  gap: number;
  chaserHp: number;
  targetHp: number;
  chaserFiring: boolean;
  targetFiring: boolean;
}

export interface ChaseResult {
  samples: Sample[];
  chaserArms: Armament;
  targetArms: Armament;
  /** First moment the chaser's guns reach the target (0 if they start in reach). */
  chaserInRange: number | null;
  /** First moment the target's guns reach the chaser. */
  targetInRange: number | null;
  /** When a runner that started inside the chaser's reach got clear of it for good. */
  escaped: number | null;
  /** Seconds each side spent firing, and the damage it did. */
  chaserFireTime: number;
  targetFireTime: number;
  damageToTarget: number;
  damageToChaser: number;
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

/**
 * Both units set off together from a standstill. The chaser closes until its
 * own guns reach and then holds that distance — an attack order stops at
 * range, it doesn't ram. A runner flees at full speed, and can only shoot
 * back with turrets that turn all the way round; a holder stands and fires
 * whatever reaches; an advancer walks in and stops at its own range.
 *
 * Damage is DPS applied continuously while in reach, every shot landing, less
 * health regen. Turning to face, projectile flight and terrain are ignored.
 */
export function simulateChase({ chaser, target, behaviour, gap }: ChaseSetup): ChaseResult {
  const chaserArms = armament(chaser, target);
  const targetArms = armament(target, chaser);
  const behave: Behaviour = mobile(target) ? behaviour : 'hold';
  const targetDps = behave === 'flee' ? targetArms.dpsRetreating : targetArms.dps;

  let chaserX = 0;
  let targetX = Math.max(gap, MIN_GAP);
  let chaserV = 0;
  let targetV = 0;
  let chaserHp = chaser.health;
  let targetHp = target.health;

  const r: ChaseResult = {
    samples: [],
    chaserArms,
    targetArms,
    chaserInRange: null,
    targetInRange: null,
    escaped: null,
    chaserFireTime: 0,
    targetFireTime: 0,
    damageToTarget: 0,
    damageToChaser: 0,
    chaserDies: null,
    targetDies: null,
  };
  const startsInReach = chaserArms.reach > 0 && targetX - chaserX <= chaserArms.reach;
  let settled = 0; // seconds nothing has changed, to end a decided run early

  for (let i = 0; i * STEP <= MAX_SECONDS; i++) {
    const t = i * STEP;
    const d = targetX - chaserX;
    const chaserFiring = chaserHp > 0 && targetHp > 0 && chaserArms.dps > 0 && d <= chaserArms.reach;
    const targetFiring = chaserHp > 0 && targetHp > 0 && targetDps > 0 && d <= targetArms.reach;

    if (chaserFiring && r.chaserInRange == null) r.chaserInRange = t;
    if (targetFiring && r.targetInRange == null) r.targetInRange = t;
    if (startsInReach && r.escaped == null && d > chaserArms.reach) r.escaped = t;

    r.samples.push({ t, chaserX, targetX, gap: d, chaserHp, targetHp, chaserFiring, targetFiring });
    if (r.chaserDies != null || r.targetDies != null) break;

    // Damage over this step, then regen, then who fell.
    if (chaserFiring) {
      r.chaserFireTime += STEP;
      r.damageToTarget += chaserArms.dps * STEP;
      targetHp -= chaserArms.dps * STEP;
    }
    if (targetFiring) {
      r.targetFireTime += STEP;
      r.damageToChaser += targetDps * STEP;
      chaserHp -= targetDps * STEP;
    }
    chaserHp = Math.min(chaser.health, chaserHp + (chaser.healthRegen ?? 0) * STEP);
    targetHp = Math.min(target.health, targetHp + (target.healthRegen ?? 0) * STEP);
    if (targetHp <= 0 && r.targetDies == null) r.targetDies = t + STEP;
    if (chaserHp <= 0 && r.chaserDies == null) r.chaserDies = t + STEP;

    // Movement. The chaser wants to be just inside its reach (or alongside, if
    // it has nothing that can hit this target).
    const hold = chaserArms.reach > 0 ? chaserArms.reach * 0.97 : MIN_GAP;
    const chaserWant =
      d > hold ? chaser.movement!.speed : Math.max(0, Math.min(targetV, chaser.movement!.speed));
    chaserV = stepVelocity(chaserV, chaserWant, chaser.movement?.acceleration);

    let targetWant = 0;
    if (behave === 'flee') targetWant = target.movement!.speed;
    if (behave === 'advance') {
      const stopAt = targetArms.reach > 0 ? targetArms.reach * 0.97 : MIN_GAP;
      targetWant = d > stopAt ? -target.movement!.speed : 0;
    }
    targetV = stepVelocity(targetV, targetWant, target.movement?.acceleration);

    chaserX += chaserV * STEP;
    targetX += targetV * STEP;
    if (targetX - chaserX < MIN_GAP) chaserX = targetX - MIN_GAP;

    // Stop once it's decided: nobody firing, nobody closing, for a few seconds.
    const closing = chaserV - targetV > 1e-6;
    settled = !chaserFiring && !targetFiring && !closing ? settled + STEP : 0;
    if (settled >= 4 && t > 6) break;
    // Or everyone is parked and trading fire forever (regen outpaces damage).
    if (chaserV === 0 && targetV === 0 && t > 60) break;
  }

  return r;
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
