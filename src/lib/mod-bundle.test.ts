import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { bundleParts, bundleReadme, mergeZips } from './mod-bundle';
import { LOADER_VERSION, MODS } from './mods';

const zip = (files: Record<string, string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)])));

describe('bundleParts', () => {
  it('is the loader, then every mod’s drop-in zip', () => {
    const parts = bundleParts();
    expect(parts[0].url).toMatch(
      new RegExp(`/ModLoader-${LOADER_VERSION}/ModLoader-${LOADER_VERSION}\\.zip$`),
    );
    expect(parts.slice(1).map((p) => p.url)).toEqual(
      MODS.map((m) => expect.stringMatching(new RegExp(`/${m.id}-${m.version}-ModManager\\.zip$`))),
    );
  });
});

describe('mergeZips', () => {
  const loader = zip({
    'README.txt': 'loader notes',
    'winhttp.dll': 'doorstop',
    'BepInEx/plugins/ModLoader.dll': 'loader',
    'SanctuaryMods/README.txt': 'drop mods here',
  });
  const hud = zip({ 'README.txt': 'hud notes', 'SanctuaryMods/SanctuaryHud/SanctuaryHud.dll': 'hud' });

  it('lays every part into one tree, with one README of its own', () => {
    const merged = unzipSync(
      mergeZips(
        [
          { label: 'loader', data: loader },
          { label: 'hud', data: hud },
        ],
        'ours\nline two',
      ),
    );
    expect(Object.keys(merged).sort()).toEqual([
      'BepInEx/plugins/ModLoader.dll',
      'README.txt',
      'SanctuaryMods/README.txt',
      'SanctuaryMods/SanctuaryHud/SanctuaryHud.dll',
      'winhttp.dll',
    ]);
    expect(strFromU8(merged['README.txt'])).toBe('ours\r\nline two');
    expect(strFromU8(merged['SanctuaryMods/README.txt'])).toBe('drop mods here');
  });

  it('accepts the same file twice, but not two different ones', () => {
    const again = zip({ 'winhttp.dll': 'doorstop' });
    expect(() =>
      mergeZips(
        [
          { label: 'loader', data: loader },
          { label: 'again', data: again },
        ],
        '',
      ),
    ).not.toThrow();

    const clash = zip({ 'BepInEx/plugins/ModLoader.dll': 'an older loader' });
    expect(() =>
      mergeZips(
        [
          { label: 'loader', data: loader },
          { label: 'old manager', data: clash },
        ],
        '',
      ),
    ).toThrow('old manager and loader both ship BepInEx/plugins/ModLoader.dll');
  });
});

describe('bundleReadme', () => {
  it('lists every part and points back at the site', () => {
    const parts = bundleParts();
    const readme = bundleReadme(parts, 'https://example.test');
    for (const p of parts) expect(readme).toContain(`  ${p.label}\n`);
    expect(readme).toContain('https://example.test/mods');
  });
});
