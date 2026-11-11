begin;
select no_plan();
select results_eq($$select allowed, remaining from app.rate_limit_hit('db09:user:one', 60, 3)$$, $$values (true, 2)$$, 'DB-09 first hit');
select results_eq($$select allowed, remaining from app.rate_limit_hit('db09:user:one', 60, 3)$$, $$values (true, 1)$$, 'second hit');
select results_eq($$select allowed, remaining from app.rate_limit_hit('db09:user:one', 60, 3)$$, $$values (true, 0)$$, 'max hits allowed');
select results_eq($$select allowed, remaining from app.rate_limit_hit('db09:user:one', 60, 3)$$, $$values (false, 0)$$, 'next hit refused');
select results_eq($$select allowed, remaining from app.rate_limit_hit('db09:user:two', 60, 3)$$, $$values (true, 2)$$, 'users independent');
-- Move the exhausted window into the past, then hit the current fixed window.
update app.rate_limits set window_start = window_start - interval '1 minute' where key = 'db09:user:one';
select results_eq($$select allowed, remaining from app.rate_limit_hit('db09:user:one', 60, 3)$$, $$values (true, 2)$$, 'new window resets');
select ok((select reset_at > statement_timestamp() and reset_at <= statement_timestamp() + interval '60 seconds' from app.rate_limit_hit('db09:reset', 60, 3)), 'reset at next window');
insert into app.rate_limits(key, window_start, count) values ('db09:old', now() - interval '3 days', 1);
select ok(app.cleanup_rate_limits() >= 1, 'cleanup deletes old windows');
select is((select count(*) from app.rate_limits where key = 'db09:old'), 0::bigint, 'old row removed');
select ok(exists(select 1 from app.rate_limits where key = 'db09:user:two'), 'active window retained');
select throws_ok($$select * from app.rate_limit_hit('bad', 86401, 3)$$, '22023', 'invalid rate limit arguments', 'bounded window');
select throws_ok($$select * from app.rate_limit_hit('bad', 60, 0)$$, '22023', 'invalid rate limit arguments', 'positive max');
select app.add_cost('provider:db09', 10, '2026-11-10 20:59:59+00');
select app.add_cost('provider:db09', 20, '2026-11-10 20:59:59+00');
select app.add_cost('provider:db09', 40, '2026-11-10 21:00:00+00');
select results_eq($$select day, micro_usd from app.cost_counters where scope = 'provider:db09' order by day$$,
  $$values ('2026-11-10'::date, 30::bigint), ('2026-11-11'::date, 40::bigint)$$, 'cost accumulation across Istanbul midnight');
select throws_ok($$select app.add_cost('global', -1)$$, '22023', 'invalid cost arguments', 'negative costs rejected');
-- Isolate global counters even when the local stack already has mock activity.
delete from app.cost_counters where scope in ('user:00000000-0000-0000-0000-000000000009', 'provider:cap-test', 'global');
select app.add_cost('user:00000000-0000-0000-0000-000000000009', 10);
select app.add_cost('provider:cap-test', 20);
select app.add_cost('global', 30);
select results_eq($$select * from app.cap_status('00000000-0000-0000-0000-000000000009', 'cap-test', 5, 15, 25, 35)$$,
  $$values (array[]::text[], '10'::text, '20'::text, '30'::text)$$, 'equal to cap allowed and totals returned');
select is((select exceeded from app.cap_status('00000000-0000-0000-0000-000000000009', 'cap-test', 6, 15, 25, 35)), array['user','provider','global'], 'all exceeded caps reported');
select is((select exceeded from app.cap_status('00000000-0000-0000-0000-000000000009', 'cap-test', 1, 10, 100, 100)), array['user'], 'user cap');
select is((select exceeded from app.cap_status('00000000-0000-0000-0000-000000000009', 'cap-test', 1, 100, 20, 100)), array['provider'], 'provider cap');
select is((select exceeded from app.cap_status('00000000-0000-0000-0000-000000000009', 'cap-test', 1, 100, 100, 30)), array['global'], 'global cap');
select app.add_cost('global', 9007199254740993);
select is((select global_total from app.cap_status('00000000-0000-0000-0000-000000000009', 'cap-test', 0, 100, 100, 9223372036854775807)), '9007199254741023', 'bigint totals remain exact JSON strings');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) roles(name)
  where n.nspname = 'app' and p.proname in ('rate_limit_hit','cleanup_rate_limits','add_cost','cap_status')
  and has_function_privilege(roles.name, p.oid, 'EXECUTE')), 0::bigint, 'functions deny client execution');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname in ('rate_limit_hit','cleanup_rate_limits','add_cost','cap_status')
  and p.prosecdef and p.proconfig @> array['search_path=app, public, pg_temp']
  and has_function_privilege('service_role', p.oid, 'EXECUTE')), 4::bigint, 'service functions have fixed search paths');
select * from finish();
rollback;
