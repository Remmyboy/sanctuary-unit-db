import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { armament, defaultGap, layerOf, simulateChase } from './chase';
import type { UnitsData } from './types';

const data: UnitsData = JSON.parse(
  readFileSync(new URL('../../public/data/units.json', import.meta.url), 'utf8'),
);
const unit = (name: string) => data.units.find((u) => u.name === name)!;

// Kodiak: T3 tank, 2.5 u/s, 34 range. Longbow: T3 sniper bot, 2.2 u/s, 60 range.
const kodiak = unit('Kodiak');
const longbow = unit('Longbow');

describe('what each side can bring to bear', () => {
  it('only counts weapons that can hit the other unit’s layer', () => {
    const aa = data.units.find(
      (u) => u.weapons.length && u.weapons.every((w) => w.targets.join() === 'Air'),
    )!;
    expect(armament(aa, kodiak).reach).toBe(0);
    expect(layerOf(kodiak)).toBe('Land');
  });

  it('a runner kites at the edge of its own reach by default', () => {
    expect(defaultGap(kodiak, longbow, 'flee')).toBe(60);
  });
});

describe('a sniper kiting a tank', () => {
  const r = simulateChase({ chaser: kodiak, target: longbow, behaviour: 'flee', gap: 60 });

  it('fires from the first moment and the tank only gains 0.3 u/s', () => {
    expect(r.targetInRange).toBe(0);
    // 26 units to make up at 0.3 u/s is well over a minute — longer than the tank lives.
    expect(r.chaserInRange).toBeNull();
    expect(r.chaserDies).not.toBeNull();
    expect(r.chaserDies!).toBeGreaterThan(40);
    expect(r.damageToChaser).toBeGreaterThanOrEqual(kodiak.health);
  });
});

describe('a faster unit simply leaves', () => {
  it('never comes within reach and the run ends once it is decided', () => {
    const r = simulateChase({ chaser: kodiak, target: unit('Nitro'), behaviour: 'flee', gap: 40 });
    expect(r.chaserInRange).toBeNull();
    expect(r.samples.at(-1)!.t).toBeLessThan(30);
  });

  it('starting inside reach, reports when it gets clear', () => {
    const r = simulateChase({ chaser: kodiak, target: unit('Nitro'), behaviour: 'flee', gap: 32 });
    expect(r.chaserInRange).toBe(0);
    expect(r.escaped).not.toBeNull();
    expect(r.damageToTarget).toBeGreaterThan(0);
  });
});

describe('walking into a longer-ranged unit that holds', () => {
  it('takes fire before it can answer, then stops at its own range', () => {
    const r = simulateChase({ chaser: kodiak, target: longbow, behaviour: 'hold', gap: 78 });
    expect(r.targetInRange!).toBeLessThan(r.chaserInRange!);
    const last = r.samples.at(-1)!;
    expect(last.gap).toBeLessThanOrEqual(34);
    expect(last.gap).toBeGreaterThan(30);
  });
});
