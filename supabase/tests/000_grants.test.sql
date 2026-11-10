begin;
select plan(12);

-- DB-01: catalogue-wide effective permissions, including inherited/PUBLIC ACLs.
select is((
  select count(*) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) roles(name)
  where n.nspname in ('public', 'app', 'restricted')
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and has_table_privilege(roles.name, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
), 0::bigint, 'DB-01: clients have no table/view write grants');

create table public.grants_probe (id bigint generated always as identity);
create table app.grants_probe (id bigint generated always as identity);
create table restricted.grants_probe (id bigint generated always as identity);
select is((
  select count(*) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) roles(name)
  where n.nspname in ('public', 'app', 'restricted') and c.relname = 'grants_probe'
    and has_table_privilege(roles.name, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,SELECT')
), 0::bigint, 'DB-01: new tables default to no client grants');
select is((
  select count(*) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) roles(name)
  where n.nspname in ('public', 'app', 'restricted') and c.relkind = 'S'
    and has_sequence_privilege(roles.name, c.oid, 'USAGE,SELECT,UPDATE')
), 0::bigint, 'new sequences default to no client grants');
select ok(not has_schema_privilege('anon', 'app', 'USAGE'), 'anon cannot use app');
select ok(not has_schema_privilege('authenticated', 'app', 'USAGE'), 'authenticated cannot use app');
select ok(not has_schema_privilege('anon', 'restricted', 'USAGE'), 'anon cannot use restricted');
select ok(not has_schema_privilege('authenticated', 'restricted', 'USAGE'), 'authenticated cannot use restricted');

create function app.grants_probe() returns integer language sql
security definer set search_path = app, public, pg_temp as 'select 1';
select is((
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) roles(name)
  where n.nspname = 'app' and has_function_privilege(roles.name, p.oid, 'EXECUTE')
), 0::bigint, 'no app function is executable by clients, including new functions');
select is((
  select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
  where n.nspname = 'app' and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
), 0::bigint, 'no app function is executable by public');
select ok(has_function_privilege('service_role', 'app.set_updated_at()', 'EXECUTE'), 'service can execute trigger function');
select ok(has_table_privilege('service_role', 'app.audit_log', 'INSERT')
  and has_table_privilege('service_role', 'app.audit_log', 'SELECT'), 'service can append and read audit log');
select ok(not has_table_privilege('service_role', 'app.audit_log', 'UPDATE,DELETE,TRUNCATE'), 'audit log grants are append-only');
select * from finish();
rollback;
