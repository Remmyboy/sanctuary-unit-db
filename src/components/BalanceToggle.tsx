// The database's switch between the game's numbers and Remmy's Balance
// Patch's, in the toolbar of the units, calculator and compare pages, and the
// strip under the toolbar that says which numbers you're looking at while the
// patch is on — so a screenshot of a patched unit can't pass for the game's.

import { Link } from '@tanstack/react-router';
import { BALANCE_PATCH_NAME, collapseTexts, describeChange } from '../lib/balance-patch';
import type { BalanceChange, UnitsMeta } from '../lib/types';

export function BalanceToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      className="balance-toggle"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      title={on ? 'Back to the game’s own numbers' : `Show every number with ${BALANCE_PATCH_NAME}`}
    >
      <svg viewBox="0 0 14 14" aria-hidden="true">
        <path d="M7 1.5v11M3 12.5h8M1.5 4.5h11M3.5 4.5 1.5 8.5h4ZM10.5 4.5l-2 4h4Z" />
      </svg>
      <span>Balance Patch</span>
    </button>
  );
}

export function BalanceStrip({ meta, onOff }: { meta: UnitsMeta; onOff: () => void }) {
  const patch = meta.balancePatch;
  if (!patch) return null;
  return (
    <div className="balance-strip" role="status">
      <span>
        <strong>{BALANCE_PATCH_NAME}</strong> v{patch.version}: every number here is the patch&rsquo;s.{' '}
        {patch.changedUnits} units changed, marked <span className="bp-mark" aria-hidden="true" />
        <span className="sr-only">with a dot</span>.
      </span>
      <span className="balance-strip-links">
        <Link to="/balance-patch">Every change</Link>
        <button type="button" className="linkish" onClick={onOff}>
          Back to the game&rsquo;s numbers
        </button>
      </span>
    </div>
  );
}

// Each change with its sections in words; changes that read the same within
// the same sections (a T4's three guns) collapse into one line.
function lines(changes: BalanceChange[], sections: Map<string, string>) {
  const tagged = changes.map((c) => ({
    tag: c.sections.map((s) => sections.get(s) ?? s).join(', '),
    text: describeChange(c),
  }));
  const tags = [...new Set(tagged.map((t) => t.tag))];
  return tags.flatMap((tag) =>
    collapseTexts(tagged.filter((t) => t.tag === tag).map((t) => t.text)).map((text) => ({ tag, text })),
  );
}

/** A patched unit's changes, in its detail panel. */
export function BalanceChanges({ changes, meta }: { changes: BalanceChange[]; meta: UnitsMeta }) {
  const sections = new Map((meta.balancePatch?.sections ?? []).map((s) => [s.key, s.label]));
  return (
    <ul className="bp-changes bp-changes-detail">
      {lines(changes, sections).map(({ text: t, tag }, i) => (
        <li key={i}>
          <span className="bp-label">
            {t.label}
            {t.count ? <span className="bp-count-n"> ×{t.count}</span> : null}
          </span>
          <span className="bp-vals">
            <span className="bp-before">{t.before}</span>
            <span className="bp-arrow" aria-label="becomes">
              →
            </span>
            <span className="bp-after">{t.after}</span>
          </span>
          <span className="bp-section-tag">{tag}</span>
        </li>
      ))}
    </ul>
  );
}
