import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifySteamCallback } from './steam';

const SITE = 'https://sanctuarydb.test';
const STEAM_ID = '76561198000000001';

// A positive assertion shaped like the ones Steam sends back.
function assertion(overrides: Record<string, string | null> = {}): URL {
  const params: Record<string, string> = {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': `${SITE}/api/auth/steam/callback`,
    'openid.response_nonce': '2026-10-02T12:00:00ZabcdEF',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2ln',
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete params[key];
    else params[key] = value;
  }
  return new URL(`${SITE}/api/auth/steam/callback?${new URLSearchParams(params)}`);
}

describe('verifySteamCallback', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('SITE_URL', SITE);
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('accepts an assertion issued for our callback', async () => {
    await expect(verifySteamCallback(assertion())).resolves.toBe(STEAM_ID);
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get('openid.mode')).toBe('check_authentication');
  });

  it('rejects when Steam does not vouch for it', async () => {
    fetchMock.mockResolvedValue(new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'));
    await expect(verifySteamCallback(assertion())).resolves.toBeNull();
  });

  // The replay: a genuine, unredeemed assertion another Steam-login site
  // received. Steam would call it valid, so it must never reach Steam.
  it('rejects an assertion issued for another site', async () => {
    const replay = assertion({ 'openid.return_to': 'https://evil.example/api/auth/steam/callback' });
    await expect(verifySteamCallback(replay)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects another path on our own origin', async () => {
    const other = assertion({ 'openid.return_to': `${SITE}/somewhere-else` });
    await expect(verifySteamCallback(other)).resolves.toBeNull();
  });

  it('tolerates a query Steam adds to our callback', async () => {
    const withQuery = assertion({ 'openid.return_to': `${SITE}/api/auth/steam/callback?x=1` });
    await expect(verifySteamCallback(withQuery)).resolves.toBe(STEAM_ID);
  });

  it('rejects when return_to or claimed_id is not covered by the signature', async () => {
    const unsigned = assertion({ 'openid.signed': 'signed,op_endpoint,identity,response_nonce' });
    await expect(verifySteamCallback(unsigned)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a different OpenID provider', async () => {
    const elsewhere = assertion({ 'openid.op_endpoint': 'https://openid.example/login' });
    await expect(verifySteamCallback(elsewhere)).resolves.toBeNull();
  });

  it('rejects mismatched claimed_id and identity', async () => {
    const mixed = assertion({ 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000002' });
    await expect(verifySteamCallback(mixed)).resolves.toBeNull();
  });

  it('rejects a claimed_id that is not a Steam profile', async () => {
    const url = 'https://steamcommunity.com/openid/id/123';
    const odd = assertion({ 'openid.claimed_id': url, 'openid.identity': url });
    await expect(verifySteamCallback(odd)).resolves.toBeNull();
  });

  it('ignores anything but a positive assertion', async () => {
    await expect(verifySteamCallback(assertion({ 'openid.mode': 'cancel' }))).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
