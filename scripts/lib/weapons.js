// Pure weapon maths for extract.js: firing simulation, projectile and aim
// speeds, and collapsing duplicate weapons. Moved here unchanged so it can be
// unit-tested without a game install.

// Simulation tick rate and step, from the game's generated constants.lua
// (TickRate = 10, TickTimeStep = 0.1). Beam weapons deal their `damage` once
// per tick, and every weapon timer counts down by the step once per tick — as
// a double, exactly as LuaJIT does, which matters (see simulateWeapon).
export const TICK_RATE = 10;
export const TICK_STEP = 0.1;

// Firing model, per the game's own template documentation:
//   muzzleGroups    - each group is a set of muzzle bones that fire together
//   muzzleSalvoSize - how many *groups* fire in one cycle (not shots per muzzle)
//   reloadTime      - seconds between cycles
// So a weapon with ten groups and a salvo size of one fires a single group per
// cycle and cycles through them; counting all ten would overstate it tenfold.
// Projectile speed lives on the weapon's aim controllers, not on the projectile
// template (those are visuals only). A weapon can have several controllers: one
// driving the turret yaw, which carries a coarse lead-estimate speed, and one
// per muzzle carrying the real firing solution. Prefer the muzzle-bound ones.
//
//   ucl4002: yaw controller says 30, both muzzle controllers say 6 -> 6
export function projectileSpeedOf(w) {
  const controllers = w.aimControllers ?? [];
  const muzzleBound = controllers.filter((a) => /muzzle/i.test(a.aimBone ?? ''));
  // The T1 Bomber declares 0.0001, which means "drops under gravity" rather than
  // any real muzzle velocity. Every genuine speed in the data is >= 5, so the
  // cutoff is unambiguous and reporting the placeholder would be nonsense.
  const speeds = (muzzleBound.length ? muzzleBound : controllers)
    .map((a) => a.projectileSpeed)
    .filter((v) => typeof v === 'number' && v >= 1);

  if (!speeds.length) return null;

  // Take the most common value; ties break low so we never overstate it.
  const counts = new Map();
  for (const v of speeds) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// How fast the weapon tracks a target, and how far around it can point.
//
// Controllers are split by axis: the one bound to a yawBone traverses, the ones
// bound to a pitchBone elevate. A weapon can have several of each, so take the
// most common speed per axis the same way projectile speed does.
//
// Note this reads the `weapons` block, not `turrets`. templateExplainations.lua
// marks `turrets` as "Old format, still have some leftover stuff", and its
// turnRateDegreesPerSecond disagrees with the live value on 20 weapons.
export function aimingOf(w) {
  const controllers = w.aimControllers ?? [];

  const mode = (values) => {
    const nums = values.filter((v) => typeof v === 'number' && v > 0);
    if (!nums.length) return null;
    const counts = new Map();
    for (const v of nums) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  };

  const yawControllers = controllers.filter((c) => c.yawBone);
  const pitchControllers = controllers.filter((c) => c.pitchBone);

  // Arc comes from whichever yaw controller declares limits; 360 means the
  // turret spins freely, anything less is a restricted firing arc.
  const arcSource = yawControllers.find((c) => c.yawMin != null && c.yawMax != null);

  return {
    traverseSpeed: mode(yawControllers.map((c) => c.yawSpeed)),
    elevationSpeed: mode(pitchControllers.map((c) => c.pitchSpeed)),
    traverseArc: arcSource ? Math.round(arcSource.yawMax - arcSource.yawMin) : null,
  };
}

// How many muzzles each muzzle group fires. Mirrors SetUpWeapons
// (unitsBaseClass.lua), which walks `muzzleGroup.muzzles` — so a group that
// declares no muzzles list fires nothing, and neither does a weapon with no
// groups at all. Four bomber weapons ship an empty list; see toWeapon.
export function groupSizes(w) {
  return (w.muzzleGroups ?? []).map((g) => (Array.isArray(g?.muzzles) ? g.muzzles.length : 0));
}

// Muzzles fired in one cycle. From AIFunctions.lua's GetWeaponCycleMuzzleCount:
// salvo indices wrap around the groups, so a weapon whose salvo size exceeds
// its group count fires some groups more than once per cycle — a series of
// barrels cycling. Capping at the group count, as this once did, undercounts.
export function cycleMuzzleCount(w) {
  const groups = groupSizes(w);
  if (!groups.length) return 0;
  let count = 0;
  for (let i = 0; i < (w.muzzleSalvoSize ?? 1); i++) count += groups[i % groups.length];
  return count;
}

// A tick-for-tick port of HostWeapon:Update and its UpdateProjectile /
// UpdateBeam / AdvanceSalvoState (host/units/weaponsClasses/weaponsBaseClass.lua),
// with the target held in the sights throughout. Returns the steady-state DPS
// and the seconds from one volley to the next.
//
// Simulating rather than using a formula is deliberate. Three things the
// template doesn't say out loud decide the real rate of fire:
//
// 1. Reload runs concurrently with the salvo. reloadTimer is reset as the salvo
//    *starts* and keeps counting while it plays out, so a cycle is whichever is
//    longer, not their sum. (The AI's own GetWeaponDamagePerSecond adds them;
//    the Chosen Commander visibly alternates barrels with no pause, which only
//    the concurrent reading predicts.)
// 2. Every timer moves in 0.1s ticks and only fires once it reaches <= 0. It
//    counts down by subtracting 0.1 as a double, and ten of those leave 1.0 at
//    1.4e-16, not zero — so a 1s reload takes 11 ticks, 1.1s. 0.5s is really
//    0.6s, 0.25s is 0.3s, 5s is 5.1s; 2s and 3s happen to land exactly.
//    There is no rounding rule — only stepping the countdown gets it right.
//    Timed in game on build 25474094: Chosen Commander 1.1s, EDA Commander
//    2.0s, Jager and Stitcher 0.6s, all exactly as simulated.
// 3. Beam damage is per tick, applied by HostBeam:Update after the weapons
//    update in the same tick (CollisionUpdate). A continuous beam
//    (beamLifetime -1) never finishes its salvo, so only the first muzzle group
//    ever fires and reload is irrelevant. A pulse or burst beam lands
//    beamLifetime ticks per volley.
//
// Anything the host never reads is left out: damageOverTimePulse*, chargeTime,
// impactDelay and damageBox appear in no runtime code, Lua or compiled — see
// unreadWeaponFields.
export function simulateWeapon(w, isBeam) {
  const groups = groupSizes(w);
  if (!groups.length) return null;

  const damage = w.damage ?? 0;
  const reloadTime = w.reloadTime ?? 0;
  const salvoSize = w.muzzleSalvoSize ?? 1;
  const lifetime = w.beamLifetime ?? -1;

  if (isBeam && lifetime <= 0) return { dps: groups[0] * damage * TICK_RATE, cycleTime: null };

  let reloadTimer = reloadTime;
  let state = 'reload';
  let salvosRemaining = 0;
  let group = 0;
  let between = 0;
  let pending = false;
  let countdown = 0;
  let beaming = 0; // muzzles whose beam is on
  let dealt = 0;
  const starts = []; // [tick, damage dealt before it] at each volley start

  const advance = () => {
    group = (group + 1) % groups.length;
    salvosRemaining -= 1;
    if (salvosRemaining <= 0) state = 'reload';
    else {
      between = w.muzzleSalvoDelay ?? 0;
      state = 'between';
    }
  };
  const waitBetween = () => {
    if (state !== 'between') return;
    between -= TICK_STEP;
    if (between <= 0) state = 'shoot';
  };

  const beamStep = () => {
    if (state === 'shoot') {
      state = 'beam';
      pending = true;
      return;
    }
    if (state === 'beam') {
      if (pending) {
        pending = false;
        countdown = lifetime;
        beaming = groups[group];
        return;
      }
      if (countdown > 0 && --countdown === 0) state = 'finish';
    }
    if (state === 'finish') {
      beaming = 0;
      advance();
    }
    waitBetween();
  };

  const projectileStep = () => {
    if (state === 'shoot') {
      dealt += groups[group] * damage;
      state = 'finish';
    }
    if (state === 'finish') advance();
    waitBetween();
  };

  // Group rotation repeats after groups.length volleys, so measure across
  // exactly that many (skipping the first, which starts from a fresh reload).
  const volleys = groups.length;
  for (let tick = 0; starts.length < volleys + 2 && tick < 1e6; tick++) {
    reloadTimer -= TICK_STEP;
    if (state === 'reload' && reloadTimer <= 0) state = 'target';
    if (state === 'target') {
      starts.push([tick, dealt]);
      reloadTimer = reloadTime;
      salvosRemaining = salvoSize;
      state = 'shoot';
    }
    if (isBeam) beamStep();
    else projectileStep();
    dealt += beaming * damage;
  }

  const [t0, d0] = starts[1];
  const [t1, d1] = starts[1 + volleys];
  const seconds = (t1 - t0) / TICK_RATE;
  return { dps: (d1 - d0) / seconds, cycleTime: round(seconds / volleys) };
}

// Big units mount the same gun several times — the Phoenix carries nine weapons
// that are really three designs, the T5 Hovertank eleven that are four. Listing
// each copy is noise, so identical entries collapse into one with a count.
export function groupWeapons(weapons) {
  const groups = new Map();

  for (const w of weapons) {
    const key = JSON.stringify([
      w.damage,
      w.damageType,
      w.damageRadius,
      w.reloadTime,
      w.rangeMax,
      w.rangeMin,
      w.isBeam,
      w.beamLifetime,
      w.projectileSpeed,
      w.homing,
      w.shotsPerCycle,
      w.cycleTime,
      w.category,
      w.targets,
      w.traverseSpeed,
      w.elevationSpeed,
      w.traverseArc,
    ]);
    const existing = groups.get(key);
    if (existing) existing.count++;
    else groups.set(key, { ...w, count: 1 });
  }

  return [...groups.values()]
    .map((w) => ({ ...w, dpsTotal: w.dps == null ? null : round(w.dps * w.count) }))
    .sort((a, b) => (b.dpsTotal ?? 0) - (a.dpsTotal ?? 0) || b.rangeMax - a.rangeMax);
}

// Highest DPS wins; ties go to the longer-ranged weapon, then the harder hitter.
export function mainWeapon(weapons) {
  return weapons
    .slice()
    .sort(
      (a, b) => (b.dpsTotal ?? 0) - (a.dpsTotal ?? 0) || b.rangeMax - a.rangeMax || b.damage - a.damage,
    )[0];
}

export function round(n) {
  return Math.round(n * 100) / 100;
}
