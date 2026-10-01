// The screenshots on a /mods card: one shot in a 16:9 viewer with its
// caption, a strip of thumbnails to switch it, and a click on the shot to see
// it full size. Shots and captions come from src/lib/mod-shots.ts; a mod
// without any gets nothing.

import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { MOD_SHOTS, shotSize, shotSrc, thumbSrc, type ModShot } from '../lib/mod-shots';

export function hasShots(modId: string): boolean {
  return (MOD_SHOTS[modId]?.length ?? 0) > 0;
}

export function ModGallery({ modId, name }: { modId: string; name: string }) {
  const shots = MOD_SHOTS[modId] ?? [];
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  if (shots.length === 0) return null;

  const shot = shots[index];
  const step = (by: number) => setIndex((i) => (i + by + shots.length) % shots.length);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  };

  return (
    <div className="mod-shots">
      <button
        type="button"
        className="mod-shot-main"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Show full size: ${shot.alt}`}
      >
        <ShotImage modId={modId} shot={shot} />
      </button>
      <p className="mod-shot-caption">{shot.caption}</p>

      {shots.length > 1 && (
        <ul className="mod-shot-thumbs" aria-label={`${name} screenshots`}>
          {shots.map((s, i) => (
            <li key={s.slug}>
              <button
                type="button"
                aria-pressed={i === index}
                aria-label={s.caption}
                onClick={() => setIndex(i)}
              >
                <img src={thumbSrc(modId, s)} alt="" loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Clicking the backdrop (the dialog itself, outside the figure) closes
          it; Escape does natively. */}
      <dialog
        ref={dialog}
        className="mod-lightbox"
        aria-label={`${name}: ${shot.caption}`}
        onKeyDown={onKey}
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <figure>
          <ShotImage modId={modId} shot={shot} eager />
          <figcaption>
            <span>{shot.caption}</span>
            {shots.length > 1 && (
              <span className="mod-lightbox-nav">
                <button type="button" onClick={() => step(-1)} aria-label="Previous screenshot">
                  ‹
                </button>
                <span className="mod-lightbox-count">
                  {index + 1} / {shots.length}
                </span>
                <button type="button" onClick={() => step(1)} aria-label="Next screenshot">
                  ›
                </button>
              </span>
            )}
            <button type="button" className="mod-lightbox-close" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </figcaption>
        </figure>
      </dialog>
    </div>
  );
}

// A panel shot is cut at the game's own pixel size, often only a couple of
// hundred pixels across, so it may scale up to 2× to fill the viewer; a frame
// only ever scales down. --w/--h carry the cut size to the CSS.
function ShotImage({ modId, shot, eager = false }: { modId: string; shot: ModShot; eager?: boolean }) {
  const [w, h] = shotSize(shot);
  return (
    <img
      src={shotSrc(modId, shot)}
      width={w}
      height={h}
      alt={shot.alt}
      data-kind={shot.kind}
      loading={eager ? undefined : 'lazy'}
      decoding="async"
      style={{ '--w': w, '--h': h } as CSSProperties}
    />
  );
}
