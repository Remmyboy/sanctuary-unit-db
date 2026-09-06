import { describe, expect, it } from 'vitest';
import { LADDER_MAPS, mapPreviewSlug, mapPreviewSrc } from './ladder-maps';

describe('mapPreviewSlug', () => {
  it('is the file name scripts/ladder-previews.js writes', () => {
    // Pinned: the script slugs the same names to name the PNGs it commits,
    // so a change here without re-running it breaks every preview.
    expect(mapPreviewSlug('There Is Time')).toBe('there-is-time');
    expect(mapPreviewSlug('Two step shuffle')).toBe('two-step-shuffle');
    expect(mapPreviewSlug('~TEAM-1v1_Tropical_256_47940')).toBe('team-1v1-tropical-256-47940');
    expect(mapPreviewSlug('~FFA-4P_Forest_1024_45657')).toBe('ffa-4p-forest-1024-45657');
  });

  it('leaves nothing a URL would have to escape', () => {
    expect(mapPreviewSlug("Daroza's Sanctuary")).toBe('daroza-s-sanctuary');
    expect(mapPreviewSlug('  Odd  name!  ')).toBe('odd-name');
    for (const map of Object.values(LADDER_MAPS).flat()) {
      expect(mapPreviewSlug(map.name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('points at public/ladder-maps', () => {
    expect(mapPreviewSrc('White Desert')).toBe('/ladder-maps/white-desert.png');
  });
});
