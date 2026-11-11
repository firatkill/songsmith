-- T-04: schema and read policies only; backend behavior arrives in later tasks.
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle extensions.citext not null unique,
  display_name text not null default '',
  bio text not null default '',
  avatar_seed text not null default '',
  locale text not null default 'en' check (locale in ('en', 'tr')),
  is_adult boolean not null default false,
  adult_verified_at timestamptz,
  remix_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'cooldown', 'suspended', 'banned', 'deleted')),
  explicit_hidden boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from service_role;
grant select, insert, update, delete on public.profiles to service_role;
create trigger set_updated_at before update on public.profiles
for each row execute function app.set_updated_at();

grant select on public.profiles to authenticated;
create policy own_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create index profiles_status_idx on public.profiles (status);
-- Deliberate owner-rights view: the postgres owner bypasses own-row RLS,
-- but callers can access only this fixed projection of active accounts.
-- security_barrier prevents caller predicates from being pushed below the filter.
create view public.public_profiles with (security_barrier = true) as
select id, handle, display_name, bio, avatar_seed from public.profiles where status = 'active';
revoke all on public.public_profiles from service_role;
grant select on public.public_profiles to anon, authenticated, service_role;
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  notification_prefs jsonb not null default '{}' check (jsonb_typeof(notification_prefs) = 'object'),
  marketing_email_opt_in boolean not null default false,
  analytics_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from service_role;
grant select, insert, update, delete on public.user_settings to service_role;
create trigger set_updated_at before update on public.user_settings
for each row execute function app.set_updated_at();

grant select on public.user_settings to authenticated;
create policy own_read on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('terms', 'privacy', 'ai_disclosure', 'marketing', 'analytics')),
  version text not null,
  granted boolean not null,
  at timestamptz not null default now(),
  source text not null,
  created_at timestamptz not null default now()
);
alter table public.consents enable row level security;
revoke all on public.consents from service_role;
grant select, insert, update, delete on public.consents to service_role;

grant select on public.consents to authenticated;
create policy own_read on public.consents for select to authenticated using (user_id = (select auth.uid()));
create index consents_user_id_idx on public.consents (user_id);
create table app.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null,
  expo_push_token text unique,
  attestation_status text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.devices enable row level security;
revoke all on app.devices from service_role;
grant select, insert, update, delete on app.devices to service_role;
create trigger set_updated_at before update on app.devices
for each row execute function app.set_updated_at();

create index devices_user_id_idx on app.devices (user_id);
create table app.staff_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('moderator', 'admin')),
  unique (user_id, role),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.staff_roles enable row level security;
revoke all on app.staff_roles from service_role;
grant select, insert, update, delete on app.staff_roles to service_role;
create trigger set_updated_at before update on app.staff_roles
for each row execute function app.set_updated_at();

