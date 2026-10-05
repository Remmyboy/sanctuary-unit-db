// What LadderReporter uploaded after a ranked game, on the match page: the
// replay to download and the end-of-match stats (a scoreboard and charts
// over time). Both are opt-in for players, so either may be missing.
//
// The charts are hand-rolled SVG like RatingGraph: a line per player in
// their in-game colour, game time along the bottom.

import { useEffect, useState } from 'react';
import { checkLive } from './GameVersion';
import { formatBytes, type MatchReplayView } from '../lib/match-replay';
import type { MatchStatsView, SeriesKey, StatsArmy } from '../lib/match-stats';
import type { MatchParticipant } from '../lib/ladder-types';

const REPLAY_FOLDER = String.raw`%USERPROFILE%\AppData\LocalLow\Enhearten Media PTY\Sanctuary\Replays\Saved`;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// 12345 → "12.3k": totals run to six figures and the table is narrow.
function num(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return Math.round(n).toLocaleString('en-GB');
  return String(Math.round(n * 10) / 10);
}

// ---- replay -----------------------------------------------------------------

export function ReplayPanel({
  matchId,
  replay,
  canEnable,
}: {
  matchId: string;
  replay: MatchReplayView | null;
  canEnable: boolean; // a participant, so the opt-in hint is theirs to act on
}) {
  const [liveBuild, setLiveBuild] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    checkLive().then((c) => alive && setLiveBuild(c?.live?.buildId ?? null));
    return () => {
      alive = false;
    };
  }, []);

  if (!replay) {
    return canEnable ? (
      <p className="match-note uploads-hint">
        No replay or stats for this game yet. LadderReporter can upload them for you: press F8 in game, open
        Ladder Reporter, and switch on <strong>Upload → Stats</strong> and <strong>Replays</strong>.
      </p>
    ) : null;
  }
  if (replay.uploading) {
    return <p className="match-note">Replay uploading from a player's game…</p>;
  }
  if (replay.status === 'expired') {
    return (
      <p className="match-note">
        The replay was removed: it was recorded on an older game build, which the current game can't play.
      </p>
    );
  }

  const outdated = replay.buildId !== null && liveBuild !== null && replay.buildId !== liveBuild;
  return (
    <section className="replay-panel">
      <div className="replay-row">
        <a className="btn primary" href={`/api/replays/${matchId}`} download={replay.fileName}>
          Download replay
        </a>
        <span className="dim">
          {formatBytes(replay.sizeBytes)}
          {replay.buildId !== null && <> · build {replay.buildId}</>}
        </span>
      </div>
      {outdated && (
        <p className="replay-warn">
          Recorded on an older game build. The current version of the game won't play it.
        </p>
      )}
      <p className="dim replay-help">
        Put the file in <code>{REPLAY_FOLDER}</code> and open it from the game's Replays menu.
      </p>
    </section>
  );
}

// ---- stats ------------------------------------------------------------------

interface Column {
  army: StatsArmy;
  name: string;
  colour: string;
}

// Fallbacks for a player whose colour didn't come across, distinct from
// each other and from the faction greens/reds/ambers.
const FALLBACK = ['var(--accent)', '#c48bff', '#f5f5f5', '#ff7ac0'];

function columns(stats: MatchStatsView, participants: MatchParticipant[]): Column[] {
  // The site's display names, in the page's own team order.
  const order = new Map(participants.map((p, i) => [p.steamId, i]));
  return [...stats.armies]
    .sort((a, b) => (order.get(a.steamId) ?? 99) - (order.get(b.steamId) ?? 99))
    .map((army, i) => ({
      army,
      name: participants.find((p) => p.steamId === army.steamId)?.personaName ?? army.name,
      colour: army.colour ?? FALLBACK[i % FALLBACK.length],
    }));
}

interface Row {
  label: string;
  value: (a: StatsArmy, tickRate: number) => number;
  format?: (n: number) => string;
  lowerIsBetter?: boolean;
  sub?: boolean; // an indented breakdown line
}

const ROWS: Row[] = [
  { label: 'Score', value: (a) => a.score },
  { label: 'Alloy gathered', value: (a) => a.alloy.gathered },
  { label: 'Alloy spent', value: (a) => a.alloy.spent },
  { label: 'Alloy wasted', value: (a) => a.alloy.wasted, lowerIsBetter: true },
  { label: 'Energy gathered', value: (a) => a.energy.gathered },
  { label: 'Energy spent', value: (a) => a.energy.spent },
  { label: 'Energy wasted', value: (a) => a.energy.wasted, lowerIsBetter: true },
  {
    label: 'Time stalled',
    value: (a, tr) => (a.alloy.stallTicks + a.energy.stallTicks) / tr,
    format: (n) => mmss(n),
    lowerIsBetter: true,
  },
  {
    label: 'Units built',
    value: (a) => a.built.land + a.built.air + a.built.naval + a.built.engineers + a.built.structures,
  },
  { label: 'Land', value: (a) => a.built.land, sub: true },
  { label: 'Air', value: (a) => a.built.air, sub: true },
  { label: 'Naval', value: (a) => a.built.naval, sub: true },
  { label: 'Engineers', value: (a) => a.built.engineers, sub: true },
  { label: 'Structures', value: (a) => a.built.structures, sub: true },
  { label: 'Value built', value: (a) => a.built.value },
  { label: 'Peak army value', value: (a) => a.peakArmyValue },
  { label: 'Value killed', value: (a) => a.killedValue },
  {
    label: 'Units lost',
    value: (a) => a.lost.mobile + a.lost.structures + a.lost.commander,
    lowerIsBetter: true,
  },
  { label: 'Value lost', value: (a) => a.lost.value, lowerIsBetter: true },
];

