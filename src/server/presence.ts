// The mod_presence row: what a player's game is doing and when it last said
// so, as the browser relays it from the local mod on 127.0.0.1 inside the
// polls it already makes (docs/local-bridge.md). The queue and match-room
// polls both land here, so the SQL that reads presence (is_launchable and
// friends) has one row per player.

import { sql } from './db';
import type { ModSignal } from '../lib/mm';

export async function recordPresence(playerId: string, mod: ModSignal): Promise<void> {
  await sql()`
    insert into mod_presence (player_id, state, game_version, mod_version, seen_at)
    values (${playerId}, ${mod.state}, ${mod.gameVersion}, ${mod.modVersion}, now())
    on conflict (player_id) do update set
      state = excluded.state, game_version = excluded.game_version,
      mod_version = excluded.mod_version, seen_at = now()`;
}
