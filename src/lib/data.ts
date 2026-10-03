import type { Unit, UnitsData } from './types';

// One fetch per session, shared by every route loader. Routes run with
// ssr: false, so this only ever executes in the browser.

export interface LoadedData {
  data: UnitsData;
  byId: Map<string, Unit>;
  /** Icon combos with real extracted artwork in /icons/<faction>/. */
  iconManifest: Set<string>;
  /** Unit ids with an extracted 64px render in /previews/. */
  previews: Set<string>;
  /** Unit ids with a 384px render from the developers in /renders/. */
  renders: Set<string>;
}

let cache: Promise<LoadedData> | null = null;

export function loadData(): Promise<LoadedData> {
  cache ??= load();
  return cache;
}

/**
 * The sharpest picture there is of a unit: the developers' 384px render (hd),
 * else the game's 64px thumbnail, else null — callers fall back to the icon.
 */
export function unitArt(u: Unit, loaded: LoadedData): { src: string; hd: boolean } | null {
  if (loaded.renders.has(u.id)) return { src: `/renders/${u.id}.webp`, hd: true };
  if (loaded.previews.has(u.id)) return { src: `/previews/${u.id}.png`, hd: false };
  return null;
}

async function load(): Promise<LoadedData> {
  const [data, iconManifest, previews, renders] = await Promise.all([
    fetchJson<UnitsData>('/data/units.json'),
    // The manifests are optional: without them icons fall back to generated
    // SVG, the detail panel uses the 64px render, or omits it.
    fetchJson<string[]>('/icons/manifest.json').catch(() => []),
    fetchJson<string[]>('/previews/manifest.json').catch(() => []),
    fetchJson<string[]>('/renders/manifest.json').catch(() => []),
  ]);

  return {
    data,
    byId: new Map(data.units.map((u) => [u.id, u])),
    iconManifest: new Set(iconManifest),
    previews: new Set(previews),
    renders: new Set(renders),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}
