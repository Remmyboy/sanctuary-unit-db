import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildResult,
  commanderOf,
  economyResult,
  expandQueue,
  packRows,
  simulateQueue,
  unpackRows,
} from './calc';
import { duration } from './format';
import type { UnitsData } from './types';

const data: UnitsData = JSON.parse(
  readFileSync(new URL('../../public/data/units.json', import.meta.url), 'utf8'),
);
const byId = new Map(data.units.map((u) => [u.id, u]));

describe('build maths', () => {
  // The README's worked example: a T3 Land Factory (4,200 build time, 2,000
  // alloy, 20,000 energy) with three T2 engineers (10 build power each)
  // takes 140s and draws 14.29 alloy/s and 142.86 energy/s.
  it('matches the documented three-engineer example', () => {
    const target = byId.get('ues3511')!; // EDA T3 Land Factory
    const eng = byId.get('uel2501')!; // EDA T2 Engineer, 10 build power
    expect(target.buildTime).toBe(4200);
    expect(eng.buildPower).toBe(10);

    const r = buildResult(target, eng, [{ id: eng.id, count: 2 }], byId)!;
    expect(r.power).toBe(30);
    expect(r.seconds).toBeCloseTo(140, 5);
    expect(r.alloysPerSec).toBeCloseTo(14.29, 2);
    expect(r.energyPerSec).toBeCloseTo(142.86, 2);
  });

  it('returns null without a builder or with zero build power', () => {
    const target = byId.get('ues3511')!;
    expect(buildResult(target, undefined, [], byId)).toBeNull();
  });
});

describe('economy maths', () => {
  it('sums production, upkeep and storage by count', () => {
    const extractor = data.units.find((u) => u.production?.alloys && u.status === 'in-game')!;
    const r = economyResult([{ id: extractor.id, count: 4 }], byId);
    expect(r.alloysIn).toBeCloseTo((extractor.production!.alloys ?? 0) * 4, 5);
    expect(r.alloysNet).toBeCloseTo(r.alloysIn - r.alloysOut, 5);
  });
});

describe('build order', () => {
  const cmd = byId.get('uel0000')!; // EDA Commander: 5 bp, +5 alloy/s +50 energy/s, 500/5,000 storage
  const start = [{ id: cmd.id, count: 1 }];
  const full = { alloys: 500, energy: 5000 };

  it('finds each faction commander', () => {
    expect(commanderOf(data.units, 'EDA')?.id).toBe('uel0000');
    expect(commanderOf(data.units, 'Chosen')?.id).toBe('ucl0000');
    expect(commanderOf(data.units, 'Guard')?.id).toBe('ugl0000');
  });

  // The opening from the feature request: land factory, 3 generators, 3
  // extractors, all by the commander from a full 500/5,000 start. Every T1
  // structure drains exactly 5 alloy/s + 50 energy/s at 5 bp — the
  // commander's own income — so it never stalls and the stockpile holds.
  it('works the factory + 3 generators + 3 extractors opening', () => {
    const queue = expandQueue(
      [
        { id: 'ues1511', count: 1 },
        { id: 'ues1611', count: 3 },
        { id: 'ues1601', count: 3 },
      ],
      byId,
    );
    expect(queue).toHaveLength(7);
    const r = simulateQueue(queue, cmd, [], start, full, byId)!;
    expect(r.cost).toEqual({ alloys: 450, energy: 4500 });
    expect(r.ideal).toBeCloseTo(90, 5);
    expect(r.finish).toBeCloseTo(90, 5);
    expect(r.steps.map((s) => s.end)).toEqual([30, 40, 50, 60, 70, 80, 90]);
    expect(r.end.alloys).toBeGreaterThan(499); // within one tick's spend of full
    // Energy fills the factory-raised 6,000 cap from the generators' output.
    expect(r.cap).toEqual({ alloys: 500, energy: 6000 });
    expect(r.end.energy).toBeGreaterThan(5990);
    expect(r.income).toEqual({ alloys: 5 + 3, energy: 50 + 30 });
  });

  it('stalls once the stockpile runs dry and slows to income', () => {
    // Four T1 engineers assisting: 25 bp drains 25 alloy/s against 5 coming in.
    const gens = expandQueue([{ id: 'ues1611', count: 6 }], byId);
    const r = simulateQueue(gens, cmd, [{ id: 'uel1501', count: 4 }], start, full, byId)!;
    expect(r.power).toBe(25);
    expect(r.ideal).toBeCloseTo(12, 5);
    // 300 alloy needed, 500 in the tank: no stall.
    expect(r.finish).toBeCloseTo(12, 5);

    const more = expandQueue([{ id: 'ues1611', count: 20 }], byId);
    const s = simulateQueue(more, cmd, [{ id: 'uel1501', count: 4 }], start, full, byId)!;
    // 1,000 alloy needed, 500 banked, the rest arrives at 5 alloy/s: ~100s,
    // against 40s with resources to spare.
    expect(s.ideal).toBeCloseTo(40, 5);
    expect(s.finish).toBeGreaterThan(90);
    expect(s.finish).toBeLessThan(101);
    expect(s.low.alloys).toBeCloseTo(0, 1);
  });

  it('reports a build that can never finish', () => {
    const r = simulateQueue([byId.get('ues1611')!], cmd, [], [], full, byId)!;
    expect(r.start).toEqual({ alloys: 0, energy: 0 }); // no storage, nothing banked
    expect(r.finish).toBe(Infinity);
    expect(r.stuck?.id).toBe('ues1611');
  });
});

describe('URL row packing', () => {
  it('round-trips and drops unknown ids', () => {
    const rows = [
      { id: 'uel2501', count: 3 },
      { id: 'ues3511', count: 1 },
    ];
    expect(unpackRows(packRows(rows), byId)).toEqual(rows);
    expect(unpackRows('nope:2,uel2501:1', byId)).toEqual([{ id: 'uel2501', count: 1 }]);
    expect(packRows([])).toBeUndefined();
  });

  it('clamps malformed counts to at least 1', () => {
    expect(unpackRows('uel2501:0', byId)).toEqual([{ id: 'uel2501', count: 1 }]);
    expect(unpackRows('uel2501:banana', byId)).toEqual([{ id: 'uel2501', count: 1 }]);
  });
});

describe('duration formatting', () => {
  it('covers the ranges build times actually span', () => {
    expect(duration(8.4)).toBe('8.4 s');
    expect(duration(140)).toBe('2 m 20 s');
    expect(duration(1000)).toBe('16 m 40 s'); // the README's stalled-factory example
    expect(duration(7325)).toBe('2 h 2 m');
    expect(duration(Infinity)).toBe('—');
  });
});
