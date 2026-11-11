-- gen_random_uuid() is built into Postgres 17 (pg_catalog); no extension needed.
create schema if not exists app;
create schema if not exists restricted;
revoke all on schema app, restricted from public, anon, authenticated;
grant usage on schema app, restricted to service_role;

-- postgres owns CLI migrations. Revoke both global and schema ACLs: a schema
-- revoke cannot cancel a global grant. No client SELECT is implicit (TD-03).
-- supabase_admin owns bootstrap/extension objects but is a superuser outside
-- postgres's role membership: migrations cannot alter its default ACLs. It must
-- not create application objects. Auth/storage/realtime owners likewise manage
-- their own schemas; all application migrations must run as postgres.
do $$
declare
  owner_role text;
  schema_name text;
begin
  foreach owner_role in array array['postgres'] loop
    execute format('alter default privileges for role %I revoke all on tables from public, anon, authenticated', owner_role);
    execute format('alter default privileges for role %I revoke all on sequences from public, anon, authenticated', owner_role);
    execute format('alter default privileges for role %I revoke execute on functions from public, anon, authenticated', owner_role);
    foreach schema_name in array array['public', 'app', 'restricted'] loop
      execute format('alter default privileges for role %I in schema %I revoke all on tables from public, anon, authenticated', owner_role, schema_name);
      execute format('alter default privileges for role %I in schema %I revoke all on sequences from public, anon, authenticated', owner_role, schema_name);
      execute format('alter default privileges for role %I in schema %I revoke execute on functions from public, anon, authenticated', owner_role, schema_name);
    end loop;
  end loop;
end;
$$;

revoke all on all tables in schema public, app, restricted from public, anon, authenticated;
revoke all on all sequences in schema public, app, restricted from public, anon, authenticated;

create function app.set_updated_at()
returns trigger
language plpgsql
security definer set search_path = app, public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.set_updated_at() to service_role;

create table app.audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Nullable for system actions; no FK so deleting an auth user preserves history.
  actor_id uuid,
  action text not null,
  target text not null,
  diff jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
alter table app.audit_log enable row level security;
-- No policies: only the backend service role can read/append; even it receives
-- no UPDATE/DELETE/TRUNCATE grant. Owners retain PostgreSQL maintenance rights.
revoke all on app.audit_log from public, anon, authenticated, service_role;
grant select, insert on app.audit_log to service_role;
create index audit_log_at_idx on app.audit_log (at);
create index audit_log_actor_id_idx on app.audit_log (actor_id);
