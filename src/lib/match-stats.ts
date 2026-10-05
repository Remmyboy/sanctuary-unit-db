// End-of-match stats as LadderReporter uploads them (POST
// /api/mm/match/{id}/stats, format 1; collected by the MatchStats Lua hooks
// shared with SanctuaryHud), and the checks the server runs before storing
// them. Pure: the route and the match page both import it.
//
// The numbers are client-supplied and cosmetic. Validation is about shape
// and sanity (finite, non-negative, bounded sizes), not about proving them;
// two uploads that agree are the integrity signal (statsAgree).

export const STATS_FORMAT = 1;
export const STATS_MAX_BYTES = 256 * 1024;
const MAX_ARMIES = 8;
const MAX_SAMPLES = 2400; // 3 h 20 min at 5 s
const MAX_VALUE = 1e12;

export interface ResourceTotals {
  gathered: number;
  spent: number;
  wasted: number;
  stallTicks: number;
  peakIncome: number;
}

export interface StatsArmy {
  steamId: string;
  armyId: number;
  name: string;
  faction: number; // 1 EDA, 2 Chosen, 3 Guard, 0 unknown
  team: number;
  colour: string | null; // #rrggbb
  condition: number; // 0 undecided, 1 won, 2 lost
  conditionTick: number;
  alloy: ResourceTotals;
  energy: ResourceTotals;
  maxStorage: number;
  built: { land: number; air: number; naval: number; engineers: number; structures: number; value: number };
  lost: { mobile: number; structures: number; commander: number; value: number };
  killedValue: number;
  commanderKills: number;
  peakArmyValue: number;
  peakUnits: number;
  score: number;
}

export const SERIES_KEYS = [
  'alloyIncome',
  'energyIncome',
  'alloySpend',
  'energySpend',
  'armyValue',
  'units',
  'score',
] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];

export interface StatsTimeline {
  intervalS: number;
  t: number[]; // seconds from the start
  series: Record<string, Record<SeriesKey, number[]>>; // by steamId
}

export interface StatsUpload {
  format: number;
  modVersion: string | null;
  buildId: number | null;
  tickRate: number;
  endTick: number;
  armies: StatsArmy[];
  timeline: StatsTimeline;
}

// What the match page gets: the first upload, and whether a second one from
// the other side agreed with it.
export interface MatchStatsView extends Omit<StatsUpload, 'modVersion'> {
  durationS: number;
  uploads: number;
  confirmed: boolean;
}

class Invalid extends Error {}

const fail = (what: string): never => {
  throw new Invalid(what);
};

const obj = (v: unknown, what: string): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(what);

const num = (v: unknown, what: string): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_VALUE ? v : fail(what);

const int = (v: unknown, what: string): number => Math.round(num(v, what));

const resource = (v: unknown, what: string): ResourceTotals => {
  const r = obj(v, what);
  return {
    gathered: num(r.gathered, `${what}.gathered`),
    spent: num(r.spent, `${what}.spent`),
    wasted: num(r.wasted, `${what}.wasted`),
    stallTicks: int(r.stallTicks, `${what}.stallTicks`),
    peakIncome: num(r.peakIncome, `${what}.peakIncome`),
  };
};

function army(v: unknown, i: number, participants: ReadonlySet<string>): StatsArmy {
  const what = `armies[${i}]`;
  const a = obj(v, what);
  const steamId = typeof a.steamId === 'string' && participants.has(a.steamId) ? a.steamId : null;
  if (!steamId) fail(`${what}.steamId is not a player in this match`);
  const built = obj(a.built, `${what}.built`);
  const lost = obj(a.lost, `${what}.lost`);
  return {
    steamId: steamId!,
    armyId: int(a.armyId, `${what}.armyId`),
    name: typeof a.name === 'string' ? a.name.slice(0, 64) : '',
    faction: int(a.faction ?? 0, `${what}.faction`),
    team: int(a.team ?? 0, `${what}.team`),
    colour: typeof a.colour === 'string' && /^#[0-9a-f]{6}$/i.test(a.colour) ? a.colour.toLowerCase() : null,
    condition: int(a.condition ?? 0, `${what}.condition`),
    conditionTick: int(a.conditionTick ?? 0, `${what}.conditionTick`),
    alloy: resource(a.alloy, `${what}.alloy`),
    energy: resource(a.energy, `${what}.energy`),
    maxStorage: num(a.maxStorage ?? 0, `${what}.maxStorage`),
    built: {
      land: int(built.land, `${what}.built.land`),
      air: int(built.air, `${what}.built.air`),
      naval: int(built.naval, `${what}.built.naval`),
      engineers: int(built.engineers, `${what}.built.engineers`),
      structures: int(built.structures, `${what}.built.structures`),
      value: num(built.value, `${what}.built.value`),
    },
    lost: {
      mobile: int(lost.mobile, `${what}.lost.mobile`),
      structures: int(lost.structures, `${what}.lost.structures`),
      commander: int(lost.commander, `${what}.lost.commander`),
      value: num(lost.value, `${what}.lost.value`),
    },
    killedValue: num(a.killedValue, `${what}.killedValue`),
    commanderKills: num(a.commanderKills ?? 0, `${what}.commanderKills`),
    peakArmyValue: num(a.peakArmyValue, `${what}.peakArmyValue`),
    peakUnits: int(a.peakUnits, `${what}.peakUnits`),
    score: num(a.score, `${what}.score`),
  };
}

