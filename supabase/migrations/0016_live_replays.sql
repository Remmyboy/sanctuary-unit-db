-- Live replays (docs/live-replays.md): a player who opted in streams the
-- game's own recording while they play, in chunks of whole network frames,
-- and anyone can watch it in game a fixed delay behind.
--
-- The bytes live in R2 (live/<stream id>/<seq>.bin); these rows say which
-- chunks exist and when each arrived. A chunk is only handed out once it is
-- older than the delay, server side, so the delay holds whatever a client
-- does. Streams are short-lived: a day after they end, the lazy prune
-- deletes the objects and the rows.

create table live_streams (
  id            uuid primary key default gen_random_uuid(),
  uploader_id   uuid not null references players(id) on delete cascade,
  map_path      text not null,
  game_version  text not null,        -- the recording header's "1.0#<luaHash>"
  build_id      bigint,
  file_name     text not null,        -- the game's own name for the recording
  players       jsonb not null,       -- [{ name, team, kind }] from the lobby
  sidecar       jsonb,                -- the recording's .mods.json, for a modded game
  status        text not null default 'live' check (status in ('live', 'ended')),
  chunks        integer not null default 0,
  bytes         bigint not null default 0,
  started_at    timestamptz not null default now(),
  last_chunk_at timestamptz not null default now(),
  ended_at      timestamptz
);

create index live_streams_by_status on live_streams (status, last_chunk_at desc);
create index live_streams_by_uploader on live_streams (uploader_id, status);

alter table live_streams enable row level security;

create table live_chunks (
  stream_id   uuid not null references live_streams(id) on delete cascade,
  seq         integer not null,
  size_bytes  integer not null,
  created_at  timestamptz not null default now(),
  primary key (stream_id, seq)
);

alter table live_chunks enable row level security;

insert into site_jobs (name) values ('live_prune') on conflict do nothing;
