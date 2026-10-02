import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { Unit } from '../lib/types';
import type { LoadedData } from '../lib/data';
import { fmt, shortName } from '../lib/format';
import {
  MAX_COUNT,
  STEP,
  armament,
  defaultGap,
  simulateChase,
  type Behaviour,
  type Body,
  type ChaseResult,
} from '../lib/chase';
import { iconUrl } from './UnitIcon';
import { FACTION_COLOURS } from '../lib/faction-colours';

// Two of the compared units on open ground — one of each, or a group of
// each — one side chasing the other, with their weapon ranges drawn round
// them. The animation plays back the very samples the summary underneath is
// worked out from, so what you watch and what you read can't disagree.

const BEHAVIOURS: Array<[Behaviour, string]> = [
  ['flee', 'Runs away'],
  ['hold', 'Holds ground'],
  ['advance', 'Walks in'],
];
const RATES = [1, 2, 4, 8];

type Namer = (u: Unit) => string;

/**
 * Names for the units being compared. Commanders and other unnamed units only
 * have their role ("Commander"), so wherever two would read the same the
 * faction goes in front — "EDA Commander" against "Chosen Commander".
 */
function namer(units: Unit[]): Namer {
  const base = (u: Unit) => u.name ?? shortName(u);
  const seen = new Map<string, number>();
  for (const u of units) seen.set(base(u), (seen.get(base(u)) ?? 0) + 1);
  return (u) => ((seen.get(base(u)) ?? 0) > 1 ? `${u.faction} ${base(u)}` : base(u));
}
const mobile = (u: Unit) => Boolean(u.movement?.speed);
/** "Kodiak", or "5× Kodiak" for a group. */
const groupName = (nameOf: Namer, u: Unit, n: number) => (n > 1 ? `${n}× ${nameOf(u)}` : nameOf(u));

/** The likeliest matchup: the longest reach is the one being chased. */
function defaults(units: Unit[]): [string, string] | null {
  const byReach = units.slice().sort((a, b) => (b.maxRange ?? 0) - (a.maxRange ?? 0));
  const target = byReach[0];
  const chaser = byReach.find((u) => u.id !== target.id && mobile(u));
  if (chaser) return [chaser.id, target.id];
  // Only the longest-ranged unit moves: let it be the chaser instead.
  const other = byReach.find((u) => u.id !== target.id);
  return mobile(target) && other ? [target.id, other.id] : null;
}

