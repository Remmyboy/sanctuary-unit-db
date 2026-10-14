// Steam sends the player back here after sign-in. Verify the assertion with
// Steam itself, upsert the player row (never touching rating/stats — upsert
// only writes the columns given), set the session cookies and land back on
// the page the player signed in from (the cookie the login route set), or
// the ladder if that's not a same-site path. No cookie at all is refused.

import { createFileRoute } from '@tanstack/react-router';
import { siteUrl, sql } from '../server/db';
import { clearReturnToCookie, readReturnToCookie, sessionCookies } from '../server/session';
import { fetchPersona, verifySteamCallback } from '../server/steam';
import { safeReturnTo } from '../lib/return-to';

export const Route = createFileRoute('/api/auth/steam/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // The login route sets this cookie, so its absence means this browser
        // didn't start a sign-in here in the last ten minutes — most likely a
        // callback link someone else minted to sign the visitor in as them.
        const returnTo = readReturnToCookie(request);
        if (returnTo === null) {
          return new Response('Sign-in expired or did not start on this site. Please sign in again.', {
            status: 403,
          });
        }

        const steamId = await verifySteamCallback(new URL(request.url));
        if (!steamId) return new Response('Steam sign-in failed.', { status: 403 });

        const persona = await fetchPersona(steamId);
        const [player] = await sql()<{ id: string; banned_at: Date | null }[]>`
          insert into players (steam_id, persona_name, avatar_url)
          values (${steamId}, ${persona.personaName}, ${persona.avatarUrl})
          on conflict (steam_id) do update set
            persona_name = excluded.persona_name,
            avatar_url = excluded.avatar_url,
            last_seen_at = now()
          returning id, banned_at`;
        if (!player) return new Response('Sign-in failed.', { status: 500 });
        if (player.banned_at) return new Response('This account is banned from the ladder.', { status: 403 });

        const headers = new Headers({
          Location: `${siteUrl()}${safeReturnTo(returnTo)}`,
        });
        for (const cookie of await sessionCookies({ playerId: player.id, steamId })) {
          headers.append('Set-Cookie', cookie);
        }
        headers.append('Set-Cookie', clearReturnToCookie());
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
