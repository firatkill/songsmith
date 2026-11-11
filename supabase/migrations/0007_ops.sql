-- T-04: schema and read policies only; backend behavior arrives in later tasks.
create table app.flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.flags enable row level security;
revoke all on app.flags from service_role;
grant select, insert, update, delete on app.flags to service_role;
create trigger set_updated_at before update on app.flags
for each row execute function app.set_updated_at();

create index flags_updated_by_idx on app.flags (updated_by);
create table app.cost_counters (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope = 'global' or scope ~ '^(user|provider):.+$'),
  day date not null,
  micro_usd bigint not null default 0 check (micro_usd >= 0),
  unique (scope, day),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.cost_counters enable row level security;
revoke all on app.cost_counters from service_role;
grant select, insert, update, delete on app.cost_counters to service_role;
create trigger set_updated_at before update on app.cost_counters
for each row execute function app.set_updated_at();

create index cost_counters_day_idx on app.cost_counters (day);
create table app.rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  window_start timestamptz not null,
  count bigint not null default 0 check (count >= 0),
  unique (key, window_start),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.rate_limits enable row level security;
revoke all on app.rate_limits from service_role;
grant select, insert, update, delete on app.rate_limits to service_role;
create trigger set_updated_at before update on app.rate_limits
for each row execute function app.set_updated_at();

create index rate_limits_window_start_idx on app.rate_limits (window_start);
create table app.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('export', 'delete')),
  status text not null,
  artifact_path text,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.data_requests enable row level security;
revoke all on app.data_requests from service_role;
grant select, insert, update, delete on app.data_requests to service_role;
create trigger set_updated_at before update on app.data_requests
for each row execute function app.set_updated_at();

create index data_requests_user_id_idx on app.data_requests (user_id);
create index data_requests_status_due_at_idx on app.data_requests (status, due_at);
