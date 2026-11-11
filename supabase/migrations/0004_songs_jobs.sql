-- T-04: schema and read policies only; backend behavior arrives in later tasks.
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  lyrics text not null default '',
  sections jsonb not null default '[]',
  language text,
  style jsonb not null default '{}',
  instrumental boolean not null default false,
  model_id text references public.models(id) on delete restrict,
  model_version text,
  duration_ms integer check (duration_ms >= 0),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  share_token text not null unique default translate(rtrim(encode(extensions.gen_random_bytes(16), 'base64'), '='), '+/', '-_') check (share_token ~ '^[A-Za-z0-9_-]{22}$'),
  explicit boolean not null default false,
  remix_allowed boolean not null default false,
  parent_song_id uuid references public.songs(id) on delete set null,
  parent_kind text  check (parent_kind in ('extend', 'remix')),
  moderation_decision_id uuid,
  credit_cost bigint check (credit_cost >= 0),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'hidden', 'removed', 'deleted')),
  deleted_at timestamptz,
  search tsvector generated always as (
    to_tsvector('pg_catalog.turkish'::regconfig, title || ' ' || lyrics) ||
    to_tsvector('pg_catalog.simple'::regconfig, title || ' ' || lyrics)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.songs enable row level security;
revoke all on public.songs from service_role;
grant select, insert, update, delete on public.songs to service_role;
create trigger set_updated_at before update on public.songs
for each row execute function app.set_updated_at();

create index songs_search_idx on public.songs using gin (search);
create index songs_owner_id_idx on public.songs (owner_id);
create index songs_model_id_idx on public.songs (model_id);
create index songs_parent_song_id_idx on public.songs (parent_song_id);
create index songs_moderation_decision_id_idx on public.songs (moderation_decision_id);
create index songs_visibility_status_idx on public.songs (visibility, status);
grant select (id, owner_id, title, lyrics, sections, language, style, instrumental, model_id, model_version, duration_ms, visibility, explicit, remix_allowed, parent_song_id, parent_kind, status, deleted_at, search, created_at, updated_at) on public.songs to anon, authenticated;
create table public.song_assets (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  kind text not null check (kind in ('audio_mp3', 'audio_wav', 'stems_zip', 'stem', 'cover', 'video', 'public_mp3', 'public_cover')),
  label text,
  bucket text not null,
  path text not null,
  bytes bigint check (bytes >= 0),
  sha256 text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.song_assets enable row level security;
revoke all on public.song_assets from service_role;
grant select, insert, update, delete on public.song_assets to service_role;
create trigger set_updated_at before update on public.song_assets
for each row execute function app.set_updated_at();

create table public.song_timings (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  granularity text not null check (granularity in ('word', 'line')),
  source text not null check (source in ('model', 'alignment', 'mock')),
  timings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.song_timings enable row level security;
revoke all on public.song_timings from service_role;
grant select, insert, update, delete on public.song_timings to service_role;
create trigger set_updated_at before update on public.song_timings
for each row execute function app.set_updated_at();

create index song_assets_song_id_idx on public.song_assets (song_id);
grant select on public.song_assets to anon, authenticated;
create policy via_song_read on public.song_assets for select to anon, authenticated using (exists (select 1 from public.songs s where s.id = song_id));
create index song_timings_song_id_idx on public.song_timings (song_id);
grant select on public.song_timings to anon, authenticated;
create policy via_song_read on public.song_timings for select to anon, authenticated using (exists (select 1 from public.songs s where s.id = song_id));
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation text not null check (operation in ('lyrics', 'rewrite', 'generate', 'extend', 'remix', 'stems', 'cover', 'video', 'align')),
  status text not null default 'queued' check (status in ('queued', 'moderating', 'running', 'finishing', 'ready', 'failed', 'refunded', 'cancelled')),
  stage_detail text,
  song_id uuid references public.songs(id) on delete set null,
  model_id text references public.models(id) on delete restrict,
  route_reason jsonb not null default '{}',
  -- Credit reservations and their FK arrive in T-17.
  reservation_id uuid,
  idempotency_key text not null,
  error_code text,
  attempts integer not null default 0 check (attempts >= 0),
  steps jsonb not null default '{}' check (jsonb_typeof(steps) = 'object'),
  heartbeat_at timestamptz not null default now(),
  correlation_id uuid,
  unique (user_id, idempotency_key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.generation_jobs enable row level security;
revoke all on public.generation_jobs from service_role;
grant select, insert, update, delete on public.generation_jobs to service_role;
create trigger set_updated_at before update on public.generation_jobs
for each row execute function app.set_updated_at();

grant select on public.generation_jobs to authenticated;
create policy own_read on public.generation_jobs for select to authenticated using (user_id = (select auth.uid()));
create index generation_jobs_song_id_idx on public.generation_jobs (song_id);
create index generation_jobs_model_id_idx on public.generation_jobs (model_id);
create index generation_jobs_reservation_id_idx on public.generation_jobs (reservation_id);
create index generation_jobs_status_heartbeat_at_idx on public.generation_jobs (status, heartbeat_at);
create index generation_jobs_non_final_user_idx on public.generation_jobs (user_id, operation) where status in ('queued', 'moderating', 'running', 'finishing');
create table app.provider_calls (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.generation_jobs(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  provider text not null,
  model_id text references public.models(id) on delete restrict,
  operation text not null check (operation in ('lyrics', 'rewrite', 'generate', 'extend', 'remix', 'stems', 'cover', 'video', 'align', 'instrumental', 'custom_lyrics', 'image_input')),
  est_cost_micro_usd bigint not null check (est_cost_micro_usd >= 0),
  actual_cost_micro_usd bigint check (actual_cost_micro_usd >= 0),
  status text not null,
  latency_ms integer check (latency_ms >= 0),
  provider_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.provider_calls enable row level security;
revoke all on app.provider_calls from service_role;
grant select, insert, update, delete on app.provider_calls to service_role;
create trigger set_updated_at before update on app.provider_calls
for each row execute function app.set_updated_at();

create index provider_calls_job_id_idx on app.provider_calls (job_id);
create index provider_calls_user_id_idx on app.provider_calls (user_id);
create index provider_calls_model_id_idx on app.provider_calls (model_id);
create index provider_calls_provider_created_at_idx on app.provider_calls (provider, created_at);
create index provider_calls_provider_request_id_idx on app.provider_calls (provider_request_id);
