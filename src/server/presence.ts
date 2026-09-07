// The mod_presence row: what a player's game is doing and when it last said
// so. Two writers during the transition to the local bridge
// (docs/local-bridge.md): the mod's own heartbeat, and the browser relaying
// what it sees on 127.0.0.1 inside the polls it already makes. Both land
// here so the SQL that reads presence (is_launchable and friends) needs no
// idea which one spoke.

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
