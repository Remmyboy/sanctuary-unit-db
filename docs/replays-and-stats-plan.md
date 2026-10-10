# Plan: ladder replays and match stats on SanctuaryDB

Status: phases 1 and 2 built (5 October 2026). Decisions taken with the user:

- **Storage:** Cloudflare R2. The buckets `sanctuarydb-replays` and `sanctuarydb-replays-dev` exist.
- **Downloads:** public, like finished match pages.
- **Uploads:** opt-in. Both mod settings are off by default.
- **Chat:** not treated as a concern.

**Goal.** After a ranked match, LadderReporter uploads two things:

- the match's end-of-game stats, so the match page shows a scoreboard and charts straight away, with no replay needed;
- the `.sanreplay` file, so anyone can download the game and watch it.

Stats are small and come first. Replays need file storage and come second.

---

## 1. What we have today (facts this plan relies on)

### Reporting

LadderReporter 0.3.6 (`sanctuary-hud/LadderReporter/LadderReporter.cs`) posts to `/api/report` at the moment of victory.

- It detects victory by wrapping the Lua `WinConditionUpdate`.
- It authenticates with a fresh Steam Web API ticket on every report.
- It only reports 1v1 games between two humans.
- The site resolves the match from the two Steam IDs, preferring `matchId` when one is sent. Only matchmade games have a `matchId` on the mod side.
- The response is `{outcome}`: it does **not** return the match id, and the mod ignores the response.

The mod also holds a 6-hour **bearer token** from `POST /api/mm/session`. Hashed copies are stored in `mm_sessions`, and it is used for the `/api/mm/match/{id}/*` calls. `api.mm.match.$id.event.ts` is the template for a per-match, participant-only endpoint: authenticate, `isUuid`, `isParticipant`, write.

### Replays

The game records every match itself.

- **Location:** `%USERPROFILE%\AppData\LocalLow\Enhearten Media PTY\Sanctuary\Replays\`.
- **Name:** `{start yyyy-MM-dd_HH-mm-ss}_{map}.sanreplay`.
- **Pruning:** the game keeps only the newest 15. Files in `Replays\Saved\` are never pruned.
- **When it is written:** the game appends to the file every tick and closes it only when the client is torn down, which happens when the player leaves the match. So at victory the file is still open and still growing.
- **Path at runtime:** `EM.Network.Replay.ReplayFile.filePath` (private static) holds the path. ModApi already reads it.
- **Format:** a header (`gameVersion = Application.version + "#" + luaHash`, `mapPath`, recording client id) followed by the raw host packet stream. The fields are already Brotli-compressed, so gzip saves only 5–11%.
- **Size:** about 150–450 KB per minute.
  - 7-minute 1v1: 1.2 MB.
  - 26-minute 1v1: 6.7 MB.
  - 17-minute 2v2: 7.5 MB.
  - Worst case seen: 14 MB.
  - **Many exceed Vercel's 4.5 MB request-body limit, so uploads must bypass the function.**
- **Playback:** a downloaded file plays if you drop it into `Replays\` or `Replays\Saved\`, but **only on the same game build and Lua hash**. Other files are greyed out in the list. After a patch, old replays become unwatchable.
- **Modded games:** these also have a `<file>.sanreplay.mods.json` sidecar, which the replay list needs.

### Match stats

Match stats live in SanctuaryHud 0.16.1 (`SanctuaryHud/MatchStats/`). Its Lua hooks collect, for each army:

- economy: gathered, spent, wasted, stalls and peaks;
- units built (by class), lost and killed, with their value;
- peak army value;
- a FAF-style score;
- a one-sample-per-second timeline of income, spend, storage, army value, unit count and score.

It does not track APM.

It persists nothing; the data dies with the match's Lua VM. LadderReporter can read it through the shared Lua VM (`__SdbStatsPull(0)`), but **only when SanctuaryHud is installed with MatchStats enabled**.

### Website

The site has no file storage, no upload handling, and no stats or duration columns. A completed match page currently shows only "Result recorded".

> Before starting mod work: the local `C:\code\sanctuary-hud` checkout is **116 commits behind origin/main**. Pull first. The 0.3.5 "never reported" fix is only on origin.

---

## 2. Design overview

```
victory ──► POST /api/report            (unchanged, now returns matchId)
   │
   └─ result panel shown ──► pull stats from Lua ──► POST /api/mm/match/{id}/stats   (JSON, ≤ 256 KB)
                                                       │
