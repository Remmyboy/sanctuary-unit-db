import { describe, expect, it } from 'vitest';
import { sslFor } from './db-ssl.js';

const SUPABASE = 'postgresql://postgres.x:pw@aws-1-eu-west-1.pooler.supabase.com:6543/postgres';

describe('sslFor', () => {
  it('requires TLS for a remote host, as Supabase needs', () => {
    expect(sslFor(SUPABASE, {})).toBe('require');
  });

  it('turns TLS off for a loopback Postgres', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(sslFor(`postgres://u:p@${host}:5432/db`, {})).toBe(false);
    }
  });

  it('lets the URL sslmode win, then PGSSLMODE', () => {
    expect(sslFor(`${SUPABASE}?sslmode=disable`, { PGSSLMODE: 'require' })).toBe(false);
    expect(sslFor('postgres://u:p@localhost/db?sslmode=verify-full', {})).toBe('verify-full');
    expect(sslFor('postgres://u:p@db.ci.internal/db', { PGSSLMODE: 'disable' })).toBe(false);
    expect(sslFor('postgres://u:p@localhost/db', { PGSSLMODE: 'require' })).toBe('require');
  });

  it('falls back to requiring TLS when the URL does not parse', () => {
    expect(sslFor('not a url', {})).toBe('require');
    expect(sslFor('not a url', { PGSSLMODE: 'disable' })).toBe(false);
  });
});
