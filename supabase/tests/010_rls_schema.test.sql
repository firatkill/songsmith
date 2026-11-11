begin;
select no_plan();
insert into auth.users (id) values ('20000000-0000-4000-8000-000000000001');
insert into public.profiles (id, handle) values ('20000000-0000-4000-8000-000000000001', 'CaseCheck') on conflict (id) do update set handle = excluded.handle;
select throws_ok($$insert into public.profiles (id, handle) values ('00000000-0000-4000-8000-000000000004', 'casecheck')$$,
  '23505', null, 'handles are case-insensitively unique');
insert into public.songs (owner_id, title, lyrics)
values ('20000000-0000-4000-8000-000000000001', 'İstanbul', 'A simple melody');
select ok((select search @@ plainto_tsquery('turkish', 'istanbul') and search @@ plainto_tsquery('simple', 'melody') from public.songs where title = 'İstanbul'), 'generated search uses Turkish and simple configurations');
select ok((select share_token ~ '^[A-Za-z0-9_-]{22}$' from public.songs where title = 'İstanbul'), 'secure token default has base64url shape');
select throws_ok($$update public.songs set share_token = 'invalid' where title = 'İstanbul'$$, '23514', null, 'song token shape enforced');
select throws_ok($$update public.songs set status = 'invalid' where title = 'İstanbul'$$, '23514', null, 'song status enforced');
select throws_ok($$update public.songs set visibility = 'invalid' where title = 'İstanbul'$$, '23514', null, 'song visibility enforced');
insert into public.gifts (sender_id, song_id, recipient_name)
select owner_id, id, 'Friend' from public.songs where title = 'İstanbul';
select ok((select token ~ '^[A-Za-z0-9_-]{22}$' from public.gifts where recipient_name = 'Friend'), 'gift token default has base64url shape');
select throws_ok($$update public.gifts set token = 'invalid' where recipient_name = 'Friend'$$, '23514', null, 'gift token shape enforced');
select throws_ok($$update public.models set capabilities = '[]' where id = 'mock-music-a'$$, '23514', null, 'model capabilities must be object');
insert into public.generation_jobs (user_id, operation, idempotency_key)
values ('20000000-0000-4000-8000-000000000001', 'generate', 'same-key');
select is((select steps from public.generation_jobs where idempotency_key = 'same-key'), '{}'::jsonb, 'job steps default to empty object');
select throws_ok($$insert into public.generation_jobs (user_id, operation, idempotency_key) values ('20000000-0000-4000-8000-000000000001', 'generate', 'same-key')$$, '23505', null, 'idempotency key unique per user');
select lives_ok($$insert into public.generation_jobs (user_id, operation, idempotency_key) values ('00000000-0000-4000-8000-000000000004', 'generate', 'same-key')$$, 'same key allowed for a different user');
select throws_ok($$update public.generation_jobs set status = 'unknown' where idempotency_key = 'same-key'$$, '23514', null, 'job status enforced');
insert into app.play_events (song_id, listener_key, hour_bucket)
select id, 'listener-hash', '2026-11-11T00:00:00Z' from public.songs where title = 'İstanbul';
select throws_ok($$insert into app.play_events (song_id, listener_key, hour_bucket) select id, 'listener-hash', '2026-11-11T00:00:00Z' from public.songs where title = 'İstanbul'$$, '23505', null, 'play deduplicated per listener/song/hour');
select lives_ok($$insert into app.play_events (song_id, listener_key, hour_bucket) select id, 'listener-hash', '2026-11-11T01:00:00Z' from public.songs where title = 'İstanbul'$$, 'play allowed in another hour');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public','app','restricted') and c.relkind in ('r','v') and pg_get_userbyid(c.relowner) <> 'postgres'), 0::bigint, 'application objects owned by postgres (D-18)');
select is((select count(*) from information_schema.columns where table_schema in ('public','app','restricted') and column_name in ('credits','credit_cost','est_cost_micro_usd','actual_cost_micro_usd','micro_usd') and data_type <> 'bigint'), 0::bigint, 'all credits and costs use bigint');
-- Every mutable entity has the shared timestamp trigger, not just a timestamp column.
select is((select count(*) from information_schema.columns col where col.table_schema in ('public','app','restricted') and col.column_name = 'updated_at' and not exists (
  select 1 from pg_trigger t where t.tgrelid = format('%I.%I', col.table_schema, col.table_name)::regclass and t.tgfoid = 'app.set_updated_at()'::regprocedure and not t.tgisinternal
)), 0::bigint, 'all mutable tables have updated_at triggers');
select * from finish();
rollback;