export function ChaseSim({ units, loaded }: { units: Unit[]; loaded: LoadedData }) {
  const [picked, setPicked] = useState<[string, string] | null>(null);
  const nameOf = namer(units);
  const [counts, setCounts] = useState<[number, number]>([1, 1]);
  const [behaviour, setBehaviour] = useState<Behaviour>('flee');
  const [gapOverride, setGapOverride] = useState<number | null>(null);

  // Picks survive only while both units are still being compared.
  const ids = picked && picked.every((id) => units.some((u) => u.id === id)) ? picked : defaults(units);
  const chaser = ids ? loaded.byId.get(ids[0]) : undefined;
  const target = ids ? loaded.byId.get(ids[1]) : undefined;
  const ready = chaser && target && mobile(chaser);

  const behave: Behaviour = target && mobile(target) ? behaviour : 'hold';
  const gap = gapOverride ?? (ready ? defaultGap(chaser, target, behave) : 0);
  const [chaserCount, targetCount] = counts;

  // A run is a few thousand steps, so it's worked out once per setup rather
  // than on every render. Dragging the gap slider asks for a new one per
  // pixel; the deferred gap lets the slider keep up and simulates the latest
  // position when there's time. Only a dragged gap is deferred — any other
  // change resets the gap, and that run should match its setup straight away.
  const deferredGap = useDeferredValue(gap);
  const runGap = gapOverride == null ? gap : deferredGap;
  const result = useMemo(
    () =>
      ready
        ? simulateChase({ chaser, target, behaviour: behave, gap: runGap, chaserCount, targetCount })
        : null,
    [ready, chaser, target, behave, runGap, chaserCount, targetCount],
  );

  if (!ready || !result) return null;
  const choose = (next: [string, string]) => {
    setPicked(next);
    setGapOverride(null);
  };
  const setCount = (side: 0 | 1, raw: string) => {
    const n = Math.min(MAX_COUNT, Math.max(1, Math.round(Number(raw) || 1)));
    setCounts((c) => (side === 0 ? [n, c[1]] : [c[0], n]));
  };

  const cArms = armament(chaser, target);
  const tArms = armament(target, chaser);
  const gapMax = Math.max(Math.ceil(Math.max(cArms.reach, tArms.reach, 20) * 2.5), gap);

  return (
    <section className="chase" aria-labelledby="chase-title">
      <h2 id="chase-title">Chase</h2>
      <p className="chase-lede">
        Set these loose on open ground — one of each, or a group of each — and watch who gets in range first.
        Rings are weapon ranges against each other.
      </p>

      <div className="chase-controls">
        <div className="chase-side">
          <label>
            <span>Chaser</span>
            <select value={chaser.id} onChange={(e) => choose([e.target.value, target.id])}>
              {units
                .filter((u) => mobile(u) && u.id !== target.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {nameOf(u)}
                  </option>
                ))}
            </select>
          </label>
          <label className="chase-count">
            <span>How many</span>
            <input
              type="number"
              min={1}
              max={MAX_COUNT}
              value={chaserCount}
              onChange={(e) => setCount(0, e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="chase-swap"
          title="Swap who chases whom"
          aria-label="Swap chaser and target"
          disabled={!mobile(target)}
          onClick={() => {
            choose([target.id, chaser.id]);
            setCounts([targetCount, chaserCount]);
          }}
        >
          ⇄
        </button>
        <div className="chase-side">
          <label>
            <span>Target</span>
            <select value={target.id} onChange={(e) => choose([chaser.id, e.target.value])}>
              {units
                .filter((u) => u.id !== chaser.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {nameOf(u)}
                  </option>
                ))}
            </select>
          </label>
          <label className="chase-count">
            <span>How many</span>
            <input
              type="number"
              min={1}
              max={MAX_COUNT}
              value={targetCount}
              onChange={(e) => setCount(1, e.target.value)}
            />
          </label>
        </div>
        <div className="view-toggle" role="group" aria-label="What the target does">
          {BEHAVIOURS.map(([b, label]) => (
            <button
              type="button"
              key={b}
              aria-pressed={behave === b}
              disabled={!mobile(target) && b !== 'hold'}
              onClick={() => {
                setBehaviour(b);
                setGapOverride(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="chase-gap">
          <span>Starting gap</span>
          <input
            type="range"
            min={2}
            max={gapMax}
            value={gap}
            onChange={(e) => setGapOverride(Number(e.target.value))}
          />
          <output>{fmt(gap)} u</output>
        </label>
      </div>

      <Playback
        key={`${chaser.id}-${chaserCount}-${target.id}-${targetCount}-${behave}-${runGap}`}
        result={result}
        chaser={chaser}
        target={target}
        behaviour={behave}
        loaded={loaded}
        nameOf={nameOf}
      />
    </section>
  );
}

// Keyed on the setup, so a change starts a fresh run from zero.
function Playback({
  result,
  chaser,
  target,
  behaviour,
  loaded,
  nameOf,
}: {
  result: ChaseResult;
  chaser: Unit;
  target: Unit;
  behaviour: Behaviour;
  loaded: LoadedData;
  nameOf: Namer;
}) {
  const end = result.samples[result.samples.length - 1].t;
  const [t, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(2);
  // The clock lives in a ref as well, so the frame loop reads it directly
  // rather than through a state updater that may not have run yet.
  const clock = useRef(0);
  const setT = (next: number) => {
    clock.current = next;
    setTime(next);
  };

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last == null ? 0 : (now - last) / 1000;
      last = now;
      const next = Math.min(end, clock.current + dt * rate);
      clock.current = next;
      setTime(next);
      if (next >= end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, end]);

  const sample = result.samples[Math.min(result.samples.length - 1, Math.round(t / STEP))];

  return (
    <>
      <Stage
        result={result}
        sample={sample}
        chaser={chaser}
        target={target}
        loaded={loaded}
        nameOf={nameOf}
      />

      <div className="chase-transport">
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (playing) return setPlaying(false);
            if (t >= end) setT(0);
            setPlaying(true);
          }}
        >
          {playing ? 'Pause' : t >= end ? 'Replay' : 'Play'}
        </button>
        <input
          type="range"
          className="chase-scrub"
          aria-label="Time"
          min={0}
          max={end}
          step={STEP}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
        />
        <span className="chase-clock">
          {fmt(sample.t, 1)}s <small>/ {fmt(end, 1)}s</small>
        </span>
        <div className="view-toggle" role="group" aria-label="Playback speed">
          {RATES.map((r) => (
            <button type="button" key={r} aria-pressed={rate === r} onClick={() => setRate(r)}>
              {r}×
            </button>
          ))}
        </div>
      </div>

      <Summary result={result} chaser={chaser} target={target} behaviour={behaviour} nameOf={nameOf} />
    </>
  );
}

// A nice round grid spacing for the visible width, so the ground reads as a
// ruler: 5, 10, 20, 50 or 100 units per line.
const gridStep = (width: number) => [5, 10, 20, 50, 100].find((s) => width / s <= 16) ?? 200;

const W = 800;
const H = 250;
const LANE = H / 2;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const living = (bodies: Body[]) => bodies.filter((b) => b.hp > 0);
const meanX = (bodies: Body[]) => bodies.reduce((n, b) => n + b.x, 0) / bodies.length;

function Stage({
  result,
  sample,
  chaser,
  target,
  loaded,
  nameOf,
}: {
  result: ChaseResult;
  sample: ChaseResult['samples'][number];
  chaser: Unit;
  target: Unit;
  loaded: LoadedData;
  nameOf: Namer;
}) {
  const { chaserArms: ca, targetArms: ta } = result;

  // One zoom for the whole run: wide enough for both blocks and both rings
  // at the start, and short enough that the wider block fits top to bottom.
  // The camera then follows the fight, so the ground slides past underneath.
  const start = [...result.samples[0].chasers, ...result.samples[0].targets];
  const extentX = Math.max(...start.map((b) => b.x)) - Math.min(...start.map((b) => b.x));
  const extentY = Math.max(...start.map((b) => Math.abs(b.y)));
  const reach = Math.max(ca.reach, ta.reach, 8);
  const scale = Math.min(W / Math.max(reach * 2.6, extentX + reach * 1.4, 30), (LANE - 42) / (extentY + 1));
  const span = W / scale;

  // Follow the living: midway between the two groups' centres.
  const cl = living(sample.chasers);
  const tl = living(sample.targets);
  const centre = (meanX(cl.length ? cl : sample.chasers) + meanX(tl.length ? tl : sample.targets)) / 2;
  const sx = (x: number) => W / 2 + (x - centre) * scale;
  const sy = (y: number) => LANE + y * scale;

  const step = gridStep(span);
  const first = Math.floor((centre - span / 2) / step) * step;
  const lines = Array.from({ length: Math.ceil(span / step) + 2 }, (_, i) => first + i * step);
  const flicker = Math.round(sample.t / STEP) % 4 < 2;

  const side = (
    u: Unit,
    count: number,
    bodies: Body[],
    enemies: Body[],
    reach: number,
    spacing: number,
    facing: 1 | -1,
  ) => {
    const colour = FACTION_COLOURS[u.faction];
    const src = iconUrl(u.icon, u.faction, loaded.iconManifest);
    const r = clamp(spacing * scale * 0.42, 4, 13);
    const alive = living(bodies);
    // The one nearest the enemy wears the full ring; the rest a faint one,
    // so a group's coverage shows without drowning the picture.
    const lead = alive.length ? alive.reduce((a, b) => (facing * (b.x - a.x) > 0 ? b : a)) : null;
    // The label rides over the survivors, not the wrecks left behind.
    const labelled = alive.length ? alive : bodies;
    const top = Math.min(...labelled.map((b) => sy(b.y))) - r - 9;
    return (
      <g>
        {reach > 0 &&
          alive.map((b, i) => (
            <circle
              key={`ring-${i}`}
              cx={sx(b.x)}
              cy={sy(b.y)}
              r={reach * scale}
              fill={b === lead ? colour : 'none'}
              fillOpacity={0.06}
              stroke={colour}
              strokeOpacity={b === lead ? 0.7 : 0.16}
              strokeDasharray="6 5"
            />
          ))}
        {flicker &&
          bodies.map((b, i) =>
            b.hp > 0 && b.shooting >= 0 ? (
              <line
                key={`shot-${i}`}
                x1={sx(b.x)}
                y1={sy(b.y)}
                x2={sx(enemies[b.shooting].x)}
                y2={sy(enemies[b.shooting].y)}
                stroke={colour}
                strokeWidth={count > 4 ? 1.2 : 2}
                strokeOpacity={0.85}
              />
            ) : null,
          )}
        {bodies.map((b, i) => {
          const x = sx(b.x);
          const y = sy(b.y);
          if (b.hp <= 0) {
            return (
              <text key={i} x={x} y={y + 4} textAnchor="middle" className="chase-wreck">
                ✕
              </text>
            );
          }
          const bar = Math.max(12, r * 2 + 4);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill="var(--bg)" stroke={colour} strokeWidth={r > 7 ? 2 : 1.5} />
              {src && r >= 8 ? (
                <image href={src} x={x - r * 0.85} y={y - r * 0.85} width={r * 1.7} height={r * 1.7} />
              ) : (
                <circle cx={x} cy={y} r={r * 0.45} fill={colour} />
              )}
              <rect
                x={x - bar / 2}
                y={y + r + 3}
                width={bar}
                height={3}
                rx={1.5}
                fill="var(--border-strong)"
              />
              <rect
                x={x - bar / 2}
                y={y + r + 3}
                width={bar * (b.hp / u.health)}
                height={3}
                rx={1.5}
                fill={b.hp / u.health > 0.35 ? 'var(--good)' : 'var(--bad)'}
              />
            </g>
          );
        })}
        <text x={sx(meanX(labelled))} y={top} textAnchor="middle" className="chase-label">
          {count === 1 || alive.length === count
            ? groupName(nameOf, u, count)
            : `${alive.length} of ${count}× ${nameOf(u)}`}
          {alive.length ? '' : ' ✕'}
        </text>
      </g>
    );
  };

  return (
    <div className="chase-stage">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${nameOf(chaser)} chasing ${nameOf(target)}`}>
        {lines.map((x) => (
          <line key={x} x1={sx(x)} x2={sx(x)} y1={0} y2={H} className="chase-grid" />
        ))}
        <line x1={0} x2={W} y1={LANE} y2={LANE} className="chase-lane" />
        {side(target, result.targetCount, sample.targets, sample.chasers, ta.reach, result.targetSpacing, -1)}
        {side(chaser, result.chaserCount, sample.chasers, sample.targets, ca.reach, result.chaserSpacing, 1)}
        <g className="chase-ruler" transform={`translate(12 ${H - 14})`}>
          <line x1={0} x2={step * scale} y1={0} y2={0} />
          <line x1={0} x2={0} y1={-4} y2={4} />
          <line x1={step * scale} x2={step * scale} y1={-4} y2={4} />
          <text x={step * scale + 6} y={4}>
            {step} u ≈ {step} T1 tanks
          </text>
        </g>
        <text x={W - 12} y={H - 10} textAnchor="end" className="chase-gap-label">
          gap {fmt(sample.gap, 1)} u
        </text>
      </svg>
    </div>
  );
}

const pct = (n: number, of: number) => `${Math.min(100, Math.round((n / of) * 100))}%`;

// The run in sentences: who reached whom, when, and what it cost.
function Summary({
  result: r,
  chaser,
  target,
  behaviour,
  nameOf,
}: {
  result: ChaseResult;
  chaser: Unit;
  target: Unit;
  behaviour: Behaviour;
  nameOf: Namer;
}) {
  const cn = r.chaserCount;
  const tnum = r.targetCount;
  const c = groupName(nameOf, chaser, cn);
  const tn = groupName(nameOf, target, tnum);
  // Verb agreement for "Kodiak gets" / "5× Kodiak get".
  const v = (n: number, one: string, many: string) => (n > 1 ? many : one);
  const lines: string[] = [];
  const cs = chaser.movement!.speed;
  const ts = target.movement?.speed ?? 0;
  const reach = fmt(r.chaserArms.reach);

  if (r.chaserArms.reach === 0) {
    lines.push(
      `${c} ${v(cn, 'has', 'have')} nothing that can hit ${nameOf(target)} — ${target.domain === 'Air' ? 'no anti-air' : 'no weapon for that layer'}.`,
    );
  } else if (r.chaserInRange === 0) {
    lines.push(`${tn} ${v(tnum, 'starts', 'start')} inside ${c}'s ${reach} range.`);
  } else if (r.chaserInRange != null) {
    lines.push(
      `${cn > 1 ? `The first of ${c}` : c} gets ${tn} into range (${reach}) after ${fmt(r.chaserInRange, 1)}s.`,
    );
  } else if (r.chaserDies != null) {
    lines.push(
      `${c} never ${v(cn, 'gets', 'get')} ${tn} into ${v(cn, 'its', 'their')} ${reach} range — ${v(cn, "it's", "they're")} destroyed first.`,
    );
  } else if (behaviour === 'flee' && ts >= cs) {
    lines.push(
      `${c} never ${v(cn, 'gets', 'get')} ${tn} into range: ${fmt(ts)} u/s against ${fmt(cs)} u/s, so the gap only ${ts > cs ? 'grows' : 'holds'}.`,
    );
  } else {
    lines.push(
      `${c} ${v(cn, "doesn't", "don't")} get ${tn} into range in ${fmt(r.samples[r.samples.length - 1].t, 0)}s.`,
    );
  }

  if (behaviour === 'flee' && ts > 0 && ts < cs && r.chaserInRange == null && r.chaserDies == null) {
    lines.push(
      `${v(cn, 'It', 'They')} only gain${v(cn, 's', '')} ${fmt(cs - ts, 2)} u/s on a runner at ${fmt(ts)} u/s.`,
    );
  }
  if (r.escaped != null) lines.push(`${tn} ${v(tnum, 'gets', 'get')} clear after ${fmt(r.escaped, 1)}s.`);

  const cHealth = chaser.health * cn;
  const tHealth = target.health * tnum;
  const combined = (n: number) => (n > 1 ? 'combined ' : '');
  if (r.targetArms.reach > 0) {
    if (behaviour === 'flee' && r.targetArms.dpsRetreating === 0) {
      lines.push(
        `${tn}'s guns only point forward, so ${v(tnum, 'it', 'they')} can't shoot back while running.`,
      );
    } else if (r.targetFireTime > 0) {
      lines.push(
        `${tn} ${v(tnum, 'is', 'are')} firing for ${fmt(r.targetFireTime, 1)}s — ${fmt(Math.round(r.damageToChaser))} damage, ${pct(r.damageToChaser, cHealth)} of ${c}'s ${combined(cn)}health.`,
      );
    } else {
      lines.push(
        `${tn} never ${v(tnum, 'gets', 'get')} a shot in: ${c} ${v(cn, 'stays', 'stay')} outside ${fmt(r.targetArms.reach)} range.`,
      );
    }
  }
  if (r.chaserFireTime > 0) {
    lines.push(
      `${c} ${v(cn, 'fires', 'fire')} for ${fmt(r.chaserFireTime, 1)}s — ${fmt(Math.round(r.damageToTarget))} damage, ${pct(r.damageToTarget, tHealth)} of ${tn}'s ${combined(tnum)}health.`,
    );
  }

  // Losses, for groups: how many fell and when the first went.
  const losses = (u: Unit, n: number, at: number[]) =>
    at.length
      ? `${nameOf(u)} lose ${at.length} of ${n}${at.length < n ? `, the first at ${fmt(at[0], 1)}s` : ''}`
      : `${nameOf(u)} lose none`;
  if (cn > 1 || tnum > 1) {
    lines.push(`${losses(chaser, cn, r.chaserLosses)}; ${losses(target, tnum, r.targetLosses)}.`);
  }
  const wiped = (name: string, n: number, at: number) =>
    n > 1 ? `The last of ${name} falls at ${fmt(at, 1)}s.` : `${name} is destroyed at ${fmt(at, 1)}s.`;
  if (r.targetDies != null) lines.push(wiped(tn, tnum, r.targetDies));
  if (r.chaserDies != null) lines.push(wiped(c, cn, r.chaserDies));

  return (
    <div className="chase-summary">
      <p>{lines.join(' ')}</p>
      <p className="hint">
        Straight line, open ground, everyone setting off from a standstill. Each unit shoots the nearest enemy
        in its reach and stops at its own range, as an attack order does; the ones behind keep coming until
        they can shoot too. Damage is DPS with every shot landing, less health regen; shields, turning and
        shell flight time are left out.
      </p>
    </div>
  );
}
