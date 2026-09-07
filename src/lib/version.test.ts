import { describe, expect, it } from 'vitest';
import { isOlderVersion } from './version';

describe('isOlderVersion', () => {
  it('spots a mod behind the current release', () => {
    expect(isOlderVersion('0.2.3', '0.3.0')).toBe(true);
    expect(isOlderVersion('0.2', '0.3.0')).toBe(true);
    expect(isOlderVersion('0.3.0-dev', '0.3.1')).toBe(true);
  });
  it('is quiet for current, newer or unknown versions', () => {
    expect(isOlderVersion('0.3.0', '0.3.0')).toBe(false);
    expect(isOlderVersion('0.3', '0.3.0')).toBe(false);
    expect(isOlderVersion('0.4.0', '0.3.0')).toBe(false);
    expect(isOlderVersion('1.0.0', '0.3.0')).toBe(false);
    expect(isOlderVersion(null, '0.3.0')).toBe(false);
    expect(isOlderVersion('', '0.3.0')).toBe(false);
    expect(isOlderVersion('dev', '0.3.0')).toBe(false);
  });
});
