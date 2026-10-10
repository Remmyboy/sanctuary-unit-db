import { describe, expect, it } from 'vitest';
import { cycleMuzzleCount, groupWeapons, mainWeapon, projectileSpeedOf, simulateWeapon } from './weapons.js';

// n muzzle groups of one muzzle each.
const groups = (n, muzzles = 1) => Array.from({ length: n }, () => ({ muzzles: Array(muzzles).fill('m') }));

describe('simulateWeapon: tick timing', () => {
  // Timers subtract 0.1 as a double and fire at <= 0, so some reloads take a
  // tick longer than they say and others land exactly. Timed in game on build
  // 25474094 (Chosen Commander 1.1s, EDA Commander 2.0s, Jager 0.6s).
  it.each([
    [0.25, 0.3],
    [0.5, 0.6],
    [1, 1.1],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 5.1],
  ])('a %ss reload cycles every %ss', (reloadTime, cycleTime) => {
    const sim = simulateWeapon({ muzzleGroups: groups(1), damage: 10, reloadTime }, false);
    expect(sim.cycleTime).toBe(cycleTime);
    expect(sim.dps).toBeCloseTo(10 / cycleTime, 10);
  });

  it('runs reload concurrently with the salvo: a short salvo is hidden by the reload', () => {
    // max(2, (2 - 1) * 0.5) = 2, not 2 + 0.5.
    const sim = simulateWeapon(
      { muzzleGroups: groups(2), damage: 10, reloadTime: 2, muzzleSalvoSize: 2, muzzleSalvoDelay: 0.5 },
      false,
    );
    expect(sim.cycleTime).toBe(2);
    expect(sim.dps).toBe(10); // two shots of 10 every 2s
  });

  it('lets a long salvo set the pace instead of the reload', () => {
    // max(2, (3 - 1) * 2) = 4, plus the one tick it takes the next volley to
    // start after the last shot of this one. Not 2 + 4.
    const sim = simulateWeapon(
      { muzzleGroups: groups(1), damage: 10, reloadTime: 2, muzzleSalvoSize: 3, muzzleSalvoDelay: 2 },
      false,
    );
    expect(sim.cycleTime).toBe(4.1);
  });

  it('quantises salvo delays the same way as reloads', () => {
    // Each 1s delay is 11 ticks: 3 × 1.1 + the restart tick.
    const sim = simulateWeapon(
      { muzzleGroups: groups(4), damage: 10, reloadTime: 1, muzzleSalvoSize: 4, muzzleSalvoDelay: 1 },
      false,
    );
    expect(sim.cycleTime).toBe(3.4);
  });

  it('fires nothing without muzzle groups', () => {
    expect(simulateWeapon({ damage: 10, reloadTime: 1 }, false)).toBeNull();
  });
});

describe('simulateWeapon: beams', () => {
  it('treats a continuous beam as first-group damage every tick, ignoring reload', () => {
    const sim = simulateWeapon(
      { muzzleGroups: groups(3, 2), damage: 5, reloadTime: 2, beamLifetime: -1 },
      true,
    );
    expect(sim).toEqual({ dps: 2 * 5 * 10, cycleTime: null });
    // No beamLifetime at all means continuous too.
    expect(simulateWeapon({ muzzleGroups: groups(1), damage: 5, reloadTime: 2 }, true).cycleTime).toBeNull();
  });

  it('lands beamLifetime ticks of damage per volley for a pulse or burst beam', () => {
    const pulse = simulateWeapon(
      { muzzleGroups: groups(1), damage: 5, reloadTime: 2, beamLifetime: 1 },
      true,
    );
    expect(pulse).toEqual({ dps: 2.5, cycleTime: 2 });
    const burst = simulateWeapon(
      { muzzleGroups: groups(1), damage: 5, reloadTime: 2, beamLifetime: 5 },
      true,
    );
    expect(burst).toEqual({ dps: 12.5, cycleTime: 2 });
  });

  it('only counts as a beam when told so: the same template as a projectile', () => {
    const sim = simulateWeapon(
      { muzzleGroups: groups(1), damage: 5, reloadTime: 2, beamLifetime: -1 },
      false,
    );
    expect(sim).toEqual({ dps: 2.5, cycleTime: 2 });
  });
});

describe('cycleMuzzleCount', () => {
  it('wraps salvo indices around the groups', () => {
    expect(
      cycleMuzzleCount({ muzzleGroups: [{ muzzles: ['a', 'b'] }, { muzzles: ['c'] }], muzzleSalvoSize: 3 }),
    ).toBe(2 + 1 + 2);
  });

  it('counts a group with no muzzles list as firing nothing', () => {
    expect(cycleMuzzleCount({ muzzleGroups: [{}] })).toBe(0);
    expect(cycleMuzzleCount({})).toBe(0);
  });
});

describe('projectileSpeedOf', () => {
  it('prefers muzzle-bound controllers over the yaw lead estimate', () => {
    const w = {
      aimControllers: [
        { aimBone: 'turret_yaw', projectileSpeed: 30 },
        { aimBone: 'muzzle_01', projectileSpeed: 6 },
        { aimBone: 'Muzzle_02', projectileSpeed: 6 },
      ],
    };
    expect(projectileSpeedOf(w)).toBe(6);
  });

  it('takes the most common speed, ties breaking low, and drops gravity-drop placeholders', () => {
    expect(projectileSpeedOf({ aimControllers: [{ projectileSpeed: 20 }, { projectileSpeed: 10 }] })).toBe(
      10,
    );
    expect(projectileSpeedOf({ aimControllers: [{ projectileSpeed: 0.0001 }] })).toBeNull();
    expect(projectileSpeedOf({})).toBeNull();
  });
});

describe('groupWeapons and mainWeapon', () => {
  const gun = { damage: 10, rangeMax: 30, dps: 5, targets: ['Land'] };
  const cannon = { damage: 50, rangeMax: 40, dps: 8, targets: ['Land'] };

  it('collapses identical weapons into one with a count and total DPS, best first', () => {
    const grouped = groupWeapons([gun, cannon, { ...gun }, { ...gun }]);
    expect(grouped.map((w) => [w.damage, w.count, w.dpsTotal])).toEqual([
      [10, 3, 15],
      [50, 1, 8],
    ]);
  });

  it('keeps an unknown DPS unknown', () => {
    expect(groupWeapons([{ ...gun, dps: null }])[0].dpsTotal).toBeNull();
  });

  it('picks the highest total DPS, then the longer range', () => {
    expect(mainWeapon(groupWeapons([gun, cannon])).damage).toBe(50);
    expect(mainWeapon(groupWeapons([gun, { ...cannon, dps: 5 }])).damage).toBe(50);
  });
});
