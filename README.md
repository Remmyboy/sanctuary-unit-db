# SanctuaryDB

Tools for _Sanctuary: Shattered Sun_, generated directly from the game's own data
files. Among its pages:

- **/** — unit database: every unit with costs, stats, weapons and build trees
- **/calculator/** — build time, resource drain and economy planning

Built with [TanStack Start](https://tanstack.com/start) (React + TypeScript on
Vite). The content pages are prerendered to static HTML; the ladder, lobbies
and modding reference keep server routes, which Nitro packages as serverless
functions (see [Deploying](#deploying)). The game data pipeline is separate:
plain Node scripts that read a local game install and commit their output to
`public/`.

## Quick start

Needs Node 22.18+ (`engines` enforces it; `.nvmrc` pins 24, which CI uses).
The scripts import `.ts` modules from `src/lib/` directly, which relies on
Node's built-in type stripping, unflagged from 22.18. Vite 8 itself needs
22.12+.

```bash
npm install
npm run dev       # Vite dev server at http://localhost:5173
npm test          # unit tests: calculators, data invariants, extractor maths, SQL migrations
npm run typecheck # tsc
npm run build     # prerender the content pages, bundle the server into .output/
npm run verify    # check public/ data + art are complete (no game needed)

npm run refresh   # extract + icons + diff: regenerate data from a local game install
```

`refresh` is `npm run extract` (game data → `public/data/units.json`), then
`npm run icons` (`icons-src/` → `public/icons/`, plus both manifests), then
`npm run diff`, which reports what changed against the committed units.json —
balance tweaks and new units by name, so an extractor regression stands out.

`extract` finds the game automatically by reading Steam's `libraryfolders.vdf`,
preferring the Playtest branch over the older Demo when both are installed. If
it can't (non-standard install, or you copied the files elsewhere), point it
manually:

```bash
SANCTUARY_PATH="D:/SteamLibrary/steamapps/common/Sanctuary Shattered Sun Demo" npm run extract
```

### Remmy's Balance Patch

The database's **Balance Patch** switch (`?balance=remmy` on `/`, `/calculator`
and `/compare`) swaps in `public/data/units-balance-patch.json`: the same units
with the patch's changes applied to the game's templates, and every number
derived again, so DPS, tiers and build trees follow the patch. `/balance-patch`
lists every change.

Both come from `src/lib/balance-patch.json`, the change list the mod exports
(`node BalancePatch/tools/preview.mjs --json` in sanctuary-mods). For a new
release of the patch:

```bash
npm run balance-patch -- <path to BalancePatch/balancepatch.json>
npm run extract
```

then bump `BALANCE_PATCH.version` in `src/lib/mods.ts` (a test checks the three
agree). `extract` warns, and leaves the change out, when a change's game value
no longer matches the install: the game moved on since the patch was made.

### Maintaining modding snapshots

Each release gets an immutable URL namespace under
`src/content/modding/docs/<game-version>-<steam-build>/`. Add and order its MDX
pages in that directory's `meta.json`, add matching build metadata under
`src/content/modding/snapshots/`, then register the snapshot in
`src/content/modding/registry.ts`. The highest numeric Steam build becomes the
default; array order does not control it.

Every MDX page needs `title`, `description`, and `navTitle` frontmatter. Keep
links snapshot-relative so the version switcher can preserve the current page.
Corrections to an old snapshot should stay scoped to what was true for that
inspected build; new game behavior belongs in a new snapshot. Unit tests reject
missing metadata, broken internal links, duplicate builds, and navigation drift.

## Ranked map previews

The match room shows the matched map as a picture, not just a name. Every map
the game ships carries its own `preview.png` — the top-down terrain render its
generator wrote — and this copies the ranked pools’ art out of a local install
into `public/ladder-maps/<slug>.png`:

```bash
npm run mappreviews                       # every map in the pools
npm run mappreviews -- "Some Other Map"   # ...plus one added to a pool since
```

The pool names come from `src/lib/ladder-maps.ts` (the offline mirror of the
`ladder_maps` table), and the file name from `mapPreviewSlug` in that same
module, so the site can find the art from a map name alone. They go through
`scripts/png.js` box-averaged down to 320px — big enough for the match room,
small enough that 27 maps are 3 MB rather than 14.

Live pools are curated from `/ladder/admin`, so a map can join one without art
in the repo. That is not an error: the match room shows the name on its own.
`npm run verify` lists any pool map missing a preview; re-run the script and
commit `public/ladder-maps/` to fix it.

### Players on the map

The same run writes `public/ladder-maps/spawns.json`: where each army starts,
as a fraction of its preview image. It comes from `markers.Spawn` in the
`.sanmap` beside the art — the very markers the preview has numbered circles
drawn on — so a name can be put on a start and land on the right circle. Two
conversions do the work, both in `readSpawns`: the preview frames the
**playable area** rather than the whole map (the hand-made maps centre a 256
playable square in a 512 map), and world Z runs up the image while CSS Y runs
down it, so Z is flipped.

Each player is drawn as their Steam avatar on their start, sitting over the
circle the game numbered there, with their name beside it — yours ringed in the
accent colour. A player with no avatar (or one Steam won't serve) falls back to
a plain ring.

Every 1v1 is given its two start positions at pairing (`match_participants.slot`,
migration 0013). An auto-launched lobby sets them for real; a manually hosted
one is only asked to — the room says "you're slot 1, Skoub is slot 2" and the
map shows it, but players seat themselves and some won't. That is fine: the
game is played wherever they actually start, and the slot claims nothing about
the result.

A slot is **not** a team number. `pair_queue` shuffles the two independently of
the rating split and of who hosts, so that hosting never comes with a fixed
spawn — team 1 is as likely to be slot 2 as slot 1. The mod is handed the
mapping explicitly (`slots` in the match object) rather than inferring it.

Team modes get no slots at all, so a 2v2 or 3v3 preview stays a plain picture
with the game's own numbered circles. Their maps don't order armies by team, so
handing out 1–6 at random would scatter teammates across the map; doing it
properly needs per-map knowledge of which starts share a corner.

## Pages

Routes are files in `src/routes/` (TanStack Router file-based routing). The
content pages are prerendered at build time and hydrate into an SPA; the
match room and player profiles render on request.

| Page                        | Route file                    | What it does                                                |
| --------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `/`                         | `index.tsx`                   | Unit database — the aligned faction board                   |
| `/compare`                  | `compare.tsx`                 | Units side by side, best value lit                          |
| `/calculator`               | `calculator.tsx`              | Build time, drain and economy planning                      |
| `/mods`                     | `mods.tsx`                    | UI mods: the sanctuary-mods catalogue and installs          |
| `/gameplay-mods`            | `gameplay-mods.tsx`           | Zone Control and Phantom-X (`/zone-control` redirects here) |
| `/lobbies`                  | `lobbies.tsx`                 | Open custom-game lobbies, live from Steam's server list     |
| `/play`                     | `play.tsx`                    | Ladder queues, your open match, the reporter mod            |
| `/ladder`                   | `ladder.tsx`                  | Standings per mode plus the overall                         |
| `/ladder/match/<id>`        | `ladder_.match.$matchId.tsx`  | The match room: map, teams, host, report/confirm/dispute    |
| `/ladder/player/<id>`       | `ladder_.player.$steamId.tsx` | A player's ratings, history and rating graphs               |
| `/ladder/admin`             | `ladder_.admin.tsx`           | Disputes, live games, test-game deletion, map pools         |
| `/modding/<version>/<page>` | `modding.$version.$.tsx`      | Versioned modding reference (`/modding` goes to the newest) |
| `/sitemap.xml`              | `sitemap[.]xml.ts`            | Sitemap on the `SITE_URL` origin                            |

The `api.*.ts` files are server-only routes: Steam sign-in, the lobby list,
queue counts, the game-version check, the reporter and the mod's matchmaking
API.

All UI state lives in the URL as typed search params — filters, sort, the open
unit, the calculator setup — using the same param names and encoding as the
pre-framework site, so old shared links keep working. The router uses a custom
search serializer (`src/router.tsx`) because every param here is a plain
string and the default would JSON-quote numeric-looking values.

`src/components/Header.tsx` renders the shared chrome and publishes the
measured header height as `--header-h` so the sticky sidebar and column
headers line up without a hard-coded offset that drifts whenever the chrome
changes.

Adding a page means a new file in `src/routes/` and an entry in the header's
`NAV` list, under the group it belongs to. Top-level pages open with
`<PageHead>` (eyebrow, title, one-line lede, optional figures on the right)
above their sticky `.toolbar`; [docs/design-system.md](docs/design-system.md)
covers the tokens, type and shared pieces.

## The calculator

Everything comes from the formulas the schema documents, so the numbers match
the game rather than being modelled:

```
seconds        = buildTime / total build power      (assisting builders add up)
drain per sec  = cost / seconds
```

So three T2 engineers (10 build power each) on a T3 Land Factory — 4,200 build
time, 2,000 alloy, 20,000 energy — take 140s and draw 14.29 alloy/s and 142.86
energy/s.

**Who can build what is not a free choice.** Every unit carries a `builtBy` list,
resolved from the builders' `canBuild` tag expressions, so a T1 air factory
cannot start a T4 bot — the Ares can only be begun by a Chosen T3 Engineer or T3
Engineering Station. The builder picker is limited to that list and re-checks
itself whenever the target changes, including when restoring from a URL.

**Assisting a construction is gated on reach, not on the Assist order.**
`construction.range` is what lets a unit pour build power into someone else's
build. A factory has 10 build power but no range, so it contributes nothing to a
construction. Exactly **22 units have a range**: the commanders, the engineers
and the engineering stations.

The `Assist` order on the other 42 builders is not wrong, it describes a
different mechanic — ordering a factory to assist another factory copies its
build queue rather than helping construct anything. Both fields are meaningful;
only `construction.range` is the one that adds build power, which is what the
calculator is measuring.

Both pickers are inline dropdown panels with a search field and icon rows; a
plain select over a couple of hundred units is unusable.

The economy panel sums `production`, `maintenanceConsumption` and `storage`
across a set of structures. Those values are already per second in the templates
(`resourceEntity.lua` divides them by `Constants.TickRate` internally).

The third panel is the one worth having: it compares build drain against net
income and stretches the build time by the shortfall, since a build that outruns
your economy stalls rather than failing. That 140s factory takes **16m 40s** on
four extractors and two T1 generators.

Setups are kept in the URL, so a build can be shared or bookmarked.

### Build order

The **Build order** mode plans a queue instead of a single build: pick a builder
(the commander by default), queue structures in order, and it reports when the
queue finishes, what it cost, and what it did to the stockpile. The economy
changes as the queue runs, so this steps through time at 10 ticks a second
instead of using one formula. `simulateQueue` in `src/lib/calc.ts` does the work:

- The run starts from the faction's commander (+5 alloy/s, +50 energy/s,
  500/5,000 storage) plus anything under "Already built". The stockpile starts
  full unless you change it.
- Each finished structure adds its production, upkeep and storage from that
  moment on.
- When the stockpile can't cover a tick's drain, progress slows to the fraction
  it can pay for. Builds stall and slow down; they don't fail.
- Walking between build sites and adjacency discounts are not modelled.

The commander's 5 build power drains exactly its own income on any T1
structure, so the classic opening (land factory, three generators, three
extractors) takes **1m 30s**, costs 450 alloy / 4,500 energy, and never touches
the stockpile. Add assisting engineers and the stockpile starts to drain.

Build-order state uses its own params: `m=q`, the queue `q` (ordered `id:count`,
repeats allowed), the builder `b`, and the starting stockpile
`s=alloy:energy`. Assists (`a`) and economy (`e`) are shared with the
single-build mode.

## Adjacency

`host/systems/adjacencyBuffs.lua` defines bonuses structures pass to neighbours.
It isn't a plain literal — `targetTags` are Lua expressions like
`Tags.FACTORY + Tags.ENGINEERING_STATION` — so `readAdjacencyBuffs` reads each
block with a regex instead of the table parser.

29 units grant a buff, across six types:

| Source                              | Effect                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Alloy Extractor                     | −10% alloy build cost to adjacent factories / engineering stations              |
| T1/T2/T3 Energy Generator           | −2.5% / −10% / −15% energy build cost, and the same off radar and shield upkeep |
| T1 Alloy Storage, T1 Energy Storage | +20% storage to adjacent storage of the same kind                               |

Several buffs defined in that file are wired to no unit at all (the alloy
fabricators, T2/T3 storages), so they're dropped rather than advertised as live.
The effect is shown on the granting structure, since that's the side the
templates describe.

## Standing economy

A unit's build cost is a one-off; 51 units also have a rate that runs forever
after, and that's usually the number that decides whether you can afford them.
A T3 Shield is 600 alloy once and **250 energy every second** thereafter.

There are **three** roles here, not two, and the game picks between them purely
on which economy blocks a template has
(`host/units/unitsClasses/unitsBaseClass.lua:630`):

| ResourceEntity | Template has                  | Count | Reads as        |
| -------------- | ----------------------------- | ----- | --------------- |
| `generation`   | `production` only             | 22    | free income     |
| `production`   | both                          | 3     | a **converter** |
| `consumption`  | `maintenanceConsumption` only | 26    | pure upkeep     |

The middle case is the one worth separating out. A converter's output is scaled
by how well its input is met — `ResourceEntity.productionMultiplier` is
documented as "Lowest satisfaction of all consumed resources" — so the Alloy
Furnace's 10 alloy/s is what its 1,000 energy/s _buys_, not a bonus on top of
it. Listing those as a "Produces" line and an "Upkeep" line reads as a generator
that happens to cost something, which is exactly backwards, so the furnaces get
a conversion line instead.

`narutalProducer` (sic) on a template would force the free-income case even with
a consumption block. No template in the current data sets it, so the rule above
is exactly the game's.

Note that extractors and generators are _not_ on this list as consumers — they
draw nothing. Only radar, sonar, shields, stealth fields and the furnaces do.

## Upgrades cost the target's full price

An in-place upgrade is not a discounted transform, and nothing is refunded for
the structure it replaces. `UpgradeBehaviorThread`
(`host/units/unitsClasses/unitsDefault.lua:177`) calls `CreateUnit` for the
target at the structure's own position and then builds it like any other unit,
and that unit's construction entity is charged its own template cost and build
time (`unitsBaseClass.lua:155`). So the upgrade price is simply the target's
cost — a T1 Alloy Extractor reaching T2 pays the T2's full 600 alloy and 6,000
energy.

What differs from an ordinary build is who supplies the build power: **the
structure raises its own replacement**, so the wall-clock time is
`target.buildTime / source.buildPower` — 600 / 5 = 120s for that extractor,
drawing 5 alloy/s and 50 energy/s. Engineers can assist, since the half-built
upgrade is an ordinary buildable.

That is also the whole reason a radar or an extractor carries build power at
all. All **33** units with build power and an empty `builds` list have an
`upgradesTo` (`economy.test.ts` pins this), so the number is an upgrade rate,
not a builder stat — showing it in the economy list implied a capability those
structures don't have, so it moved into the upgrade block where it explains the
time. Real builders keep it.

## Where the data comes from

### Which game version

The game has no version string of its own — Unity's `bundleVersion` is a
permanent `1.0` and nothing in the Lua tree names a release — so the **Steam
build id** is the version. `extract.js` reads it from the
`appmanifest_<appid>.acf` beside the install and records it as `meta.game`
in `units.json` (and in the tiny `public/data/version.json`), and every data
page's toolbar shows `Build 25114838 · 4 Sep 2026`: the build the numbers came
from, and the day they were extracted. Hover it for detail.

The dot next to it is live. `GET /api/game-version` is a public, CORS-open
endpoint (cached five minutes) that answers with both halves:

```json
{
  "appId": 4511930,
  "branch": "public",
  "data": { "buildId": 25114838, "updatedAt": "…", "generatedAt": "…", "unitCount": 295 },
  "live": { "buildId": 25114838, "updatedAt": "…" },
  "upToDate": true
}
```

Valve publishes no key-free way to read a branch's build id, so `live` comes
from [api.steamcmd.net](https://api.steamcmd.net), a public mirror of
`app_info_print`. When that lookup fails `live` is `null`, `upToDate` is `null`
and the dot goes grey; the data half is always served. Anything — the in-game
mod, a bot — can poll the same URL to see whether a patch has outrun the site.

**The install ships two complete Lua trees, and they disagree.** This caught me
out, so read this before changing any path:

|                      | `engine/LJ/lua`                                     | `prototype/RuntimeContent/Lua`          |
| -------------------- | --------------------------------------------------- | --------------------------------------- |
| Balance data         | **newer** (Aug 12)                                  | older (Jul 22, untouched since install) |
| `availableUnits.lua` | 295 entries, `OK` / `NO_MODEL` / … `(DEMO_UI_ONLY)` | 270 entries, freeform notes             |
| `canBuild` grammar   | AND, **OR and parentheses**                         | AND only                                |
| Maps                 | 93                                                  | 0 (baked into `level0–10` scenes)       |
| Unit models / icons  | Playtest: `Sanctuary_Data/Gamedata/*.sanpack`       | Demo: `level0–10` scenes                |

89 of 283 units differ on cost, health or build time — the Tempest is 3000 HP in
one and 6000 in the other. The extractor reads **`engine`** for unit data. Set
`SANCTUARY_TREE=prototype` to read the older data for comparison.

Where the art lives moved between branches: the Demo bakes unit LODs into
Unity's `level0–10` scene files, while the Playtest — which ships no
`prototype` tree at all — packs them into `Sanctuary_Data/Gamedata/*.sanpack`.
`scanUnitModels` reads both, in chunks, since one of those packs is 1.4 GB and
does not fit in a single JS string. That scan decides `status`, so if a refresh
ever reports every unit as `no-model`, look there first.

Under whichever tree, the files used are:

| Path                             | What it gives us                                                  |
| -------------------------------- | ----------------------------------------------------------------- |
| `unitsTemplates/<id>/<id>.santp` | One file per unit — cost, health, weapons, movement, tags         |
| `availableUnits.lua`             | QA sign-off status per unit, with reason codes (engine tree only) |
| `templateExplainations.lua`      | The devs' own annotated schema, including the build-time formula  |

Every `.santp` is a pure Lua table literal — no functions, requires or
conditionals — so `scripts/lua-parser.js` reads them directly. All 283 templates
parse with zero failures; anything that isn't a plain literal throws rather than
silently producing a wrong number.

## The aligned faction board

The site lays units out as three faction columns with equivalent units on the
same row, so you can compare a T1 engineer across all three at a glance.

That alignment comes from the ids themselves. Templates are named
`u<faction><domain><code>`, so `uel1001` / `ucl1001` / `ugl1001` are the same
roster slot — Puma, Gladius and Gimlet. Dropping the faction letter gives the
row key. 80 of 113 slots have all three factions; where one is missing the cell
is left as a dashed placeholder rather than closing the gap, so the hole is
visible.

Eleven slots have factions that diverge in purpose (one gets a repair station
where another gets a shield booster). The row takes the most common label and
each card keeps its own name, so the divergence shows rather than hiding.

Sorting by a metric reorders whole rows — ranked by their most extreme member —
so the alignment survives sorting.

**Commanders are their own class.** The templates tag them `TECH1`, and `tier`
in the data says 1 because that's what the game says, but nothing about a
commander is T1: every army starts from one, it builds and fights, and there's
one per faction. So the site keys them on the `COMMAND` tag (`isCommander` in
`src/lib/format.ts`). They get a row ahead of the T1 land units, their own
"Commander" chip in the tier filter (`?tier=cmd`), a "Commander" badge instead
of "Tier 1", no "T1" before their name anywhere, and the detail panel ranks
them against the other two commanders rather than a field of T1 tanks.

### Compact view

**Cards | Compact** in the toolbar (`?view=compact`) swaps the cards for small
tiles, in the spirit of the FAF unit database, so the whole roster fits on one
screen. It's the same aligned rows turned sideways: each faction is a row and
each slot a column, so equivalents stack vertically. The board is cut into
blocks that wrap, one per domain and tier (`compactBlocks` in
`src/lib/board.ts`); in a metric sort, where tiers interleave, it's runs of 12
slots labelled by rank instead. A slot where one faction has two units spans
two columns for everyone, and missing units leave a dashed hole, as on the
cards.

Tiles show the game's 64px render (the size it was made for) with the
strategic icon in the corner. The numbers move to a strip above the tiles that
follows the pointer and keyboard focus; a click opens the usual detail panel.
Reset clears the filters but keeps the view.

### Comparing units

**Compare** in the board's toolbar turns on compare mode: a click on a card or
tile then picks it instead of opening it, and a tray along the bottom holds the
picks (up to 6) with the way through to `/compare`. The detail panel's
**+ Compare** button adds a unit without entering the mode. Escape leaves it.
The picks live in the board's URL (`?compare=a,b`), so they survive switching
view, filtering, and a round trip to the comparison.

`/compare?units=a,b,c` puts them side by side: a column per unit and a row per
stat, grouped as cost, durability, combat, economy and mobility, with each
unit's weapons listed underneath. A row only appears if one of the units has a
value for it, and the best value in each row is lit, lowest for costs and
upkeep and highest for everything else. Nothing is lit on a tie or when only
one unit has the stat. The rows and that rule are in `src/lib/compare.ts`. The
link carries the picks, so a comparison can be shared.

Each figure has a hairline bar under it, as long as it is against the row's
largest, so magnitude reads at a glance and not just the winner. Rows that
would only be abstract lead with what the number means in play and keep the
template value underneath: speed says how long a 512 map takes to cross, and
acceleration and turn rate become "top speed in 1.3s" and "turns about in 4s".
DPS is split into ground and air when the two differ.

**Chase** under the table sets two of the compared units loose on open ground,
one side chasing the other, with their weapon ranges drawn round them — the
Kodiak running down a kiting Longbow, say. Each side can be a group of up to
20, laid out a few abreast. It animates the samples from `simulateChase` in
`src/lib/chase.ts` and sums the run up underneath: when (or whether) the
chasers get in range, how long the targets were shooting first, what that
cost, and who was lost when.

Every unit fights for itself: it shoots the nearest enemy its guns reach, so
the front of a group soaks the fire and falls first, and it stops advancing
only once something is in its own range — the ones behind keep coming up
until they can shoot too, queueing behind their own front rank rather than
walking through it. Only weapons that can hit the other's layer count, a
runner only shoots back with turrets that turn all the way round, and an
attack order stops at range rather than ramming. It leaves out shields,
turning and shell flight time, and says so. One Longbow kites one Kodiak to
death; five Kodiaks still can't catch three; ten catch one at 89s for the loss
of a tank. Units that would read the same — every commander is just
"Commander" — get their faction in front ("EDA Commander") so a mirror match
says who is who.

### Game units, made readable

Every distance in the templates is in game units and every speed in game units
per second, which is exact and tells nobody anything. `src/lib/scale.ts` turns
them into things a player can picture, using a 512 map (most of the ranked 1v1
pool) as the yardstick and a T1 tank, about one unit long, as the ruler: time to
cross a map, to top speed, to turn about, for a shot to reach max range. The
detail panel ranks speed against every in-game unit that moves the same way
("faster than 39% of ground units"), and a peer section strips each headline
stat against the unit's signed-off peers — each a dot you can click through
to.

Peers share a **class** as well as a domain and tier (`unitClass` in
`scale.ts`), since a tank against an engineer on DPS says nothing. Classes come
from the role the game assigns through each unit's strategic icon, with thin
roles folded together so each tier has enough to rank: combat (direct fire and
artillery), anti-air, anti-naval, engineers, intel (scouts, radar, the
transmitter), shields, economy (alloy and energy), factories, and commanders. A
T1 tank is ranked against the other T1 combat units, engineers against
engineers on build power. A stat every peer ties on is dropped, so identical
units such as the three factions' T1 engineers show no strips at all.

## How derived values are calculated

Most fields are copied straight across. Several are computed, and the assumptions
matter if you're using this for balance work:

**DPS.** A tick-for-tick port of the weapon state machine the game actually
runs — `HostWeapon:Update` in `host/units/weaponsClasses/weaponsBaseClass.lua`
(`simulateWeapon` in `scripts/extract.js`) — with the target held in the
sights and every shot landing. It started as a port of the AI's
`GetWeaponDamagePerSecond`, and every one of these was a way that got it wrong:

1. **Beam `damage` is per tick, not per shot,** and the game runs at
   `Constants.TickRate = 10`. `beamLifetime` says which kind:
   `-1` continuous (`damage x muzzles x 10`, **reloadTime is irrelevant**, and
   only the first muzzle group ever fires), `1` pulse — one tick per volley,
   `N` burst — N ticks per volley. Auger is a continuous beam: 25.64 x 10 =
   **256.4 DPS**, not 25.64/3 = 8.5.
2. **A weapon is a beam only if it has a `beam` table.** That is the game's own
   test (`common/utilities/beams.lua`). `beamLifetime` alone means nothing: the
   Engraver keeps a stale `-1` from when it was a beam but fires projectiles,
   and reading it as a beam listed it at 3,333 DPS instead of 303 — ten times
   its sibling AA turrets.
3. **Salvo indices wrap around the muzzle groups.** A weapon with a salvo of 20
   over 1 group fires that group 20 times a cycle. Capping at the group count
   put Quasar at 18.75 DPS instead of 375.
4. **Reload runs concurrently with the salvo, SupCom-style.** The state machine
   resets `reloadTimer` as the salvo _starts_ and keeps counting it down while
   the salvo plays out, so the cycle is `max(reload, salvo stretch)`, not their
   sum. The AI's `GetWeaponDamagePerSecond` adds them, which would break the
   Chosen Commander's two barrels (0.5s apart, 1s reload) into
   fire-fire-pause. In game they alternate with no pause (see point 5 for the
   exact gaps).
5. **Timers move in 0.1s ticks, as doubles, and fire at `<= 0`.** Each tick
   subtracts `Constants.TickTimeStep` (0.1), and whether a reload gains a tick
   depends on where that floating-point countdown happens to land — there is
   no rounding rule. Ten subtractions leave 1.0 at 1.4e-16, not zero, so a
   **1s reload fires every 11 ticks (1.1s)**. In the current data 0.25, 0.4,
   0.5, 0.8, 1, 1.2, 3.25, 5, 6, 7, 8, 10, 12, 15 and 16s each gain a tick;
   0.2, 0.3, 1.4, 1.5, 1.6, 1.8, 2, 2.2, 2.5, 3, 4 and 22s come out exact.
   That's up to 20% on fast-firing weapons (Jager 100.8 → 84) and about 1% on
   slow ones. The extractor steps the game's own countdown rather than applying
   a formula, and stores each weapon's real volley-to-volley time as
   `cycleTime`.

   **Measured in game (build 25474094),** by logging every shot the host sent
   in a skirmish against the AI, to the tick:

   | Unit                 | Shots | Measured                                                                    | Data             |
   | -------------------- | ----- | --------------------------------------------------------------------------- | ---------------- |
   | Chosen Commander, 1s | 98    | each barrel every 11 ticks, 48/48 gaps; the two barrels 0.6s and 0.5s apart | 1.1s, 90.91 DPS  |
   | EDA Commander, 2s    | 68    | a 2-shot burst every 20 ticks, no exceptions                                | 2.0s, 100 DPS    |
   | Jager, 0.5s          | 112   | every 6 ticks, 110/111 gaps (one 7: a retarget)                             | 0.6s, 84 DPS     |
   | Stitcher, 0.5s       | 112   | every 6 ticks, 111/111 gaps                                                 | 0.6s, 133.33 DPS |
   | Hyena                | 1,457 | a shot every tick                                                           | 0.2s, 78.6 DPS   |

   Not yet timed live: the Guard Commander, and any 5s reload.

6. **Fields no game code reads are ignored.** `damageOverTimePulse*`,
   `chargeTime`, `impactDelay`, `damageBox` and `useDamageCollider` are
   documented and set on a few templates, but appear in no runtime Lua and not
   in the compiled engine (`Trebuchet.dll` holds none of the names). Counting
   damage over time put the Onager at 925 DPS; it deals 520.

The extractor reports each template that trips 2 or 6 in `meta.dataIssues`.
The pinned values in `board.test.ts` (Kodiak 342.91, Chosen Commander 90.91,
Engraver 303.03, Onager 519.8, Jager 0.6s) move only with a real balance
change or a regression.

**Weapons that can't fire.** Four bomber weapons (Meteor, Inertia, Impulse,
TALEN) declare an empty `muzzles` list, the Laser Bomber's weapon has no muzzle
groups at all, and the Spitter fires a projectile (`pei211`) that isn't in the
build. None of them can put a shot out, but that's a template gap rather than a
genuine zero, so they report `dps: null` and render as "dps unknown".

**Health regen** (`defence.health.regen`, HP per second) is carried as
`healthRegen`; 101 units have it. Nothing in the Lua switches it off, and the
game's own information panel reads it straight from the template.

### Which units are actually in the build

Availability is a **three-way** status, from two independent signals.

**Signal 1 — does it have art?** A unit's mesh, material and textures are all
named `<tpId>_lod<n>`, so scanning the `level*` scene files gives a verifiable
list of what would render:

```
u[ecgw][lans]\d{4}(?=_lod\d)
```

226 of 283 units. `extract.js` does this itself in about a second — a plain
string scan, no asset tooling. That's the `hasModel` field.

**Signal 2 — is it signed off?** The engine tree's `availableUnits.lua` is a
live QA tracker, not the stale list the prototype tree carries. Its reason codes
line up with the shipped art almost exactly:

| Reason                        | Count | Have art |
| ----------------------------- | ----- | -------- |
| `OK` / true                   | 140   | 140      |
| `OK_PENDING_APPROVAL` / false | 64    | 64       |
| `NO_MODEL` / false            | 61    | 5        |
| `OK` / false                  | 9     | 9        |
| `BONE_MISSMATCH` / false      | 7     | 7        |
| `BATTLE_NO_DAMAGE` / false    | 1     | 1        |

So the boolean means _"signed off and enabled"_, not _"exists"_ — the non-`OK`
codes describe units that are modelled but gated. Crossing the two gives:

- **`in-game`** (140) — has art, signed off and enabled
- **`in-progress`** (86) — has art, but gated: pending approval, rigging
  mismatch, or no damage state. `statusReason` carries which.
- **`no-model`** (57) — nothing to render

The Availability filter defaults to `in-game`. In-progress units keep their
faction colour and carry a `WIP` tag with the reason on hover, since they have
real art and real numbers — only `no-model` units are dimmed.

Note the prototype tree's copy of this file is _not_ usable this way: it uses
freeform notes that contradict themselves (`ugl2002 = false, -- model exist`).
The three-way split only works against the engine tree.

### Which weapon block is live

Templates carry **two** weapon representations, and they disagree — 40 of 75
comparable units differ on primary-weapon damage, 22 on reload, 20 on turn rate.
Reading the wrong one gives plausible but wrong numbers throughout, so this is
worth knowing before touching anything weapon-related.

The top-level `weapons` array is current. `turrets` is legacy:

- `templateExplainations.lua:376` opens a section commented `-- Old format, still
have some leftover stuff`, and `turrets` (line 414) is inside it.
- The same file documents the current schema with LuaLS annotations —
  `---@class WeaponTemplate` and `---@field weapons WeaponTemplate[]?`.
- `templateUpdater.lua` has `UpdateWeaponFormat`, a migration that builds
  `tp.weapons` from `tp.turrets` and ends with `tp.weapons = newWeapons` followed
  by a commented-out `--tp.turrets = nil`. That's why both blocks still exist.

The runtime settles it: the host builds every unit's weapons from `tp.weapons`
(`SetUpWeapons` in `host/units/unitsClasses/unitsBaseClass.lua`), and nothing in
the host reads `turrets` any more. Beam weapons don't exist in the old format at
all, and several units including two Commanders have `weapons` with no
`turrets` block. This project reads `weapons` throughout.

**Turn rates.** Two separate things, both surfaced:

- _Unit_ turn rate is `movement.rotationSpeed`, in degrees per second (10–300
  across the roster).
- _Weapon_ turn rate comes from `aimControllers`, split by axis: controllers
  bound to a `yawBone` traverse, those bound to a `pitchBone` elevate. Most
  common speed per axis wins, same tie-break as projectile speed. Range is
  5–360°/s. Deliberately **not** `turrets[].turnRateDegreesPerSecond`, which is
  the legacy value and disagrees on 20 weapons.

`yawMin`/`yawMax` give the traverse arc. Most turrets are a free-spinning 360°;
anything less is flagged "(limited)", and a weapon with no yaw controller at all
is a fixed forward mount — the EDA Commander's gun only elevates.

**Weapon grouping.** Big units mount the same gun many times: the Phoenix lists
nine weapons that are really three designs, the T5 Hovertank eleven that are
four. Identical entries collapse into one carrying a `count`, so every unit in
the data has at most four distinct weapons and the UI can show all of them
rather than picking a "main" one. Each group reports `dps` per instance and
`dpsTotal` for the group; the unit's `dps` is the sum of the totals.

One weapon — the Phoenix's `AOEDelayedCluster` — has `damage = 0` because it
uses `useDamageCollider`, meaning damage comes from the projectile rather than
the weapon entry. It's shown as "damage on impact" instead of a bare zero.

**Projectile speed.** Not on the weapon, and not on the projectile template —
those are visuals, audio and collision only. It lives on the weapon's
`aimControllers`, and a weapon can have several:

```
ucl4002 aim[0]  speed 30  solver LowArc   aimBone Turret01_Yaw01     <- turret yaw
        aim[1]  speed  6  solver HighArc  aimBone Turret01_Muzzle01  <- real firing solution
        aim[2]  speed  6  solver HighArc  aimBone Turret01_Muzzle04
```

The yaw controller carries a coarse lead estimate; the muzzle-bound ones carry
the actual value. So the extractor prefers controllers whose `aimBone` names a
muzzle and takes the most common speed among them, breaking ties low. Five
weapons in the current data have controllers that disagree this way.

Two exclusions:

- **Beams** report `null`. They apply damage along their length rather than
  launching anything, so their controllers' speed is a lead artefact, not travel
  time. 12 units are beam-only and have no projectile speed at all.
- **The T1 Bomber** declares `0.0001`, meaning the bomb drops under gravity. Every
  genuine speed in the data is ≥ 5, so anything below 1 is treated as absent.

The unit-level `projectileSpeed` is the main weapon's, ranked by DPS _among
weapons that actually fire a projectile_ — so a unit whose highest-DPS weapon is
a beam still reports its cannon rather than nothing. Both the cards and the
detail panel list every weapon separately, so nothing is hidden behind that pick.

**Death explosions.** Templates list these in the `weapons` array with
`category = "DeathExplosion"`. They only trigger on death, so they're pulled out
into a separate `deathExplosion` field and excluded from DPS and range.

**Build tree.** `construction.canBuild` is a boolean tag expression. `*` is AND,
`+` is OR, and parentheses group:

```
Tags.EDA * Tags.BUILDABLE_BY_T1_FACTORY * ((Tags.LAND * Tags.MOBILE) + Tags.LAND_FACTORY)
```

A land factory builds EDA land units _or_ another land factory — that second
branch is the upgrade chain. 27 of the 69 expressions use the OR form, and they
only appear in the `engine` tree; `prototype` uses AND alone. Splitting on `*`
parses them into nonsense and costs ~90 units their builders, so this is a real
recursive-descent parser (`compileTagExpression`), and an expression that fails
to parse is reported rather than silently yielding an empty build list.

An atom naming a template id rather than a tag (`"Tags.ugs3805"`) matches that
one unit — that's how in-place structure upgrades are written. Each builder is
evaluated against every unit to produce `builds`, which is inverted to give each
unit its `builtBy`, and `upgradesTo` is folded in too.

Build time is stored in build-power-seconds, so wall-clock time depends on the
builder: `buildTime / builder.buildPower`. The detail panel shows this per builder
rather than a single misleading number.

`upgradesTo` is folded in here but priced separately — see
[Upgrades cost the target's full price](#upgrades-cost-the-targets-full-price),
since an upgrade is paid for by the structure itself rather than by a builder.

## Icons

The site uses the game's own strategic icons, with a generated SVG fallback for
the handful of combinations the game never shipped. 269 of 283 units get real
artwork; the other 14 are disabled naval and T4 structures whose icons don't
exist in the build.

**The `iconUI` field in the templates is dead.** It names files like
`tech1_land1_direct.png` which appear nowhere in the game — the string doesn't
occur in any asset file or in `GameAssembly.dll`. `templateControl.lua` has it
commented out and `selectionSystem.lua` carries a "remove this once icons are
updated" TODO. Don't build anything on it.

What the game actually does is composite icons at runtime from the three parts:

```lua
-- unitsBaseClass.lua
local imageName = string.format("%s_%s_%s_normal", iconTp.shape, iconTp.tech, iconTp.symbol)
self:AddIcon("StrategicIcon", "Unit", imageName, self:GetColor())
```

So the real assets are named `land1_t1_direct_normal` — shape, tech, symbol, in
that order — and live in the `level*` scene files, not in `resources.assets`.
Each has four states (`normal`, `over`, `selected`, `selected_over`); only
`normal` is used here.

They are **two-tone tint masks**: magenta marks the region the game recolours
with the player's colour (note `GetColor()` above), black is the glyph and
outline. Shipped as-is they render as magenta squares, so `npm run icons` bakes
one copy per faction using the palette in `src/lib/faction-colours.ts`.

### Re-extracting

`icons-src/` holds the 136 extracted masters and is committed, so `npm run icons`
works on a clean checkout. You only need to redo the extraction if the game's
art changes — which is rare, unlike the balance data.

Extraction needs [AssetStudioModCLI](https://github.com/aelurum/AssetStudio)
(the GUI-only AssetRipper can't be scripted — its file loading always opens a
native OS dialog). With that unpacked somewhere:

```bash
AssetStudioModCLI "<game>/prototype/Sanctuary Shattered Sun_Data/level2" \
  -m export -t tex2d,sprite -g none -f assetName -o out/ \
  --filter-by-name "^(land|air|bot|naval|structure|experimental)[0-9]_t[0-9]_" --filter-with-regex
```

Then copy `*_normal.png` into `icons-src/` with the `_normal` suffix stripped and
run `npm run icons`. On a machine with only a newer .NET runtime installed, set
`DOTNET_ROLL_FORWARD=Major`.

## Unit previews

The detail panel shows the game's own rendered unit thumbnail — the image its
build menu uses. These are `Texture2D` assets named exactly after the template
id (`uel1001.png`), sitting alongside the model's `_albedo_team` / `_mask` /
`_normal_alpha` textures in the same `level*` scene files.

222 of 283 units have one — 222 of the 226 that have models, the four gaps being
units whose preview is a fully transparent placeholder. `npm run icons` detects
those and leaves them out of the manifest, so the panel is omitted rather than
showing an empty frame.

They're **64×64, and that's the only size the game ships** (checked across
scene files). The UI upscales to 150px with smooth filtering on a
faction-tinted backdrop, which hides the softness reasonably well. Don't go
much larger. Most units now show a sharp 384px render from the developers
instead (see [Artwork from the developers](#artwork-from-the-developers)); this
64px one is the fallback.

Unlike the strategic icons these need no processing — colours are already baked
in — so they live in `public/previews/` directly. `npm run icons` just indexes
them into `previews/manifest.json`.

To re-extract, same tool as the icons:

```bash
AssetStudioModCLI "<game>/prototype/Sanctuary Shattered Sun_Data/level2" \
  -m export -t tex2d -g none -f assetName -o out/ \
  --filter-by-name "^u(e|c|g|w)(l|a|n|s)[0-9]{4}$" --filter-with-regex
```

That regex matches the template-id naming exactly, which keeps the model
textures out. Drop the results into `public/previews/` and re-run `npm run icons`.

### 3D models

Not done, and not planned. Extraction isn't the hard part — AssetRipper will
give you meshes. The problem is that Unity materials and shaders don't map onto
glTF, so you get untextured geometry unless you rebuild materials per unit, and
then you still need a conversion pipeline, a viewer, mesh compression and a few
hundred MB of hosting. One model is an afternoon; 283 is a separate project.

## Artwork from the developers

**Art © Enhearten Media, used with permission.** The masthead screenshots,
faction emblems and high-resolution unit renders come from the developers of
_Sanctuary: Shattered Sun_, who shared their presskit, faction icon pack and
unit renders (via Google Drive) for use on this site.

About 490 MB of originals, none committed. `npm run art` cuts them down to the
~3 MB the site serves:

| Output                              | From                                      | Used by                                                        |
| ----------------------------------- | ----------------------------------------- | -------------------------------------------------------------- |
| `public/art/mastheads/<page>.webp`  | a band of one presskit screenshot, 1600px | `PageHead` on the seven top-level pages, dimmed behind a scrim |
| `public/art/factions/<faction>.png` | the white 500px emblems, at 384px         | `FactionEmblem`: Units column heads, detail-panel stage        |
| `public/renders/<id>.webp`          | the 2048px unit renders, at 384px         | the detail panel's render (falls back to `public/previews/`)   |

Which screenshot heads which page, and its crop, lives in `src/lib/art.ts`. The
emblems are CSS masks filled with the faction colour, so they always match
`FACTION_COLOURS`. Unzip the three Drive folders side by side and run:

```bash
npm run art -- "<folder holding Sanctuary Presskit, Faction Icons Pack, Unit Icons>"
```

It needs `ffmpeg` on PATH. `npm run verify` fails if a masthead or emblem is
missing.

The unit renders are dated September 2023, so newer units aren't in the pack.
157 units get one; the other 65 with a render keep the game's 64px thumbnail.
Five renders in the pack no longer match the unit in game and are skipped on
purpose (`STALE_RENDERS` in `scripts/build-art.js`): ucl4003 is a different
model, ugl1501/2501/3501 are all one identical buggy, and ucs3401's silhouette
has changed. They were found by downscaling every render to 64px and comparing
it against the game's own thumbnail, which is worth repeating whenever a new
pack arrives.

Not used: both key art images (marketing text is baked in), the faction banner,
the glow/Discord/superseded icon variants, and the black emblems.

## Caveats

- Currently built from the **Playtest** install (the Steam build is in
  `public/data/version.json`), so balance values are still pre-release.
  `meta.isDemo` is set in the JSON when the data comes from the Demo instead.
- The site defaults to the 174 signed-off units. Another 66 are modelled but
  gated, and 55 have no model at all — use the Availability filter to see them.
- Nothing here is authoritative. Re-run `npm run extract` after a game patch.

## Deploying

**The extraction scripts are local-only. Production never runs them** — it
can't, because there's no game install on a build server. The split is:

- `npm run build` (Vite) only needs the **committed** `public/data` + art, so
  it runs anywhere, including on Vercel. The content pages are prerendered
  and served as static files, exactly as before.
- Since the ladder was added, the build has a server half too. Nitro
  (`nitro()` in `vite.config.ts`) packages it: into `.output/` locally, and on
  Vercel into the Build Output API layout (`.vercel/output/`), which serves the
  prerendered pages as static files and the server functions and `/api/*`
  routes as serverless functions. `vercel.json` only sets cache headers.
  The ladder needs env vars (see `.env.example`): `DATABASE_URL`,
  `STEAM_API_KEY`, `SESSION_SECRET`, `SITE_URL`.

  Production builds and servers require `SITE_URL` as an absolute HTTP(S) origin without a path, query, or
  fragment. Document canonicals and sitemap entries use that origin. Missing or invalid values fail the build.
  Use the deployed public origin in hosting configuration; `http://localhost:4173` is only for local browser tests.
  Steam sign-in only works on the origin `SITE_URL` names — not on preview
  deployment URLs. The database schema lives in `supabase/migrations/`, applied
  with `npm run db:migrate` (`scripts/db-migrate.js`): each pending file once,
  in filename order and in its own transaction with its `schema_migrations`
  row, against `DATABASE_URL` from the environment or `.env`. TLS is required
  except for a localhost database; `?sslmode=` on the URL or `PGSSLMODE`
  overrides that. `npm run db:migrate -- 0005` stops after 0005, for two-step
  rollouts. `supabase/README.md` lists which migration holds each SQL
  function's live definition.

- `npm run extract` / `icons` / `refresh` need the game install and only ever
  run on your machine. Their output is committed.

```bash
vercel deploy
```

The workflow after a game patch is: `npm run refresh` locally, `npm run verify`,
`npm test` (it pins known-good derived values, so a surprising diff here is
either a real balance change or an extractor regression), then commit the
regenerated `public/` and push. CI (`.github/workflows/ci.yml`) runs on pull
requests and pushes to main: `verify`, `lint`, `format:check`, the build,
`typecheck`, the unit tests, the Playwright e2e suite and
`test:modding-versions` — none of it needs the game.

If you ever want extraction automated, it has to run somewhere the game files
exist — a self-hosted runner or your own machine on a schedule — pushing the
regenerated JSON. It cannot run on Vercel.

## Layout

```
icons-src/          136 extracted icon masters (committed; source for npm run icons)
scripts/            local-only data pipeline, plain Node
  lua-parser.js     Lua table literal -> JS
  locate-game.js    finds the install via Steam's library index
  extract.js        templates -> public/data/units.json
  lib/              the scripts' pure parts, unit-tested: weapons.js (firing
                    simulation, DPS, grouping) and tag-expression.js (canBuild)
                    for extract.js, db-ssl.js for db-migrate.js
  diff-data.js      what a re-extract changed vs the committed units.json
  png.js            zero-dep 8-bit PNG decode/encode against node:zlib
  build-icons.js    icons-src/ -> per-faction PNGs
  ladder-previews.js  ranked pool art -> public/ladder-maps/
  build-art.js      the developers' artwork -> public/art/, public/renders/
  build-mod-shots.js  mod screenshots -> public/art/mods/
  verify.js         checks public/ data + art consistency (no game needed)
  db-migrate.js     applies supabase/migrations/ to DATABASE_URL
  test-modding-versions.js  builds with fixture modding snapshots, runs their e2e
supabase/
  migrations/       ladder database schema + SQL functions (pairing, Elo)
  migrations.test.ts  applies them to in-memory PGlite, checks SQL against src/lib
  README.md         which migration holds each function's live definition
src/                the site, TanStack Start + React + TypeScript
  router.tsx        router factory + legacy-compatible search param encoding
  routes/
    __root.tsx      document shell, head, shared header
    index.tsx       unit board route: filters, sort, detail — all URL state
    calculator.tsx  calculator route: build/economy setup — all URL state
    mods.tsx        the mod catalogue, rendered from lib/mods.ts
    ladder*.tsx     ladder: leaderboard/queue, match room, player profiles
    lobbies.tsx     open custom-game lobbies, read from Steam's server list
    api.auth.*.ts   server-only routes for Steam OpenID sign-in/out
    api.lobbies.ts  CDN-cached lobby list (Steam Web API, needs STEAM_API_KEY)
  server/           server-function layer (service-role Supabase, sessions,
                    Steam OpenID, queue + match logic) — never in the client
  lib/
    types.ts        the Unit type — the one contract for units.json
    data.ts         cached fetch of units.json + both manifests
    board.ts        grouping, filtering, sorting (pure functions)
    calc.ts         build/economy maths, option pools, URL row packing
    economy.ts      standing economy roles, upgrade price/time/payback
    mods.ts         the mod catalogue: versions, blurbs, release/download URLs
    clipboard.ts    copy-to-clipboard with a fallback
    elo.ts          ladder rating maths (mirrored in supabase/migrations)
    matchmaking.ts  queue radius/pairing rules (mirrored likewise)
    ladder-maps.ts  the ranked map pools, and where each map’s preview lives
    ladder-spawns.ts  cached fetch of the pool maps' start positions
    art.ts          masthead screenshot per page + faction emblem paths
    *.test.ts       vitest suites, run against the committed units.json
  components/       Header, HeaderSearch, UnitIcon (art + SVG fallback),
                    UnitCard, DetailPanel
public/             static assets copied verbatim into the build
  data/units.json   generated
  data/version.json generated: the Steam build the data came from (for /api/game-version)
  ladder-maps/      generated by mappreviews: a preview per pool map, and
                    spawns.json — each map's starts in image coordinates
  icons/            generated: <faction>/*.png plus manifest.json
  previews/         extracted unit renders plus manifest.json
  renders/          generated by art: the developers' 384px renders + manifest
  art/              generated by art: masthead bands, faction emblems
```

`public/data/units.json`, `public/icons/` and `public/previews/` are all
committed — the Vercel build bundles the app around them without needing the
game.
