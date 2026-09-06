// Where each army starts on a ranked map, as a fraction of its preview image
// (0,0 is the top left corner). Written by scripts/ladder-previews.js from the
// same markers the game itself reads, keyed by the map's preview slug.
//
// Decoration, not data the room depends on: a map with no entry, or a fetch
// that fails, just means no names on the picture, so this never throws.

export interface MapSpawn {
  army: number; // the lobby's army number — the circles drawn on the preview
  x: number; // 0–1 across the image
  y: number; // 0–1 down the image
}

export type MapSpawns = Record<string, MapSpawn[]>;

let cache: Promise<MapSpawns> | null = null;

export function loadSpawns(): Promise<MapSpawns> {
  cache ??= fetch('/ladder-maps/spawns.json')
    .then((res) => (res.ok ? (res.json() as Promise<MapSpawns>) : {}))
    .catch(() => ({}));
  return cache;
}
