// Open custom-game lobbies, as Steam's server list has them.
//
// Sanctuary's lobbies are not Steam matchmaking lobbies: the host runs a
// listen game server (GameServer.InitEx + a relay "FakeIP") and advertises it
// to Steam's master server, and the game's own lobby browser is
// SteamMatchmakingServers.RequestInternetServerList. That makes the list
// readable from Steam's Web API (IGameServersService/GetServerList) with our
// key — no mod on anybody's PC. See src/server/lobbies.ts for the fetch.
//
// Everything here mirrors the game's EM.Network.SteamLobbyBackend
// (RefreshAdvertisement writes the fields, TryParseServerEntry reads them):
//
//   name      the lobby name
//   map       the map's file name without extension, cut to 31 bytes
//   gametype  "sid:<session>;v:<version>#<lua hash>;p:<n>/<max>;hn:<host>"
//
// The player count comes from the `p:` tag, as the game's browser takes it:
// Steam's own `players` field counts authenticated clients and disagreed with
// the lobby when checked (1 against 4/8). A host stops advertising the moment
// its game starts, so everything listed is still in its lobby.

export interface Lobby {
  // The session id the game joins by (the `sid` tag): the host's game-server
  // SteamID, an anonymous account — not the host's own profile.
  id: string;
  appId: number;
  name: string;
  host: string; // the host's Steam name as the game cut it (31 bytes)
  map: string; // as advertised: file name, possibly cut short with "..."
  players: number;
  maxPlayers: number;
  version: string; // game version + "#" + Lua checksum, as the game compares them
  dedicated: boolean;
}

export interface LobbyList {
  // False when Steam couldn't be asked at all, so an empty list means "don't
  // know" rather than "nobody is hosting".
  ok: boolean;
  lobbies: Lobby[];
  fetchedAt: string;
}

// One row of IGameServersService/GetServerList, as far as we read it.
export interface SteamServer {
  steamid?: string;
  appid?: number;
  name?: string;
  map?: string;
  players?: number;
  max_players?: number;
  dedicated?: boolean;
  gametype?: string;
}

// The `key:value;key:value` tags. The game strips ';' and ':' from the host
// name before writing it, so splitting on the first ':' is safe.
export function parseTags(gametype: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of gametype.split(';')) {
    const at = part.indexOf(':');
    if (at > 0) tags[part.slice(0, at)] = part.slice(at + 1);
  }
  return tags;
}

const count = (s: string | undefined): number | null => {
  const n = Number(s);
  return s !== undefined && s !== '' && Number.isInteger(n) && n >= 0 ? n : null;
};

// Null for a row that isn't a lobby we could join: no usable session id.
export function toLobby(server: SteamServer): Lobby | null {
  const tags = parseTags(server.gametype ?? '');
  const id = /^\d{1,20}$/.test(tags.sid ?? '') ? tags.sid : null;
  if (!id || id === '0') return null;
  const [n, max] = (tags.p ?? '').split('/');
  const maxPlayers = count(max) ?? server.max_players ?? 0;
  return {
    id,
    appId: server.appid ?? 0,
    name: server.name?.trim() || 'Unnamed lobby',
    host: tags.hn?.trim() ?? '',
    map: server.map ?? '',
    players: Math.min(count(n) ?? server.players ?? 0, maxPlayers || Infinity),
    maxPlayers,
    version: tags.v ?? '',
    dedicated: server.dedicated === true,
  };
}

export const isFull = (l: Lobby): boolean => l.maxPlayers > 0 && l.players >= l.maxPlayers;

// Joinable first, and among those the fullest — they're the ones about to
// start. Then by name, so the order holds still between refreshes.
export function sortLobbies(lobbies: Lobby[]): Lobby[] {
  return [...lobbies].sort(
    (a, b) =>
      Number(isFull(a)) - Number(isFull(b)) ||
      b.players - a.players ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

// Every row Steam returned, as lobbies. One host can show up twice for a
// moment after re-hosting; the session id is the lobby, so keep one.
export function toLobbies(servers: SteamServer[]): Lobby[] {
  const byId = new Map<string, Lobby>();
  for (const server of servers) {
    const lobby = toLobby(server);
    if (lobby) byId.set(lobby.id, lobby);
  }
  return sortLobbies([...byId.values()]);
}

// The game's lobby list shows a hand-made map's file name with its
// underscores as spaces ("Daroza_s_Sanctuary" -> "Daroza s Sanctuary"); the
// generated ones ("~FFA-12P_Tropical_2048_80433") are shown as they are.
export const mapLabel = (map: string): string => (map.startsWith('~') ? map : map.replace(/_/g, ' '));

// The game reads SteamApps.GetLaunchCommandLine at start-up and again on
// NewUrlLaunchParameters_t (when it's already running), parses it as a
// session id and joins it — the same path a Steam "Join game" takes. So this
// link starts the game if needed and drops you into the lobby.
export const joinHref = (l: Lobby): string => `steam://run/${l.appId}//${l.id}/`;

// The list as the browser sees it: the CDN-cached /api/lobbies, never Steam
// directly. Null when that endpoint can't be reached at all.
export async function loadLobbies(): Promise<LobbyList | null> {
  try {
    const res = await fetch('/api/lobbies');
    if (!res.ok) return null;
    return (await res.json()) as LobbyList;
  } catch {
    return null;
  }
}
