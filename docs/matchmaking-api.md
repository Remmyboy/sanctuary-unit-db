# Matchmaking API (for the in-game mod)

The server half of "queue on the site, get launched into the game". The mod
authenticates once with a Steam web-API ticket and then posts with a bearer
token. It never polls: what the game is doing, and the match it should act
on, travel over the local bridge (`docs/local-bridge.md`) — the page reads
the mod on `127.0.0.1`, relays its state inside the site's own polls, and
hands it the match object. Nobody needs the mod to queue: it only decides
whether a 1v1 pair gets the `auto` flow (both games launch themselves) or
today's `manual` flow.

All bodies and responses are JSON. Errors are `{ "error": "…" }` with a 4xx
status; a `401` means the token is gone and the mod should mint a new one.

## `POST /api/mm/session`

```json
{ "ticket": "<hex>", "identity": "sanctuarydb-ladder" }
```

→ `{ token, steamId, name, expiresAt }`. The ticket must have been minted with
identity `sanctuarydb-ladder` (the reporter's `TicketIdentity`); `identity` in
the body is optional and only checked for equality. Tokens live 6 hours and
only their hash is stored. Signing in on the site first is not required: the
player row is created here if needed.

Every endpoint below takes `Authorization: Bearer <token>`.

## Presence

Not an endpoint. The page sends the mod's `GET /status` answer as `mod` on
`queueStatus` and `matchGet`, and the server writes it to `mod_presence`
(`src/server/presence.ts`):

```json
{ "state": "menu | lobby | loading | ingame | replay", "gameVersion": "…", "modVersion": "…" }
```

A player is **launchable** while their presence is under 15 s old and its
state is `menu`, `lobby` or `replay` — the mod leaves a lobby or closes a
replay itself before launching. `loading` and `ingame` are not launchable.
The site shows this next to the queue ("Auto-launch ready") but never gates
queueing on it.

## The match object

What the page pushes to the mod (`POST /match` on the local bridge), and what
the endpoints below return.

```json
{
  "id": "5a4c…-uuid",
  "mode": "auto | manual",
  "status": "countdown | launch | cancelled | failed | done | manual",
  "host": "7656119…",
  "joiner": "7656119…",
  "opponent": { "steamId": "7656119…", "name": "Skoub" },
  "map": "Maps/The_Forge/The_Forge.sanmap",
  "mapName": "The Forge",
  "factions": { "7656119…": "EDA", "7656119…": "Chosen" },
  "slots": { "7656119…": 1, "7656119…": 2 },
  "sessionId": null,
  "countdownEndsAt": "2026-09-03T15:02:10.000Z",
  "cancelledBy": null,
  "reason": null
}
```

- `status: manual` is this site's addition: an open match the mod must not
  launch — it only reports the result when the game ends. `map` is `null` and
  `factions` is empty on manual matches.
- `slots` is populated for every 1v1, manual ones included: the site shows each
  player which start to take and puts them there on the map preview. On a
  manual match it is a request to a human, not something to act on — the mod
  still must not launch one. It stays empty in team modes, whose maps don't
  order their armies by team.
- `auto` matches start in `countdown` (10 s, site-owned, cancellable on the
  site). At zero, if both players are still startable the status becomes
  `launch`; otherwise the match **falls back to `mode: manual`** with `reason`
  saying who dropped ("Skoub closed the game, so host manually").
- **Startable** is stricter than launchable: presence has to have been
  written _since the match was made_, not merely in the last 15 s. The match
  room polls every 5 s through the countdown, so a running game has always
  been relayed — and a game closed the moment the match formed, whose last
  presence is still under 15 s old at zero, is caught rather than launched
  into nothing.
- The match room pushes ended matches too (`done`, `cancelled`, `failed`), so
  a mod mid-launch learns to stop.
- Match ids are the ladder's UUIDs.

## `POST /api/mm/match/{id}/session` — host only

```json
{ "sessionId": "90150…" }
```

The host's Steam game-server id, as digits (a JSON number is accepted too).
Only while the match is in `launch` (`409` otherwise). The joiner's page picks
it up in `sessionId` on its next poll and pushes it to the mod, which joins.
Returns the match object.

## `POST /api/mm/match/{id}/event`

```json
{ "type": "lobby_created | joined | ready | started | failed | left", "detail": "optional" }
```

Returns the match object. Two events change the match:

- `failed` with `detail` containing `map missing` → the match falls back to
  `manual` (same situation as a player who stopped being launchable). Any
  other `failed` → `status: failed` with the detail in `reason`.
- `left` before both sides have `started` → `status: failed`.

Timeouts after `launch`, enforced lazily by every poll and post:

| Waiting for      | Limit                  | On expiry (`status: failed`)            |
| ---------------- | ---------------------- | --------------------------------------- |
| host `sessionId` | 20 s                   | "Remmy's game could not create a lobby" |
| joiner `joined`  | 30 s after `sessionId` | "Skoub didn't join the lobby"           |
| both `started`   | 60 s after `launch`    | "The game didn't start"                 |

Unless a mod has gone quiet (no presence for 15 s), in which case the match
**falls back to `mode: manual`** instead of failing — someone closed their
game rather than the launch breaking, and the pair still have a match they
can host by hand.

A failed or cancelled auto match is a cancelled ladder match: no rating
change, and both players are free to queue again.

## `POST /api/report`

Unchanged, plus an optional `matchId`. When it names an open match between
the two reported players, that match takes the result; otherwise it is
ignored and the newest open match between them is used as before.

Like `/api/mm/session`, the ticket must be minted with identity
`sanctuarydb-ladder` (`identity` in the body is optional and only checked for
equality), and a banned reporter is answered `403` rather than changing an
open match. Both routes answer `429` past 20 requests a minute from one IP —
far above what the mod sends.

The 200 answer now also names the match the result went to:
`{ "outcome": "reported" | "applied" | "disputed", "matchId": "<uuid>" }`.
That is how a manually hosted game gets the id its uploads need.

A report for a match that is already settled changes nothing, and still
names the match. With both players running the mod this is the usual case
for the second report: the loser's concession completes the match at once.
The match is the one `matchId` names, else one between the two players
settled in the last two hours:

- completed, same winner → 200 `{ "outcome": "applied", "matchId" }`;
- completed, the other winner → 409 `{ "error", "matchId" }`. Its ratings
  are applied, so a client can't reopen it; that is an admin's call;
- disputed → 200 `{ "outcome": "disputed", "matchId" }`.

Only when there is no such match is the answer 404.

## After the game: stats and replay uploads

Opt-in on the player's side (LadderReporter `[Upload] Stats` / `Replays`,
both off by default). Both use the bearer session and are refused for a
match the caller didn't play (404) or one that was cancelled. Neither touches
ratings. The plan and the reasoning are in `docs/replays-and-stats-plan.md`.

