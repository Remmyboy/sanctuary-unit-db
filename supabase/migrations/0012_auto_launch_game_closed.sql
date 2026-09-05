-- Closing the game during an auto-launch.
--
-- The countdown gate was meant to catch exactly this and never could. The
-- mod heartbeats every 5 s, a heartbeat counts as live for 15 s, and the
-- countdown is 10 s — so a game closed the moment the match formed still had
-- a heartbeat 10-15 s old when the gate ran, which reads as launchable. The
-- match went to `launch`, launched into nothing, and was cancelled 20 s later
-- as "could not create a lobby". Nobody had done anything wrong and the pair
-- lost the match.
--
-- Two changes, both towards the same end: a game that isn't there means
-- manual hosting, not a cancelled match.
--
-- 1. The gate now asks for a heartbeat since the match was made, rather than
--    one under 15 s old. Ten seconds of countdown is one to two heartbeats,
--    so a game that is still running has always checked in; a closed one
--    never has. It also costs nothing when the sweep runs late.
--
-- 2. A launch that times out with a mod gone quiet falls back to manual
--    instead of cancelling. The timeouts still cancel when both mods are
--    there and the launch itself broke — that is a real failure, and the
--    players are better off requeueing.

-- The gate at the end of the countdown. Deliberately stricter than
-- not_launchable_reason, which is the pairing-time question ("could this
-- pair be auto?") and rightly tolerates a missed heartbeat.
create or replace function not_startable_reason(p_player uuid, p_since timestamptz)
returns text
language sql
stable
as $$
  select case
    when pr.player_id is null or pr.seen_at <= p_since
      then player_label(p_player) || ' closed the game'
    when pr.state = 'lobby' then player_label(p_player) || ' is in a lobby'
    when pr.state = 'loading' then player_label(p_player) || ' is loading a game'
    when pr.state = 'ingame' then player_label(p_player) || ' is in a game'
    else null
  end
  from (select p_player as id) x
  left join mod_presence pr on pr.player_id = x.id;
$$;

-- How a launch that ran out of time ends. A mod that has stopped
-- heartbeating means someone closed their game: nothing is broken, no game
-- has been played, and the pair still have a match they can host by hand —
-- so it drops to manual rather than being cancelled out from under them.
-- Anything else is a launch that genuinely failed and cancels as before.
--
-- Only reached from the timeout branches below, all of which already require
-- that the game never got going.
create or replace function mm_launch_timeout(p_match_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_gone text;
begin
  select string_agg(player_label(mp.player_id) || ' closed the game', '; ' order by mp.team)
    into v_gone
  from match_participants mp
  where mp.match_id = p_match_id
    and not exists (
      select 1 from mod_presence pr
      where pr.player_id = mp.player_id and pr.seen_at > now() - interval '15 seconds'
    );

  if v_gone is null then
    perform mm_fail(p_match_id, p_reason);
  else
    perform mm_fallback_manual(p_match_id, v_gone || ', so host manually');
  end if;
end;
$$;

-- Same sweep as 0009's, with the gate and the timeout endings above.
create or replace function sweep_mm_matches()
returns integer
language plpgsql
as $$
declare
  m        record;
  v_joiner uuid;
  v_reason text;
  n        integer := 0;
begin
  -- Countdown reached zero.
  for m in
    select id, host_player_id, created_at from matches
    where mm_mode = 'auto' and mm_status = 'countdown' and status = 'in_progress'
      and countdown_ends_at <= now()
    for update skip locked
  loop
    select string_agg(r, '; ') into v_reason
    from (
      select not_startable_reason(mp.player_id, m.created_at) as r
      from match_participants mp where mp.match_id = m.id order by mp.team
    ) x where r is not null;

    if v_reason is null then
      update matches set mm_status = 'launch', launched_at = now() where id = m.id;
    else
      perform mm_fallback_manual(m.id, v_reason || ', so host manually');
    end if;
    n := n + 1;
  end loop;

  -- After launch.
  for m in
    select id, host_player_id, launched_at, session_id, session_at from matches
    where mm_mode = 'auto' and mm_status = 'launch' and status = 'in_progress'
    for update skip locked
  loop
    select mp.player_id into v_joiner from match_participants mp
    where mp.match_id = m.id and mp.player_id <> m.host_player_id limit 1;

    if m.session_id is null and m.launched_at < now() - interval '20 seconds' then
      perform mm_launch_timeout(m.id, player_label(m.host_player_id) || '''s game could not create a lobby');
      n := n + 1;
    elsif m.session_id is not null
      and m.session_at < now() - interval '30 seconds'
      and not exists (select 1 from mm_events e where e.match_id = m.id and e.type = 'joined') then
      perform mm_launch_timeout(m.id, player_label(v_joiner) || ' didn''t join the lobby');
      n := n + 1;
    elsif m.launched_at < now() - interval '60 seconds'
      and (select count(distinct player_id) from mm_events e where e.match_id = m.id and e.type = 'started') < 2 then
      perform mm_launch_timeout(m.id, 'The game didn''t start');
      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;
