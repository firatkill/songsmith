-- T-04: schema and read policies only; backend behavior arrives in later tasks.
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.playlists enable row level security;
revoke all on public.playlists from service_role;
grant select, insert, update, delete on public.playlists to service_role;
create trigger set_updated_at before update on public.playlists
for each row execute function app.set_updated_at();

grant select on public.playlists to authenticated;
create policy own_read on public.playlists for select to authenticated using (user_id = (select auth.uid()));
create index playlists_user_id_idx on public.playlists (user_id);
create table public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  position numeric not null,
  unique (playlist_id, song_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.playlist_items enable row level security;
revoke all on public.playlist_items from service_role;
grant select, insert, update, delete on public.playlist_items to service_role;
create trigger set_updated_at before update on public.playlist_items
for each row execute function app.set_updated_at();

create index playlist_items_song_id_idx on public.playlist_items (song_id);
create index playlist_items_playlist_id_position_idx on public.playlist_items (playlist_id, position);
grant select on public.playlist_items to authenticated;
create policy own_read on public.playlist_items for select to authenticated using (exists (select 1 from public.playlists p where p.id = playlist_id));
create table public.favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  unique (user_id, song_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.favourites enable row level security;
revoke all on public.favourites from service_role;
grant select, insert, update, delete on public.favourites to service_role;
create trigger set_updated_at before update on public.favourites
for each row execute function app.set_updated_at();

create index favourites_song_id_idx on public.favourites (song_id);
grant select on public.favourites to authenticated;
create policy own_read on public.favourites for select to authenticated using (user_id = (select auth.uid()));
create table app.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  unique (user_id, song_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.likes enable row level security;
revoke all on app.likes from service_role;
grant select, insert, update, delete on app.likes to service_role;
create trigger set_updated_at before update on app.likes
for each row execute function app.set_updated_at();

create index likes_song_id_idx on app.likes (song_id);
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  unique (follower_id, followed_id),
  check (follower_id <> followed_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.follows enable row level security;
revoke all on public.follows from service_role;
grant select, insert, update, delete on public.follows to service_role;
create trigger set_updated_at before update on public.follows
for each row execute function app.set_updated_at();

grant select on public.follows to authenticated;
create policy own_read on public.follows for select to authenticated using (follower_id = (select auth.uid()));
create index follows_followed_id_idx on public.follows (followed_id);
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blocks enable row level security;
revoke all on public.blocks from service_role;
grant select, insert, update, delete on public.blocks to service_role;
create trigger set_updated_at before update on public.blocks
for each row execute function app.set_updated_at();

grant select on public.blocks to authenticated;
create policy own_read on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));
create index blocks_blocked_id_idx on public.blocks (blocked_id);
create policy owner_read on public.songs for select to authenticated using (owner_id = (select auth.uid()));
create policy public_read on public.songs for select to authenticated using (
  visibility = 'public' and status = 'ready' and not exists (
    select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = owner_id
  )
);
create policy anonymous_read on public.songs for select to anon using (visibility = 'public' and status = 'ready');
create table public.song_stats (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null unique references public.songs(id) on delete cascade,
  likes bigint not null default 0 check (likes >= 0),
  plays bigint not null default 0 check (plays >= 0),
  trending_score double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.song_stats enable row level security;
revoke all on public.song_stats from service_role;
grant select, insert, update, delete on public.song_stats to service_role;
create trigger set_updated_at before update on public.song_stats
for each row execute function app.set_updated_at();

create index song_stats_trending_score_idx on public.song_stats (trending_score);
grant select on public.song_stats to anon, authenticated;
create policy public_read on public.song_stats for select to anon, authenticated using (exists (select 1 from public.songs s where s.id = song_id and s.visibility = 'public' and s.status = 'ready'));
create table app.play_events (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  listener_key text not null,
  hour_bucket timestamptz not null,
  unique (song_id, listener_key, hour_bucket),
  created_at timestamptz not null default now()
);
alter table app.play_events enable row level security;
revoke all on app.play_events from service_role;
grant select, insert, update, delete on app.play_events to service_role;

create index play_events_hour_bucket_idx on app.play_events (hour_bucket);
create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique default translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_') check (token ~ '^[A-Za-z0-9_-]{22}$'),
  recipient_name text not null,
  message text not null default '',
  occasion text,
  opens_at timestamptz,
  revoked_at timestamptz,
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.gifts enable row level security;
revoke all on public.gifts from service_role;
grant select, insert, update, delete on public.gifts to service_role;
create trigger set_updated_at before update on public.gifts
for each row execute function app.set_updated_at();

create index gifts_song_id_idx on public.gifts (song_id);
create index gifts_sender_id_idx on public.gifts (sender_id);
grant select (id, song_id, sender_id, recipient_name, message, occasion, opens_at, revoked_at, created_at, updated_at) on public.gifts to authenticated;
create policy own_read on public.gifts for select to authenticated using (sender_id = (select auth.uid()));
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
revoke all on public.notifications from service_role;
grant select, insert, update, delete on public.notifications to service_role;
create trigger set_updated_at before update on public.notifications
for each row execute function app.set_updated_at();

grant select on public.notifications to authenticated;
create policy own_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at);
alter publication supabase_realtime add table public.generation_jobs, public.notifications;
