import { createFileRoute, redirect } from '@tanstack/react-router';

// Zone Control had a page of its own until it moved onto /gameplay-mods,
// beside Phantom-X. Old links land on its card there.
export const Route = createFileRoute('/zone-control')({
  beforeLoad: () => {
    throw redirect({ href: '/gameplay-mods#ZoneControl', statusCode: 308 });
  },
});
