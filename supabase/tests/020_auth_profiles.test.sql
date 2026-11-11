begin;
select no_plan();
insert into auth.users (id, raw_user_meta_data) values
 ('abcdef12-3456-4000-8000-000000000001', '{"locale":"tr"}'),
 ('abcdef12-3457-4000-8000-000000000001', '{"locale":"xx"}');
select is((select handle::text from public.profiles where id = 'abcdef12-3456-4000-8000-000000000001'), 'user_abcdef123456', 'trigger creates expected lowercase handle');
select is((select display_name from public.profiles where id = 'abcdef12-3456-4000-8000-000000000001'), 'user_abcdef123456', 'display name defaults to handle');
select is((select locale from public.profiles where id = 'abcdef12-3456-4000-8000-000000000001'), 'tr', 'supported metadata locale');
select is((select locale from public.profiles where id = 'abcdef12-3457-4000-8000-000000000001'), 'en', 'unsupported metadata locale defaults to en');
select ok((select not is_adult and adult_verified_at is null and status = 'active' from public.profiles where id = 'abcdef12-3456-4000-8000-000000000001'), 'new profile active and unverified');
select is((select count(*) from public.user_settings where user_id = 'abcdef12-3456-4000-8000-000000000001'), 1::bigint, 'trigger creates default settings');
-- Same 48-bit UUID prefix must provision both identities, including settings.
insert into auth.users (id) values ('abcdef12-3456-4000-8000-000000000002');
select is((select count(*) from public.profiles where id in ('abcdef12-3456-4000-8000-000000000001', 'abcdef12-3456-4000-8000-000000000002')), 2::bigint, 'colliding UUID prefixes both get profiles');
select is((select count(distinct handle) from public.profiles where id in ('abcdef12-3456-4000-8000-000000000001', 'abcdef12-3456-4000-8000-000000000002')), 2::bigint, 'colliding UUID prefixes receive distinct handles');
select ok((select handle::text ~ '^user_[a-f0-9]{12}$' and display_name = handle::text from public.profiles where id = 'abcdef12-3456-4000-8000-000000000002'), 'retry preserves generated handle format and display name');
select is((select count(*) from public.user_settings where user_id = 'abcdef12-3456-4000-8000-000000000002'), 1::bigint, 'collision retry also provisions settings');
select ok((select relrowsecurity from pg_class where oid = 'app.signup_blocks'::regclass), 'signup blocks have RLS');
select ok(not has_table_privilege('anon', 'app.signup_blocks', 'select'), 'anon cannot read hashes');
select ok(not has_table_privilege('authenticated', 'app.signup_blocks', 'select'), 'authenticated cannot read hashes');
select ok(has_function_privilege('supabase_auth_admin', 'app.before_user_created(jsonb)', 'execute'), 'auth admin can call hook');
select ok(not has_function_privilege('service_role', 'app.before_user_created(jsonb)', 'execute'), 'service cannot call hook');
select ok(not has_function_privilege('anon', 'app.before_user_created(jsonb)', 'execute'), 'anon cannot call hook');
select ok(not has_function_privilege('authenticated', 'app.before_user_created(jsonb)', 'execute'), 'authenticated cannot call hook');
insert into app.signup_blocks values (encode(extensions.digest('blocked@example.test', 'sha256'), 'hex'), now() + interval '30 days');
select is(app.before_user_created('{"user":{"email":" BLOCKED@example.test "}}')->'error'->>'http_code', '403', 'hook rejects normalized blocked email');
select is(app.before_user_created('{"user":{"email":"allowed@example.test"}}'), '{}'::jsonb, 'hook accepts unblocked email');
reset role;
update app.signup_blocks set blocked_until = now() - interval '1 second';
select is(app.before_user_created('{"user":{"email":"blocked@example.test"}}'), '{}'::jsonb, 'expired block permits signup');
select ok(not has_table_privilege('service_role', 'public.consents', 'update,delete,truncate'), 'consent history grants append-only');
select app.record_consent('abcdef12-3456-4000-8000-000000000001', 'marketing', '2026-11-01', true, 'web');
select app.record_consent('abcdef12-3456-4000-8000-000000000001', 'marketing', '2026-11-01', false, 'ios');
select is((select count(*) from public.consents where user_id = 'abcdef12-3456-4000-8000-000000000001'), 2::bigint, 'consents append history');
select ok((select not marketing_email_opt_in from public.user_settings where user_id = 'abcdef12-3456-4000-8000-000000000001'), 'consent mirrors latest flag');
create temporary sequence handle_attempts;
create function pg_temp.force_handle_collision() returns trigger language plpgsql as $$
begin
  perform nextval('pg_temp.handle_attempts');
  raise unique_violation using constraint = 'profiles_handle_key', message = 'forced handle collision';
end;
$$;
create trigger force_handle_collision before insert on public.profiles
for each row execute function pg_temp.force_handle_collision();
select throws_ok($$insert into auth.users (id) values ('abcdef12-3458-4000-8000-000000000001')$$, '23505', 'forced handle collision', 'exhausted handle retries fail signup');
select is((select last_value from pg_temp.handle_attempts), 5::bigint, 'handle retry has five total attempts');
select is((select count(*) from auth.users where id = 'abcdef12-3458-4000-8000-000000000001'), 0::bigint, 'exhausted retries roll back auth identity');
select * from finish();
rollback;
