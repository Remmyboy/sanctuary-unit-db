import { beforeEach, describe, expect, it } from 'vitest';
import { allowRequest, clientIp, resetRateLimits } from './rate-limit';

describe('allowRequest', () => {
  beforeEach(() => resetRateLimits());

  it('allows 20 a minute per key, then refuses until the window passes', () => {
    const t = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allowRequest('report:1.2.3.4', t + i)).toBe(true);
    expect(allowRequest('report:1.2.3.4', t + 30_000)).toBe(false);
    expect(allowRequest('report:5.6.7.8', t + 30_000)).toBe(true);
    expect(allowRequest('report:1.2.3.4', t + 60_000)).toBe(true);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://x/api/report', { headers });

  it('prefers x-real-ip, then the first x-forwarded-for hop', () => {
    expect(clientIp(req({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9');
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 10.0.0.1' }))).toBe('1.1.1.1');
    expect(clientIp(req({}))).toBe('unknown');
  });
});
