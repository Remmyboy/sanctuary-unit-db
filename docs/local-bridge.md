# Local bridge: the site drives the mod through the browser

Design for replacing the LadderReporter's 5-second heartbeat with a local
connection from the SanctuaryDB page to the mod. Covers both repos: the site
(this one) and `sanctuary-hud/LadderReporter`. Status: both halves are
implemented — the site (`src/lib/mod-bridge.ts`, the `mod` field on the
polls, the match room hand-off, the admin test bench) and LadderReporter
0.3. The heartbeat route stays until players have updated.

## Why

The mod heartbeats `POST /api/mm/heartbeat` every 5 s for as long as the game
is open, queued or not. That is 720 Vercel function invocations per player per
game-hour, and it was the largest single line in the month's 183K invocations.
Meanwhile the browser polls `queueStatus` every 5 s whenever the Play page is
open or the player is queued, so a queued player with the mod costs two polls
every 5 s that say the same thing.

The server cannot reach the mod: the game sits behind home NAT, and a Vercel
function cannot hold a connection open without being billed for every second
of it. But the browser tab and the game are on the same machine. The tab is
already polling the site while the player is queued, and it has to stay open
anyway (that poll is the queue heartbeat). So the tab becomes the messenger:
it reads the mod's state locally and reports it to the site, and it hands the
match object to the mod when there is one.

What this buys:

- Idle players cost nothing. A game left open in the menu all evening makes
  zero requests to Vercel. No polling cadence can match that.
- Freshness by construction. The site learns the mod's state from the same
  request that keeps the player in the queue, so "auto-launch ready" is never
  a stale guess and the countdown can stay at a plain 10 s.
- Less to maintain. The heartbeat route, `mod_presence`'s freshness rules,
  `is_launchable`, `not_launchable_reason` and `not_startable_reason` all
  collapse into "did the last poll say the game is in the menu".

## The shape

```
 ┌───────────────┐   loopback, ~2 s   ┌──────────────────────┐
 │ LadderReporter│ ◄────────────────► │ SanctuaryDB page     │
 │ (in the game) │  GET /status       │ (browser tab, queued │
 │ 127.0.0.1:PORT│  POST /match       │  or in a match room) │
 └──────┬────────┘                    └──────────┬───────────┘
        │ one-off posts, bearer token             │ queueStatus / matchGet,
        │ (session id, events, result)            │ now carrying `mod`
        ▼                                         ▼
 ┌────────────────────────────────────────────────────────────┐
 │ Site (Vercel function + Postgres)                          │
 └────────────────────────────────────────────────────────────┘
```

Three flows:

1. **Presence.** While the player is queued or in an open 1v1, the page asks
   the local mod for its status every 2 s and includes the latest answer in
   the site poll it is already making. The site writes it to `mod_presence`
   exactly as the heartbeat did. Nothing else on the site changes for this.
2. **Launch.** When a site poll comes back with the player's match, the page
   hands the whole match object to the mod (`POST /match`). The mod's
   existing `ApplyMatch` takes it from there unchanged: it already treats the
   object as the single source of truth and converges from any state.
3. **One-off posts.** The host's lobby session id, the progress events and
   the end-of-game report keep going straight from the mod to the site with
   the existing Steam-ticket bearer token. They are rare, and keeping them
   direct means a closed tab cannot lose a result. (Routing them through the
   page is a possible follow-up; see "Later".)

The mod never needs to know whether the player is queued. The `queued` field
in today's heartbeat reply is set in the mod and never read, and it goes.

## The mod's local API

The mod listens on `127.0.0.1` only (never `0.0.0.0`), on a fixed port,
`27555` by default and overridable in the BepInEx config. The page only ever
tries the default; the config knob is for testers.

Implementation note: `HttpListener` needs a URL reservation on Windows unless
the game runs as admin, so use a `TcpListener` with a minimal HTTP/1.1
responder (request line, headers, optional JSON body, one response, close).
Loopback listeners do not trigger the Windows firewall prompt. Run it on a
background thread and marshal into Unity's main thread for anything that
touches the game, same as the ticket callback does today.

### `GET /status`

```json
{
  "modVersion": "0.3.0",
  "gameVersion": "1.0",
  "state": "menu | lobby | loading | ingame | replay",
  "match": { "id": "5a4c…", "status": "launch", "phase": "HostWaiting" } | null
}
```

