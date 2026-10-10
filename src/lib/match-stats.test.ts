import { describe, expect, it } from 'vitest';
import { parseStatsUpload, statsAgree, statsDurationS, type StatsUpload } from './match-stats';

const A = '76561198000000001';
const B = '76561198000000002';

const army = (steamId: string, over: Record<string, unknown> = {}) => ({
  steamId,
  armyId: steamId === A ? 1 : 2,
  name: steamId === A ? 'Alpha' : 'Bravo',
  faction: 2,
  team: steamId === A ? 1 : 2,
  colour: '#3A7BD5',
  condition: steamId === A ? 1 : 2,
  conditionTick: 10400,
  alloy: { gathered: 12000.5, spent: 11000, wasted: 40, stallTicks: 12, peakIncome: 48.2 },
  energy: { gathered: 90000, spent: 85000, wasted: 0, stallTicks: 0, peakIncome: 410 },
  maxStorage: 3000,
  built: { land: 61, air: 0, naval: 0, engineers: 9, structures: 34, value: 9000 },
  lost: { mobile: 20, structures: 3, commander: 0, value: 2500 },
  killedValue: 3100,
  commanderKills: 1,
  peakArmyValue: 4200,
  peakUnits: 55,
  score: 18342,
  ...over,
});

const series = (n: number) => ({
  alloyIncome: Array(n).fill(10),
  energyIncome: Array(n).fill(100),
  alloySpend: Array(n).fill(9),
  energySpend: Array(n).fill(90),
  armyValue: Array(n).fill(500),
  units: Array(n).fill(12),
  score: Array(n).fill(1000),
});

const upload = (over: Record<string, unknown> = {}) => ({
  format: 1,
  modVersion: '0.4.0',
  buildId: 20412345,
  tickRate: 10,
  endTick: 10430,
  armies: [army(A), army(B)],
  timeline: { intervalS: 5, t: [0, 5, 10], series: { [A]: series(3), [B]: series(3) } },
  ...over,
});

const players = [A, B];

describe('parseStatsUpload', () => {
  it('accepts the documented shape and normalises it', () => {
    const s = parseStatsUpload(upload(), players) as StatsUpload;
    expect(typeof s).toBe('object');
    expect(s.armies).toHaveLength(2);
    expect(s.armies[0].colour).toBe('#3a7bd5');
    expect(s.buildId).toBe(20412345);
    expect(s.timeline.series[B].score).toEqual([1000, 1000, 1000]);
  });

  it('drops unknown fields', () => {
    const s = parseStatsUpload(
      upload({ extra: 'x', armies: [army(A, { secret: 1 })] }),
      players,
    ) as StatsUpload;
    expect(s).not.toHaveProperty('extra');
    expect(s.armies[0]).not.toHaveProperty('secret');
  });

  it('treats a missing or zero build id as unknown', () => {
    expect((parseStatsUpload(upload({ buildId: 0 }), players) as StatsUpload).buildId).toBeNull();
    expect((parseStatsUpload(upload({ buildId: undefined }), players) as StatsUpload).buildId).toBeNull();
  });

  it('refuses players who were not in the match', () => {
    expect(parseStatsUpload(upload({ armies: [army('76561198000000009')] }), players)).toMatch(
      /not a player/,
    );
  });

  it('refuses the same player twice', () => {
    expect(parseStatsUpload(upload({ armies: [army(A), army(A)] }), players)).toMatch(/duplicate/);
  });

  it('refuses another format, negative or non-finite numbers', () => {
    expect(parseStatsUpload(upload({ format: 2 }), players)).toMatch(/format/);
    expect(parseStatsUpload(upload({ armies: [army(A, { score: -1 })] }), players)).toMatch(/score/);
    expect(parseStatsUpload(upload({ armies: [army(A, { score: 'lots' })] }), players)).toMatch(/score/);
  });

  it('refuses a series whose length differs from the time axis', () => {
    const bad = { intervalS: 5, t: [0, 5, 10], series: { [A]: series(2) } };
    expect(parseStatsUpload(upload({ timeline: bad }), players)).toMatch(/length/);
  });

  it('allows a player with no timeline', () => {
    const tl = { intervalS: 5, t: [0, 5, 10], series: { [A]: series(3) } };
    const s = parseStatsUpload(upload({ timeline: tl }), players) as StatsUpload;
    expect(Object.keys(s.timeline.series)).toEqual([A]);
  });
});

describe('statsAgree', () => {
  const s = parseStatsUpload(upload(), players) as StatsUpload;

  it('agrees with itself and with a score a tick apart', () => {
    expect(statsAgree(s, s)).toBe(true);
    const near = { armies: s.armies.map((a) => ({ ...a, score: a.score * 1.005 })) };
    expect(statsAgree(s, near)).toBe(true);
  });

  it('disagrees on a different result or a different score', () => {
    expect(statsAgree(s, { armies: s.armies.map((a) => ({ ...a, condition: 0 })) })).toBe(false);
    expect(statsAgree(s, { armies: s.armies.map((a) => ({ ...a, score: a.score * 1.2 })) })).toBe(false);
    expect(statsAgree(s, { armies: s.armies.slice(1) })).toBe(false);
  });
});

describe('statsDurationS', () => {
  it('runs to the last result, else to the pull', () => {
    expect(statsDurationS({ armies: [army(A), army(B)] as never, endTick: 10430, tickRate: 10 })).toBe(1040);
    const undecided = [army(A, { conditionTick: 0 }), army(B, { conditionTick: 0 })] as never;
    expect(statsDurationS({ armies: undecided, endTick: 10430, tickRate: 10 })).toBe(1043);
  });
});
