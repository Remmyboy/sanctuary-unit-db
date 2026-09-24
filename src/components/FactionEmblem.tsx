// A faction's emblem from the developers' icon pack, filled with the faction
// colour (`--fc`, inherited from whatever it sits in). The PNG is only a mask,
// so the colour always comes from FACTION_COLOURS rather than being baked in.
// A faction without an emblem gets the old rotated-square marker.

import { FACTION_EMBLEMS } from '../lib/art';

export function FactionEmblem({ faction, className }: { faction: string; className?: string }) {
  const src = FACTION_EMBLEMS[faction];
  return (
    <span
      className={['faction-emblem', src ? null : 'fallback', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={src ? ({ '--emblem': `url(${src})` } as React.CSSProperties) : undefined}
    />
  );
}
