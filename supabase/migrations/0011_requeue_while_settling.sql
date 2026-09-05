-- Re-queueing while a result settles.
--
-- The old rule was "you can't queue while you're in a match", and it counted
-- 'reported' and 'disputed' as being in one. But a reported result waits 15
-- minutes for the loser to confirm, and a dispute waits on an admin — so a
-- player whose opponent alt-F4'd and went offline was locked out of the
-- ladder for the whole window, having done nothing wrong.
--
-- Only a game actually being played stops you queueing now. A result can
-- settle while you play the next one: apply_match_result reads ratings from
-- players at finalisation, so the intervening game just moves the baseline,
-- which is the same thing that happens when two of your matches finalise out
-- of order.
--
-- Mirrored in blockingMatchIdFor (src/server/queue-fns.ts) — change both
-- together. Otherwise identical to 0010's pass.

create or replace function pair_queue(p_mode text, map_pool text[])
returns setof uuid
language plpgsql
as $$
declare
  v_size      integer := case p_mode when '1v1' then 1 when '2v2' then 2 when '3v3' then 3 end;
  v_needed    integer := v_size * 2;
  anchor      record;
  cand        record;
  v_ids       uuid[];
  v_ratings   integer[];
  v_mask      integer;
  v_best_mask integer;
  v_best_gap  integer;
  v_bits      integer;
  v_sum1      integer;
  v_sum2      integer;
  i           integer;
  v_match_id  uuid;
  v_auto      boolean;
  v_auto_pool text[];
  v_map       text;
  v_path      text;
  v_factions  text[];
  v_slot1     integer;
  v_reason    text;
begin
  if v_size is null then
    raise exception 'unknown mode %', p_mode;
  end if;

  perform pg_advisory_xact_lock(hashtext('ladder_pairing'));

  -- Entries whose tab stopped polling are dead. The 5 s status poll is the
  -- heartbeat, but browsers throttle hidden tabs' timers to once a minute, so
  -- the tolerance is 90 s: wide enough for a backgrounded-but-alive tab,
  -- narrow enough that a closed one stops ghost-matching people quickly.
  delete from queue_entries where heartbeat_at < now() - interval '90 seconds';
  -- In a game right now. A result still settling ('reported', or 'disputed'
  -- and waiting on an admin) does not stop you queueing again.
  delete from queue_entries qe
  where exists (
    select 1 from match_participants mp
    join matches m on m.id = mp.match_id
    where mp.player_id = qe.player_id
      and m.status = 'in_progress'
  );

  -- Maps in this pool the mod can launch.
  select array_agg(lm.name) into v_auto_pool
  from ladder_maps lm
  where lm.mode = p_mode and lm.enabled and lm.path is not null and lm.name = any(map_pool);

  loop
    v_match_id := null;

    for anchor in select * from queue_entries where mode = p_mode order by joined_at loop
      v_ids := array[anchor.player_id];
      v_ratings := array[anchor.rating];

      for cand in
        select * from queue_entries e
        where e.mode = p_mode
          and e.player_id <> anchor.player_id
          and abs(e.rating - anchor.rating) <= least(queue_radius(anchor.joined_at), queue_radius(e.joined_at))
        order by e.joined_at
      loop
        exit when array_length(v_ids, 1) >= v_needed;
        v_ids := v_ids || cand.player_id;
        v_ratings := v_ratings || cand.rating;
      end loop;

      continue when array_length(v_ids, 1) < v_needed;

      -- Best split: masks with bit 0 set and exactly v_size bits.
      v_best_gap := null;
      for v_mask in 1 .. (1 << v_needed) - 1 loop
        continue when (v_mask & 1) = 0;
        v_bits := 0; v_sum1 := 0; v_sum2 := 0;
        for i in 0 .. v_needed - 1 loop
          if ((v_mask >> i) & 1) = 1 then
            v_bits := v_bits + 1;
            v_sum1 := v_sum1 + v_ratings[i + 1];
          else
            v_sum2 := v_sum2 + v_ratings[i + 1];
          end if;
        end loop;
        continue when v_bits <> v_size;
        if v_best_gap is null or abs(v_sum1 - v_sum2) < v_best_gap then
          v_best_gap := abs(v_sum1 - v_sum2);
          v_best_mask := v_mask;
        end if;
      end loop;

      -- Auto only for 1v1, only when both can be launched into a game right
      -- now, and only if there's a map the mod knows the path of.
      v_auto := p_mode = '1v1'
        and v_auto_pool is not null
        and is_launchable(v_ids[1]) and is_launchable(v_ids[2]);

      -- Why not, when someone was at least trying (a heartbeat in the last
      -- minute): the players' reasons, else the pool's.
      v_reason := null;
      if p_mode = '1v1' and not v_auto and exists (
        select 1 from mod_presence
        where player_id = any(v_ids) and seen_at > now() - interval '60 seconds'
      ) then
        select string_agg(r, '; ') into v_reason
        from (
          select not_launchable_reason(id) as r
          from unnest(v_ids) as id
        ) x where r is not null;
        if v_reason is null then
          v_reason := 'no map in the 1v1 pool has a path set';
        end if;
      end if;

      if v_auto then
        v_map := v_auto_pool[1 + floor(random() * array_length(v_auto_pool, 1))::integer];
        select lm.path into v_path from ladder_maps lm where lm.mode = p_mode and lm.name = v_map;
      else
        v_map := map_pool[1 + floor(random() * array_length(map_pool, 1))::integer];
        v_path := null;
      end if;

      insert into matches (status, mode, map_name, host_player_id,
                           mm_mode, mm_status, map_path, countdown_ends_at, mm_reason)
      values ('in_progress', p_mode, v_map,
              v_ids[1 + floor(random() * v_needed)::integer],
              case when v_auto then 'auto' else 'manual' end,
              case when v_auto then 'countdown' end,
              v_path,
              case when v_auto then now() + interval '10 seconds' end,
              v_reason)
      returning id into v_match_id;

      -- Slots shuffled independently of hosting, so the host doesn't get a
      -- fixed spawn.
      v_slot1 := 1 + floor(random() * 2)::integer;

      for i in 0 .. v_needed - 1 loop
        if v_auto then
          select factions into v_factions from queue_entries
          where player_id = v_ids[i + 1] and mode = p_mode;
          if v_factions is null or array_length(v_factions, 1) is null then
            v_factions := '{EDA,Chosen,Guard}';
          end if;
        end if;
        insert into match_participants (match_id, player_id, team, rating_before, faction, slot)
        values (v_match_id, v_ids[i + 1],
                case when ((v_best_mask >> i) & 1) = 1 then 1 else 2 end,
                v_ratings[i + 1],
                case when v_auto
                  then v_factions[1 + floor(random() * array_length(v_factions, 1))::integer] end,
                case when v_auto then (case when i = 0 then v_slot1 else 3 - v_slot1 end) end);
      end loop;

      -- Out of every queue, not just this mode's.
      delete from queue_entries where player_id = any(v_ids);

      return next v_match_id;
      exit; -- the queue changed; start the pass over
    end loop;

    exit when v_match_id is null;
  end loop;

  return;
end;
$$;
