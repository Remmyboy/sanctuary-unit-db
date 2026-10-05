import { describe, expect, it } from 'vitest';
import { formatBytes, mapStem, parseReplaySlot, replayKeys, safeReplayName } from './match-replay';

const slot = (over: Record<string, unknown> = {}) => ({
  sizeBytes: 1195344,
  sha256: 'AB'.repeat(32),
  gameVersion: '1.0#5f3c9a',
  buildId: 20412345,
  mapPath: 'Maps/~TEAM-1v1_Tropical_256_92536/~TEAM-1v1_Tropical_256_92536.sanmap',
  fileName: '2026-10-04_12-47-17_~TEAM-1v1_Tropical_256_92536.sanreplay',
  sidecarBytes: 0,
  ...over,
});

describe('parseReplaySlot', () => {
  it('accepts what the mod sends', () => {
    const r = parseReplaySlot(slot());
    expect(r).toMatchObject({ sizeBytes: 1195344, buildId: 20412345, sidecarBytes: 0 });
    expect((r as { sha256: string }).sha256).toBe('ab'.repeat(32));
  });

  it('names the first bad field', () => {
    expect(parseReplaySlot(slot({ sizeBytes: 0 }))).toBe('sizeBytes');
    expect(parseReplaySlot(slot({ sha256: 'nope' }))).toBe('sha256');
    expect(parseReplaySlot(slot({ mapPath: 'Maps/x.txt' }))).toBe('mapPath');
    expect(parseReplaySlot(slot({ sidecarBytes: -3 }))).toBe('sidecarBytes');
    expect(parseReplaySlot(null)).toBe('body');
  });

  it('treats a zero build id as unknown', () => {
    expect(parseReplaySlot(slot({ buildId: 0 }))).toMatchObject({ buildId: null });
  });
});

describe('safeReplayName', () => {
  it("keeps the game's own names intact", () => {
    expect(safeReplayName('2026-10-04_12-47-17_~TEAM-1v1_Tropical_256_92536.sanreplay')).toBe(
      '2026-10-04_12-47-17_~TEAM-1v1_Tropical_256_92536.sanreplay',
    );
  });

  it('replaces anything unsafe for a header or a path', () => {
    expect(safeReplayName('a"b/c\\d\r\n.sanreplay')).toBe('a_b_c_d__.sanreplay');
    expect(safeReplayName('')).toBe('match.sanreplay');
  });
});

describe('replayKeys', () => {
  it('groups by month, with the sidecar beside the replay', () => {
    const k = replayKeys('2b5e…', new Date('2026-10-04T12:00:00Z'));
    expect(k.object).toBe('replays/2026/10/2b5e….sanreplay');
    expect(k.sidecar).toBe('replays/2026/10/2b5e….sanreplay.mods.json');
  });
});

describe('mapStem', () => {
  it('matches a ladder map path against a replay header path', () => {
    expect(mapStem('Maps/The_Forge/The_Forge.sanmap')).toBe('the_forge');
    expect(mapStem('Maps\\The_Forge\\The_Forge.sanmap')).toBe(mapStem('maps/the_forge/THE_FORGE.sanmap'));
  });
});

describe('formatBytes', () => {
  it('reads like a download size', () => {
    expect(formatBytes(180445)).toBe('176 KB');
    expect(formatBytes(6660601)).toBe('6.4 MB');
  });
});