### `POST /api/mm/match/{id}/stats`

The MatchStats figures, read once the result screen is up. JSON, at most
256 KB (413 past it). Format 1, validated by `src/lib/match-stats.ts`:

```json
{
  "format": 1,
  "modVersion": "0.4.0",
  "buildId": 20412345,
  "tickRate": 10,
  "endTick": 10430,
  "armies": [
    {
      "steamId": "765…",
      "armyId": 1,
      "name": "…",
      "faction": 2,
      "team": 1,
      "colour": "#3a7bd5",
      "condition": 1,
      "conditionTick": 10400,
      "alloy": { "gathered": 0, "spent": 0, "wasted": 0, "stallTicks": 0, "peakIncome": 0 },
      "energy": { "gathered": 0, "spent": 0, "wasted": 0, "stallTicks": 0, "peakIncome": 0 },
      "maxStorage": 0,
      "built": { "land": 0, "air": 0, "naval": 0, "engineers": 0, "structures": 0, "value": 0 },
      "lost": { "mobile": 0, "structures": 0, "commander": 0, "value": 0 },
      "killedValue": 0,
      "commanderKills": 0,
      "peakArmyValue": 0,
      "peakUnits": 0,
      "score": 0
    }
  ],
  "timeline": {
    "intervalS": 5,
    "t": [0, 5, 10],
    "series": {
      "765…": {
        "alloyIncome": [],
        "energyIncome": [],
        "alloySpend": [],
        "energySpend": [],
        "armyValue": [],
        "units": [],
        "score": []
      }
    }
  }
}
```

