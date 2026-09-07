// Shared site chrome, rendered once by the root route: one dense 46px bar with
// the brand, nav and a centred slot (the units page portals its search here).

import { useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { SITE_REPO } from '../lib/mods';
import { AuthChip } from './AuthChip';

export function Header() {
  const ref = useRef<HTMLElement>(null);

  // Sticky sidebars and column headers sit below the bar, whose height depends
  // on the viewport (it wraps when narrow), so publish the measured height
  // rather than hard-coding an offset that silently drifts when the chrome
  // changes.
  useEffect(() => {
    const header = ref.current;
    if (!header) return;

    const publish = () =>
      document.documentElement.style.setProperty(
        '--header-h',
        `${Math.round(header.getBoundingClientRect().height)}px`,
      );

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header className="topbar" ref={ref}>
      <Link to="/" className="brand">
        <svg viewBox="0 0 64 64" width={18} height={18} aria-hidden="true">
          <path d="M20 8H44L56 20V44L44 56H20L8 44V20Z" fill="none" stroke="var(--accent)" strokeWidth={6} />
        </svg>
        <span className="wordmark">
          Sanctuary<span>DB</span>
        </span>
      </Link>
      <span className="topbar-divider" aria-hidden="true" />
      <nav className="nav">
        <Link
          to="/"
          className="navlink"
          activeOptions={{ exact: true, includeSearch: false }}
          activeProps={{ className: 'navlink active' }}
        >
          Units
        </Link>
        <Link
          to="/calculator"
          className="navlink"
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: 'navlink active' }}
        >
          Calculator
        </Link>
        <Link
          to="/maps"
          className="navlink"
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: 'navlink active' }}
        >
          Maps
        </Link>
        <Link
          to="/mods"
          className="navlink"
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: 'navlink active' }}
        >
          Mods
        </Link>
        <Link
          to="/play"
          className="navlink"
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: 'navlink active' }}
        >
          Play
        </Link>
        <Link
          to="/ladder"
          className="navlink"
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: 'navlink active' }}
        >
          Ladder
        </Link>
      </nav>
      <div className="header-slot" />
      {/* The site itself is open source; the icon says so without spending a
          nav slot on a word nobody scans for. */}
      <a
        className="ghlink"
        href={SITE_REPO}
        target="_blank"
        rel="noreferrer"
        title="SanctuaryDB on GitHub"
        aria-label="SanctuaryDB on GitHub"
      >
        <svg viewBox="0 0 16 16" width={17} height={17} aria-hidden="true" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
      </a>
      <AuthChip />
    </header>
  );
}
