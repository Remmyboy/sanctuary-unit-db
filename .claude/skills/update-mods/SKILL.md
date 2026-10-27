---
name: update-mods
description: Bring the site's mod pages (/mods, /gameplay-mods, /balance-patch) up to date with new sanctuary-mods releases. Use when a mod has been released or updated, when a new mod needs adding to the site.
---

# Updating the site for mod releases

Every download link and version on /mods, /gameplay-mods and the Play page
comes from `src/lib/mods.ts`. So a release reaches the site when its version
there moves, and the copy changes only when the mod can do something new.

## 1. See what's behind

```bash
git fetch -q origin
npm run mod-releases -- --ref origin/main
```

This compares main's `mods.ts` with the newest published release of every mod,
and it reads the open site PRs too. Each line has a status:

| status      | meaning                                                   | what to do                                                                                                     |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `bump`      | released with all its zips                                | step 3                                                                                                         |
| `manual`    | Zone Control or the Balance Patch                         | step 4                                                                                                         |
| `new`       | released, but the site doesn't list it                    | step 5                                                                                                         |
| `waiting`   | the release is still uploading its zips                   | nothing yet, or the link would 404. Check again in a few minutes                                               |
| `in-pr`     | an open site PR already has this version                  | nothing                                                                                                        |
| `pr-behind` | an open site PR changes this mod, but to an older version | do the work on that PR's branch, not in a new PR. If another session has the branch checked out, tell the user |

Without `--ref`, it compares the working tree's `mods.ts` instead. Use that
once you are on your branch, to check your own work.

## 2. Where to work

Never on `main` (see the branch-and-PR rule). Work in this session's worktree
branch (sessions in this repo normally start in one), or on the branch of the
PR you are extending.

The main checkout is often on someone's branch with work in progress. Don't
switch it, and don't commit there.

## 3. A plain bump

```bash
npm run mod-releases -- --write
```

This rewrites the version of every `bump` row in `mods.ts` and nothing else.
Then read what each release changed:

```bash
"/c/Program Files/GitHub CLI/gh.exe" release view <Id>-<version> --repo Remmyboy/sanctuary-mods
```

Find the "New in <version>" paragraph and decide whether the card's copy still
holds.

- **A fix, or nothing a player would notice:** leave the copy alone. Fixes
  belong in the release notes, which every card links to.
- **The mod can do something new:** add a `{ title, text }` feature, or rewrite
  the one it changes. Write it as a benefit to the player.
- **A feature changed or went away:** fix or drop the line that now says
  something untrue. (Example: Build Spacing 0.2.0 turned "always keeps the
  blast gap" into "warns you". The old line would have been wrong.)
- **New or changed keys:** update `keys`.

Copy rules: the card is a pitch, not a changelog. No implementation detail (which
hook, which canvas, which Lua file). Use curly apostrophes (’) like the rest of
the file. Keep feature text to one or two short sentences.

## 4. The two mods a version won't cover

**Zone Control.** Its site download is `ZoneControl-<v>-WithMap.zip`, holding
`SanctuaryMods\ZoneControl\` plus
`Sanctuary_Data\Maps\Zone_Control_for_FAF_8P_V2\`. `pack-release.ps1` can't
build it, so the release needs it uploaded by hand. The checker reports
`waiting` until it's there. Once it is, bump `ZONE_CONTROL.version` by hand.
If the rules changed, update `src/lib/zone-control.ts` (copied from the mod's
`balance.lua`).

**Remmy's Balance Patch.** Three things must agree, and a test checks them:

```bash
curl -sLo "$TMP/balancepatch.json" https://github.com/Remmyboy/sanctuary-mods/releases/download/BalancePatch-<v>/balancepatch.json
npm run balance-patch -- "$TMP/balancepatch.json"
npm run extract          # needs the game installed; rebuilds public/data/units-balance-patch.json
```

Then bump `BALANCE_PATCH.version`. Every number in its features is shown
against the unmodded game (the game's value in brackets), so diff the new
`balance-patch.json` against the old one and fix any feature whose numbers
moved. A new projectile change needs a name in `PROJECTILE_NAMES`
(`src/lib/balance-changes.ts`). If the section count changed, so does the e2e
pin. `npm run extract` reads the local game install. In a run with no game
installed (it lives under `ENGINE_PATH` in `mods.ts`), stop and report rather
than guess.

## 5. A new mod

Read its release notes and its README row in sanctuary-mods first. Then decide
which kind it is:

- **UI mod** (client-side, `It only changes ... the other players don't
need it`): add an entry to `MODS` in `mods.ts`. The order is the reading
  order of the page: manager, everyday play, ladder, then watching/recording
  tools. Put building and placement mods next to Build Hotkeys. It joins the
  everything zip on its own, and the page shows it as a card. Then bump the
  `.mod-entry` count in `e2e/smoke.spec.ts` (it pins the number of /mods
  cards) and its comment.
- **Gameplay mod** (the host switches it on, everyone needs it): a new
  `export const` beside `PHANTOM_X` and an entry in `GAMEPLAY_MODS`. Add a
  guide component in `src/routes/gameplay-mods.tsx` (set-up, rules, options,
  credits, like the others), keyed by id in its map. Its set-up step names the
  minimum Mod Manager version the release notes give. Check the e2e pins for
  /gameplay-mods.

Screenshots are optional. `MOD_SHOTS` in `src/lib/mod-shots.ts` has no entry
until there are captures (`npm run modshots -- "<folder>"`). Don't block on
them; say in the PR that the card has none.

## 6. Check it

```bash
npx prettier --check --end-of-line auto src/lib/mods.ts e2e/smoke.spec.ts
npm run lint
npm run build            # fetches every release zip into the everything zip: a bad version fails here
npm test
npx playwright test
```

- After the build, confirm a new or bumped UI mod is in the everything zip:
  `unzip -l .output/public/downloads/SanctuaryMods-Everything.zip | grep <Id>`.
- Run `npm run mod-releases` (working tree) and check that it says nothing to
  do, except `waiting` rows.
- Look at the card: `preview_start` `static` (serves `.output/public` on
  5174), open `/mods#<Id>`, and screenshot it.

## 7. Ship it

Commit with a subject like `Mods page: Build Spacing 0.2.0, SanctuaryHud
0.18.1`. Push with `-u`, and open a PR (or push to the existing one) whose body
lists each version and any copy change. The release already exists by
construction, so the links work as soon as it merges. **Don't merge.** The user
reviews mod PRs, and GitHub auto-merge is off.
