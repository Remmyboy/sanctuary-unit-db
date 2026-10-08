// Reads every unit template out of the game install and writes the flat JSON
// the site consumes. Re-run this after a game update: `npm run extract`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLuaTable } from './lua-parser.js';
import { locateGame, contentRoot, steamBuild } from './locate-game.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.join(here, '..', 'public', 'data', 'units.json');
const VERSION_FILE = path.join(here, '..', 'public', 'data', 'version.json');
// Remmy's Balance Patch: its changes (imported by `npm run balance-patch`) and
// the units with them applied, for the database's balance-patch toggle.
const PATCH_FILE = path.join(here, '..', 'src', 'lib', 'balance-patch.json');
const PATCH_OUT_FILE = path.join(here, '..', 'public', 'data', 'units-balance-patch.json');
// Set by the patch but not worth a line: a unit spawns with its max health, so
// this always moves with `health`. src/lib/balance-patch.ts hides the same.
const HIDDEN_FIELDS = new Set(['defence.health.value']);

// Third character of the template id encodes the domain, second the faction.
const FACTIONS = { e: 'EDA', c: 'Chosen', g: 'Guard', w: 'Guard' };
const DOMAINS = { l: 'Land', a: 'Air', n: 'Naval', s: 'Structure' };

// The faction tag a unit should carry, derived from its id. Used to catch
// mis-tagged templates — see normaliseFactionTag.
const FACTION_TAGS = { e: 'EDA', c: 'CHOSEN', g: 'GUARD', w: 'GUARD' };
const ALL_FACTION_TAGS = new Set(Object.values(FACTION_TAGS));

// Simulation tick rate and step, from the game's generated constants.lua
// (TickRate = 10, TickTimeStep = 0.1). Beam weapons deal their `damage` once
// per tick, and every weapon timer counts down by the step once per tick — as
// a double, exactly as LuaJIT does, which matters (see simulateWeapon).
const TICK_RATE = 10;
const TICK_STEP = 0.1;

// Problems found in the game's own data, surfaced rather than silently patched.
const issues = [];

// Role is inferred from the icon symbol the game already assigns each unit,
// which is more reliable than guessing from tags or names.
const ROLES = {
  direct: 'Direct Fire',
  indirect: 'Artillery',
  aa: 'Anti-Air',
  antiNaval: 'Anti-Naval',
  engineer: 'Engineer',
  intel: 'Intel',
  shield: 'Shield',
  plasma: 'Plasma',
  alloy: 'Economy',
  // Only factories wear these. Named for what they are, so the Role chips
  // can't be mistaken for the Domain filter's Air / Land / Naval.
  air: 'Air Factory',
  land: 'Land Factory',
  naval: 'Naval Factory',
  transmiter: 'Transmitter',
  none: null,
};

// The icon is wrong for one factory (every T3 Naval Factory wears the air
// symbol), so a factory's role comes from its *_FACTORY tag, which agrees with
// its name everywhere.
const FACTORY_ROLES = {
  LAND_FACTORY: 'Land Factory',
  AIR_FACTORY: 'Air Factory',
  NAVAL_FACTORY: 'Naval Factory',
};

function roleOf(symbol, tags, id) {
  const fromIcon = ROLES[symbol] ?? null;
  const factoryTag = tags.find((tag) => FACTORY_ROLES[tag]);
  if (!factoryTag) return fromIcon;
  const role = FACTORY_ROLES[factoryTag];
  if (fromIcon && fromIcon !== role) {
    issues.push(`${id} is tagged ${factoryTag} but its icon shows "${symbol}" — role taken from the tag`);
  }
  return role;
}

