# Live replays

Status: live since 10 October 2026 (site PR #68, migration
`0016_live_replays.sql`; mod: LadderReporter 0.5.0, sanctuary-mods PR #26).

A player who switched on streaming in LadderReporter streams the game they
are playing to the site while it runs. Anyone can open it from
[/live](https://www.sanctuarydb.net/live) and press **Watch in game**: their
own LadderReporter downloads the stream and plays it with the game's replay
player, a fixed delay (`LIVE_DELAY_S`, 180 s) behind the players.

Streaming is two settings, both off by default, in F8 > Ladder Reporter >
Live: `Live.StreamLadder` for ladder games and `Live.StreamOther` for any
other game (custom lobbies, skirmishes, games the player observes).

## How it fits together

```
streaming game                         site                                 watching game
──────────────                         ────                                 ─────────────
POST /api/mm/live  ───────────────►   live_streams row           ◄── GET /api/live/{id}?from=n (every 10 s)
every 15 s:                            live_chunks rows                  chunks ≥ n older than the delay,
POST /api/mm/live/{id}/chunk/{seq} ►   R2 live/{id}/{seq}.bin       ──►  each with a 10-minute R2 URL
on leaving:                                                              appended to Replays\Live\{id}.sanreplay,
POST /api/mm/live/{id}/end ───────►   status 'ended'                    played by the game while it grows
```

- **Chunks** are whole network frames from the game's own recording, in
  order, starting with its header. The mod reads them as the game writes
  them (the file is flushed frame by frame). The opening frame is the
  whole starting state, up to 1.7 MB on the stock maps (The Forge), so the
  first chunk is the big one; the rest are tens of KB every 15 s.
- **The delay is the server's.** `viewerPoll` lists only chunks whose
  `created_at` is older than `LIVE_DELAY_S` by the database clock. R2 is
  private and the URLs are signed per poll, so nothing younger can be
  fetched, whatever a client does. A stream's page shows "Watchable in N s"
  until its first chunk is out.
- **Small enough to pass through the function.** Unlike finished replays
  (presigned PUT straight to R2), chunks are posted to the function, which
  checks they are whole frames (`checkChunk`) and writes them to R2 itself.
  `CHUNK_MAX_BYTES` is 4 MiB, under Vercel's 4.5 MB body limit.
- **Order and retries.** A chunk must be the next one (`seq == chunks`). A
  repeat of one already stored answers `{ next }` (a lost reply); one past
  the next answers 409 `{ next }`. The mod fixes each chunk's byte range the
  first time it reads it, so a retry carries identical bytes.
- **Ending.** The mod's `/end`, or 3 minutes without a chunk (`STALE_S`: a
  crash). Viewers get `complete: true` once the stream is over and every
  chunk has come out of the delay; the mod then lets the replay end.
- **One stream per player at a time.** Starting a new one ends the last.
- **Retention.** A day after a stream ends (`KEEP_ENDED_H`), the lazy prune
  (`site_jobs` row `live_prune`, at most every 15 minutes and 400 R2
  deletes, from `/api/mm/live`) deletes its R2 objects and rows.
- **Quota.** Any Steam account with the mod can stream, so one player may
  stream at most `LIVE_DAILY_MAX_BYTES` (1 GiB) a day; past it a new
  stream is refused (403). The finished replay of a ranked game is
  the post-game upload, not this.
- **Who.** The players list comes from the streaming player's lobby: names,
  teams, player/AI/observer; no Steam ids. Streaming needs the mod's bearer
  session (a Steam ticket); watching needs nothing.

## Endpoints

### `POST /api/mm/live` (bearer)

```json
{
  "mapPath": "Maps/The_Forge/The_Forge.sanmap",
  "gameVersion": "0.0.1.20#90b0…",
  "buildId": 25474094,
  "fileName": "2026-10-10_09-14-28_The_Forge.sanreplay",
  "players": [
    { "name": "Remmy", "team": 1, "kind": "player" },
    { "name": "AI 1", "team": 2, "kind": "ai" }
  ],
  "sidecar": null
}
```

→ `{ id, url, delayS }` · 403 when the player has streamed
`LIVE_DAILY_MAX_BYTES` (1 GiB) in the last day. `sidecar` is the recording's `.mods.json` for a
modded game (without its notes), which a viewer's ModApi needs to apply the
same mods.

### `POST /api/mm/live/{id}/chunk/{seq}` (bearer, raw bytes)

→ `{ next }` · 409 `{ error, next }` · 410 the stream is over · 413 too big ·
400 not whole frames.

### `POST /api/mm/live/{id}/end` (bearer)

→ `{ ok: true }`.

### `GET /api/live/{id}?from=n` (public)

```json
{
  "id": "…",
  "gameVersion": "…",
  "mapPath": "…",
  "fileName": "…",
  "sidecar": null,
  "delayS": 180,
  "chunks": [{ "seq": 0, "sizeBytes": 2097431, "url": "https://…r2…" }],
  "complete": false,
  "startsInS": null
}
```

At most 60 chunks per answer; ask again from the next. `startsInS` is set
while chunk 0 is still inside the delay. The CDN caches an answer for 10 s
(the mod polls without a bearer), which only ever makes it later.

### Local bridge: `POST /watch`

`{ "stream": "<id>" }` from the stream's page (`watchLive` in
`src/lib/mod-bridge.ts`). The mod accepts it in the menu or over a replay
(which it closes), refuses it with 409 in a game or lobby, and fetches the
stream from its own `Matchmaking.BaseUrl`, never from a URL the page names.
`GET /status` then answers `live.watching: { id, phase, error }` — phase
`waiting`, `loading`, `playing`, `over` or `failed` with a sentence — which
the page shows.

## Tested

10 October 2026, in game against a local stand-in for these endpoints (same
routes and shapes), not yet against the deployed site:

- streaming a skirmish vs AI on The Forge: a 2 MB first chunk, then ~37 KB
  every 15 s; the chunks joined together were byte-identical to the game's
  finished recording, and the stream closed on leaving the match;
- watching a stream released in real time: playback started from the
  first chunk, ran into data that arrived after it started, waited at the
  live edge at 4× speed (still "Running", not "Finished") and resumed as
  chunks came, then ended on the last frame once the stream was complete;
- watching over an open replay (closed first), leaving (the watch stops),
  a stream from another game version (refused, with the reason in
  `/status`), and the bridge refusing other origins.

The site half has unit tests (`src/lib/live-replay.test.ts`). Its SQL
(`src/server/live-replays.ts`) was run once against PGlite with every
migration applied and R2 stubbed: start, ownership, order and retry
rules, the delay, end, staleness, one stream per player, and the prune.
Not yet against Supabase or R2: the migration isn't applied.
