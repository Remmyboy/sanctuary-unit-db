import { describe, expect, it } from 'vitest';
import { compileTagExpression } from './tag-expression.js';

const unit = (id, ...tags) => ({ id, tags });

const edaTank = unit('uel0101', 'EDA', 'BUILDABLE_BY_T1_FACTORY', 'LAND', 'MOBILE');
const edaLandFactory = unit('ues0101', 'EDA', 'BUILDABLE_BY_T1_FACTORY', 'LAND_FACTORY');
const edaAirFactory = unit('ues0102', 'EDA', 'BUILDABLE_BY_T1_FACTORY', 'AIR_FACTORY');
const chosenTank = unit('ucl0101', 'CHOSEN', 'BUILDABLE_BY_T1_FACTORY', 'LAND', 'MOBILE');
const edaStatic = unit('ues0201', 'EDA', 'BUILDABLE_BY_T1_FACTORY', 'LAND');

const matching = (src, units) => units.filter(compileTagExpression(src)).map((u) => u.id);

describe('compileTagExpression', () => {
  it('treats * as AND', () => {
    expect(matching('Tags.EDA * Tags.LAND', [edaTank, chosenTank, edaStatic, edaAirFactory])).toEqual([
      'uel0101',
      'ues0201',
    ]);
  });

  it('treats + as OR, binding looser than *', () => {
    // (EDA AND MOBILE) OR anything that's an AIR_FACTORY.
    expect(
      matching('Tags.EDA * Tags.MOBILE + Tags.AIR_FACTORY', [edaTank, chosenTank, edaAirFactory]),
    ).toEqual(['uel0101', 'ues0102']);
  });

  it('groups with parentheses: the land-factory upgrade chain', () => {
    const src = 'Tags.EDA * Tags.BUILDABLE_BY_T1_FACTORY * ((Tags.LAND * Tags.MOBILE) + Tags.LAND_FACTORY)';
    expect(matching(src, [edaTank, edaLandFactory, edaAirFactory, chosenTank, edaStatic])).toEqual([
      'uel0101',
      'ues0101',
    ]);
  });

  it('matches a template id used as an atom', () => {
    expect(matching('Tags.ues0201', [edaTank, edaStatic])).toEqual(['ues0201']);
  });

  it('throws on malformed expressions rather than matching nothing', () => {
    expect(() => compileTagExpression('(Tags.EDA * Tags.LAND')).toThrow('expected ")"');
    expect(() => compileTagExpression('Tags.EDA *')).toThrow('unexpected "end"');
    expect(() => compileTagExpression('Tags.EDA ) Tags.LAND')).toThrow('trailing tokens');
  });
});
