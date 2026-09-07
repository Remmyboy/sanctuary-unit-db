// Session → player resolution, shared by the server functions. Kept out of
// the *-fns modules on purpose: those are imported by client code (for the
// RPC stubs), so everything they re-export must be client-safe — this module
// touches the session cookie and the database and must never leave the server.

import { sql } from './db';
import { readSession } from './session';
import type { Me } from '../lib/ladder-types';

interface PlayerRow {
  id: string;
  steam_id: string;
  persona_name: string;
  avatar_url: string | null;
  is_admin: boolean;
  banned_at: Date | null;
  open_match_id: string | null;
}

// One round trip: this runs at the top of every server function, so the
// open-match lookup rides along as a subselect rather than a second query.
export async function loadSessionPlayer(): Promise<Me | null> {
  const session = await readSession();
  if (!session) return null;
  const rows = await sql()<PlayerRow[]>`
    select p.id, p.steam_id, coalesce(p.display_name, p.persona_name) as persona_name,
           p.avatar_url, p.is_admin, p.banned_at,
           (select mp.match_id
            from match_participants mp join matches m on m.id = mp.match_id
            where mp.player_id = p.id and m.status in ('in_progress', 'reported', 'disputed')
            limit 1) as open_match_id
    from players p where p.id = ${session.playerId}`;
  const player = rows[0];
  if (!player || player.banned_at) return null;
  return {
    playerId: player.id,
    steamId: player.steam_id,
    personaName: player.persona_name,
    avatarUrl: player.avatar_url,
    isAdmin: player.is_admin,
    openMatchId: player.open_match_id,
  };
}

// Inside mutating handlers: resolves the signed-in, unbanned player or throws.
export async function requirePlayer(): Promise<Me> {
  const player = await loadSessionPlayer();
  if (!player) throw new Error('Not signed in');
  return player;
}

export async function requireAdmin(): Promise<Me> {
  const me = await requirePlayer();
  if (!me.isAdmin) throw new Error('Admins only');
  return me;
}