function main() {
  const gameDir = locateGame();
  const { root: lua, tree } = contentRoot(gameDir);
  console.log(`game:      ${gameDir}`);
  console.log(`tree:      ${tree}  (unit data; art always comes from prototype)`);
  const build = steamBuild(gameDir);
  console.log(
    `build:     ${build ? `${build.buildId} (${build.name}, installed ${build.updatedAt})` : 'unknown — not under a Steam library'}`,
  );

  const available = readAvailability(path.join(lua, 'common', 'units', 'availableUnits.lua'));
  const adjacency = readAdjacencyBuffs(path.join(lua, 'host', 'systems', 'adjacencyBuffs.lua'));
  const models = scanUnitModels(gameDir);
  console.log(`models:    ${models.size} unit ids have LOD art in the scene files`);
  const projectiles = readProjectiles(path.join(lua, 'common', 'projectiles', 'projectilesTemplates'));
  console.log(`projectiles: ${projectiles.size} templates`);
  const templateDir = path.join(lua, 'common', 'units', 'unitsTemplates');

  const units = [];
  const failures = [];
  // Each unit's template as parsed, for the balance patch to apply its changes to.
  const templates = new Map();

  for (const id of fs.readdirSync(templateDir).sort()) {
    const file = path.join(templateDir, id, `${id}.santp`);
    if (!fs.existsSync(file)) {
      failures.push({ id, reason: 'no .santp file in template folder' });
      continue;
    }
    try {
      const raw = parseLuaTable(fs.readFileSync(file, 'utf8'), { assignment: 'UnitTemplate' });
      templates.set(id, structuredClone(raw));
      units.push(toUnit(raw, id, available, models, adjacency, projectiles));
    } catch (err) {
      failures.push({ id, reason: err.message });
    }
  }

  // Two units sharing an id would silently lose build-tree edges to whichever
  // one a Map lookup happened to keep, so treat it as fatal rather than subtle.
  const counts = new Map();
  for (const u of units) counts.set(u.id, (counts.get(u.id) ?? 0) + 1);
  const collisions = [...counts].filter(([, n]) => n > 1);
  if (collisions.length) {
    throw new Error(`duplicate unit ids: ${collisions.map(([id, n]) => `${id} ×${n}`).join(', ')}`);
  }

  resolveBuildTrees(units);

  const game = build;
  if (!game) issues.push('no Steam appmanifest next to the install — build id unknown');

  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: path.basename(gameDir),
      // The Steam build this was extracted from, so the site can say whether
      // it still matches the live branch. Null when the game isn't under
      // steamapps (a copied install).
      game,
      unitCount: units.length,
      // Surfaced in the UI so nobody mistakes demo balance for release balance.
      isDemo: /demo/i.test(path.basename(gameDir)),
      // Faults in the game's own templates that this run worked around.
      dataIssues: issues,
    },
    units: units.sort((a, b) => a.id.localeCompare(b.id)),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  // A few hundred bytes the /api/game-version route can bundle, so it can
  // answer "is the database current?" without shipping every unit to the
  // server function.
  fs.writeFileSync(
    VERSION_FILE,
    JSON.stringify(
      {
        generatedAt: payload.meta.generatedAt,
        source: payload.meta.source,
        unitCount: payload.meta.unitCount,
        game,
      },
      null,
      2,
    ) + '\n',
  );

  report(units, failures, payload);
  writeBalancePatch(payload, templates, { available, models, adjacency, projectiles });
}

// Remmy's Balance Patch, applied to the templates just read: the same
// derivation as the base data (DPS, tiers, build trees), on the patched
// numbers, so every page can show either. The patch's changes count array
// items from 1, as Lua does, and say what the game's value was; a change whose
// "before" no longer matches the install means the game has moved on since the
// patch was made, so it's reported and left out, as the mod itself would skip it.
function writeBalancePatch(base, templates, { available, models, adjacency, projectiles }) {
  if (!fs.existsSync(PATCH_FILE)) return;
  const patch = JSON.parse(fs.readFileSync(PATCH_FILE, 'utf8'));
  const build = base.meta.game?.buildId;
  if (build && String(build) !== String(patch.game.steamBuild)) {
    console.warn(
      `
balance patch: made for build ${patch.game.steamBuild}, this install is ${build} — checking every change`,
    );
  }

  const stale = [];
  const apply = (target, c) => {
    const keys = c.field.split('.');
    let node = target;
    for (const k of keys.slice(0, -1)) node = node?.[Array.isArray(node) ? Number(k) - 1 : k];
    const last = keys.at(-1);
    const key = Array.isArray(node) ? Number(last) - 1 : last;
    if (!node || !sameValue(node[key], c.before)) {
      stale.push(
        `${c.id} ${c.field}: expected ${JSON.stringify(c.before)}, found ${JSON.stringify(node?.[key])}`,
      );
      return false;
    }
    node[key] = structuredClone(c.after);
    return true;
  };

  const patchedProjectiles = new Map(projectiles);
  // What changed on each unit, its own fields first, then its shots'.
  const own = new Map();
  const shots = new Map();
  const note = (list, id, c, label) =>
    list.set(id, [
      ...(list.get(id) ?? []),
      { label, before: c.before, after: c.after, sections: c.sections },
    ]);

  for (const c of patch.changes.filter((c) => c.kind === 'projectile')) {
    const tp = structuredClone(patchedProjectiles.get(c.id));
    if (!tp || !apply(tp, c)) continue;
    patchedProjectiles.set(c.id, tp);
    // Shown on every unit that fires it.
    const shot = /missile/i.test(tp.general?.name ?? '') ? 'missile' : 'shell';
    for (const [id, t] of templates) {
      if ((t.weapons ?? []).some((w) => w.projectileTemplate === c.id))
        note(shots, id, c, `${shot} ${c.label}`);
    }
  }

  const patched = new Map();
  for (const c of patch.changes.filter((c) => c.kind === 'unit')) {
    if (!templates.has(c.id)) {
      stale.push(`${c.id}: no such unit in this install`);
      continue;
    }
    if (!patched.has(c.id)) patched.set(c.id, structuredClone(templates.get(c.id)));
    if (apply(patched.get(c.id), c) && !HIDDEN_FIELDS.has(c.field)) note(own, c.id, c, c.label);
  }
  const byUnit = new Map(
    [...new Set([...own.keys(), ...shots.keys()])].map((id) => [
      id,
      [...(own.get(id) ?? []), ...(shots.get(id) ?? [])],
    ]),
  );

  // The base run already reported the game's own data faults; re-deriving the
  // same units would only repeat them.
  const issuesBefore = issues.length;
  const units = base.units.map((u) => {
    const t = patched.get(u.id) ?? (byUnit.has(u.id) ? templates.get(u.id) : null);
    const unit = t
      ? toUnit(structuredClone(t), u.id, available, models, adjacency, patchedProjectiles)
      : structuredClone(u);
    unit.builds = [];
    unit.builtBy = [];
    if (byUnit.has(u.id)) unit.balance = byUnit.get(u.id);
    return unit;
  });
  resolveBuildTrees(units);
  issues.length = issuesBefore;

  const payload = {
    meta: {
      ...base.meta,
      balancePatch: {
        id: patch.mod.id,
        version: patch.mod.version,
        game: patch.game,
        sections: patch.sections.map(({ key, label }) => ({ key, label })),
        changedUnits: byUnit.size,
        stale,
      },
    },
    units,
  };
  fs.writeFileSync(PATCH_OUT_FILE, JSON.stringify(payload));
  const size = (fs.statSync(PATCH_OUT_FILE).size / 1024).toFixed(0);
  console.log(`
balance patch ${patch.mod.version}: ${byUnit.size} units changed`);
  console.log(`wrote:     ${path.relative(process.cwd(), PATCH_OUT_FILE)} (${size} KB)`);
  if (stale.length) {
    console.warn(`balance patch changes that no longer match the game (${stale.length}), left out:`);
    for (const s of stale) console.warn(`  ! ${s}`);
  }
}

