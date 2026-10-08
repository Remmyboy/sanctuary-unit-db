// Remmy's Balance Patch: the download, what it's for, and every change it
// makes to the game, section by section — each section is one of its lobby
// options. A unit's line links to it in the database with the patch on, where
// every number on the site follows the patch.
//
// The version comes from src/lib/mods.ts and the changes from
// src/lib/balance-patch.json (the mod's own export); a test keeps the two on
// the same release.

import { Link, createFileRoute } from '@tanstack/react-router';
import { CopyPath } from '../components/ModInstall';
import { FactionEmblem } from '../components/FactionEmblem';
import { FACTION_COLOURS } from '../components/UnitIcon';
import { HeadStat, PageHead } from '../components/PageHead';
import {
  BALANCE_PATCH,
  MODS_REPO,
  managerHref,
  mod,
  releaseNotes,
  releaseTag,
  sourceHref,
  standaloneHref,
} from '../lib/mods';
import {
  PATCH_CHANGE_COUNT,
  PATCH_GAME,
  PATCH_SECTIONS,
  PATCH_UNIT_COUNT,
  type PatchRow,
  type PatchSection,
} from '../lib/balance-changes';
import type { ChangeText } from '../lib/balance-patch';

export const Route = createFileRoute('/balance-patch')({
  head: () => ({
    meta: [
      { title: 'Remmy’s Balance Patch — SanctuaryDB' },
      {
        name: 'description',
        content:
          'Remmy’s Balance Patch for Sanctuary: Shattered Sun: a community balance pass measured in game. Download it, and see every change to every unit, with the game’s number, the patch’s and why.',
      },
    ],
  }),
  component: BalancePatchPage,
});

const MANAGER = mod('ModManager');