player leaves match ──► replay file closed             ▼
   └─ copy to pending/ ──► POST /api/mm/match/{id}/replay   ──► signed upload URL
                          PUT file directly to storage (bypasses Vercel)
                          POST /api/mm/match/{id}/replay/done ──► verified, row ready
```

Design principles:

- **Stats and replays are independent.** Stats never wait for the replay, and a failed replay upload never hides the stats.
- **Neither one affects Elo.** They are cosmetic, client-supplied data. The result path (`/api/report`) is untouched apart from one extra response field.
- **Never touch gameplay.**
  - Stats are pulled once, when the match is already decided.
  - The replay upload runs only while the player is in the menu or a lobby. It pauses and resumes if a new game starts loading.
- **Uploads use the bearer token** (`EnsureSession`), not a new ticket per call.

---

## 3. Website changes

### 3.1 `/api/report` returns the match id

Add `matchId` to the success response: `{ outcome, matchId }`. Old mods ignore it.

The mod needs this for manual (non-matchmade) games, where it otherwise has no id.

### 3.2 Migration `0015_match_stats_replays.sql`

```sql
create table match_stats (
  match_id    uuid not null references matches(id) on delete cascade,
  uploader_id uuid not null references players(id),
  format      smallint not null,          -- payload format version
  build_id    bigint,                     -- Steam build id (SteamApps.GetAppBuildId)
  duration_s  integer,
  totals      jsonb not null,             -- per-army totals, keyed by steamId
  timeline    jsonb not null,             -- columnar, downsampled (see 3.3)
  created_at  timestamptz not null default now(),
  primary key (match_id, uploader_id)
);

