// Fetches the open lobbies from Steam's master server list. Server only: the
// Web API wants our key, which must never reach a browser — and Steam sends
// no CORS headers, so a browser couldn't ask it directly anyway.
//
// Served from /api/lobbies behind the CDN cache, so a page full of viewers
// costs one call here per cache window. The short in-memory copy covers a
// burst of cache misses landing on one warm instance.

import { toLobbies, type LobbyList, type SteamServer } from '../lib/lobbies';

// The Playtest today and the full game so nothing breaks at launch — the
// same pair src/server/steam.ts accepts tickets from.
const APP_IDS = [4511930, 1699050];
const UPSTREAM_TIMEOUT_MS = 6000;
const TTL_MS = 10_000;

let cached: { at: number; list: LobbyList } | null = null;

async function serversFor(appId: number, key: string): Promise<SteamServer[]> {
  const filter = encodeURIComponent(`\\appid\\${appId}`);
  const res = await fetch(
    `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${key}&limit=500&filter=${filter}`,
    { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`GetServerList ${appId}: ${res.status}`);
  const body = (await res.json()) as { response?: { servers?: SteamServer[] } };
  // An app with nobody hosting answers `{"response":{}}`.
  return body.response?.servers ?? [];
}

async function fetchLobbies(): Promise<LobbyList> {
  const fetchedAt = new Date().toISOString();
  const key = process.env.STEAM_API_KEY;
  if (!key) return { ok: false, lobbies: [], fetchedAt };
  const results = await Promise.allSettled(APP_IDS.map((appId) => serversFor(appId, key)));
  const servers = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  // Errors are deliberately not logged or passed on: the request URL carries
  // the key.
  return { ok: results.some((r) => r.status === 'fulfilled'), lobbies: toLobbies(servers), fetchedAt };
}

export async function listLobbies(): Promise<LobbyList> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.list;
  const list = await fetchLobbies();
  cached = { at: Date.now(), list };
  return list;
}