// Template values as the patch records them: a missing field is the game's
// default, which for every field it touches is false, 0 or nothing.
function sameValue(found, before) {
  const norm = (v) => (v === undefined || v === false ? null : v);
  return JSON.stringify(norm(found)) === JSON.stringify(norm(before));
}

// Which units actually have a model, found by looking for their LOD assets in
// the scene files. A unit's mesh, material and textures are all named
// <tpId>_lod<n>, so the id appearing in that form means the art exists.
//
// This replaces availableUnits.lua as the availability signal. That file is
// hand-maintained ("Validated by eyes!"), disabled in the loader
// (useAvailableUnitsList = false), and wrong about 90 units — it claims
// "no model" for things like the Chosen T1 Raider that are plainly modelled.
function scanUnitModels(gameDir) {
  const pattern = /u[ecgw][lans]\d{4}(?=_lod\d)/g;
  const found = new Set();

  // Only the prototype build ships unit art — the engine build's asset files
  // contain no unit LODs and no strategic icons at all — but scan every build's
  // data directory so this keeps working if that changes.
  const dataDirs = fs
    .readdirSync(gameDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      const buildDir = path.join(gameDir, e.name);
      return fs
        .readdirSync(buildDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /_Data$/.test(d.name))
        .map((d) => path.join(buildDir, d.name));
    });

  for (const dir of dataDirs) {
    // Scenes share assets, so read them all in case a unit appears in only one.
    // The Playtest build moved unit art out of Unity's `levelN` scenes and into
    // Gamedata/*.sanpack bundles, so scan both layouts.
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^level\d+$/.test(f))
      .map((f) => path.join(dir, f));

    const packs = path.join(dir, 'Gamedata');
    if (fs.existsSync(packs)) {
      for (const f of fs.readdirSync(packs)) {
        if (f.endsWith('.sanpack')) files.push(path.join(packs, f));
      }
    }

    for (const file of files) scanForIds(file, pattern, found);
  }
  return found;
}

// Read in chunks: these files run from ~100 MB to well over a gigabyte, past
// the point where the whole thing fits in one JS string. Chunks overlap by a
// name's width so an id straddling a boundary is still matched.
function scanForIds(file, pattern, found) {
  const CHUNK = 64 * 1024 * 1024;
  const OVERLAP = 32;

  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(CHUNK, size));

    for (let offset = 0; offset < size; offset += CHUNK - OVERLAP) {
      const bytes = fs.readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
      if (bytes <= 0) break;
      const text = buffer.subarray(0, bytes).toString('latin1');
      for (const match of text.matchAll(pattern)) found.add(match[0]);
    }
  } catch {
    // An unreadable asset file just contributes no ids.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Projectile templates, keyed the way the game looks them up
// (__Templates.Projectiles[weapon.projectileTemplate]): by the lower-case
// general.tpId, not the upper-case folder name they ship in. Most are visuals
// only; the handful with a `movement` block are guided missiles that the host
// steers onto the target (weaponsBaseClass.lua, UpdateProjectile).
function readProjectiles(dir) {
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, `${name}.santp`);
    if (!fs.existsSync(file)) continue;
    try {
      const tp = parseLuaTable(fs.readFileSync(file, 'utf8'), { assignment: 'ProjectileTemplate' });
      map.set(tp.general?.tpId ?? name.toLowerCase(), tp);
    } catch (err) {
      issues.push(`projectile ${name} failed to parse (${err.message})`);
    }
  }
  return map;
}

