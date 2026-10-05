-- What LadderReporter uploads after a ranked game, when the player opted in
-- (docs/replays-and-stats-plan.md): the end-of-match stats, and the game's
-- own .sanreplay recording, stored in Cloudflare R2.
--
-- Both are cosmetic and client-supplied: neither touches ratings. Rows go
-- with their match (on delete cascade), so admin_delete_match keeps working;
-- the R2 objects are deleted by the server before it calls that function.

-- One row per uploader: both clients ran the same lockstep simulation, so
-- two rows that agree mark the stats as confirmed by both players.
create table match_stats (
  match_id    uuid not null references matches(id) on delete cascade,
  uploader_id uuid not null references players(id),
  format      smallint not null,
  mod_version text,
  build_id    bigint,               -- Steam build id the game was played on
  tick_rate   smallint not null,
  end_tick    integer not null,     -- when the stats were read (the result screen)
  armies      jsonb not null,       -- per-player totals (src/lib/match-stats.ts)
  timeline    jsonb,                -- downsampled series, keyed by steamId; only the
                                    -- first upload keeps it (the page shows that one)
  created_at  timestamptz not null default now(),
  primary key (match_id, uploader_id)
);

alter table match_stats enable row level security;

-- One replay per match: the first uploader reserves the row ('pending') and
-- PUTs straight to R2 with a presigned URL; /replay/done checks the object
-- and marks it 'ready'. A pending row left behind by a failed upload can be
-- taken over by the other player after 15 minutes. 'expired' rows had their
-- object pruned (old game build), so the page can say why it's gone.
create table match_replays (
  match_id     uuid primary key references matches(id) on delete cascade,
  uploader_id  uuid not null references players(id),
  object_key   text not null,
  sidecar_key  text,                -- <replay>.mods.json for modded games
  file_name    text not null,       -- the game's own name, used for downloads
  size_bytes   integer not null,
  sidecar_bytes integer not null default 0,
  sha256       text not null,
  game_version text not null,       -- the replay header's "1.0#<luaHash>"
  build_id     bigint,
  map_path     text not null,
  status       text not null default 'pending' check (status in ('pending', 'ready', 'expired')),
  created_at   timestamptz not null default now(),
  ready_at     timestamptz
);

create index match_replays_by_status on match_replays (status, created_at);

alter table match_replays enable row level security;

-- Housekeeping that runs lazily from a request instead of a cron: a job
-- claims its row with one conditional update, so at most one caller per
-- interval does the work.
create table site_jobs (
  name        text primary key,
  last_run_at timestamptz not null default 'epoch'
);

alter table site_jobs enable row level security;

insert into site_jobs (name) values ('replay_prune');
