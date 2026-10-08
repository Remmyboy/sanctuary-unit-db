import type { Unit, UnitsData } from './types';
import { BALANCE_DATA_URL, type Balance } from './balance-patch';

// One fetch per session and balance, shared by every route loader. Routes run
// with ssr: false, so this only ever executes in the browser.

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

const cache = new Map<string, Promise<LoadedData>>();

/** The units as the game ships them, or with a balance mod applied. */
export function loadData(balance?: Balance): Promise<LoadedData> {
  const key = balance ?? 'game';
  if (!cache.has(key)) cache.set(key, load(balance));
  return cache.get(key)!;
}

async function load(balance?: Balance): Promise<LoadedData> {
  const [data, iconManifest, previews, renders] = await Promise.all([
    fetchJson<UnitsData>(balance ? BALANCE_DATA_URL : '/data/units.json'),
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
