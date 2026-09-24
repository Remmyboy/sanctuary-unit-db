// The masthead every top-level page opens with: a small eyebrow naming the
// section, the page title in the display face, one line of what the page is
// for, and an optional aside on the right for live figures or the page's main
// action. It scrolls away; the sticky toolbar under it is what stays.
//
// `art` names the presskit screenshot behind it (src/lib/art.ts). It's
// decoration only: dimmed, and scrimmed dark under the text.

import type { ReactNode } from 'react';
import { MASTHEAD_ART, mastheadSrc, type MastheadArt } from '../lib/art';

interface PageHeadProps {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  art?: MastheadArt;
}

export function PageHead({ eyebrow, title, children, aside, art }: PageHeadProps) {
  return (
    <header className="page-head">
      {art && (
        <div
          className="page-head-art"
          aria-hidden="true"
          style={
            {
              backgroundImage: `url(${mastheadSrc(art)})`,
              '--art-focus': MASTHEAD_ART[art].focus,
            } as React.CSSProperties
          }
        />
      )}
      <div className="page-head-inner">
        <div className="page-head-text">
          <p className="page-eyebrow">{eyebrow}</p>
          <h1 className="page-title">{title}</h1>
          {children && <p className="page-lede">{children}</p>}
        </div>
        {aside && <div className="page-head-aside">{aside}</div>}
      </div>
    </header>
  );
}

// A figure for a masthead aside: a big number over a small label, with an
// optional colour bar (a faction's, or a resource's) down its left edge.
export function HeadStat({ value, label, colour }: { value: ReactNode; label: string; colour?: string }) {
  return (
    <div className="head-stat" style={colour ? ({ '--fc': colour } as React.CSSProperties) : undefined}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
