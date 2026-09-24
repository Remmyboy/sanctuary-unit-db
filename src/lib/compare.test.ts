import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bestIndexes, compareTable, parseCompare, togglePick, COMPARE_MAX } from './compare';
import type { UnitsData } from './types';

const data: UnitsData = JSON.parse(
  readFileSync(new URL('../../public/data/units.json', import.meta.url), 'utf8'),
);
const byId = new Map(data.units.map((u) => [u.id, u]));

describe('the id list in the URL', () => {
  it('dedupes, trims, caps and drops unknown ids', () => {
    expect(parseCompare(' uel1001,ucl1001,uel1001,,nope ', (id) => byId.has(id))).toEqual([
      'uel1001',
      'ucl1001',
    ]);
    expect(parseCompare(undefined)).toEqual([]);
    const many = data.units.slice(0, COMPARE_MAX + 3).map((u) => u.id);
    expect(parseCompare(many.join(','))).toHaveLength(COMPARE_MAX);
  });

  it('toggles a pick and refuses to go past the cap', () => {
    expect(togglePick(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePick(['a', 'b'], 'a')).toEqual(['b']);
    const full = Array.from({ length: COMPARE_MAX }, (_, i) => `u${i}`);
    expect(togglePick(full, 'extra')).toBe(full);
    expect(togglePick(full, 'u0')).toHaveLength(COMPARE_MAX - 1);
  });
});

describe('best value in a row', () => {
  it('marks the highest or lowest, and every column that ties for it', () => {
    expect([...bestIndexes([3, 5, 5], 'high')]).toEqual([1, 2]);
    expect([...bestIndexes([3, 5, null], 'low')]).toEqual([0]);
  });

  it('marks nothing when there is nothing to choose between', () => {
    expect(bestIndexes([4, 4, 4], 'high').size).toBe(0);
    expect(bestIndexes([4, null], 'high').size).toBe(0);
    expect(bestIndexes([1, 2], undefined).size).toBe(0);
  });
});

describe('the comparison table', () => {
  // The three T1 tanks: Puma / Gladius / Gimlet.
  const tanks = ['uel1001', 'ucl1001', 'ugl1001'].map((id) => byId.get(id)!);
  const table = compareTable(tanks);
  const row = (label: string) => table.flatMap((s) => s.rows).find((r) => r.label === label);

  it('lines each stat up across the units in order', () => {
    expect(row('Health')!.values).toEqual(tanks.map((u) => u.health));
    expect(row('Alloy')!.values).toEqual(tanks.map((u) => u.cost.alloys));
  });

  it('leaves out rows none of the units have', () => {
    // Tanks store nothing and have no build power.
    expect(row('Energy storage')).toBeUndefined();
    expect(row('Build power')).toBeUndefined();
    expect(table.every((s) => s.rows.length > 0)).toBe(true);
  });

  it('prefers cheaper and tougher', () => {
    const alloy = row('Alloy')!;
    const cheapest = Math.min(...tanks.map((u) => u.cost.alloys));
    for (const i of alloy.best) expect(tanks[i].cost.alloys).toBe(cheapest);
    const hp = row('Health')!;
    const toughest = Math.max(...tanks.map((u) => u.health));
    for (const i of hp.best) expect(tanks[i].health).toBe(toughest);
  });
});
