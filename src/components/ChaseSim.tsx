import { useEffect, useMemo, useRef, useState } from 'react';
import type { Unit } from '../lib/types';
import type { LoadedData } from '../lib/data';
import { fmt, shortName } from '../lib/format';
import { STEP, armament, defaultGap, simulateChase, type Behaviour, type ChaseResult } from '../lib/chase';
import { FACTION_COLOURS, iconUrl } from './UnitIcon';

// Two of the compared units on open ground, one chasing the other, with their
// weapon ranges drawn round them. The animation plays back the very samples
// the summary underneath is worked out from, so what you watch and what you
// read can't disagree.

const BEHAVIOURS: Array<[Behaviour, string]> = [
  ['flee', 'Runs away'],
  ['hold', 'Holds ground'],
  ['advance', 'Walks in'],
];
const RATES = [1, 2, 4, 8];

const nameOf = (u: Unit) => u.name ?? shortName(u);
const mobile = (u: Unit) => Boolean(u.movement?.speed);

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
  const fallback = useMemo(() => defaults(units), [units]);
  const [picked, setPicked] = useState<[string, string] | null>(null);
  const [behaviour, setBehaviour] = useState<Behaviour>('flee');
  const [gapOverride, setGapOverride] = useState<number | null>(null);

  // Picks survive only while both units are still being compared.
  const ids = picked && picked.every((id) => units.some((u) => u.id === id)) ? picked : fallback;
  const chaser = ids && loaded.byId.get(ids[0]);
  const target = ids && loaded.byId.get(ids[1]);

  if (!chaser || !target || !mobile(chaser)) return null;

  const behave: Behaviour = mobile(target) ? behaviour : 'hold';
  const gap = gapOverride ?? defaultGap(chaser, target, behave);
  const choose = (next: [string, string]) => {
    setPicked(next);
    setGapOverride(null);
  };

  const cArms = armament(chaser, target);
  const tArms = armament(target, chaser);
  const gapMax = Math.max(Math.ceil(Math.max(cArms.reach, tArms.reach, 20) * 2.5), gap);

  return (
    <section className="chase" aria-labelledby="chase-title">
      <h2 id="chase-title">Chase</h2>
      <p className="chase-lede">
        Set two of these loose on open ground and watch who gets in range first. Rings are weapon ranges
        against each other.
      </p>

      <div className="chase-controls">
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
        <button
          type="button"
          className="chase-swap"
          title="Swap who chases whom"
          aria-label="Swap chaser and target"
          disabled={!mobile(target)}
          onClick={() => choose([target.id, chaser.id])}
        >
          ⇄
        </button>
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
        key={`${chaser.id}-${target.id}-${behave}-${gap}`}
        result={simulateChase({ chaser, target, behaviour: behave, gap })}
        chaser={chaser}
        target={target}
        behaviour={behave}
        loaded={loaded}
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
}: {
  result: ChaseResult;
  chaser: Unit;
  target: Unit;
  behaviour: Behaviour;
  loaded: LoadedData;
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
      <Stage result={result} sample={sample} chaser={chaser} target={target} loaded={loaded} />

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

      <Summary result={result} chaser={chaser} target={target} behaviour={behaviour} />
    </>
  );
}

// A nice round grid spacing for the visible width, so the ground reads as a
// ruler: 5, 10, 20, 50 or 100 units per line.
const gridStep = (width: number) => [5, 10, 20, 50, 100].find((s) => width / s <= 16) ?? 200;

const W = 800;
const H = 230;
const LANE = H / 2;

