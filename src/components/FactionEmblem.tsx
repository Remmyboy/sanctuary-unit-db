// A faction's emblem from the developers' icon pack, filled with the faction
// colour: `--fc`, inherited from whatever it sits in, or `colour` where the
// parent doesn't set one (a filter chip). The PNG is only a mask, so the
// colour always comes from FACTION_COLOURS rather than being baked in. A
// faction without an emblem gets the old rotated-square marker.

import { FACTION_EMBLEMS } from '../lib/art';

interface FactionEmblemProps {
  faction: string;
  colour?: string;
  className?: string;
}

export function FactionEmblem({ faction, colour, className }: FactionEmblemProps) {
  const src = FACTION_EMBLEMS[faction];
  const style = {
    ...(src && { '--emblem': `url(${src})` }),
    ...(colour && { '--fc': colour }),
  } as React.CSSProperties;
  return (
    <span
      className={['faction-emblem', src ? null : 'fallback', className].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={style}
    />
  );
}
