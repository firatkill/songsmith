-- T-04: schema and read policies only; backend behavior arrives in later tasks.
create table public.models (
  id text primary key,
  kind text not null check (kind in ('music', 'text', 'image', 'alignment')),
  adapter text not null,
  adapter_version text not null,
  display_name text not null,
  enabled boolean not null default false,
  quality_rank integer not null default 0,
  is_mock boolean not null default false,
  capabilities jsonb not null check (jsonb_typeof(capabilities) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.models enable row level security;
revoke all on public.models from service_role;
grant select, insert, update, delete on public.models to service_role;
create trigger set_updated_at before update on public.models
for each row execute function app.set_updated_at();

create table public.model_prices (
  model_id text not null references public.models(id) on delete cascade,
  operation text not null check (operation in ('lyrics', 'rewrite', 'generate', 'extend', 'remix', 'stems', 'cover', 'video', 'align', 'instrumental', 'custom_lyrics', 'image_input')),
  credits bigint not null check (credits >= 0),
  est_cost_micro_usd bigint not null check (est_cost_micro_usd >= 0),
  primary key (model_id, operation),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.model_prices enable row level security;
revoke all on public.model_prices from service_role;
grant select, insert, update, delete on public.model_prices to service_role;
create trigger set_updated_at before update on public.model_prices
for each row execute function app.set_updated_at();

create table public.model_languages (
  id uuid primary key default gen_random_uuid(),
  model_id text not null references public.models(id) on delete cascade,
  language text not null,
  status text not null default 'unverified' check (status in ('unverified', 'beta', 'verified')),
  eval_run_id uuid,
  verified_at timestamptz,
  unique (model_id, language),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.model_languages enable row level security;
revoke all on public.model_languages from service_role;
grant select, insert, update, delete on public.model_languages to service_role;
create trigger set_updated_at before update on public.model_languages
for each row execute function app.set_updated_at();

grant select on public.models to anon, authenticated;
create policy catalogue_read on public.models for select to anon, authenticated using (true);
grant select on public.model_prices to anon, authenticated;
create policy catalogue_read on public.model_prices for select to anon, authenticated using (true);
grant select on public.model_languages to anon, authenticated;
create policy catalogue_read on public.model_languages for select to anon, authenticated using (true);
create index models_adapter_idx on public.models (adapter);
create index models_enabled_quality_rank_idx on public.models (enabled, quality_rank);
create table app.provider_health (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  breaker_state text not null default 'closed' check (breaker_state in ('closed', 'open', 'half_open')),
  opened_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.provider_health enable row level security;
revoke all on app.provider_health from service_role;
grant select, insert, update, delete on app.provider_health to service_role;
create trigger set_updated_at before update on app.provider_health
for each row execute function app.set_updated_at();

