// One mod's card, shared by /mods (UI mods) and /gameplay-mods: monogram
// tile, name and version, tagline and the download along the top; its
// screenshots beside its features; hotkeys and links along the foot. A
// gameplay mod passes its whole set-up and rules as children, so everything
// about one mode sits in one card.

import type { ReactNode } from 'react';
import { ModGallery, hasShots } from './ModGallery';
import { releaseNotes, sourceHref, type Mod } from '../lib/mods';

export function ModCard({
  mod,
  href,
  label,
  addOn = false,
  children,
}: {
  mod: Mod;
  href: string;
  label: string;
  /** One of the mods that go on top of the Mod Manager: a quieter download
   *  button, so the manager's stays the one that reads as step one. */
  addOn?: boolean;
  /** More about the mod, between its features and its foot. */
  children?: ReactNode;
}) {
  return (
    <article className="mod-entry" id={mod.id}>
      <header className="mod-entry-head">
        <span className="mod-glyph" aria-hidden="true">
          {monogram(mod.name)}
        </span>
        <div className="mod-entry-title">
          <h3>
            {mod.name} <span className="mod-version">v{mod.version}</span>
          </h3>
          <p className="mod-tagline">{mod.tagline}</p>
        </div>
        <a className={addOn ? 'dl-btn ghost' : 'dl-btn'} href={href} aria-label={`Download ${mod.name}`}>
          {label}
        </a>
      </header>

      {/* With screenshots, they sit beside the features; without, the
          features take the card's full width. */}
      <div className={hasShots(mod.id) ? 'mod-body has-shots' : 'mod-body'}>
        <ModGallery modId={mod.id} name={mod.name} />
        <ul className="mod-features">
          {mod.features.map((f) => (
            <li key={f.title}>
              <strong>{f.title}</strong>
              {f.text}
            </li>
          ))}
        </ul>
      </div>

      {children}

      <footer className="mod-entry-foot">
        {mod.keys && <span className="mod-keys">{mod.keys}</span>}
        <span className="mod-links">
          <a href={sourceHref(mod)} target="_blank" rel="noreferrer">
            Source
          </a>
          <a href={releaseNotes(mod)} target="_blank" rel="noreferrer">
            Release notes
          </a>
        </span>
      </footer>
    </article>
  );
}

// Two letters for a mod's tile: the initials of its first two words, or the
// first two letters of a one-word name ("Mod Manager" → MM, "Minimap" → MI).
function monogram(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}