`state` is `CurrentState()`, with one state more than the heartbeat had:
`replay` (watching a replay, which used to report as `ingame`). The mod can
leave a lobby or close a replay by itself when a match launches, so `menu`,
`lobby` and `replay` are all launchable; only `loading` and `ingame` are not
(migration 0014 says the same on the server). The optional `match` block is
what the mod is currently acting on, for the admin test bench and for
debugging; the site's own record stays the authority. `phase` is the mod's
own state machine (`Idle`, `Leaving`, `HostCreating`, `HostWaiting`,
`JoinerWaiting`, `JoinerJoining`, `JoinerInLobby`, `Started`) — `Leaving` is
the lobby-or-replay exit before a launch. (A `steamId` field, so
the page could spot a second Steam account on the same PC, was considered and
left out of v1 as not worth the Steamworks call.)

### `POST /match`

Body: the match object, exactly the shape `/api/mm/heartbeat` returns today
(see `docs/matchmaking-api.md`, "The match object"). Idempotent: the page
posts it on every poll while the match is open, and the mod handles repeats
the way it handles repeated heartbeat replies now. Response: `{ "ok": true }`
or `{ "ok": false, "error": "…" }` with a 4xx. The mod applies the object via
`ApplyMatch`; nothing about the timeouts or lobby handling changes. A
`failed` event's `detail` is now one of `in a game`, `loading a game`,
`stuck in lobby`, `stuck in replay`, `leave failed: …`, or the unchanged
`map missing` — the only one the server treats specially (it falls back to
manual rather than failing the match).

`POST /match` with `null` (or a match whose status is `done`, `cancelled`,
`failed` or `manual`) is what today's heartbeat reply with `match: null`
was: the mod drops back to idle.

### CORS and origin

Browsers treat `https://www.sanctuarydb.net` → `http://127.0.0.1` as a
cross-origin, private-network request. The mod must:

- answer `OPTIONS` preflights with `Access-Control-Allow-Origin` set to the
  requesting origin when it is on the allow list, plus
  `Access-Control-Allow-Methods: GET, POST`,
  `Access-Control-Allow-Headers: content-type`,
  `Access-Control-Allow-Private-Network: true` and a long
  `Access-Control-Max-Age`;
- send `Access-Control-Allow-Origin` on the real responses too;
- **reject any request whose `Origin` is not on the allow list** with 403.
  Browsers always send `Origin` on cross-origin requests, so this is what
  stops a random web page from pushing a fake match into the game. A local
  non-browser process can already do anything on the machine, so it is not
  the threat here.

Allow list: `https://www.sanctuarydb.net`, and `http://localhost:5173` when
a `DevOrigins` config entry says so. The apex `sanctuarydb.net` redirects to
`www`, so it never appears as an origin.

## The page's side

A new module, `src/lib/mod-bridge.ts`, module-level like `queue-watch.ts`:

- `probe()`: `GET http://127.0.0.1:27555/status` with a 1.5 s timeout.
  Returns the status or `null`. Any failure (no listener, blocked by the
  browser, wrong origin) is `null`; the reason is kept for the UI.
- Opt-in. Nothing is sent to `127.0.0.1` until the player presses
  **Connect to Sanctuary** on the 1v1 card, and players without the mod
  never see the browser's prompt. The choice is kept in `localStorage`
  (`sdb.bridge`) only once a probe has succeeded — that is the one moment
  the page knows the browser allowed the connection and the mod was there.
  A click that ended with the prompt blocked or dismissed, or with the game
  closed, is not remembered, so the next visit shows the button again
  rather than raising the prompt unasked. "Stop looking" forgets it.
- Once enabled, polls every 2 s while something wants it: the Play page is
  open (queued or not, so the "Auto-launch ready" line is live before the
  click; it costs a loopback request and nothing on Vercel), the player is
  queued, or an open 1v1 match room is showing. Stops otherwise. After five
  straight failures it slows to every 15 s, so a dismissed permission prompt
  is not raised again every two seconds; Retry probes at once.
