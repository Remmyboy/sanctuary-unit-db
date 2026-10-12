import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diffUnit, type Patch, type PatchesFile } from './patch-diff';
import {
  buildTimeline,
  changeLabel,
  describe as describeLine,
  foldPatches,
  patchesBetween,
  unitVerdict,
  verdict,
} from './patches';
import { PATCH_NOTES } from './patch-notes';
import type { Unit, UnitsData } from './types';

const read = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`../../public/data/${file}`, import.meta.url), 'utf8'));
const units = read<UnitsData>('units.json');
const { patches } = read<PatchesFile>('patches.json');
const byId = new Map(units.units.map((u) => [u.id, u]));
const nameOf = (id: string) => byId.get(id)?.name ?? id;

const unit = (over: Partial<Unit>): Unit => ({ ...structuredClone(byId.get('uel1001')!), ...over }) as Unit;

describe('the patch history the site ships', () => {
  it('ends at the build the database is on', () => {
    expect(patches[0].to.buildId).toBe(units.meta.game?.buildId);
  });

  it('is a chain: each patch starts where the one before it ended', () => {
    for (let i = 0; i < patches.length - 1; i++) expect(patches[i].from).toEqual(patches[i + 1].to);
  });

  it('has the patches we know about, with what they changed', () => {
    const byTo = new Map(patches.map((p) => [p.to.buildId, p]));
    // 0.0.1.21.1: the T1 mobile anti-air got tougher.
    const dart = byTo.get(25856019)!.changed.find((u) => u.id === 'ucl1201')!;
    expect(dart.changes).toContainEqual({ key: 'health', before: 200, after: 220 });
    // 25135612 only tagged the Spitter demo-only.
    expect(byTo.get(25135612)!.changed.map((u) => u.id)).toEqual(['ues2101']);
    // The September patch added the navies.
    expect(byTo.get(25114838)!.added).toHaveLength(12);
  });

  it('has words for every patch it lists', () => {
    for (const p of patches) expect(PATCH_NOTES[p.to.buildId!], String(p.to.buildId)).toBeDefined();
  });

  it('labels every field it records', () => {
    for (const p of patches)
      for (const u of p.changed)
        for (const c of u.changes) expect(changeLabel(c.key, u), c.key).not.toMatch(/[.]|^[a-z]+[A-Z]/);
  });
});

describe('diffUnit', () => {
  it('reads a resource that appears as a change from nothing', () => {
    const was = unit({ production: { alloys: 5 } });
    const now = unit({ production: { alloys: 5, energy: 10 } });
    expect(diffUnit(was, now)).toEqual([{ key: 'production.energy', before: null, after: 10 }]);
  });

  it('skips a field the older extract never had', () => {
    const was = unit({});
    delete (was as Partial<Unit>).healthRegen;
    expect(diffUnit(was, unit({ healthRegen: 4 }))).toEqual([]);
  });

  it('treats a reordered list as no change', () => {
    const u = byId.get('uel1001')!;
    expect(diffUnit(u, unit({ tags: [...u.tags].reverse() }))).toEqual([]);
  });

  it('counts weapons by mount, so two launchers merged into one entry lose nothing', () => {
    const gun = byId.get('uel1001')!.weapons[0];
    const was = unit({ weapons: [gun, { ...gun, targets: ['Land'] }] });
    const now = unit({ weapons: [{ ...gun, count: 2 }] });
    expect(diffUnit(was, now)).toEqual([]);
  });

  it('reads the Peregrine as faster shots, not a lost launcher', () => {
    const peregrine = patches[0].changed.find((u) => u.id === 'uea3201')!;
    expect(peregrine.changes.map((c) => c.key)).not.toContain('weapons');
    expect(peregrine.changes).toContainEqual({ key: 'weapon.1.projectileSpeed', before: 20, after: 35 });
  });
});

