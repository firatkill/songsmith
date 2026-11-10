begin;
select plan(8);

-- DB-02: the same predicate checks the real schema and a deliberate violation.
create temporary view rls_missing as
select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
select is((select count(*) from rls_missing), 0::bigint, 'DB-02: all public tables enable RLS');
create table public.rls_probe (id integer);
select is((select count(*) from rls_missing), 1::bigint, 'DB-02: detects a table missing RLS');
alter table public.rls_probe enable row level security;
select is((select count(*) from rls_missing), 0::bigint, 'DB-02: passes after enabling RLS');
select ok((select relrowsecurity from pg_class where oid = 'app.audit_log'::regclass), 'audit log enables RLS');
select is((select count(*) from pg_policy where polrelid = 'app.audit_log'::regclass), 0::bigint, 'audit log has no client policies');

create table app.updated_at_probe (id integer primary key, updated_at timestamptz not null);
create trigger set_updated_at before update on app.updated_at_probe
for each row execute function app.set_updated_at();
insert into app.updated_at_probe values (1, '2000-01-01T00:00:00Z');
update app.updated_at_probe set id = 2;
select is((select updated_at from app.updated_at_probe), now(), 'trigger sets updated_at to now');

set local role service_role;
insert into app.audit_log (action, target) values ('foundation.test', 'probe');
reset role;
select ok((select id is not null and at = now() and diff = '{}'::jsonb and actor_id is null
  from app.audit_log where action = 'foundation.test' and target = 'probe'), 'audit defaults work for service role and system actions');
set local role authenticated;
select throws_ok(
  $$insert into app.audit_log (action, target) values ('forbidden', 'probe')$$,
  '42501', 'permission denied for schema app', 'authenticated cannot insert audit rows'
);
reset role;
select * from finish();
rollback;
