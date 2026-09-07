-- LadderReporter 0.3: the mod can leave a lobby or close a replay by itself
-- before launching, so neither is a reason to host manually any more. Two
-- things follow.
--
-- 1. A fifth presence state, `replay`. Until now a replay reported as
--    `ingame`; the mod now says which it is, because a replay can be closed
--    for the match and a game cannot.
-- 2. Launchable means seen recently in the menu, a lobby or a replay. Only
--    `loading` and `ingame` still mean "not now" — at pairing time and at
--    the end of the countdown alike.
--
-- Additive and safe to apply before the site deploys: the old code only
-- ever writes the four old states, and the widened rule only makes more
-- pairs eligible for auto-launch, which the mod handles. The site must not
-- accept `replay` from the page before this has run, or the presence write
-- fails the check constraint.

alter table mod_presence drop constraint mod_presence_state_check;
alter table mod_presence add constraint mod_presence_state_check
  check (state in ('menu', 'lobby', 'loading', 'ingame', 'replay'));

create or replace function is_launchable(p_player uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from mod_presence
    where player_id = p_player
      and state in ('menu', 'lobby', 'replay')
      and seen_at > now() - interval '15 seconds'
  );
$$;

-- Pairing time: why this player can't be auto-launched right now.
create or replace function not_launchable_reason(p_player uuid)
returns text
language sql
stable
as $$
  select case
    when pr.player_id is null
      then player_label(p_player) || ' isn''t running the mod'
    when pr.seen_at <= now() - interval '15 seconds'
      then player_label(p_player) || '''s last heartbeat was '
           || extract(epoch from now() - pr.seen_at)::integer || ' s old'
    when pr.state = 'loading' then player_label(p_player) || ' is loading a game'
    when pr.state = 'ingame' then player_label(p_player) || ' is in a game'
    else null
  end
  from (select p_player as id) x
  left join mod_presence pr on pr.player_id = x.id;
$$;

-- Countdown zero: the same question, but the game must have checked in
-- since the match was made (see 0012).
create or replace function not_startable_reason(p_player uuid, p_since timestamptz)
returns text
language sql
stable
as $$
  select case
    when pr.player_id is null or pr.seen_at <= p_since
      then player_label(p_player) || ' closed the game'
    when pr.state = 'loading' then player_label(p_player) || ' is loading a game'
    when pr.state = 'ingame' then player_label(p_player) || ' is in a game'
    else null
  end
  from (select p_player as id) x
  left join mod_presence pr on pr.player_id = x.id;
$$;
