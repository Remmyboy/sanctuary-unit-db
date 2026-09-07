// The bridge answers with "not visible" for every kind of failure — the
// server must never learn the difference between no mod and a blocked one,
// and the page must never crash on a mod that speaks nonsense.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fresh = async () => {
  vi.resetModules();
  return import('./mod-bridge');
};

const reply = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) } as unknown as Response);

describe('mod-bridge', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a well-formed status', async () => {
    vi.stubGlobal('fetch', reply({ state: 'menu', modVersion: '0.3.0', gameVersion: '1.0' }));
    const bridge = await fresh();
    expect(await bridge.probe()).toEqual({ state: 'menu', modVersion: '0.3.0', gameVersion: '1.0' });
  });

  it('treats an unknown state as no mod', async () => {
    vi.stubGlobal('fetch', reply({ state: 'dancing' }));
    const bridge = await fresh();
    expect(await bridge.probe()).toBeNull();
  });

  it('treats a refused connection as no mod', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const bridge = await fresh();
    expect(await bridge.probe()).toBeNull();
  });

  it('treats a non-2xx answer as no mod', async () => {
    vi.stubGlobal('fetch', reply({ state: 'menu' }, false));
    const bridge = await fresh();
    expect(await bridge.probe()).toBeNull();
  });

  it('has no signal to relay before the mod has been seen', async () => {
    const bridge = await fresh();
    expect(bridge.bridgeSignal()).toBeNull();
    expect(bridge.bridgeSnapshot().probed).toBe(false);
  });

  it('posts the match and reports whether the mod took it', async () => {
    const fetchMock = reply({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const bridge = await fresh();
    expect(await bridge.pushMatch(null)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:27555/match');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('null');
  });

  it('does nothing outside a browser', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('window', undefined);
    const bridge = await fresh();
    expect(await bridge.probe()).toBeNull();
    expect(await bridge.pushMatch(null)).toBe(false);
  });
});