function timeline(v: unknown, steamIds: string[]): StatsTimeline {
  const tl = obj(v, 'timeline');
  const intervalS = int(tl.intervalS, 'timeline.intervalS');
  if (intervalS < 1 || intervalS > 60) fail('timeline.intervalS');
  if (!Array.isArray(tl.t) || tl.t.length > MAX_SAMPLES) fail('timeline.t');
  const t = (tl.t as unknown[]).map((x, i) => num(x, `timeline.t[${i}]`));
  const raw = obj(tl.series, 'timeline.series');
  const series: StatsTimeline['series'] = {};
  for (const id of steamIds) {
    if (raw[id] === undefined) continue; // a player with no samples is allowed
    const s = obj(raw[id], `timeline.series.${id}`);
    const out = {} as Record<SeriesKey, number[]>;
    for (const key of SERIES_KEYS) {
      const arr = s[key];
      if (!Array.isArray(arr) || arr.length !== t.length) fail(`timeline.series.${id}.${key} length`);
      out[key] = (arr as unknown[]).map((x, i) => num(x, `timeline.series.${id}.${key}[${i}]`));
    }
    series[id] = out;
  }
  return { intervalS, t, series };
}

// The upload as stored, or the reason it was refused. Unknown fields are
// dropped, so what is stored is exactly the documented shape.
export function parseStatsUpload(raw: unknown, participantSteamIds: string[]): StatsUpload | string {
  try {
    const d = obj(raw, 'body');
    if (d.format !== STATS_FORMAT) return `unsupported format ${String(d.format)}`;
    if (!Array.isArray(d.armies) || d.armies.length === 0 || d.armies.length > MAX_ARMIES) return 'armies';
    const participants = new Set(participantSteamIds);
    const armies = (d.armies as unknown[]).map((a, i) => army(a, i, participants));
    const ids = armies.map((a) => a.steamId);
    if (new Set(ids).size !== ids.length) return 'duplicate steamId in armies';
    const tickRate = int(d.tickRate, 'tickRate');
    if (tickRate < 1 || tickRate > 100) return 'tickRate';
    return {
      format: STATS_FORMAT,
      modVersion: typeof d.modVersion === 'string' ? d.modVersion.slice(0, 32) : null,
      buildId:
        d.buildId === undefined || d.buildId === null || d.buildId === 0 ? null : int(d.buildId, 'buildId'),
      tickRate,
      endTick: int(d.endTick, 'endTick'),
      armies,
      timeline: timeline(d.timeline, ids),
    };
  } catch (e) {
    if (e instanceof Invalid) return e.message;
    throw e;
  }
}

// Two uploads describe the same game when every player in both has the same
// result and a score within 1% (they are the same simulation; the margin
// only absorbs a pull taken a tick or two apart).
export function statsAgree(a: Pick<StatsUpload, 'armies'>, b: Pick<StatsUpload, 'armies'>): boolean {
  const byId = new Map(b.armies.map((x) => [x.steamId, x]));
  if (a.armies.length !== b.armies.length) return false;
  return a.armies.every((x) => {
    const y = byId.get(x.steamId);
    if (!y || x.condition !== y.condition) return false;
    const scale = Math.max(1, Math.abs(x.score), Math.abs(y.score));
    return Math.abs(x.score - y.score) / scale <= 0.01;
  });
}

// The game time the stats cover: until the last army's result, else the pull.
export function statsDurationS(s: Pick<StatsUpload, 'armies' | 'endTick' | 'tickRate'>): number {
  const decided = Math.max(0, ...s.armies.map((a) => a.conditionTick));
  return Math.round((decided > 0 ? decided : s.endTick) / s.tickRate);
}