`armies` are the seated human players only, each a participant of the
match. Every series has the length of `t`. Answers `{ "ok": true }`, or 400
naming the first bad field. Re-sending replaces the caller's own upload.
When both players upload and the results and scores agree (within 1%), the
match page marks the stats confirmed.

### `POST /api/mm/match/{id}/replay`

Asks to upload the game's `.sanreplay`, which goes straight to Cloudflare R2
(a replay is often bigger than a function request may be):

```json
{
  "sizeBytes": 1195344,
  "sha256": "<64 hex>",
  "gameVersion": "1.0#…",
  "buildId": 20412345,
  "mapPath": "Maps/…/X.sanmap",
  "fileName": "2026-10-04_12-47-17_X.sanreplay",
  "sidecarBytes": 0
}
```

Only once the match has a result (`reported`, `completed`, `disputed`). An
auto match also checks `mapPath` against its own map (400 otherwise). At
most 30 MB, and 256 KB for the `.mods.json` sidecar (413). Answers:

- `{ "upload": { "url": "…", "sidecarUrl": "…" | null }, "expiresAt": "…" }` —
  PUT the raw bytes to `url` (no auth header) and the sidecar to
  `sidecarUrl`, then call `/replay/done`. The URLs last two hours.
- `{ "skip": "stored" }` — the other player's replay is already stored (or
  it was pruned); drop yours.
- `{ "retryAfterS": n }` — the other player is uploading right now. If they
  haven't finished in 15 minutes, their reservation can be taken over.
- 503 with `retryAfterS` — replay storage isn't configured on this
  deployment.

### `POST /api/mm/match/{id}/replay/done`

Body `{}`. The site checks the stored object's size against `sizeBytes` and
publishes the replay: `{ "ok": true }`. A 409 means it didn't match (or
nothing arrived); the reservation is released, so start again from
`/replay`.

### `GET /api/replays/{matchId}`

Public: redirects to a five-minute download link that saves the file under
the game's own name. 404 when there is no ready replay.

## Live replays

`POST /api/mm/live`, `POST /api/mm/live/{id}/chunk/{seq}`,
`POST /api/mm/live/{id}/end` (bearer) and the public `GET /api/live/{id}`:
see [live-replays.md](live-replays.md).

## Why a match went manual

Every 1v1 match that could have been auto but wasn't carries the reason in
`reason` (and on the match page), recorded at pairing time, as long as at
least one player's mod had been seen in the last minute:

- `Skoub isn't running the mod`
- `Skoub's last heartbeat was 22 s old` (the mod was there but the relay
  stalled or stopped; the wording is the database's, from before the bridge)
- `Skoub is loading a game` / `is in a game` (a lobby or a replay is no
  longer a reason: the mod leaves it)
- `no map in the 1v1 pool has a path set`

Two players' reasons are joined with `; `. A countdown that falls back to
manual uses the same wording plus `, so host manually`.

Map paths for every shipped map are seeded server-side (`shipped_maps`), so a
pool map only needs a path typed in on the admin page if the game's list
doesn't already know it.

## A note on `status: manual`

The agreed list was `countdown | launch | cancelled | failed | done`. Open
manual matches report `manual` so the mod has one field to check before doing
anything on the auto path; `done`, `cancelled` and `failed` are reported the
same way for both modes.