create table match_replays (
  match_id     uuid primary key references matches(id) on delete cascade,
  uploader_id  uuid not null references players(id),
  object_key   text not null,             -- e.g. replays/2026/10/<match_id>.sanreplay
  sidecar_key  text,                      -- .mods.json when present
  size_bytes   integer not null,
  sha256       text not null,
  game_version text not null,             -- header gameVersion ("1.0#<luaHash>")
  build_id     bigint,
  map_path     text not null,
  status       text not null default 'pending' check (status in ('pending','ready','expired')),
  created_at   timestamptz not null default now(),
  ready_at     timestamptz
);
alter table match_stats enable row level security;
alter table match_replays enable row level security;
```

Notes on this schema:

- RLS is on with no policies, matching every other table.
- `on delete cascade` keeps `admin_delete_match` working. That function also needs a server-side storage delete for the object (see 3.5).
- **Stats: one row per uploader.** Both clients run the same lockstep simulation, so their totals should agree. When both rows exist and their totals match, the page can mark the stats "confirmed by both players". The page shows the first row either way.
- **Replay: one per match.** The first uploader reserves the row. A `pending` row older than 15 minutes can be taken over by the other player.

### 3.3 Stats endpoint: `POST /api/mm/match/{id}/stats`

The endpoint runs these checks in order:

1. bearer auth;
2. `isUuid`;
3. `content-length ≤ 256 KB`;
4. the caller is a participant;
5. the match is not `cancelled`.

It then validates the shape and upserts on `(match_id, uploader_id)`.

The payload is versioned (`format: 1`):

```jsonc
{
  "format": 1, "buildId": 20412345, "durationS": 1043, "tickRate": 10,
  "armies": [
    { "steamId": "7656…", "armyId": 1, "faction": 2, "condition": 1,
      "score": 18342, "alloy": { "gathered": …, "spent": …, "wasted": … },
      "energy": { … }, "built": { "land": 61, "air": 0, "naval": 0, "engineers": 9, "structures": 34, "value": … },
      "lost": { "mobile": …, "structures": …, "commander": 0, "value": … },
      "killedValue": …, "peakArmyValue": …, "peakUnits": …, "stallTicks": … }
  ],
  "timeline": { "intervalS": 5, "t": [0,5,10,…],
                "series": { "<steamId>": { "alloyIncome": […], "energyIncome": […], "armyValue": […],
                                           "units": […], "score": […] } } }
}
```

- **Downsampling:** the mod sends one sample every 5 s, not every 1 s. A 30-minute 1v1 is then about 360 samples × 5 series × 2 players, roughly 30–40 KB of JSON. That keeps the database small: Supabase's free database is 500 MB, and full one-second timelines would cost about 0.5 MB per match.
- **Join key:** the mod maps `armyId` to `steamId` using its roster snapshot. The server rejects any `steamId` that is not a participant.
- **Testing:** a pure validator in `src/lib/match-stats.ts` gets vitest coverage.

### 3.4 Replay endpoints

**`POST /api/mm/match/{id}/replay`**

- Body: `{ sizeBytes, sha256, gameVersion, buildId, mapPath, hasSidecar }`.
- Checks:
  - the caller is a participant;
  - the match status is `reported`, `completed` or `disputed`;
  - `sizeBytes ≤ 30 MB`;
  - `mapPath` matches `matches.map_path` or the map name.
- If a `ready` row exists, it returns `{ skip: "stored" }`. The second player doesn't re-upload.
- Otherwise it reserves the row and returns signed upload URL(s) for the object (and the sidecar).

**`POST /api/mm/match/{id}/replay/done`**

The server fetches the object's metadata from storage. It checks that the size matches, then sets `status='ready'`.

**Downloads**

A server fn `replayDownload(matchId)` returns a short-lived signed download URL (5 min). The URL uses `download=<original game-style filename>`, so the file lands with a name the game's list understands.

- Downloads are public, like finished match pages.
- The URL is signed rather than a permanent public link, so it can't be hot-linked forever.

**Storage: Cloudflare R2, private bucket `sanctuarydb-replays`**

Why R2 over Supabase Storage and Vercel Blob:

- **Space:** the free tier has 10 GB, about 3,300 replays at ~3 MB each. The other two have 1 GB, about 330.
- **Downloads are free and unlimited** (no egress fees). Supabase allows 5 GB a month, shared with the database. Vercel Blob on Hobby switches off for 30 days once you go over.

R2 speaks the S3 API, so everything goes through **presigned URLs** generated in `src/server/storage.ts`. Sign them with `aws4fetch`, a ~3 KB SigV4 signer that works on Vercel's Node runtime; there's no AWS SDK. The endpoint is `https://<account_id>.r2.cloudflarestorage.com/<bucket>/<key>`.

| Use      | Request         | Expiry | Notes                                                                                                                                    |
| -------- | --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Upload   | presigned `PUT` | 2 h    | Returned by `/replay`; the mod PUTs the raw bytes. The URL does not enforce the size, so `/done` checks it.                              |
| Verify   | signed `HEAD`   | —      | Done server-side in `/done`. If `Content-Length ≠ sizeBytes` or it's over the cap, the server deletes the object and rejects the upload. |
| Download | presigned `GET` | 5 min  | Adds `response-content-disposition=attachment; filename="<game-style name>"`, so the browser saves it with the right name.               |
| Delete   | signed `DELETE` | —      | Used by retention and admin delete.                                                                                                      |