const CHARTS: { key: SeriesKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'armyValue', label: 'Army value' },
  { key: 'alloyIncome', label: 'Alloy income' },
  { key: 'energyIncome', label: 'Energy income' },
  { key: 'units', label: 'Units' },
];

const FACTIONS: Record<number, string> = { 1: 'EDA', 2: 'Chosen', 3: 'Guard' };

export function MatchStatsPanel({
  stats,
  participants,
}: {
  stats: MatchStatsView;
  participants: MatchParticipant[];
}) {
  const [chart, setChart] = useState<SeriesKey>('score');
  const cols = columns(stats, participants);
  const hasTimeline = stats.timeline.t.length > 1;

  return (
    <section className="match-stats">
      <header className="ms-head">
        <h2>Match stats</h2>
        <span className="dim">
          {mmss(stats.durationS)} game ·{' '}
          {stats.confirmed ? (
            <span className="ms-confirmed" title="Both players' games uploaded the same figures">
              confirmed by both players
            </span>
          ) : (
            'uploaded by one player'
          )}
        </span>
      </header>

      <div className="ms-table-wrap">
        <table className="ms-table">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.army.steamId} style={{ '--pc': c.colour } as React.CSSProperties}>
                  <span className="ms-swatch" aria-hidden="true" />
                  {c.name}
                  {FACTIONS[c.army.faction] && <span className="ms-faction">{FACTIONS[c.army.faction]}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const values = cols.map((c) => row.value(c.army, stats.tickRate));
              const best = row.lowerIsBetter ? Math.min(...values) : Math.max(...values);
              const differs = values.some((v) => v !== values[0]);
              return (
                <tr key={row.label} data-sub={row.sub || undefined}>
                  <th scope="row">{row.label}</th>
                  {values.map((v, i) => (
                    <td key={cols[i].army.steamId} data-best={(differs && v === best) || undefined}>
                      {(row.format ?? num)(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasTimeline && (
        <>
          <div className="chips ms-chart-picker" role="group" aria-label="Chart">
            {CHARTS.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip"
                aria-pressed={chart === c.key}
                onClick={() => setChart(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <StatsChart
            stats={stats}
            cols={cols}
            series={chart}
            label={CHARTS.find((c) => c.key === chart)!.label}
          />
        </>
      )}
    </section>
  );
}

const W = 720;
const H = 220;
const PAD = { l: 44, r: 12, t: 12, b: 24 };

function StatsChart({
  stats,
  cols,
  series,
  label,
}: {
  stats: MatchStatsView;
  cols: Column[];
  series: SeriesKey;
  label: string;
}) {
  const t = stats.timeline.t;
  const lines = cols
    .map((c) => ({ col: c, values: stats.timeline.series[c.army.steamId]?.[series] }))
    .filter((l): l is { col: Column; values: number[] } => Array.isArray(l.values));
  const maxT = Math.max(1, t[t.length - 1]);
  const maxV = Math.max(1, ...lines.flatMap((l) => l.values));
  const x = (s: number) => PAD.l + (s / maxT) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / maxV) * (H - PAD.t - PAD.b);
  // A tick every 5 minutes, or every minute for a short game.
  const step = maxT > 900 ? 300 : 60;
  const ticks: number[] = [];
  for (let s = 0; s <= maxT; s += step) ticks.push(s);

  return (
    <svg className="ms-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} over the game`}>
      {[0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(maxV * f)} y2={y(maxV * f)} className="ms-grid" />
          <text x={PAD.l - 6} y={y(maxV * f) + 4} textAnchor="end" className="ms-axis">
            {num(maxV * f)}
          </text>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="ms-baseline" />
      {ticks.map((s) => (
        <text key={s} x={x(s)} y={H - 6} textAnchor="middle" className="ms-axis">
          {mmss(s)}
        </text>
      ))}
      {lines.map(({ col, values }) => (
        <polyline
          key={col.army.steamId}
          className="ms-line"
          stroke={col.colour}
          points={values.map((v, i) => `${x(t[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
        >
          <title>{col.name}</title>
        </polyline>
      ))}
    </svg>
  );
}