function Stage({
  result,
  sample,
  chaser,
  target,
  loaded,
}: {
  result: ChaseResult;
  sample: ChaseResult['samples'][number];
  chaser: Unit;
  target: Unit;
  loaded: LoadedData;
}) {
  const { chaserArms: ca, targetArms: ta } = result;
  // One zoom for the whole run, wide enough for the start and both rings;
  // the camera then follows the pair, so the ground slides past underneath.
  const span = useMemo(
    () => Math.max(ca.reach, ta.reach, result.samples[0].gap, 12) * 2.6,
    [ca.reach, ta.reach, result.samples],
  );
  const scale = W / span;
  const centre = (sample.chaserX + sample.targetX) / 2;
  const sx = (x: number) => W / 2 + (x - centre) * scale;
  const step = gridStep(span);
  const first = Math.floor((centre - span / 2) / step) * step;
  const lines = Array.from({ length: Math.ceil(span / step) + 2 }, (_, i) => first + i * step);
  const flicker = Math.round(sample.t / STEP) % 4 < 2;

  const actor = (u: Unit, x: number, hp: number, reach: number, firing: boolean, other: number) => {
    const colour = FACTION_COLOURS[u.faction];
    const cx = sx(x);
    const dead = hp <= 0;
    const src = iconUrl(u.icon, u.faction, loaded.iconManifest);
    return (
      <g opacity={dead ? 0.35 : 1}>
        {reach > 0 && (
          <circle
            cx={cx}
            cy={LANE}
            r={reach * scale}
            fill={colour}
            fillOpacity={0.06}
            stroke={colour}
            strokeOpacity={0.7}
            strokeDasharray="6 5"
          />
        )}
        {firing && flicker && (
          <line
            x1={cx}
            y1={LANE}
            x2={sx(other)}
            y2={LANE}
            stroke={colour}
            strokeWidth={2}
            strokeOpacity={0.9}
          />
        )}
        <circle cx={cx} cy={LANE} r={13} fill="var(--bg)" stroke={colour} strokeWidth={2} />
        {src ? (
          <image href={src} x={cx - 11} y={LANE - 11} width={22} height={22} />
        ) : (
          <circle cx={cx} cy={LANE} r={6} fill={colour} />
        )}
        <text x={cx} y={LANE - 22} textAnchor="middle" className="chase-label">
          {nameOf(u)}
          {dead ? ' ✕' : ''}
        </text>
        <rect x={cx - 22} y={LANE + 19} width={44} height={4} rx={2} fill="var(--border-strong)" />
        <rect
          x={cx - 22}
          y={LANE + 19}
          width={44 * Math.max(0, hp / u.health)}
          height={4}
          rx={2}
          fill={hp / u.health > 0.35 ? 'var(--good)' : 'var(--bad)'}
        />
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
        {actor(target, sample.targetX, sample.targetHp, ta.reach, sample.targetFiring, sample.chaserX)}
        {actor(chaser, sample.chaserX, sample.chaserHp, ca.reach, sample.chaserFiring, sample.targetX)}
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
}: {
  result: ChaseResult;
  chaser: Unit;
  target: Unit;
  behaviour: Behaviour;
}) {
  const c = nameOf(chaser);
  const tn = nameOf(target);
  const lines: string[] = [];
  const cs = chaser.movement!.speed;
  const ts = target.movement?.speed ?? 0;

  if (r.chaserArms.reach === 0) {
    lines.push(
      `${c} has nothing that can hit ${tn} — ${target.domain === 'Air' ? 'no anti-air' : 'no weapon for that layer'}.`,
    );
  } else if (r.chaserInRange === 0) {
    lines.push(`${tn} starts inside ${c}'s ${fmt(r.chaserArms.reach)} range.`);
  } else if (r.chaserInRange != null) {
    lines.push(
      `${c} gets ${tn} into its ${fmt(r.chaserArms.reach)} range after ${fmt(r.chaserInRange, 1)}s.`,
    );
  } else if (r.chaserDies != null) {
    lines.push(`${c} never gets ${tn} into its ${fmt(r.chaserArms.reach)} range — it's destroyed first.`);
  } else if (behaviour === 'flee' && ts >= cs) {
    lines.push(
      `${c} never gets ${tn} into range: ${fmt(ts)} u/s against ${fmt(cs)} u/s, so the gap only ${ts > cs ? 'grows' : 'holds'}.`,
    );
  } else {
    lines.push(`${c} doesn't get ${tn} into range in ${fmt(r.samples[r.samples.length - 1].t, 0)}s.`);
  }

  if (behaviour === 'flee' && ts > 0 && ts < cs && r.chaserInRange == null && r.chaserDies == null) {
    lines.push(`It only gains ${fmt(cs - ts, 2)} u/s on a runner at ${fmt(ts)} u/s.`);
  }
  if (r.escaped != null) lines.push(`${tn} gets clear of it after ${fmt(r.escaped, 1)}s.`);

  if (r.targetArms.reach > 0) {
    if (behaviour === 'flee' && r.targetArms.dpsRetreating === 0) {
      lines.push(`${tn}'s guns only point forward, so it can't shoot back while running.`);
    } else if (r.targetFireTime > 0) {
      lines.push(
        `${tn} is firing for ${fmt(r.targetFireTime, 1)}s — ${fmt(Math.round(r.damageToChaser))} damage, ${pct(r.damageToChaser, chaser.health)} of ${c}'s health.`,
      );
    } else {
      lines.push(`${tn} never gets a shot in: ${c} stays outside its ${fmt(r.targetArms.reach)} range.`);
    }
  }
  if (r.chaserFireTime > 0) {
    lines.push(
      `${c} fires for ${fmt(r.chaserFireTime, 1)}s — ${fmt(Math.round(r.damageToTarget))} damage, ${pct(r.damageToTarget, target.health)} of ${tn}'s health.`,
    );
  }
  if (r.targetDies != null) lines.push(`${tn} is destroyed at ${fmt(r.targetDies, 1)}s.`);
  if (r.chaserDies != null) lines.push(`${c} is destroyed at ${fmt(r.chaserDies, 1)}s.`);

  return (
    <div className="chase-summary">
      <p>{lines.join(' ')}</p>
      <p className="hint">
        Straight line, open ground, both setting off from a standstill. The chaser stops at its own range, as
        an attack order does. Damage is DPS with every shot landing, less health regen; shields, turning and
        shell flight time are left out.
      </p>
    </div>
  );
}