describe('a range of patches', () => {
  const p = (to: number, from: number, changed: Patch['changed'], extra: Partial<Patch> = {}): Patch => ({
    from: { buildId: from, installedAt: null },
    to: { buildId: to, installedAt: null },
    commit: 'x',
    added: [],
    removed: [],
    changed,
    ...extra,
  });
  const info = {
    id: 'u1',
    name: 'One',
    displayName: 'Tier 1: Tank',
    faction: 'EDA',
    domain: 'Land',
    tier: 1,
    icon: null,
    weaponCount: 1,
  };
  const newestFirst = [
    p(3, 2, [{ ...info, changes: [{ key: 'health', before: 120, after: 100 }] }]),
    p(2, 1, [
      {
        ...info,
        changes: [
          { key: 'health', before: 100, after: 120 },
          { key: 'buildTime', before: 10, after: 12 },
        ],
      },
    ]),
  ];

  it('runs from the first build to the last', () => {
    expect(buildTimeline(newestFirst).map((b) => b.key)).toEqual(['1', '2', '3']);
    expect(patchesBetween(newestFirst, '1', '3')).toHaveLength(2);
    expect(patchesBetween(newestFirst, '3', '1')).toEqual([]);
  });

  it('folds into the first value against the last, dropping what came back', () => {
    const folded = foldPatches(patchesBetween(newestFirst, '1', '3'));
    expect(folded.changed[0].changes).toEqual([{ key: 'buildTime', before: 10, after: 12 }]);
  });

  it('calls a unit that arrived inside the range new, not changed', () => {
    const added = p(2, 1, [], { added: [info] });
    const folded = foldPatches([added, newestFirst[0]]);
    expect(folded.added.map((u) => u.id)).toEqual(['u1']);
    expect(folded.changed).toEqual([]);
  });
});

describe('verdicts', () => {
  const u = {
    id: 'x',
    name: null,
    displayName: 'Tier 1: Tank',
    faction: 'EDA',
    domain: 'Land',
    tier: 1,
    icon: null,
    weaponCount: 2,
  };

  it('knows which way is better', () => {
    expect(verdict({ key: 'health', before: 200, after: 220 })).toBe('buff');
    expect(verdict({ key: 'cost.alloys', before: 20, after: 34 })).toBe('nerf');
    expect(verdict({ key: 'weapon.1.reloadTime', before: 1, after: 4 })).toBe('nerf');
    expect(verdict({ key: 'status', before: 'in-progress', after: 'in-game' })).toBe('buff');
    expect(verdict({ key: 'movement.type', before: 'LegsSeabed', after: 'Hover' })).toBeNull();
    // The TALEN couldn't fire before 0.0.1.21.1: gaining a reload isn't a nerf.
    expect(verdict({ key: 'weapon.1.cycleTime', before: null, after: 1.1 })).toBeNull();
  });

  it('says which weapon only when there is more than one', () => {
    expect(changeLabel('weapon.2.damage', u)).toBe('weapon 2 damage');
    expect(changeLabel('weapon.1.damage', { weaponCount: 1 })).toBe('damage');
  });

  it('prints a list as what left and what joined, and hides tier tags', () => {
    const line = describeLine(
      { key: 'tags', before: ['AIR', 'TECH1', 'SEABED'], after: ['AIR', 'TECH3', 'HOVER'] },
      u,
      nameOf,
    )!;
    expect([line.before, line.after]).toEqual(['seabed', 'hover']);
    expect(describeLine({ key: 'tags', before: ['TECH1'], after: ['TECH3'] }, u, nameOf)).toBeNull();
  });

  it('sums a unit up', () => {
    const lines = [
      describeLine({ key: 'health', before: 200, after: 220 }, u, nameOf)!,
      describeLine({ key: 'cost.alloys', before: 20, after: 34 }, u, nameOf)!,
    ];
    expect(unitVerdict(lines)).toBe('mixed');
    expect(unitVerdict(lines.slice(0, 1))).toBe('buff');
  });
});
