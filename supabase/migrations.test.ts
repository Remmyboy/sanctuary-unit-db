// The migrations, applied in order to an in-memory Postgres (PGlite), then
// the parts of the SQL that src/lib mirrors driven against their TypeScript
// references. Nothing here touches a real database.
//
// No Supabase stubs are needed: the migrations use only core Postgres
// (gen_random_uuid, advisory locks, RLS with no policies), so PGlite runs
// them as written.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyTeamResult, type EloPlayer } from '../src/lib/elo';
import { pairQueue, type QueueCandidate } from '../src/lib/matchmaking';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const name of migrations) {
    try {
      await db.exec(readFileSync(join(migrationsDir, name), 'utf8'));
    } catch (err) {
      throw new Error(`${name} failed to apply: ${(err as Error).message}`, { cause: err });
    }
  }
}, 60_000);

afterAll(async () => {
  await db?.close();
});

// Every test starts from the migrated schema with no players (the cascade
// clears queues, matches and ratings with them).
beforeEach(async () => {
  await db.exec('truncate players cascade');
});

let steamIds = 0;
async function addPlayer(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into players (steam_id, persona_name) values ($1, 'p') returning id`,
    [`7656119800000${String(++steamIds).padStart(4, '0')}`],
  );
  return rows[0].id;
}

describe('migrations', () => {
  it('applies 0001 onwards cleanly, in order', () => {
    expect(migrations[0]).toMatch(/^0001_/);
    expect(migrations.length).toBeGreaterThanOrEqual(14);
  });
});

describe('apply_match_result matches src/lib/elo.ts', () => {
  async function playMatch(winners: EloPlayer[], losers: EloPlayer[], mode: string) {
    const { rows } = await db.query<{ id: string }>(
      `insert into matches (status, mode, map_name, host_player_id, reported_winner_team)
       values ('reported', $1, 'Map', $2, 1) returning id`,
      [mode, await addPlayer()],
    );
    const matchId = rows[0].id;
    const ids: string[] = [];
    for (const [team, players] of [
      [1, winners],
      [2, losers],
    ] as const) {
      for (const p of players) {
        const id = await addPlayer();
        ids.push(id);
        await db.query(
          `insert into player_ratings (player_id, mode, rating, games_played) values ($1, $2, $3, $4)`,
          [id, mode, p.rating, p.gamesPlayed],
        );
        await db.query(
          `insert into match_participants (match_id, player_id, team, rating_before) values ($1, $2, $3, $4)`,
          [matchId, id, team, p.rating],
        );
      }
    }

    await db.query('select apply_match_result($1, 1)', [matchId]);

    const after = async (id: string) =>
      (
        await db.query<{ rating: number }>(
          `select rating from player_ratings where player_id = $1 and mode = $2`,
          [id, mode],
        )
      ).rows[0].rating;
    const ratings = await Promise.all(ids.map(after));
    const status = (await db.query<{ status: string }>('select status from matches where id = $1', [matchId]))
      .rows[0].status;
    return {
      winnersAfter: ratings.slice(0, winners.length),
      losersAfter: ratings.slice(winners.length),
      status,
    };
  }

  const p = (rating: number, gamesPlayed: number): EloPlayer => ({ rating, gamesPlayed });

  it.each<[string, EloPlayer[], EloPlayer[], string]>([
    ['equals, both provisional', [p(1000, 0)], [p(1000, 0)], '1v1'],
    ['equals, both established', [p(1000, 10)], [p(1000, 25)], '1v1'],
    ['last provisional game vs first standard', [p(1000, 9)], [p(1000, 10)], '1v1'],
    ['upset: underdog wins', [p(1000, 30)], [p(1400, 30)], '1v1'],
    ['favourite wins', [p(1400, 30)], [p(1000, 30)], '1v1'],
    ['mixed K, uneven ratings', [p(1234, 3)], [p(987, 50)], '1v1'],
    ['loser at the floor', [p(150, 30)], [p(110, 4)], '1v1'],
    ['loser already on the floor', [p(500, 30)], [p(100, 30)], '1v1'],
    ['near-half rounding', [p(1017, 12)], [p(1000, 12)], '1v1'],
    ['2v2 team averages', [p(1100, 2), p(900, 20)], [p(1050, 15), p(1000, 0)], '2v2'],
    [
      '3v3 with a provisional',
      [p(1200, 40), p(800, 1), p(1000, 10)],
      [p(1000, 9), p(1300, 11), p(950, 30)],
      '3v3',
    ],
  ])('%s', async (_name, winners, losers, mode) => {
    const sql = await playMatch(winners, losers, mode);
    expect(sql.status).toBe('completed');
    expect({ winnersAfter: sql.winnersAfter, losersAfter: sql.losersAfter }).toEqual(
      applyTeamResult(winners, losers),
    );
  });

  it('agrees on a sweep of 1v1 ratings and game counts', async () => {
    const mismatches: string[] = [];
    for (const w of [100, 640, 999, 1000, 1001, 1333, 2100]) {
      for (const l of [100, 777, 1000, 1250, 1800]) {
        for (const games of [0, 9, 10]) {
          const winner = p(w, games);
          const loser = p(l, 19 - games);
          const sql = await playMatch([winner], [loser], '1v1');
          const ts = applyTeamResult([winner], [loser]);
          if (sql.winnersAfter[0] !== ts.winnersAfter[0] || sql.losersAfter[0] !== ts.losersAfter[0]) {
            mismatches.push(
              `${w}/${games} beat ${l}: sql ${sql.winnersAfter}/${sql.losersAfter}, ts ${ts.winnersAfter}/${ts.losersAfter}`,
            );
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  }, 60_000);
});

describe('pair_queue matches src/lib/matchmaking.ts', () => {
  it('forms the same 1v1 pairs from the same queue', async () => {
    // Seconds waited and rating. Offsets sit mid-minute so the radius steps
    // (+100 per full minute) can't flip between the SQL now() and Date.now().
    const queue: Array<[name: string, rating: number, waited: number]> = [
      ['oldest, unmatched', 1000, 190], // radius 400
      ['old, wide', 2000, 310], // radius 600
      ['old partner', 2450, 275], // radius 500 — 450 apart, inside both
      ['too far', 1500, 130], // radius 300 — 500 from the 1000
      ['fresh', 1180, 30], // radius 100
      ['fresh partner', 1250, 10], // radius 100 — 70 from 'fresh'
    ];
    const nowMs = Date.now();
    const byId = new Map<string, string>();
    const candidates: QueueCandidate[] = [];
    for (const [name, rating, waited] of queue) {
      const id = await addPlayer();
      byId.set(id, name);
      await db.query(
        `insert into queue_entries (player_id, mode, rating, joined_at) values ($1, '1v1', $2, now() - $3 * interval '1 second')`,
        [id, rating, waited],
      );
      candidates.push({ playerId: id, rating, joinedAtMs: nowMs - waited * 1000 });
    }

    // Two statements: one that reads match_participants in the same statement
    // as the pairing pass wouldn't see the rows it inserts.
    await db.query(`select pair_queue('1v1', array['Map'])`);
    const { rows } = await db.query<{ ids: string[] }>(
      `select array_agg(player_id) as ids from match_participants group by match_id`,
    );
    const sqlPairs = rows.map((r) => r.ids.map((id) => byId.get(id)).sort());
    const tsPairs = pairQueue(candidates, nowMs).map((pair) => pair.map((id) => byId.get(id)).sort());

    expect(tsPairs.sort()).toEqual([
      ['fresh', 'fresh partner'],
      ['old partner', 'old, wide'],
    ]);
    expect(sqlPairs.sort()).toEqual(tsPairs);
  });
});

describe('supabase/README.md', () => {
  it("names the migration holding each function's live definition", () => {
    // Every `create or replace function name(arg types)` per signature, in
    // order: the last is live, the rest are history. `drop function` removes it.
    const defined = new Map<string, string[]>();
    const signature = (name: string, args: string) =>
      `${name}(${args
        .split(',')
        .map((a) => a.trim().split(/\s+/).at(-1))
        .filter(Boolean)
        .join(', ')})`;
    for (const file of migrations) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8').replace(/--[^\n]*/g, '');
      for (const m of sql.matchAll(/create\s+or\s+replace\s+function\s+(\w+)\s*\(([^)]*)\)/gi)) {
        const sig = signature(m[1], m[2]);
        defined.set(sig, [...(defined.get(sig) ?? []), file.replace(/\.sql$/, '')]);
      }
      for (const m of sql.matchAll(/drop\s+function\s+if\s+exists\s+(\w+)\s*\(([^)]*)\)/gi)) {
        defined.delete(signature(m[1], m[2]));
      }
    }
    const fromSql = Object.fromEntries(
      [...defined].map(([sig, files]) => [
        sig,
        { live: files.at(-1), earlier: files.slice(0, -1).map((f) => f.slice(0, 4)) },
      ]),
    );

    // | `signature` | `0006_name` | 0003, 0005 | ...
    const readme = readFileSync(join(here, 'README.md'), 'utf8');
    const fromReadme = Object.fromEntries(
      [...readme.matchAll(/^\|\s*`([^`]+)`\s*\|\s*`(\d{4}_\w+)`\s*\|([^|]*)\|/gm)].map((m) => [
        m[1],
        { live: m[2], earlier: m[3].match(/\d{4}/g) ?? [] },
      ]),
    );
    expect(fromReadme).toEqual(fromSql);
  });
});
