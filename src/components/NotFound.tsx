// The page for any URL no route claims, and for a route that throws
// notFound() (an unknown modding version or doc page). A lost little scout
// drone stands in for the 0 of the 404, bobbing and looking about, and the
// one action is the way home.

import { Link, useRouterState } from '@tanstack/react-router';

export function NotFound() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <main className="not-found">
      <title>Page not found — SanctuaryDB</title>
      <div className="nf-code" aria-hidden="true">
        <span>4</span>
        <LostDrone />
        <span>4</span>
      </div>
      <p className="page-eyebrow">Error 404 · Signal lost</p>
      <h1 className="page-title">This sector is uncharted</h1>
      <p className="nf-lede">
        Our scout searched every grid square and came back with nothing but questions. There's no page at{' '}
        <code>{path}</code>. It may have moved, or never been built.
      </p>
      <Link to="/" className="btn primary nf-home">
        Return home
      </Link>
    </main>
  );
}

// Octagon hull like the logo, a visor with two big blinking eyes, rosy
// cheeks, an antenna beacon, and two thrusters keeping it aloft.
function LostDrone() {
  return (
    <svg className="nf-drone" viewBox="24 4 132 166">
      <ellipse className="nf-shadow" cx="80" cy="156" rx="34" ry="6" />
      <g className="nf-bob">
        <g className="nf-tilt">
          <path className="nf-flame" d="M62 112q4 14 8 0z" />
          <path className="nf-flame nf-flame-b" d="M90 112q4 14 8 0z" />
          <line x1="80" y1="40" x2="80" y2="22" className="nf-antenna" />
          <circle cx="80" cy="19" r="5" className="nf-beacon" />
          <rect x="30" y="66" width="12" height="18" rx="3" className="nf-arm" />
          <rect x="118" y="66" width="12" height="18" rx="3" className="nf-arm" />
          <path d="M58 40H102L120 58V94L102 112H58L40 94V58Z" className="nf-hull" />
          <rect x="52" y="56" width="56" height="40" rx="10" className="nf-visor" />
          <g className="nf-eyes">
            <ellipse cx="68" cy="74" rx="6.5" ry="8.5" />
            <ellipse cx="92" cy="74" rx="6.5" ry="8.5" />
            <circle cx="70.5" cy="70.5" r="2.4" className="nf-glint" />
            <circle cx="94.5" cy="70.5" r="2.4" className="nf-glint" />
          </g>
          <ellipse cx="58" cy="88" rx="5" ry="2.6" className="nf-cheek" />
          <ellipse cx="102" cy="88" rx="5" ry="2.6" className="nf-cheek" />
          <path d="M75 89q2.5-2.5 5 0t5 0" className="nf-mouth" />
        </g>
        <text x="128" y="36" className="nf-huh">
          ?
        </text>
      </g>
    </svg>
  );
}