// Adjacency bonuses, from host/systems/adjacencyBuffs.lua.
//
// Structures placed next to each other pass buffs along: an energy generator
// makes adjacent factories cheaper to build from, storages boost neighbouring
// storages. The file isn't a plain literal — targetTags are Lua expressions like
// `Tags.FACTORY + Tags.ENGINEERING_STATION` — so each buff block is read with a
// regex rather than the table parser.
//
// A buff only does anything if some unit's template names it, and several
// defined here are not wired to any unit (the alloy fabricators, T2/T3
// storages), so those are dropped rather than advertised as live.
function readAdjacencyBuffs(file) {
  const buffs = new Map();
  if (!fs.existsSync(file)) return buffs;

  const text = fs.readFileSync(file, 'utf8');
  // Only the data table matters; the registration loop below it is behaviour.
  const table = text.slice(text.indexOf('adjacencyBuffsData = {'));

  // Each top-level entry: `T1EnergyGenerator = { ... },` at one indent level.
  for (const unitBlock of table.matchAll(/^    (\w+) = \{$([\s\S]*?)^    \},$/gm)) {
    const [, source, body] = unitBlock;
    const effects = [];

    for (const effect of body.matchAll(/^        (\w+) = \{$([\s\S]*?)^        \},$/gm)) {
      const [, category, fields] = effect;
      // Commented-out effects are proposals, not live behaviour.
      if (/^\s*--/.test(fields.split('\n')[0] ?? '')) continue;

      const extra = Number(fields.match(/extra\s*=\s*(-?[\d.]+)/)?.[1]);
      const resource = fields.match(/resource\s*=\s*"(\w+)"/)?.[1];
      const targets = [
        ...(fields.match(/targetTags\s*=\s*([^\n]+)/)?.[1] ?? '').matchAll(/Tags\.(\w+)/g),
      ].map((m) => m[1]);

      if (Number.isNaN(extra) || !resource) continue;
      effects.push({ category, resource, extra, targets });
    }

    if (effects.length) buffs.set(`${source}AdjacencyBuff`, { source, effects });
  }
  return buffs;
}

// Pretty names for the buff categories.
const ADJACENCY_CATEGORIES = {
  ConstructionDiscount: 'Build cost',
  ConsumptionDiscount: 'Upkeep',
  StorageBonus: 'Storage',
};

// The engine tree's availableUnits.lua is a live QA tracker, not the stale list
// the prototype tree carries. Each row is
//
//   ucl4001 = true,  -- ChosenT4Bot   -- OK
//   uca4011 = false, -- ChosenT4Gunship -- OK_PENDING_APPROVAL
//   ucl1201 = false, -- ChosenT1MAA     -- OK (DEMO_UI_ONLY)
//
// Since the 2026-09 patch the code can carry a parenthesised note — so far only
// DEMO_UI_ONLY, which mirrors the template tag and explains why a signed-off
// unit is still switched off in the Playtest.
//
// and the reason codes line up with the shipped art almost exactly: every
// OK/OK_PENDING_APPROVAL/BONE_MISSMATCH unit has a model, and NO_MODEL units
// overwhelmingly don't. So the flag means "signed off and enabled", not
// "exists" — the two together give a three-way status.
function readAvailability(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const text = fs.readFileSync(file, 'utf8');

  for (const m of text.matchAll(/^\s*([a-z]{3}\d{4})\s*=\s*(true|false)\s*,?\s*(?:--\s*(.*))?$/gm)) {
    const comment = (m[3] ?? '').replace(/\s+/g, ' ').trim();
    // The comment carries the internal name, then the reason code.
    const [internalName, reasonText] = comment.split(/\s+--\s+/);
    const reason = reasonText?.trim().match(/^([A-Z_]+)(?:\s*\(([^)]*)\))?$/);
    map.set(m[1], {
      enabled: m[2] === 'true',
      internalName: internalName?.trim() || null,
      reason: reason?.[1] ?? reasonText?.trim() ?? null,
      note: reason?.[2]?.trim() || null,
    });
  }
  return map;
}

// Resolves the buff name a template declares into its actual effects.
function adjacencyOf(buffName, buffs) {
  if (!buffName) return null;
  const buff = buffs.get(buffName);
  if (!buff) {
    issues.push(`unknown adjacency buff "${buffName}" — not defined in adjacencyBuffs.lua`);
    return null;
  }
  return {
    source: buff.source,
    effects: buff.effects.map((e) => ({
      ...e,
      label: ADJACENCY_CATEGORIES[e.category] ?? e.category,
      // Stored as a fraction; -0.15 means 15% cheaper.
      percent: Math.round(e.extra * 1000) / 10,
    })),
  };
}

// Reason codes, prettified for display.
const REASONS = {
  OK: 'Signed off',
  OK_PENDING_APPROVAL: 'Pending approval',
  BONE_MISSMATCH: 'Rigging mismatch',
  BATTLE_NO_DAMAGE: 'No damage state',
  NO_MODEL: 'No model',
  TEMPLATE_INVALID_PREFAB: 'Invalid prefab',
};
const NOTES = {
  DEMO_UI_ONLY: 'demo UI only',
};

