import { describe, expect, it } from 'vitest';
import {
  checkChunk,
  liveChunkKey,
  liveMapName,
  liveTeams,
  parseLiveStart,
  releasedBefore,
  streamOver,
  LIVE_DELAY_S,
  STALE_S,
  type LiveStart,
} from './live-replay';

const start = (over: Record<string, unknown> = {}) => ({
  mapPath: 'Maps/~TEAM-1v1_Tropical_256_92536/~TEAM-1v1_Tropical_256_92536.sanmap',
  gameVersion: '1.0#5f3c9a',
  buildId: 20412345,
  fileName: '2026-10-10_12-47-17_~TEAM-1v1_Tropical_256_92536.sanreplay',
  players: [
    { name: 'Remmy', team: 1, kind: 'player' },
    { name: 'AI: Duck', team: 2, kind: 'ai' },
    { name: 'Caster', team: -1, kind: 'observer' },
  ],
  ...over,
});

describe('parseLiveStart', () => {
  it('accepts what the mod sends', () => {
    const r = parseLiveStart(start());
    expect(r).toMatchObject({ buildId: 20412345, sidecar: null });
    expect((r as { players: unknown[] }).players).toHaveLength(3);
  });

  it('names the first bad field', () => {
    expect(parseLiveStart(null)).toBe('body');
    expect(parseLiveStart(start({ mapPath: 'x.txt' }))).toBe('mapPath');
    expect(parseLiveStart(start({ gameVersion: '' }))).toBe('gameVersion');
    expect(parseLiveStart(start({ buildId: -1 }))).toBe('buildId');
    expect(parseLiveStart(start({ players: [{ name: 'a', team: 1, kind: 'host' }] }))).toBe('players');
    expect(parseLiveStart(start({ players: [{ name: '   ', team: 1, kind: 'player' }] }))).toBe('players');
    expect(parseLiveStart(start({ sidecar: [1] }))).toBe('sidecar');
  });

  it('cleans names', () => {
    const r = parseLiveStart(start({ players: [{ name: '<b>Bob</b>\u0007', team: 0, kind: 'player' }] }));
    expect((r as { players: { name: string }[] }).players[0].name).toBe('bBob/b');
  });
});

// A recording in the game's layout: int32 header length + header, then
// frames of `100, int32 length, payload`.
const frame = (n: number) => {
  const b = new Uint8Array(5 + n);
  b[0] = 100;
  new DataView(b.buffer).setInt32(1, n, true);
  return b;
};
const header = (n: number) => {
  const b = new Uint8Array(4 + n);
  new DataView(b.buffer).setInt32(0, n, true);
  return b;
};
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe('checkChunk', () => {
  it('accepts whole frames, with the header first', () => {
    expect(checkChunk(cat(header(40), frame(10), frame(0), frame(300)), true)).toBeNull();
    expect(checkChunk(header(40), true)).toBeNull();
    expect(checkChunk(cat(frame(10), frame(7)), false)).toBeNull();
  });

  it('refuses torn or foreign bytes', () => {
    expect(checkChunk(new Uint8Array(0), false)).toBe('empty');
    expect(checkChunk(cat(frame(10), frame(7)).subarray(0, 20), false)).toMatch(/torn/);
    expect(checkChunk(cat(header(40), frame(3)), false)).toMatch(/not a frame/);
    expect(checkChunk(frame(3), true)).toBe('bad header');
    expect(checkChunk(header(40).subarray(0, 20), true)).toBe('bad header');
  });

  it('reads a chunk that is a view into a bigger buffer', () => {
    const whole = cat(frame(2), frame(4), frame(6));
    expect(checkChunk(whole.subarray(7), false)).toBeNull();
  });
});

describe('timing rules', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  it('holds chunks back by the delay', () => {
    expect(releasedBefore(now).getTime()).toBe(now.getTime() - LIVE_DELAY_S * 1000);
  });

  it('calls a quiet stream over', () => {
    expect(streamOver('live', new Date(now.getTime() - 10_000), now)).toBe(false);
    expect(streamOver('live', new Date(now.getTime() - (STALE_S + 1) * 1000), now)).toBe(true);
    expect(streamOver('ended', now, now)).toBe(true);
  });
});

describe('names', () => {
  it('keys chunks in order', () => {
    expect(liveChunkKey('abc', 7)).toBe('live/abc/000007.bin');
  });

  it('shows maps and teams', () => {
    expect(liveMapName('Maps/~TEAM-1v1_Tropical/~TEAM-1v1_Tropical.sanmap')).toBe('TEAM-1v1 Tropical');
    const teams = liveTeams((parseLiveStart(start()) as LiveStart).players);
    expect(teams.map((t) => t.map((p) => p.name))).toEqual([['Remmy'], ['AI: Duck']]);
  });
});
