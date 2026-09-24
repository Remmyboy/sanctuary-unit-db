import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildGroups,
  compactBlocks,
  matches,
  slotSpan,
  visibleGroups,
  COMPACT_CHUNK,
  DEFAULT_STATUS,
  type BoardFilters,
} from './board';
import type { UnitsData } from './types';

// Tests run against the committed units.json — the same file the site serves —
// so they double as regression tests for the extractor's output. The pinned
// numbers come from the README's worked examples; if a re-extract changes
// them, that's a real balance change (fine, update the pin) or an extractor
// regression (the thing these exist to catch).
const data: UnitsData = JSON.parse(
  readFileSync(new URL('../../public/data/units.json', import.meta.url), 'utf8'),
);
const byId = new Map(data.units.map((u) => [u.id, u]));

const noFilters: BoardFilters = {
  faction: new Set(),
  domain: new Set(),
  tier: new Set(),
  role: new Set(),
  status: new Set(),
  search: '',
};

describe('grouping', () => {
  const groups = buildGroups(data.units);

  it('aligns the same roster slot across factions', () => {
    const t1Tanks = groups.find((g) => g.units.some((u) => u.id === 'uel1001'));
    expect(t1Tanks).toBeDefined();
    const names = t1Tanks!.units.map((u) => u.name).sort();
    expect(names).toEqual(['Gimlet', 'Gladius', 'Puma']);
  });

  it('splits slots whose members disagree on tier (Hyena is T2 despite its 3xxx id)', () => {
    const hyena = data.units.find((u) => u.name === 'Hyena')!;
    expect(hyena.tier).toBe(2);
    const group = groups.find((g) => g.units.includes(hyena))!;
    expect(group.tier).toBe(2);
    // Hyena must not share a row with genuine T3 units from the same id slot.
    expect(group.units.every((u) => u.tier === 2)).toBe(true);
  });

  it('every unit lands in exactly one group', () => {
    const seen = new Map<string, number>();
    for (const g of groups) for (const u of g.units) seen.set(u.id, (seen.get(u.id) ?? 0) + 1);
    expect(seen.size).toBe(data.units.length);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });
});

describe('filtering', () => {
  it('status filter matches the labelled availability', () => {
    const f = { ...noFilters, status: new Set([DEFAULT_STATUS]) };
    const kept = data.units.filter((u) => matches(u, f));
    expect(kept.length).toBe(data.units.filter((u) => u.status === 'in-game').length);
  });

  it('search hits ids, names and tags', () => {
    const kodiak = data.units.find((u) => u.name === 'Kodiak')!;
    expect(matches(kodiak, { ...noFilters, search: 'kodiak' })).toBe(true);
    expect(matches(kodiak, { ...noFilters, search: kodiak.id })).toBe(true);
    expect(matches(kodiak, { ...noFilters, search: 'zzz-no-such-unit' })).toBe(false);
  });

  it('metric sort ranks rows by their strongest member and keeps rows whole', () => {
    const groups = visibleGroups(buildGroups(data.units), noFilters, 'dps');
    const score = (g: (typeof groups)[number]) => Math.max(...g.units.map((u) => u.dps ?? 0));
    for (let i = 1; i < groups.length; i++) {
      expect(score(groups[i - 1])).toBeGreaterThanOrEqual(score(groups[i]));
    }
  });
});

describe('extracted data invariants (pinned from the game formulas)', () => {
  const dps = (name: string) => data.units.find((u) => u.name === name)?.dps;

  it('continuous beams use per-tick damage × tick rate — Auger is 256.4, not 8.5', () => {
    expect(dps('Auger')).toBeCloseTo(256.4, 1);
  });

  it('salvo indices wrap muzzle groups — Kodiak counts all three barrels', () => {
    expect(dps('Kodiak')).toBeCloseTo(348.63, 1);
  });

  it('reload runs concurrently with the salvo — Chosen Commander fires 2×50 per second', () => {
    const commander = data.units.find((u) => u.id === 'ucl0000')!;
    expect(commander.dps).toBeCloseTo(100, 1);
  });

  it('bomber weapons with no muzzles report null DPS, not a confident zero', () => {
    const talen = data.units.find((u) => u.name === 'TALEN')!;
    expect(talen.weapons.some((w) => w.dps === null)).toBe(true);
  });

  it('exactly the commanders, engineers and stations can assist a construction', () => {
    const withRange = data.units.filter((u) => u.buildRange != null && u.buildRange > 0);
    expect(withRange.length).toBe(22);
  });

  it('the OR grammar in canBuild resolves builders — the T3 Land Factory has them', () => {
    const lf3 = byId.get('ues3511')!;
    expect(lf3.builtBy.length).toBeGreaterThan(0);
  });
});

describe('compact view', () => {
  const defaultStatus = { ...noFilters, status: new Set([DEFAULT_STATUS]) };
  const factions = ['EDA', 'Chosen', 'Guard'];

  it('keeps every visible slot, in order, one block per domain and tier', () => {
    const groups = visibleGroups(buildGroups(data.units), defaultStatus, 'default');
    const blocks = compactBlocks(groups, 'default');
    expect(blocks.flatMap((b) => b.groups)).toEqual(groups);
    for (const b of blocks) for (const g of b.groups) expect([g.domain, g.tier]).toEqual([b.domain, b.tier]);
    // Tech-tree order visits each domain/tier once, so no block repeats.
    expect(new Set(blocks.map((b) => b.key)).size).toBe(blocks.length);
  });

  it('chunks a metric sort in rank order instead of by tier', () => {
    const groups = visibleGroups(buildGroups(data.units), defaultStatus, 'dps');
    const blocks = compactBlocks(groups, 'dps');
    expect(blocks.flatMap((b) => b.groups)).toEqual(groups);
    expect(blocks.every((b) => b.groups.length <= COMPACT_CHUNK && b.tier === null)).toBe(true);
    expect(blocks[0].label).toBe(`#1–${Math.min(COMPACT_CHUNK, groups.length)}`);
  });

  it('widens a slot to the most units any shown faction has in it', () => {
    const groups = buildGroups(data.units);
    const wide = groups.find((g) => Object.values(g.byFaction).some((us) => (us?.length ?? 0) > 1));
    expect(wide).toBeDefined();
    const most = Math.max(...Object.values(wide!.byFaction).map((us) => us?.length ?? 0));
    expect(slotSpan(wide!, factions)).toBe(most);
    // A faction filtered out doesn't widen the column.
    const widest = factions.find((f) => wide!.byFaction[f]?.length === most)!;
    const others = factions.filter((f) => f !== widest);
    expect(slotSpan(wide!, others)).toBe(Math.max(1, ...others.map((f) => wide!.byFaction[f]?.length ?? 0)));
    // One unit per faction, and nothing shown at all, are both one column.
    const t1Tanks = groups.find((g) => g.units.some((u) => u.id === 'uel1001'))!;
    expect(slotSpan(t1Tanks, factions)).toBe(1);
    expect(slotSpan(t1Tanks, [])).toBe(1);
  });
});