- `pushMatch(match)`: `POST /match`. Called by the match room on every
  answer it gets for a 1v1 the player is in, ended matches included, so the
  mod also learns when to stand down. (A match that forms from a queue sends
  the player to the room, which is why the queue watch needn't push.)
- Exposes the last status through `useSyncExternalStore`, same pattern as
  the queue state and the match alert.

`queueStatus` and `matchGet` gain an optional `mod` argument:

```ts
{ state: 'menu' | 'lobby' | 'loading' | 'ingame', modVersion: string, gameVersion: string } | null
```

The page sends the latest probe result, or `null` when it cannot see the
mod. The server upserts `mod_presence` from it (same row the heartbeat writes
today) when non-null, and does nothing when null so a momentary blip does not
erase a good row; the freshness window takes care of a mod that is really
gone.

Poll cadences after this change:

| Where                          | Today | After                                         |
| ------------------------------ | ----- | --------------------------------------------- |
| Play page, signed in, idle     | 5 s   | none; counts come from the cached endpoint    |
| Queued                         | 5 s   | 5 s (short-lived, and it carries presence)    |
| Match room, countdown / launch | 5 s   | 5 s                                           |
| Match room, playing / reported | 5 s   | 30 s, paused while the tab is hidden          |
| Play page, signed out          | 5 s   | one read of the cached counts, refreshed 30 s |
| Mod, game open, idle           | 5 s   | none                                          |

The cached counts endpoint (`GET /api/queue-counts`,
`s-maxage=10, stale-while-revalidate=30`) is a separate small change and is
listed here only because it is what lets the idle Play page stop polling.

### What the player sees

On the Play page, on the 1v1 card, one block driven by the bridge:

- Not yet connected: a **Connect to Sanctuary** button with one sentence on
  what it does and what the browser's prompt is for: "Your browser will ask
  whether this site can connect to devices on your local network: that is
  the permission for reaching the mod inside your game on this PC." The
  prompt's own wording is the browser's and cannot be changed from either
  side, so the page says what it is for just before it appears.
- Connected, looking: "Looking for your game…" until the first probe answers.
- Mod seen, in the menu: **Auto-launch ready**.
- Mod seen, in a lobby / loading / in a game: "Game seen in a lobby, back
  to the main menu to auto-launch".
- Connected but nothing seen: "Can't see your game. Run Sanctuary with the
  LadderReporter mod. If your browser blocked the connection, allow it in
  this site's permissions." with **Retry** and **Stop looking**.

While players are still on the heartbeat mod, the server's last word about
their mod (from the status poll) stands in for the "seen" lines, so nobody
who will get the auto flow is told otherwise.

The site never gates queueing on any of this.

## Browser support and the permission prompt

An https page may fetch `http://127.0.0.1`: loopback is exempt from
mixed-content blocking. What varies is the local-network permission:

- **Chrome and Edge** show a one-time "allow this site to access your local
  network" prompt on the first request. Allowed is remembered per site. The
  text is the same for a printer on the LAN and for `127.0.0.1` on the same
  PC; there is no API, header or fetch option that changes it, which is why
  the page asks first and explains before the request is made.
- **Safari** prompts similarly on recent macOS.
- **Firefox** currently allows it without a prompt.
- **Brave** blocks localhost access until the user allows it in the site's
  shield settings.
- Privacy extensions may block it outright.

In every blocked case the outcome is the same as not having the mod: manual
hosting. No launch is ever attempted on information the page could not
verify. This is why the manual path has to stay first-class, which it already
is.

## Site changes, in order

1. **Accept `mod` on `queueStatus` and `matchGet`** and upsert
   `mod_presence` from it. Additive; the heartbeat keeps writing the same row
   during the transition.
2. **Widen nothing.** Because presence now arrives with the 5 s queue poll,
   the 15 s launchable window and the "heartbeat since the match was made"
   countdown gate stay as they are. (If the queued poll is ever slowed to
   10 s, widen `is_launchable` to 30 s at the same time.)
3. **`mod-bridge.ts`** and the Play page / match room wiring above.
4. **Cadence changes** in `queue-watch.ts` and the match room, and the
   cached counts endpoint.
5. **Bump `REPORTER_VERSION`** in `ReporterCard.tsx` when the mod ships.
6. **After the mod release has settled:** delete `/api/mm/heartbeat`, the
   heartbeat section of `docs/matchmaking-api.md`, and `HeartbeatSeconds`
   from the mod. `mod_presence` stays; only its writer changed.

Nothing in SQL changes for the bridge itself. `pair_queue`, `sweep_all`,
`sweep_mm_matches` and the launch timeouts read `mod_presence` exactly as
before.

## Mod changes

In `Matchmaking.cs`:

- Remove `HeartbeatRoutine`, `_mmHbAccum`, `_mmHbInFlight`, `_mmQueued`,
  `_cfgMmHeartbeat` and the slow-heartbeat warning.
- Add the loopback listener (new file, `LocalBridge.cs`, partial class as
  `Matchmaking.cs` is). `GET /status` reads `CurrentState()`, `ModVersion`,
  `Application.version`, `LocalSteamId` and the current phase. `POST /match`
  parses with `MmMatch.Parse` and queues `ApplyMatch(m)` for the main
  thread.
- Keep `EnsureSession` / `SessionRoutine`: the bearer token is still needed
  for `PostEvent`, the session-id post and (unchanged) the result report.
  Mint it lazily, on the first `POST /match`, instead of at startup, so a
  player who never queues never asks Steam for a ticket.
- Keep `MockFile`: reading the mock replaces `POST /match`, so the
  two-person mock test still works with no site.
- Config: `Matchmaking.LocalPort` (27555), `Matchmaking.DevOrigins` ("").
- `ModVersion` → `0.3.0`. Behaviour with an older site: the listener sits
  idle, nothing is launched, results still report. Behaviour of the old mod
  with the new site: unchanged, it heartbeats and works, until step 6 above.

## Failure cases

| Case                                      | What happens                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Tab closed while queued                   | Queue entry swept after 90 s, as today.                                                                                  |
| Tab closed during countdown               | Presence goes stale; at zero the site falls back to manual with the usual reason. Same as a closed game today.           |
| Tab closed during launch, games launching | Site sees a quiet mod and falls back to manual; the games may still start. The result still lands on the (manual) match. |
| Mod closed, tab open                      | Probe returns null; the page sends `mod: null`; presence goes stale; manual. Same as today.                              |
| Browser blocks loopback                   | Same as no mod. Play page explains once.                                                                                 |
| Two Steam accounts on one PC              | Not detected in v1: the game signed in as B gets A's match pushed to it and the launch fails on the lobby side. Rare.    |
| Malicious page posts to `/match`          | Rejected on `Origin`.                                                                                                    |
| Mod's `/status` is slow (game loading)    | 1.5 s timeout → `null` for that tick; the next tick recovers. A `null` never overwrites presence.                        |

## Testing

- Unit: `mod-bridge.ts` against a fake `fetch`; the server-side `mod`
  validation.
- Local: run the game with the mod, the site on `localhost:5173` with
  `DevOrigins=http://localhost:5173`, and watch the Play page line change as
  the game moves menu → lobby → menu. `curl -H "Origin: https://evil.example"
http://127.0.0.1:27555/status` must 403.
- Two-player: the existing dev-test recipe (two accounts, one machine is
  fine since the bridge is per-browser-profile and per-game-instance), on a
  preview deployment with `SITE_URL` set, through countdown, launch and
  result.
- Browser matrix: Chrome (prompt), Firefox (no prompt), Brave (blocked until
  allowed), each once.

## Later, not now

- Route the session id, events and report through the page as well and drop
  `mm_sessions` and the Steam ticket flow. Costs a closed-tab-loses-nothing
  guarantee we would have to rebuild; not worth it for three rare posts.
- Slow the queued poll to 10 s once the bridge is in. Needs the wider
  `is_launchable` window from step 2.
- Team modes: the bridge is 1v1-only because auto-launch is. Nothing here
  prevents extending it.

## Decisions

Settled 7 Sep 2026:

- Port `27555`, overridable in the mod config; the page only tries the
  default.
- The Play page probes the mod whenever it is open, queued or not.
- No `steamId` in `/status` for v1; the two-accounts-one-PC case is ignored.

## Compatibility while players are still on the old mod

The site half ships first, and nothing here needs a database migration:
`mod_presence` keeps its shape and the heartbeat keeps writing it through
the same upsert. What each combination does:

| Mod             | Site | Result                                                                                                                                                                                                                                                                                                               |
| --------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.2.x heartbeat | old  | Today.                                                                                                                                                                                                                                                                                                               |
| 0.2.x heartbeat | new  | Unchanged: presence comes from the heartbeat, the match object from the heartbeat reply. Auto-launch works. The page's probe finds no listener and sends `mod: null`, which never touches presence. The Play page and banner show the server's last word about the mod, so the line still reads "Auto-launch ready". |
| 0.3.x bridge    | old  | The listener sits idle. No presence is written, so every match pairs as manual; results still report.                                                                                                                                                                                                                |
| 0.3.x bridge    | new  | The design above.                                                                                                                                                                                                                                                                                                    |

An already-open tab running the previous client bundle keeps working across
the deploy: its `queueStatus()` call without a `mod` field validates to
`null`, and its `queueCounts` call (the server function this replaces with
the cached endpoint) fails quietly and shows dashes until the tab reloads.
