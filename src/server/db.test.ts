import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guard, siteUrl } from './db';

// The watchdog is the whole point of the guarded client: a query on a dead
// pooled socket never answers, and without this every later call on the
// same warm instance queues behind it.
describe('guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('passes a prompt answer through', async () => {
    await expect(guard(Promise.resolve([{ n: 1 }]), 'select 1')).resolves.toEqual([{ n: 1 }]);
  });

  it('passes a prompt failure through', async () => {
    await expect(guard(Promise.reject(new Error('syntax')), 'select ?')).rejects.toThrow('syntax');
  });

  it('gives up on a query that never answers', async () => {
    const never = new Promise<never>(() => {});
    const result = guard(never, 'select pg_sleep(999)');
    const settled = expect(result).rejects.toThrow(/did not answer in time/);
    await vi.advanceTimersByTimeAsync(8000);
    await settled;
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('resetting connections'));
  });

  it('does not fire the watchdog after a normal answer', async () => {
    await guard(Promise.resolve(1), 'select 1');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('siteUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps its own message when SITE_URL is unset or blank', () => {
    for (const value of ['', '  ']) {
      vi.stubEnv('SITE_URL', value);
      expect(() => siteUrl()).toThrow('SITE_URL must be set (see .env.example)');
    }
  });

  it('returns the origin, with or without a trailing slash', () => {
    vi.stubEnv('SITE_URL', 'https://sanctuarydb.example/');
    expect(siteUrl()).toBe('https://sanctuarydb.example');
    vi.stubEnv('SITE_URL', 'https://sanctuarydb.example');
    expect(siteUrl()).toBe('https://sanctuarydb.example');
    // What dev, CI and the e2e suite run with.
    vi.stubEnv('SITE_URL', 'http://localhost:4173');
    expect(siteUrl()).toBe('http://localhost:4173');
  });

  it('rejects anything that is not a bare HTTP(S) origin', () => {
    for (const value of [
      'sanctuarydb.example',
      'ftp://x.example',
      'https://x.example/ladder',
      'https://u:p@x.example',
    ]) {
      vi.stubEnv('SITE_URL', value);
      expect(() => siteUrl()).toThrow('SITE_URL must be');
    }
  });
});
