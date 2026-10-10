// The `ssl` option db-migrate.js hands postgres.js.
//
// Supabase needs TLS, but a local or CI Postgres usually has none, and an
// explicit `ssl` option overrides whatever the URL says. So, in order:
//   1. `?sslmode=` on DATABASE_URL, as libpq reads it
//   2. PGSSLMODE in the environment
//   3. off for a loopback host, 'require' for anything else
// 'disable' means off; any other mode (require, prefer, verify-full...) is
// passed through, which postgres.js accepts as-is.

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export function sslFor(databaseUrl, env = process.env) {
  let url = null;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Unparseable here (postgres.js has its own, looser parser): no host to
    // judge by, so only an explicit PGSSLMODE can turn TLS off.
  }
  const mode = url?.searchParams.get('sslmode') || env.PGSSLMODE;
  if (mode) return mode === 'disable' ? false : mode;
  return url && LOOPBACK.has(url.hostname) ? false : 'require';
}
