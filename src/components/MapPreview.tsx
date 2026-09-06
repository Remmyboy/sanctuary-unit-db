// The matched map, as the game itself renders it: the preview.png every map
// ships, copied into public/ladder-maps/ by scripts/ladder-previews.js.
//
// A map curated into a pool since that script last ran has no art in the
// repo, and the pools are edited from the admin page — so a missing picture
// is a normal state, not a bug. It leaves nothing behind when there's none.
//
// `starts` puts a player's face and name on the start they were given. Every
// 1v1 has them (shuffled independently of the teams — see migration 0013);
// team modes have none, so their preview stays a plain picture with the game's
// own numbered circles to read.

import { useEffect, useState } from 'react';
import { mapPreviewSlug, mapPreviewSrc } from '../lib/ladder-maps';
import { loadSpawns, type MapSpawn } from '../lib/ladder-spawns';

export interface MapStart {
  army: number; // matches MapSpawn.army — a participant's slot
  name: string;
  avatarUrl: string | null;
  you: boolean;
}

export function MapPreview({ name, starts = [] }: { name: string; starts?: MapStart[] }) {
  const src = mapPreviewSrc(name);
  const [failed, setFailed] = useState<string | null>(null);
  const [spawns, setSpawns] = useState<MapSpawn[]>([]);

  useEffect(() => {
    if (starts.length === 0) return;
    let alive = true;
    void loadSpawns().then((all) => alive && setSpawns(all[mapPreviewSlug(name)] ?? []));
    return () => {
      alive = false;
    };
  }, [name, starts.length]);

  if (failed === src) return null;

  const placed = starts
    .map((start) => ({ start, at: spawns.find((s) => s.army === start.army) }))
    .filter((p): p is { start: MapStart; at: MapSpawn } => p.at !== undefined);

  return (
    <div className="map-preview">
      <img src={src} alt={`${name} seen from above`} onError={() => setFailed(src)} />
      {placed.map(({ start, at }) => (
        <StartMarker key={start.army} start={start} at={at} />
      ))}
    </div>
  );
}

// One player standing on their start: their Steam avatar over the numbered
// circle the preview already has there, with their name beside it.
function StartMarker({ start, at }: { start: MapStart; at: MapSpawn }) {
  // Steam serves the avatars, so this one image is out of our hands — a
  // broken-image glyph in the middle of the map is worse than the plain ring.
  const [noFace, setNoFace] = useState(false);

  return (
    <span
      className="map-start"
      data-you={start.you || undefined}
      // Anchored towards the middle of the picture so a name near an edge
      // stays on it, above the marker rather than below in the bottom half.
      data-side={at.x > 0.5 ? 'right' : 'left'}
      data-vside={at.y > 0.5 ? 'above' : 'below'}
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
    >
      {start.avatarUrl && !noFace ? (
        <img className="map-start-face" src={start.avatarUrl} alt="" onError={() => setNoFace(true)} />
      ) : (
        <span className="map-start-ring" />
      )}
      <span className="map-start-name" title={start.name}>
        {start.name}
      </span>
    </span>
  );
}