- **No CORS rules needed.** The mod isn't a browser, and downloads are plain navigations, not `fetch`.
- **Object keys:** `replays/<yyyy>/<mm>/<match_id>.sanreplay`, plus `…/<match_id>.sanreplay.mods.json`.
- **Backstop:** an R2 **lifecycle rule** on the bucket deletes objects older than 180 days, in case the lazy prune ever misses something.
- **Dev environment:** dev and local runs use a second bucket, `sanctuarydb-replays-dev`, so tests never touch production replays.
- **New server-only env vars** (Vercel and `.env`):
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET`

**One-time setup (you do this, about 10 minutes):**

1. Create a Cloudflare account and enable R2. Cloudflare may ask for a payment method even though the free tier costs nothing.
2. Create the buckets `sanctuarydb-replays` and `sanctuarydb-replays-dev`, with location hint Western Europe (near Supabase eu-west-1 and Vercel dub1). Use Standard storage class: Infrequent Access is not covered by the free tier.
3. Create an R2 API token with **Object Read & Write**, scoped to those two buckets only.
4. Add the 4 env vars to Vercel (Production) and to the main checkout's `.env` (dev bucket).
5. Add the 180-day lifecycle rule to the production bucket.

### 3.5 Retention (there is no cron, so this is done lazily)

A replay is useless once the game patches, because it won't play any more. Proposal:

- Keep each replay until **30 days after its build stopped being the live build**, and always for at least 30 days.
- The prune runs inside the `/replay` slot request, at most once an hour (an advisory lock plus a `last_pruned_at` row).
  - It deletes the storage objects.
  - It marks their rows `expired`.
- Stats are kept forever.
- `admin_delete_match` deletes the object first, from the server fn, then calls the SQL function.

Rough budget: an average 1v1 is about 3 MB. R2's free tier is 10 GB, which holds about 3,300 replays.

Retention means we only ever hold one patch cycle plus 30 days. At about 10 ranked games a day, that's around 300–600 replays, or 1–2 GB. Beyond the free tier, R2 costs $0.015 per GB a month, so 100 GB is about $1.50 a month.

The free-tier operation limits are 1M writes and 10M reads a month, far above what we'll use.

### 3.6 Match page (`ladder_.match.$matchId.tsx`)

`MatchView` gains:

- `stats?: MatchStatsView`;
- `replay?: { sizeBytes, buildId, playable: boolean | null, durationS }`.

These are loaded in `view()` only for finished matches.

**Stats panel.** This replaces the bare "Result recorded" for completed matches.

- **Scoreboard:** the two players side by side, with:
  - score;
  - alloy and energy gathered, spent and wasted;
  - units built (by class), lost and killed;
  - peak army;
  - duration.
- **Charts:** score, army value and income over time, two lines each in the players' team colours. Reuse the SVG approach from `RatingGraph` and don't add a chart library. Charts follow the site design system.
- **Badge:** "Confirmed by both players" when the two uploads agree.

**Replay panel.**

- A **Download replay** button, with the file size.
- One line on where to put the file: `…\Sanctuary\Replays\Saved\`.
- A warning when `buildId` differs from the live build (from the existing `/api/game-version`): "Recorded on an older game build. It won't play on the current version."
- While a `pending` upload is less than 15 minutes old, the panel says "Replay uploading…".

**Profile page.** History rows link to the match page. Small icons show whether stats and a replay exist.

### 3.7 Docs and version

- Update `docs/matchmaking-api.md` with the three new endpoints and the `/api/report` response.
- Bump `REPORTER_VERSION` (QueueCard) when the mod ships.

---

## 4. Mod changes (sanctuary-hud)

### 4.1 Make the stats collector shared

Move the MatchStats Lua chunk (`MatchStats.InstallChunk`) and the `StatsModel.cs` parser into `shared/`. LadderReporter then installs the hook itself and no longer depends on SanctuaryHud being installed.

- The existing `__SdbStatsHook` guard makes a double install harmless: whichever mod installs first serves both.
- Add a format number to the `V|` line so a newer reader can tell when an older mod's hook is the one running.
- It stays MP-safe: these are table-field wraps, so no Lua files change and the lobby hash is unaffected.

### 4.2 LadderReporter 0.4.0

**1. Report.** Parse `{outcome, matchId}` from the `/api/report` response. Keep `matchId` as `_uploadMatchId`.

**2. Stats.**

- **When:** once the GameResult panel is visible, or 5 s after victory. The match VM is still alive at that point.
- **Pull:** `__SdbStatsPull(0)`, then parse.
- **Build the payload:**
  - map `armyId` to `steamId` from the roster snapshot;
  - downsample to 5 s;
  - add `SteamApps.GetAppBuildId()`.
- **Send:** POST with the bearer token, 3 tries, the same UnityWebRequest coroutine pattern as today.

**3. Replay.**

- **Find the file:** after the report succeeds, read `ReplayFile.filePath` and remember it.
- **Wait for it to close:** wait until the player leaves the match (`InMatch` false and the file no longer locked for writing).
- **Copy it** into `BepInEx\cache\LadderReporter\pending\<matchId>.sanreplay`, plus the sidecar, plus a small manifest JSON. This protects it from the game's 15-file prune and from a game restart.
- **Upload queue:**
  - Runs only in the `menu` and `lobby` states, and pauses if the game starts loading.
  - Steps: slot request, then `PUT` via `UploadHandlerFile` (streams from disk, never on the main thread), then `/done`.
  - Backoff: 1, 5 and 30 minutes, then on the next game launch.
  - Discard after 7 days, or when the server answers `skip` or a 4xx.
- **Hash:** compute SHA-256 on a background thread.

**4. Config** (`[Upload]`):

- `Stats = false`
- `Replays = false`

Both are opt-in, off by default (the user's decision).

- `MaxReplayMB = 30`

**5. DryRun.** Write both payloads to `BepInEx\cache\LadderReporter\dryrun\` instead of posting them.

**6. Local bridge.** Add `uploads: { pending: n }` to `GET /status`, so the match page can show "Uploading from your game…".

### 4.3 Later (phase 3): "Watch in game"

The match page's button posts `{ url }` to the local bridge at `POST /replay`. The mod (ReplayManager or LadderReporter):

1. downloads the file into `Replays\Saved\`;
2. checks the header's `gameVersion`;
3. starts playback with `NetworkManager.StartReplayPlayback`.

This is the same flow as the auto-launch, so it's one click from the website straight into the replay.

---

## 5. Phasing

| Phase          | Site                                                                                                                                                                    | Mod                                            | Ships                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------- |
| **1. Stats**   | 0015 (stats table only); `/api/report` returns `matchId`; stats endpoint; match-page scoreboard and charts; profile links                                               | shared stats hook; LadderReporter stats upload | Stats visible on every reported 1v1 |
| **2. Replays** | R2 setup (you, see 3.4); `match_replays` (second half of 0015, or 0016); `storage.ts` (aws4fetch); slot/done/download; replay panel; lazy prune; admin delete cleans R2 | pending queue + uploader                       | Download button on match pages      |
| **3. Extras**  | "Watch in game" button; per-player stat aggregates on the profile (average score, alloy/min)                                                                            | bridge `POST /replay` → download + play        | One-click replays                   |

Each phase is its own branch and PR in each repo. The site goes first so the endpoints exist before the mod calls them. Migrations go to the live Supabase only with your go-ahead.

---

## 6. Testing

- **SQL:** PGlite in the scratchpad, applying all migrations, then the upsert, reserve and takeover statements.
- **Server:** vitest for the stats validator, the downsampling and the retention "is expired" rule. Route tests use a stubbed `storage.ts`.
- **End to end against a local dev server:**
  - mint a bearer token with the existing scratchpad pattern;
  - `curl` a recorded stats payload and a real `.sanreplay` through slot, PUT and done;
  - open the match page.
- **e2e:** smoke test the match page with a fixture match that has stats and a replay.
- **Mod:** DryRun against a real 1v1 vs AI is not possible, because the reporter needs two humans. Instead:
  - add a debug `ForceUpload` config that runs the stats and replay path for any finished game, with a test match id;
  - point `Endpoint` at the local dev server via `DevOrigins` and `BaseUrl`.

---

## 7. Risks and unknowns

1. **Chat in replays.** In-game chat may travel in the host packet stream, in which case a public replay includes it. The user judged this not to matter. Uploads are opt-in, which limits it to players who chose to share.
2. **Stats are client-supplied.** A modified client could send fake numbers. This doesn't matter for Elo, and two agreeing uploads give a cheap integrity signal. A later option is to derive economy totals server-side from the replay itself: `UpdateEconomyTotals` is in the stream, and the extractor design is in `git show ced1768^:docs/replay-economy-data.md` in sanctuary-hud.
3. **Upload bandwidth.** A 7 MB upload while the next match is launching. This is handled by uploading only in menu or lobby and pausing on load.
4. **Storage growth.** R2 egress is free, so popular replays cost nothing extra. Only stored size matters, and that is bounded by retention and the 180-day lifecycle rule. Even well past the free tier, the cost is cents per GB.
5. **Leaked R2 key.** The token is scoped to the two replay buckets with object read/write only, so a leak can't touch anything else on the Cloudflare account. Rotate it in the Cloudflare dashboard if needed.
6. **1v1 only.** The reporter skips team games, so they get neither stats nor replays. Team support is a separate piece of work on the reporter.
