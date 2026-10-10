import { describe, expect, it } from 'vitest';
import { parseLuaTable } from './lua-parser.js';

describe('parseLuaTable', () => {
  it('reads a template-shaped literal', () => {
    const src = `
      -- leading comment with a { brace
      --[[ long
           comment ]]
      UnitTemplate = {
        general = { tpId = "uel0101", name = 'Tank', icon = { tech = 1 } }, -- trailing
        economy = { cost = { alloys = 50, energy = -2.5e2 }; buildTime = 10 },
        tags = { "EDA", "LAND", },
        flags = { on = true, off = false, gone = nil },
        ["quoted key"] = 1,
        empty = {},
      }
    `;
    expect(parseLuaTable(src, { assignment: 'UnitTemplate' })).toEqual({
      general: { tpId: 'uel0101', name: 'Tank', icon: { tech: 1 } },
      economy: { cost: { alloys: 50, energy: -250 }, buildTime: 10 },
      tags: ['EDA', 'LAND'],
      flags: { on: true, off: false, gone: null },
      'quoted key': 1,
      empty: [],
    });
  });

  it('seeks past the named assignment', () => {
    const src = 'Other = { 1 }\nProjectileTemplate = { general = { tpId = "p" } }';
    expect(parseLuaTable(src, { assignment: 'ProjectileTemplate' })).toEqual({ general: { tpId: 'p' } });
    expect(parseLuaTable(src)).toEqual([1]);
  });

  it('unescapes strings', () => {
    expect(parseLuaTable(String.raw`T = { "a\"b", 'c\nd' }`)).toEqual(['a"b', 'c\nd']);
  });

  it('throws on anything that is not a plain literal', () => {
    expect(() => parseLuaTable('T = { x = Tags.EDA }')).toThrow('unexpected bare token');
    expect(() => parseLuaTable('T = { 1, x = 2 }')).toThrow('mixed array/map');
    expect(() => parseLuaTable('T = { x = 1')).toThrow(/unterminated|unexpected end/);
    expect(() => parseLuaTable('T = { 1 }', { assignment: 'UnitTemplate' })).toThrow('not found');
  });
});
