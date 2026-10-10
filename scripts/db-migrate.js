// Applies supabase/migrations/*.sql in filename order, once each, tracked in
// a schema_migrations table. Plain Node like the rest of scripts/ — reads
// DATABASE_URL from the environment or .env.
//
//   node scripts/db-migrate.js            # apply everything pending
//   node scripts/db-migrate.js 0005       # apply pending up to and including 0005
//
// The bound exists for two-step rollouts: an additive migration first, the
// new code deployed, then the migration that drops what the old code used.
//
// TLS is required except for a localhost database; `?sslmode=` on the URL or
// PGSSLMODE overrides that (see lib/db-ssl.js).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import { sslFor } from './lib/db-ssl.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Node's own .env reader: handles quotes, comments and `export`, and never
// overrides a variable the shell already set.
if (!process.env.DATABASE_URL && existsSync(join(root, '.env'))) {
  process.loadEnvFile(join(root, '.env'));
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (env or .env).');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  prepare: false,
  ssl: sslFor(process.env.DATABASE_URL),
  max: 1,
});

try {
  await sql`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const dir = join(root, 'supabase', 'migrations');
  const until = process.argv[2];
  const pending = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !applied.has(f))
    .filter((f) => !until || f.slice(0, until.length) <= until)
    .sort();

  if (pending.length === 0) {
    console.log('Nothing to apply — schema is up to date.');
  }
  for (const name of pending) {
    const body = readFileSync(join(dir, name), 'utf8');
    // One transaction: a migration that fails part-way leaves nothing behind,
    // and one that succeeds is always recorded, so a re-run never applies it
    // twice. simple() allows the multi-statement files through the pooler,
    // which keeps a transaction on one connection in transaction mode.
    await sql.begin(async (tx) => {
      await tx.unsafe(body).simple();
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    console.log(`applied ${name}`);
  }
} finally {
  await sql.end();
}