function BalancePatchPage() {
  return (
    <>
      <PageHead
        eyebrow="Gameplay mod"
        title={BALANCE_PATCH.name}
        art="mods"
        aside={
          <>
            <HeadStat value={PATCH_UNIT_COUNT} label="Units changed" />
            <HeadStat value={PATCH_SECTIONS.length} label="Lobby options" />
          </>
        }
      >
        {BALANCE_PATCH.tagline} Below is every change it makes, with the game&rsquo;s number, the
        patch&rsquo;s and why.
      </PageHead>
      <div className="toolbar">
        <span className="toolbar-summary">
          v{BALANCE_PATCH.version} · {PATCH_CHANGE_COUNT} changes · for game {PATCH_GAME.version} (Steam build{' '}
          {PATCH_GAME.steamBuild})
        </span>
        <a className="toolbar-link" href={sourceHref(BALANCE_PATCH)} target="_blank" rel="noreferrer">
          Source on GitHub ↗
        </a>
      </div>

      <main className="mods-page gm-page bp-page">
        <aside className="mods-aside">
          <section className="mods-everything" aria-labelledby="bp-get">
            <div>
              <p className="mods-everything-kicker">Download</p>
              <h2 id="bp-get">Balance Patch {BALANCE_PATCH.version}</h2>
              <p>
                A gameplay mod: the lobby&rsquo;s host switches it on, and everyone in the match needs it and
                the <strong>Mod Manager</strong>.
              </p>
            </div>
            <a className="dl-btn" href={managerHref(BALANCE_PATCH)}>
              Download the Balance Patch
            </a>
            <a className="dl-btn ghost" href={standaloneHref(MANAGER)}>
              Mod Manager {MANAGER.version}
            </a>
          </section>

          <div className="mods-where">
            <h2>Where the zips go</h2>
            <p>
              Your game&rsquo;s <code>engine</code> folder. It&rsquo;s usually here:
            </p>
            <CopyPath />
            <p className="gm-tree">
              Inside it, the patch lands in <code>SanctuaryMods\BalancePatch\</code>
            </p>
          </div>

          <nav className="bp-toc" aria-label="Sections">
            <h2>Sections</h2>
            <ol>
              {PATCH_SECTIONS.map((s) => (
                <li key={s.key}>
                  <a href={`#${s.key}`}>
                    {s.label}
                    <span>{s.unitCount || s.rules.length ? sectionCount(s) : ''}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="mods-main">
          <section aria-labelledby="bp-what">
            <h2 id="bp-what" className="gm-heading">
              What it does
            </h2>
            <ul className="mod-features bp-features">
              {BALANCE_PATCH.features.map((f) => (
                <li key={f.title}>
                  <strong>{f.title}</strong>
                  {f.text}
                </li>
              ))}
            </ul>
            <div className="bp-db">
              <p>
                <strong>See it in the unit database.</strong> Switch on <em>{BALANCE_PATCH.name}</em> in the
                database&rsquo;s toolbar and every number on the site follows the patch: costs, health, DPS,
                the calculator and comparisons.
              </p>
              <Link to="/" search={{ balance: 'remmy' }} className="dl-btn ghost">
                Units with the patch on
              </Link>
            </div>
          </section>

          <section className="gm-section" aria-labelledby="bp-setup">
            <h2 id="bp-setup" className="gm-heading">
              Set it up
            </h2>
            <ol className="gm-steps">
              <li>
                Extract the zip into your <code>engine</code> folder, with the{' '}
                <Link to="/gameplay-mods" className="gm-more">
                  Mod Manager
                </Link>
                . Every player in the lobby needs both.
              </li>
              <li>Host a lobby on any map.</li>
              <li>
                Open <strong>Mods</strong> in the lobby, beside Settings, and switch on{' '}
                <strong>Balance Patch</strong>. Its nine sections below are its options: all start on, and the
                host can switch off any of them.
              </li>
              <li>
                Start. The game waits until every player has the same copy, and says who&rsquo;s missing it.
              </li>
            </ol>
          </section>

          <p className="bp-legend hint">
            Each line is the game&rsquo;s number, then the patch&rsquo;s. Click a unit to open it in the
            database with the patch on.
          </p>

          {PATCH_SECTIONS.map((s) => (
            <Section key={s.key} section={s} />
          ))}

          <p className="gm-credit-links bp-foot">
            <a href={releaseNotes(BALANCE_PATCH)} target="_blank" rel="noreferrer">
              Release notes ↗
            </a>{' '}
            ·{' '}
            <a
              href={`${MODS_REPO}/blob/${releaseTag(BALANCE_PATCH)}/BalancePatch/CHANGELOG.md`}
              target="_blank"
              rel="noreferrer"
            >
              The full changelog ↗
            </a>
          </p>
        </div>
      </main>
    </>
  );
}

const sectionCount = (s: PatchSection): string =>
  s.unitCount ? `${s.unitCount} unit${s.unitCount === 1 ? '' : 's'}` : `${s.rules.length} rules`;

function Section({ section: s }: { section: PatchSection }) {
  return (
    <section className="gm-section bp-section" id={s.key} aria-labelledby={`bp-${s.key}`}>
      <h2 id={`bp-${s.key}`} className="gm-heading">
        {s.label}
        <span className="bp-count">{sectionCount(s)}</span>
      </h2>
      <p className="bp-desc">{s.description}</p>

      {s.rules.length > 0 && (
        <ul className="mod-features gm-rules bp-rules">
          {s.rules.map((r) => (
            <li key={r.title}>
              <strong>{r.title}</strong>
              {r.text}
            </li>
          ))}
        </ul>
      )}

      {s.rows.length > 0 && (
        <div className="bp-rows" role="list">
          {s.rows.map((r) => (
            <Row key={r.key} row={r} />
          ))}
        </div>
      )}

      {s.why.length > 0 && (
        <details className="bp-why">
          <summary>Why</summary>
          <ul>
            {s.why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Row({ row: r }: { row: PatchRow }) {
  return (
    <div className="bp-row" role="listitem">
      <div className="bp-who">
        <span className="bp-title">{r.title}</span>
        {!r.projectile && (
          <span className="bp-units">
            {r.units.map((u) => (
              <Link
                key={u.id}
                to="/"
                search={{ unit: u.id, balance: 'remmy' }}
                className="bp-unit"
                style={{ '--fc': FACTION_COLOURS[u.faction] } as React.CSSProperties}
                title={`${u.name ?? r.title} (${u.faction}) in the database, with the patch on`}
              >
                <FactionEmblem faction={u.faction} />
                {u.name ?? u.faction}
              </Link>
            ))}
          </span>
        )}
      </div>
      <ul className="bp-changes">
        {r.changes.map((c, i) => (
          <Change key={i} change={c} />
        ))}
      </ul>
    </div>
  );
}

function Change({ change: c }: { change: ChangeText }) {
  return (
    <li>
      <span className="bp-label">{c.label}</span>
      <span className="bp-vals">
        <span className="bp-before">{c.before}</span>
        <span className="bp-arrow" aria-label="becomes">
          →
        </span>
        <span className="bp-after">{c.after}</span>
        {c.percent != null && c.percent !== 0 && (
          <span className={c.percent > 0 ? 'bp-pct up' : 'bp-pct down'}>
            {c.percent > 0 ? '+' : '−'}
            {Math.abs(c.percent)}%
          </span>
        )}
      </span>
    </li>
  );
}
