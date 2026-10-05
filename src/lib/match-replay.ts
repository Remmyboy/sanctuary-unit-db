// Replay uploads (POST /api/mm/match/{id}/replay): the slot request
// LadderReporter sends before PUTting the game's .sanreplay to R2, and the
// names it is stored and downloaded under. Pure, so it is unit tested.

export const REPLAY_MAX_BYTES = 30 * 1024 * 1024; // worst seen ~15 MB
export const SIDECAR_MAX_BYTES = 256 * 1024;
export const UPLOAD_URL_TTL_S = 2 * 60 * 60;
export const DOWNLOAD_URL_TTL_S = 5 * 60;
export const PENDING_TAKEOVER_MIN = 15;

export interface ReplaySlotRequest {
  sizeBytes: number;
  sha256: string;
  gameVersion: string;
  buildId: number | null;
  mapPath: string;
  fileName: string;
  sidecarBytes: number;
}

export type ReplayStatus = 'pending' | 'ready' | 'expired';

export interface MatchReplayView {
  status: ReplayStatus;
  sizeBytes: number;
  buildId: number | null;
  fileName: string;
  uploading: boolean; // pending and still young enough to land
}

const posInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;

// The game names recordings `{start yyyy-MM-dd_HH-mm-ss}_{map}.sanreplay`,
// maps can carry `~`, spaces and brackets. Anything outside a safe set is
// replaced, so the name is fine in a Content-Disposition header and on disk.
export function safeReplayName(name: string): string {
  const base = name
    .replace(/\.sanreplay$/i, '')
    .replace(/[^A-Za-z0-9_.~() -]/g, '_')
    .slice(0, 100);
  return `${base || 'match'}.sanreplay`;
}

export function parseReplaySlot(raw: unknown): ReplaySlotRequest | string {
  const d = raw as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return 'body';
  if (!posInt(d.sizeBytes)) return 'sizeBytes';
  if (typeof d.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(d.sha256)) return 'sha256';
  if (typeof d.gameVersion !== 'string' || d.gameVersion.length === 0 || d.gameVersion.length > 100) {
    return 'gameVersion';
  }
  if (typeof d.mapPath !== 'string' || !/\.sanmap$/i.test(d.mapPath) || d.mapPath.length > 260)
    return 'mapPath';
  if (typeof d.fileName !== 'string' || d.fileName.length === 0) return 'fileName';
  const sidecarBytes = d.sidecarBytes === undefined ? 0 : d.sidecarBytes;
  if (sidecarBytes !== 0 && !posInt(sidecarBytes)) return 'sidecarBytes';
  const buildId = d.buildId === undefined || d.buildId === null || d.buildId === 0 ? null : d.buildId;
  if (buildId !== null && !posInt(buildId)) return 'buildId';
  return {
    sizeBytes: d.sizeBytes as number,
    sha256: d.sha256.toLowerCase(),
    gameVersion: d.gameVersion,
    buildId: buildId as number | null,
    mapPath: d.mapPath,
    fileName: safeReplayName(d.fileName),
    sidecarBytes: sidecarBytes as number,
  };
}

// Keys group by upload month so the bucket stays browsable by hand.
export function replayKeys(matchId: string, at: Date): { object: string; sidecar: string } {
  const prefix = `replays/${at.getUTCFullYear()}/${String(at.getUTCMonth() + 1).padStart(2, '0')}/${matchId}`;
  return { object: `${prefix}.sanreplay`, sidecar: `${prefix}.sanreplay.mods.json` };
}

// The map a replay header names, as the file stem the ladder pools use:
// "Maps/The_Forge/The_Forge.sanmap" → "the_forge".
export const mapStem = (path: string) =>
  (path.split(/[\\/]/).pop() ?? '').replace(/\.sanmap$/i, '').toLowerCase();

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// When a game was played, in the reader's own time zone.
export const formatPlayed = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