function reasonOf(entry) {
  if (!entry?.reason) return null;
  const base = REASONS[entry.reason] ?? entry.reason;
  if (!entry.note) return base;
  return `${base} (${NOTES[entry.note] ?? entry.note})`;
}

// Three buckets, from the empirical art scan crossed with the QA flag:
//   in-game      art exists and it is signed off and enabled
//   in-progress  art exists but it is gated (approval, rigging, damage state)
//   no-model     nothing to render
function statusOf(hasModel, entry) {
  if (!hasModel) return 'no-model';
  return entry?.enabled ? 'in-game' : 'in-progress';
}

function toUnit(t, id, available, models, adjacency, projectiles) {
  const general = t.general ?? {};
  const economy = t.economy ?? {};
  const status = available.get(id);

  // Identity is the filename, not general.tpId. templateLoader's
  // ReadUnitTemplate(tp, tpId) takes tpId from the caller and gates on
  // AvailableUnits[tpId], which is keyed by filename — so that's what the game
  // uses. One template (ugs2807) carries a stale copied tpId of "ugs2806";
  // trusting the field would collide two units onto one id.
  if (general.tpId && general.tpId !== id) {
    issues.push(`${id} declares tpId "${general.tpId}" — using the filename instead`);
  }

  const tags = normaliseFactionTag(t.tags ?? [], id);

  // Death explosions are listed alongside weapons but only fire when the unit
  // dies, so they're reported separately and kept out of DPS and range.
  const allWeapons = (t.weapons ?? [])
    .map((w, i) => toWeapon(w, `${id} weapon ${i + 1}`, projectiles))
    .filter((w) => w.damage > 0 || w.rangeMax > 0);
  const weapons = groupWeapons(allWeapons.filter((w) => w.category !== 'DeathExplosion'));
  const deathExplosion = allWeapons.find((w) => w.category === 'DeathExplosion') ?? null;

  const cost = {
    alloys: economy.cost?.alloys ?? 0,
    energy: economy.cost?.energy ?? 0,
  };

  return {
    id,
    declaredTpId: general.tpId && general.tpId !== id ? general.tpId : null,
    name: general.name || null,
    displayName: general.displayName ?? '',
    faction: FACTIONS[id[1]] ?? 'Unknown',
    domain: DOMAINS[id[2]] ?? 'Unknown',
    tier: resolveTier(tags, id),
    role: roleOf(general.icon?.symbol, tags, id),
    icon: {
      shape: general.icon?.shape ?? null,
      symbol: general.icon?.symbol ?? null,
      tech: general.icon?.tech ?? null,
    },

    // Does the unit have art that would actually render, found by scanning the
    // scene files for its LOD assets rather than trusting any list.
    hasModel: models.has(id),
    // in-game | in-progress | no-model
    status: statusOf(models.has(id), status),
    // Why it isn't enabled, straight from the QA tracker's reason code.
    statusReason: reasonOf(status),
    internalName: status?.internalName ?? null,
    demoOnly: tags.includes('DEMO_UI_ONLY'),
    // What this structure grants to neighbours when built next to them.
    adjacency: adjacencyOf(t.adjacency, adjacency),

    cost,
    buildTime: economy.buildTime ?? 0,
    production: nonEmpty(economy.production),
    upkeep: nonEmpty(economy.maintenanceConsumption),
    storage: nonEmpty(economy.storage),

    health: t.defence?.health?.max ?? 0,
    // HP per second, always on: nothing in the Lua ever switches it off, and
    // the game's own information panel shows it straight from the template.
    healthRegen: t.defence?.health?.regen || null,
    shields: (t.defence?.shields ?? []).map((s) => ({
      name: s.name ?? 'Shield',
      max: s.max ?? 0,
      regen: s.regen ?? null,
      regenDelay: s.regenDelay ?? null,
      rechargeTime: s.rechargeTime ?? null,
      // radii is an x/y/z extent; the shield bubble is spherical so x is the radius.
      radius: s.radii?.x ?? null,
    })),

    buildPower: t.construction?.buildPower ?? null,
    // Reach for building, repairing and assisting a construction. This — not the
    // Assist order — is what decides whether a unit can pour build power into
    // someone else's build.
    //
    // Both fields are meaningful, they just describe different things. Ordering a
    // factory to assist another factory copies its build queue rather than
    // contributing to a construction, so the 42 builders that declare
    // `Assist = true` without a range are correct about their own mechanic; they
    // simply add no build power. 22 units have a range: the commanders, the
    // engineers and the engineering stations.
    buildRange: t.construction?.range ?? null,
    orders: Object.entries(t.general?.orders ?? {})
      .filter(([, on]) => on)
      .map(([name]) => name)
      .sort(),
    // Can contribute build power to another unit's construction.
    canAssist: (t.construction?.range ?? 0) > 0 && t.general?.orders?.Assist === true,
    canBuildExpr: t.construction?.canBuild ?? null,
    upgradesTo: t.construction?.upgradesTo ?? null,
    // Filled in by resolveBuildTrees once every unit is known.
    builds: [],
    builtBy: [],

    movement: t.movement
      ? {
          type: t.movement.type ?? null,
          speed: t.movement.speed ?? null,
          acceleration: t.movement.acceleration ?? null,
          rotationSpeed: t.movement.rotationSpeed ?? null,
          // Planes can't hover: this is the stall floor they never drop below.
          minSpeed: t.movement.minSpeed || null,
        }
      : null,

    vision: t.intel?.visionRadius ?? null,
    radar: t.intel?.radarRadius ?? null,
    sonar: t.intel?.sonarRadius ?? null,

    transportSlots: t.transport?.storage ?? null,
    footprint: t.footprint ? { x: t.footprint.x, y: t.footprint.y } : null,

    weapons,
    deathExplosion: deathExplosion
      ? { damage: deathExplosion.damage, radius: deathExplosion.damageRadius }
      : null,
    // Null rather than 0 when every damaging weapon has an unknown figure, so
    // the UI shows an em dash instead of claiming the unit deals no damage.
    dps:
      weapons.length && weapons.every((w) => w.dpsTotal == null)
        ? null
        : round(weapons.reduce((sum, w) => sum + (w.dpsTotal ?? 0), 0)),
    maxRange: weapons.length ? Math.max(...weapons.map((w) => w.rangeMax)) : 0,
    // The main weapon's travel speed. Ranked among weapons that actually fire a
    // projectile, so a unit whose top gun is a beam still reports its cannon
    // rather than nothing — the per-weapon table shows the full picture.
    projectileSpeed: mainWeapon(weapons.filter((w) => w.projectileSpeed != null))?.projectileSpeed ?? null,

    tags,
  };
}

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
function projectileSpeedOf(w) {
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
function aimingOf(w) {
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
function groupSizes(w) {
  return (w.muzzleGroups ?? []).map((g) => (Array.isArray(g?.muzzles) ? g.muzzles.length : 0));
}

// Muzzles fired in one cycle. From AIFunctions.lua's GetWeaponCycleMuzzleCount:
// salvo indices wrap around the groups, so a weapon whose salvo size exceeds
// its group count fires some groups more than once per cycle — a series of
// barrels cycling. Capping at the group count, as this once did, undercounts.
function cycleMuzzleCount(w) {
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
function simulateWeapon(w, isBeam) {
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

// Template fields the documentation describes but no runtime code reads — not
// the Lua host, not the compiled engine (Trebuchet.dll holds none of these
// names). Counting them would credit damage the game never deals: the Onager's
// damage-over-time alone would add 400 DPS to a 525 DPS gun.
const UNREAD_WEAPON_FIELDS = [
  'damageOverTimePulseCount',
  'chargeTime',
  'impactDelay',
  'damageBox',
  'useDamageCollider',
];
function unreadWeaponFields(w, where) {
  const unread = UNREAD_WEAPON_FIELDS.filter((k) => w[k] != null);
  if (unread.length)
    issues.push(`${where} sets ${unread.join(', ')} — no game code reads it, so it's ignored`);
}

function toWeapon(w, where, projectiles) {
  const groups = w.muzzleGroups ?? [];
  // The game's own test (common/utilities/beams.lua): a weapon is a beam when
  // it has a `beam` table. beamLifetime alone decides nothing — the Engraver
  // keeps a stale beamLifetime of -1 from when it was a beam, but fires
  // projectiles, and reading it as a beam put it at 3,333 DPS instead of ~300.
  const isBeam = w.beam != null;
  if (!isBeam && w.beamLifetime != null && w.category !== 'DeathExplosion') {
    issues.push(`${where} has a beamLifetime but no beam — the game fires it as a projectile`);
  }
  const beamLifetime = isBeam ? (w.beamLifetime ?? -1) : null;
  const projectile = isBeam ? null : projectiles.get(w.projectileTemplate);
  if (w.category !== 'DeathExplosion') {
    unreadWeaponFields(w, where);
    if (!isBeam && w.projectileTemplate && !projectile) {
      issues.push(
        `${where} fires projectile "${w.projectileTemplate}", which isn't in the build — it can't fire`,
      );
    }
  }

  const damage = w.damage ?? 0;
  // A projectile weapon with no projectile template can't fire (the host
  // dereferences it unguarded), and one with no muzzle bones fires nothing —
  // both template gaps rather than a genuine zero, so the DPS is unknown.
  const firesNothing = cycleMuzzleCount(w) === 0 || (!isBeam && !projectile);
  const sim = w.category === 'DeathExplosion' || firesNothing ? null : simulateWeapon(w, isBeam);

  return {
    damage,
    damageType: w.damageType ?? 'Normal',
    damageRadius: w.damageRadius ?? 0,
    reloadTime: w.reloadTime ?? 0,
    salvoSize: w.muzzleSalvoSize ?? 1,
    salvoDelay: w.muzzleSalvoDelay ?? 0,
    totalGroups: groups.length,
    // Muzzles that actually fire in one cycle, wrapping as the game does.
    shotsPerCycle: cycleMuzzleCount(w),
    // Seconds from one volley to the next on the game's own countdown — a
    // tick longer than reloadTime for some values (1s → 1.1s), exactly it for
    // others (2s). Null for a continuous beam.
    cycleTime: sim?.cycleTime ?? null,
    rangeMax: w.rangeMax ?? 0,
    rangeMin: w.rangeMin ?? 0,
    isBeam,
    beamLifetime,
    // -1 holds the beam on target indefinitely; a positive count is how many
    // ticks of damage it lands per volley.
    beamMode: !isBeam ? null : beamLifetime < 0 ? 'continuous' : beamLifetime === 1 ? 'pulse' : 'burst',
    // Beams apply damage along their length rather than launching anything, so
    // the speed on their controllers is a lead-calculation artefact, not travel
    // time. Reporting it would imply a flight time that doesn't exist.
    projectileSpeed: isBeam ? null : projectileSpeedOf(w),
    // A projectile template with a movement type is steered onto its target
    // each tick (TargetEntity etc.) rather than flying a ballistic arc. Its
    // projectileSpeed is the launch speed; the missile accelerates from there.
    homing: Boolean(projectile?.movement?.type),
    // Tracking speed applies to beams too — they still have to swing onto target.
    ...aimingOf(w),
    targets: w.layerTargetLimits ?? [],
    category: w.category ?? null,
    dps: damage > 0 && firesNothing ? null : round(sim?.dps ?? 0),
  };
}

// canBuild is a boolean tag expression. `*` is AND, `+` is OR, and parentheses
// group:
//
//   Tags.EDA * Tags.BUILDABLE_BY_T1_FACTORY * ((Tags.LAND * Tags.MOBILE) + Tags.LAND_FACTORY)
//
// i.e. a land factory builds EDA land units, or another land factory — that's
// the upgrade chain. An atom that names a template id rather than a tag matches
// that one unit, which is how in-place structure upgrades are written
// ("Tags.ugs2806"). 27 of the 69 expressions use the OR/parenthesis form; a
// naive split on `*` silently drops them, costing ~90 units their builders.
function compileTagExpression(src) {
  const tokens = src.match(/Tags\.[A-Za-z0-9_]+|[*+()]/g) ?? [];
  let pos = 0;

  // orExpr := andExpr ('+' andExpr)*
  const orExpr = () => {
    let node = andExpr();
    while (tokens[pos] === '+') {
      pos++;
      const [lhs, rhs] = [node, andExpr()];
      node = (u) => lhs(u) || rhs(u);
    }
    return node;
  };

  // andExpr := atom ('*' atom)*
  const andExpr = () => {
    let node = atom();
    while (tokens[pos] === '*') {
      pos++;
      const [lhs, rhs] = [node, atom()];
      node = (u) => lhs(u) && rhs(u);
    }
    return node;
  };

  const atom = () => {
    if (tokens[pos] === '(') {
      pos++;
      const node = orExpr();
      if (tokens[pos] !== ')') throw new Error(`expected ")" in: ${src}`);
      pos++;
      return node;
    }
    const token = tokens[pos++];
    if (!token?.startsWith('Tags.')) throw new Error(`unexpected "${token ?? 'end'}" in: ${src}`);
    const name = token.slice(5);
    return (u) => u.tags.includes(name) || u.id === name;
  };

  const matches = orExpr();
  if (pos !== tokens.length) throw new Error(`trailing tokens in: ${src}`);
  return matches;
}

function resolveBuildTrees(units) {
  const byId = new Map(units.map((u) => [u.id, u]));

  for (const builder of units) {
    const targets = new Set();

    if (builder.canBuildExpr) {
      try {
        const matches = compileTagExpression(builder.canBuildExpr);
        for (const candidate of units) if (matches(candidate)) targets.add(candidate.id);
      } catch (err) {
        // Never fail silently here — an unparsed expression means a builder
        // quietly loses its whole build list.
        issues.push(`${builder.id} has an unparseable canBuild (${err.message})`);
      }
    }

    // The canBuild expression also matches the structure's own upgrade target —
    // that's how the game surfaces the upgrade inside the factory's build menu.
    // But an upgrade transforms the structure in place; it is not the factory
    // constructing a sibling, so it stays out of builds/builtBy and is carried
    // by upgradesTo alone.
    if (builder.upgradesTo) targets.delete(builder.upgradesTo);

    targets.delete(builder.id);
    builder.builds = [...targets].sort();
  }

  for (const builder of units) {
    for (const targetId of builder.builds) byId.get(targetId).builtBy.push(builder.id);
  }
  for (const unit of units) unit.builtBy.sort();
}

// Big units mount the same gun several times — the Phoenix carries nine weapons
// that are really three designs, the T5 Hovertank eleven that are four. Listing
// each copy is noise, so identical entries collapse into one with a count.
function groupWeapons(weapons) {
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
function mainWeapon(weapons) {
  return weapons
    .slice()
    .sort(
      (a, b) => (b.dpsTotal ?? 0) - (a.dpsTotal ?? 0) || b.rangeMax - a.rangeMax || b.damage - a.damage,
    )[0];
}

// Build lists are resolved by matching tag expressions, so a wrong faction tag
// puts a unit in the wrong faction's factory. Two templates get this wrong:
//
//   ugl2806 "Relay"          tagged CHOSEN — its tag list is byte-identical to
//                            the Chosen sibling ucl2806, so the Guard variant
//                            was copied without changing the faction. It shows
//                            up under Chosen factories and is missing from Guard's.
//   ues1111 "Freeze Station" has no faction tag at all, so no builder expression
//                            can match it and nothing can build it.
//
// The id prefix is unambiguous in both cases, so correct from that and record
// it. When the templates are fixed upstream these stop firing and nothing about
// the output changes.
function normaliseFactionTag(tags, id) {
  const expected = FACTION_TAGS[id[1]];
  if (!expected) return tags;

  const present = tags.filter((t) => ALL_FACTION_TAGS.has(t));
  if (present.length === 1 && present[0] === expected) return tags;

  if (present.length === 0) {
    issues.push(`${id} has no faction tag — adding ${expected} from its id`);
  } else {
    issues.push(`${id} is tagged ${present.join('+')} but its id says ${expected} — corrected`);
  }

  return [...tags.filter((t) => !ALL_FACTION_TAGS.has(t)), expected].sort();
}

// A unit's tier is its TECH tag, cross-checked against the tiers that can build
// it. Units are routinely buildable one tier *below* their own — T4s come out of
// T3 engineers, T2 factories are built by T1 engineers — so a lower buildable
// tier is normal and expected (38 units).
//
// The reverse is contradictory: nothing can be TECH1 while only a T3 factory can
// make it. Exactly one unit trips this — uga3011 "TALEN", tagged TECH1 but
// buildable only from the T3 Air Factory. Everything else about it says T3: it
// costs 900 alloys / 18,000 energy / 6,000 hp, identical to the confirmed T3
// gunship Hornet and roughly 13x the real Guard T1 gunship CRISPR. Its internal
// name even collides with CRISPR's ("GuardT1Gunship"), which is the copy-paste
// that produced the wrong tag.
function resolveTier(tags, id) {
  const tech = tags.find((t) => /^TECH\d$/.test(t));
  const techTier = tech ? Number(tech.slice(4)) : null;

  const buildTiers = tags.filter((t) => /^BUILDABLE_BY_T\d/.test(t)).map((t) => Number(t.match(/T(\d)/)[1]));

  if (techTier == null || !buildTiers.length) return techTier;

  const minBuildTier = Math.min(...buildTiers);
  if (techTier < minBuildTier) {
    issues.push(
      `${id} is tagged TECH${techTier} but only a T${minBuildTier} builder can make it — using T${minBuildTier}`,
    );
    return minBuildTier;
  }
  return techTier;
}

function nonEmpty(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const entries = Object.entries(obj).filter(([, v]) => typeof v === 'number' && v !== 0);
  return entries.length ? Object.fromEntries(entries) : null;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function report(units, failures, payload) {
  const size = (fs.statSync(OUT_FILE).size / 1024).toFixed(0);
  console.log(`parsed:    ${units.length} units (${failures.length} failed)`);
  for (const f of failures) console.warn(`  ! ${f.id}: ${f.reason}`);

  const tally = (key) =>
    Object.entries(units.reduce((acc, u) => ((acc[u[key]] = (acc[u[key]] ?? 0) + 1), acc), {}))
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');

  console.log(`faction:   ${tally('faction')}`);
  console.log(`domain:    ${tally('domain')}`);
  const byStatus = (s) => units.filter((u) => u.status === s).length;
  console.log(
    `status:    ${byStatus('in-game')} in game, ` +
      `${byStatus('in-progress')} modelled but gated, ` +
      `${byStatus('no-model')} no model`,
  );
  console.log(
    `build tree: ${units.filter((u) => u.builds.length).length} builders, ` +
      `${units.filter((u) => u.builtBy.length).length} units reachable`,
  );
  console.log(`wrote:     ${path.relative(process.cwd(), OUT_FILE)} (${size} KB)`);
  if (payload.meta.isDemo) console.log('note:      demo build — balance values are not final');

  if (issues.length) {
    console.log(`\ngame data faults worked around (${issues.length}):`);
    for (const issue of issues) console.log(`  · ${issue}`);
  }
}

// This is the one script that needs a local game install, so when it can't find
// one, say so plainly instead of dumping a stack trace at whoever ran it.
try {
  main();
} catch (err) {
  console.error(`\nExtraction failed: ${err.message}\n`);
  console.error('This script reads the installed game and only runs locally —');
  console.error('production serves the committed public/ directory as-is.');
  console.error('To check the committed data instead, run: npm run verify\n');
  process.exit(1);
}
