// The bridge answers with "not visible" for every kind of failure — the
// server must never learn the difference between no mod and a blocked one,
// and the page must never crash on a mod that speaks nonsense. And it never
// speaks to 127.0.0.1 at all until the player has opted in: the first
// request is what raises the browser's local-network prompt.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fresh = async () => {
  vi.resetModules();
  return import('./mod-bridge');
};

const reply = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) } as unknown as Response);

const storage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('mod-bridge', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', storage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reads a well-formed status', async () => {
    vi.stubGlobal('fetch', reply({ state: 'menu', modVersion: '0.3.0', gameVersion: '1.0' }));
    const bridge = await fresh();
    expect(await bridge.probe()).toEqual({
      state: 'menu',
      modVersion: '0.3.0',
      gameVersion: '1.0',
      match: null,
    });
  });

  it('keeps what the mod is acting on, for the test bench', async () => {
    vi.stubGlobal(
      'fetch',
      reply({ state: 'replay', match: { id: 'm1', status: 'launch', phase: 'HostWaiting' } }),
    );
    const bridge = await fresh();
    expect(await bridge.probe()).toEqual({
      state: 'replay',
      modVersion: null,
      gameVersion: null,
      match: { id: 'm1', status: 'launch', phase: 'HostWaiting' },
    });
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

  it('is off until the player opts in, and remembers the choice', async () => {
    const bridge = await fresh();
    expect(bridge.bridgeSnapshot().enabled).toBe(false);
    bridge.enableBridge();
    expect(bridge.bridgeSnapshot().enabled).toBe(true);
    const again = await fresh();
    expect(again.bridgeSnapshot().enabled).toBe(true);
    again.disableBridge();
    expect((await fresh()).bridgeSnapshot().enabled).toBe(false);
  });

  it('never touches 127.0.0.1 while off — not even with a page watching', async () => {
    const fetchMock = reply({ state: 'menu' });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const bridge = await fresh();
    const release = bridge.watchBridge();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await bridge.pushMatch(null)).toBe(false);
    release();
  });

  it('probes as soon as the player opts in, and relays what it sees', async () => {
    const fetchMock = reply({ state: 'menu', modVersion: '0.3.0' });
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const bridge = await fresh();
    const release = bridge.watchBridge();
    bridge.enableBridge();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bridge.bridgeSignal()).toEqual({ state: 'menu', modVersion: '0.3.0', gameVersion: null });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    release();
  });

  it('backs off once the mod has gone quiet, so a dismissed prompt is not nagged', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    const bridge = await fresh();
    const release = bridge.watchBridge();
    bridge.enableBridge();
    // Five quick failures, then the slow cadence.
    await vi.advanceTimersByTimeAsync(2000 * 4 + 10);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(2000 * 3);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    // Retry is immediate regardless.
    bridge.retryBridge();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    release();
  });

  it('posts the match and reports whether the mod took it', async () => {
    const fetchMock = reply({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const bridge = await fresh();
    bridge.enableBridge();
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
