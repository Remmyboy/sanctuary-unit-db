# Ladder database

`migrations/` is the ladder schema, applied in filename order by `npm run db:migrate` (`scripts/db-migrate.js`), once each, tracked in a `schema_migrations` table. Applied files are history: never edit one, add the next number instead.

Most functions are `create or replace`d by later migrations, so the first file to define one is rarely the one that runs. This is where each function's live definition is. `migrations.test.ts` rebuilds this list from the SQL and fails if it drifts, applies every migration to an in-memory Postgres (PGlite), and checks the SQL Elo and 1v1 pairing against `src/lib/elo.ts` and `src/lib/matchmaking.ts`.

| Function                                  | Live definition                | Earlier definitions    | Mirrored in                                        |
| ----------------------------------------- | ------------------------------ | ---------------------- | -------------------------------------------------- |
| `queue_radius(timestamptz)`               | `0002_ladder`                  |                        | `src/lib/matchmaking.ts` `searchRadius`            |
| `apply_match_result(uuid, integer)`       | `0006_drop_legacy_ratings`     | 0003, 0005             | `src/lib/elo.ts` `applyTeamResult`                 |
| `finalize_due_matches()`                  | `0003_results`                 |                        |                                                    |
| `ensure_rating(uuid, text)`               | `0005_modes`                   |                        |                                                    |
| `pair_queue(text, text[])`                | `0013_manual_slots`            | 0005, 0009, 0010, 0011 | `src/lib/matchmaking.ts` `formGroups`, `bestSplit` |
| `admin_delete_match(uuid)`                | `0007_admin_delete`            |                        |                                                    |
| `is_launchable(uuid)`                     | `0014_replay_state`            | 0009                   |                                                    |
| `player_label(uuid)`                      | `0009_matchmaking`             |                        |                                                    |
| `not_launchable_reason(uuid)`             | `0014_replay_state`            | 0009, 0010             |                                                    |
| `mm_fallback_manual(uuid, text)`          | `0009_matchmaking`             |                        |                                                    |
| `mm_fail(uuid, text)`                     | `0009_matchmaking`             |                        |                                                    |
| `sweep_mm_matches()`                      | `0012_auto_launch_game_closed` | 0009                   |                                                    |
| `sweep_all()`                             | `0010_matchmaking_reasons`     |                        |                                                    |
| `not_startable_reason(uuid, timestamptz)` | `0014_replay_state`            | 0012                   |                                                    |
| `mm_launch_timeout(uuid, text)`           | `0012_auto_launch_game_closed` |                        |                                                    |

Dropped: the one-argument `pair_queue(text[])` (0002, kept as a compatibility overload in 0005), removed by 0006.

Two comments in applied migrations have gone stale and are left as written: 0011's header says `apply_match_result` reads ratings from `players` (they have lived in `player_ratings` since 0005), and names `blockingMatchIdFor`, which is now `UNFINISHED_SQL` in `src/server/queue-fns.ts`.
