import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import PATCH from './balance-patch.json';
import { BALANCE_PATCH } from './mods';
import { collapseTexts, describeChange, formatValue } from './balance-patch';
import { netChanges } from './balance-net';
import { PATCH_SECTIONS, PROJECTILE_NAMES, parseNote } from './balance-changes';
import type { UnitsData } from './types';

const read = (file: string): UnitsData =>
  JSON.parse(readFileSync(new URL(`../../public/data/${file}`, import.meta.url), 'utf8'));
const base = read('units.json');
const patched = read('units-balance-patch.json');
const unit = (data: UnitsData, id: string) => data.units.find((u) => u.id === id)!;

describe('the release the site describes', () => {
  it('is the one the download links to', () => {
    expect(PATCH.mod.version).toBe(BALANCE_PATCH.version);
    expect(patched.meta.balancePatch?.version).toBe(BALANCE_PATCH.version);
  });

  it('applied every change to the extracted game', () => {
    expect(patched.meta.balancePatch?.stale).toEqual([]);
    expect(patched.meta.game?.buildId).toBe(base.meta.game?.buildId);
  });

  it('names every projectile it changes', () => {
    const ids = PATCH.changes.filter((c) => c.kind === 'projectile').map((c) => c.id);
    for (const id of ids) expect(PROJECTILE_NAMES[id], id).toBeDefined();
  });
});

describe('the patched units', () => {
  it('has every unit, with the patch marked on the ones it changes', () => {
    expect(patched.units.map((u) => u.id)).toEqual(base.units.map((u) => u.id));
    expect(patched.units.filter((u) => u.balance).length).toBe(patched.meta.balancePatch?.changedUnits);
    expect(base.units.some((u) => u.balance)).toBe(false);
  });

  it('re-derives the numbers rather than patching them on top', () => {
    // Puma: same alloys at 6 energy per alloy, more health, as fast as a T1 tank was.
    expect(unit(base, 'uel1001').cost).toEqual({ alloys: 31, energy: 310 });
    expect(unit(patched, 'uel1001').cost).toEqual({ alloys: 31, energy: 186 });
    expect(unit(patched, 'uel1001').health).toBe(320);
    // EDA commander: half the damage, reload 2s -> 1s. A 1s reload is 11
    // ticks of the game's 0.1s countdown, so the DPS falls rather than holding.
    expect(unit(base, 'uel0000').dps).toBe(100);
    expect(unit(patched, 'uel0000').dps).toBe(90.91);
    expect(unit(patched, 'uel0000').production).toEqual({ alloys: 3, energy: 30 });
  });

  it('moves the TALEN to T3 with its tags', () => {
    expect(unit(patched, 'uga3011').displayName).toBe('Tier 3: Gunship');
    expect(unit(patched, 'uga3011').tags).toContain('TECH3');
  });

  it('lists a projectile change on the units that fire it', () => {
    const labels = unit(patched, 'ugl0000').balance!.map((c) => c.label);
    expect(labels).toContain('missile top speed');
    expect(unit(patched, 'ucl0000').balance!.map((c) => c.label)).not.toContain('missile top speed');
  });
});

describe('describeChange', () => {
  it('prints numbers with their percent change', () => {
    expect(describeChange({ label: 'alloys', before: 31, after: 39 })).toEqual({
      label: 'alloy cost',
      before: '31',
      after: '39',
      percent: 26,
    });
  });

  it('prints only what joins or leaves a list', () => {
    const c = describeChange({ label: 'tags', before: ['AIR', 'TECH1'], after: ['AIR', 'TECH3'] });
    expect([c.before, c.after]).toEqual(['TECH1', 'TECH3']);
  });

  it('prints income per second, and yes/no for switches', () => {
    expect(formatValue({ alloys: 5, energy: 50 }, 'income')).toBe('5 alloy/s + 50 energy/s');
    expect(describeChange({ label: 'leads its target', before: false, after: true })).toMatchObject({
      before: 'no',
      after: 'yes',
      percent: null,
    });
  });
});

describe('the page', () => {
  it('has a section per lobby option', () => {
    expect(PATCH_SECTIONS.map((s) => s.key)).toEqual(PATCH.sections.map((s) => s.key));
  });

  it('merges factions that change the same way', () => {
    const engineers = PATCH_SECTIONS.find((s) => s.key === 'economy')!;
    const t1 = engineers.rows.find((r) => r.title === 'T1 Engineer')!;
    expect(t1.units.map((u) => u.faction).sort()).toEqual(['Chosen', 'EDA', 'Guard']);
    expect(t1.changes).toEqual([{ label: 'health', before: '750', after: '300', percent: -60 }]);
  });

  it('files the code-side rules under their sections, without file paths', () => {
    const fixes = PATCH_SECTIONS.find((s) => s.key === 'fixes')!;
    expect(fixes.rules.map((r) => r.title)).toEqual(['Targeting', 'Shields']);
    const economy = PATCH_SECTIONS.find((s) => s.key === 'economy')!;
    expect(economy.rules.map((r) => r.title)).toEqual(['AI']);
    for (const r of PATCH_SECTIONS.flatMap((s) => s.rules)) {
      expect(r.text).not.toMatch(/\.lua|template change/);
      expect(r.text[0]).toBe(r.text[0].toUpperCase());
    }
  });

  it('reads a note with no section', () => {
    expect(parseNote('Plain: some rule.')).toEqual({ title: 'Plain', text: 'Some rule.', section: null });
  });
});

describe('netChanges', () => {
  const change = (field: string, before: unknown, after: unknown, sections = ['a']) => ({
    kind: 'unit',
    id: 'u1',
    field,
    label: field,
    before,
    after,
    sections,
  });

  it('folds a narrow change then a wide one into the game’s value and the final one', () => {
    const net = netChanges([
      change('economy.cost.energy', 100, 60, ['economy']),
      change('economy.cost', { alloys: 10, energy: 60 }, { alloys: 20, energy: 120 }, ['units']),
    ]);
    expect(net).toHaveLength(1);
    expect(net[0]).toMatchObject({
      field: 'economy.cost',
      before: { alloys: 10, energy: 100 },
      after: { alloys: 20, energy: 120 },
      sections: ['economy', 'units'],
    });
  });

  it('folds a wide change then a narrow one, and drops a change that ends where it started', () => {
    const net = netChanges([
      change('economy.cost', { alloys: 10, energy: 100 }, { alloys: 20, energy: 100 }),
      change('economy.cost.energy', 100, 60),
      change('health', 5, 6),
      change('health', 6, 5),
    ]);
    expect(net).toEqual([
      expect.objectContaining({ before: { alloys: 10, energy: 100 }, after: { alloys: 20, energy: 60 } }),
    ]);
  });

  it('shows the patched T4s against the game’s own cost', () => {
    const ares = unit(patched, 'ucl4001').balance!.find((c) => c.label === 'cost')!;
    expect(ares.before).toEqual(unit(base, 'ucl4001').cost);
    expect(ares.after).toEqual(unit(patched, 'ucl4001').cost);
  });
});

describe('collapseTexts', () => {
  it('counts lines that read the same', () => {
    const t = describeChange({ label: 'yawSpeed', before: 45, after: 90 });
    expect(t.label).toBe('gun turn rate (deg/s)');
    expect(collapseTexts([t, t, t])).toEqual([{ ...t, count: 3 }]);
  });
});
