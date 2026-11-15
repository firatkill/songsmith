begin;
select no_plan();
-- T-19: song jobs (0015).
insert into auth.users(id) values ('85000000-0000-4000-8000-000000000001');
create function pg_temp.uid() returns uuid language sql as $$select '85000000-0000-4000-8000-000000000001'::uuid$$;
select app.grant_credits(pg_temp.uid(),30,'signup_grant','test',null,'g1');
create function pg_temp.job(p_key text) returns public.generation_jobs language sql as $$
  select app.start_job(pg_temp.uid(),'generate','mock-music-a',10,p_key,2)
$$;
create function pg_temp.id(p_key text) returns uuid language sql as $$
  select id from public.generation_jobs where idempotency_key = p_key
$$;
create function pg_temp.claim(p_key text, p_hash text default repeat('a',64)) returns public.generation_jobs language sql as $$
  select app.claim_song_job(pg_temp.id(p_key),p_hash,'{"title":"T"}','{"kind":"auto"}',gen_random_uuid(),'{"title":"T","lyrics":"[Verse]\nla","language":"en","explicit":true}')
$$;

select ok(exists(select 1 from storage.buckets where id='private-media' and not public),'private bucket exists');
select pg_temp.job('s1');
select isnt((pg_temp.claim('s1')).song_id,null,'claim creates the song');
select is((select status||':'||owner_id::text||':'||explicit::text from public.songs where id=(select song_id from public.generation_jobs where id=pg_temp.id('s1'))),'pending:'||pg_temp.uid()||':true','song is pending, owned and labelled');
select is((pg_temp.claim('s1',repeat('b',64))).steps->>'bodySha256',repeat('a',64),'second claim keeps the first request');
select is((select count(*) from public.songs where owner_id=pg_temp.uid()),1::bigint,'second claim creates no song');
select throws_ok($$select app.claim_song_job(pg_temp.id('s1'),'x','{}','{}',null,'{"title":"T"}')$$,'SS004','invalid song job','claim validates arguments');

-- Complete charges the used model's price, capped by the hold.
update public.model_prices set credits = 12 where model_id='mock-music-b' and operation='generate';
select is((app.complete_song_job(pg_temp.id('s1'),'mock-music-b',30000,'[{"kind":"audio_mp3","label":null,"bucket":"private-media","path":"songs/x/audio.mp3","bytes":10,"sha256":"00"}]')).status,'ready','complete marks the job ready');
select is((select balance||':'||held from app.credit_accounts where user_id=pg_temp.uid()),'20:0','charge capped at the reserved 10');
select is((select status||':'||model_id||':'||credit_cost||':'||duration_ms from public.songs where id=(select song_id from public.generation_jobs where id=pg_temp.id('s1'))),'ready:mock-music-b:10:30000','song ready with the used model');
select lives_ok($$select app.complete_song_job(pg_temp.id('s1'),'mock-music-b',30000,'[{"kind":"audio_mp3","label":null,"bucket":"private-media","path":"p","bytes":1,"sha256":"00"}]')$$,'second complete is a no-op');
select is((select count(*) from app.credit_ledger where user_id=pg_temp.uid() and kind='spend'),1::bigint,'charged once');
select is((select count(*) from public.song_assets where song_id=(select song_id from public.generation_jobs where id=pg_temp.id('s1'))),1::bigint,'one asset row');
update public.model_prices set credits = 10 where model_id='mock-music-b' and operation='generate';

-- Fail releases the hold, refunds the job and fails the song, once.
select pg_temp.job('s2');
select pg_temp.claim('s2');
select is((app.fail_song_job(pg_temp.id('s2'),'PROVIDER_TIMEOUT')).status,'refunded','fail refunds the job');
select is((select held from app.credit_accounts where user_id=pg_temp.uid()),0::bigint,'hold released');
select is((select status from public.songs where id=(select song_id from public.generation_jobs where id=pg_temp.id('s2'))),'failed','song failed');
select is((app.fail_song_job(pg_temp.id('s2'),'INTERNAL')).error_code,'PROVIDER_TIMEOUT','second fail keeps the first code');
select throws_ok($$select app.complete_song_job(pg_temp.id('s2'),'mock-music-a',1,'[{"kind":"audio_mp3","bucket":"b","path":"p"}]')$$,'SS004','job not running','complete after fail refused');
-- The sweeper marks a stale job failed before calling fail_song_job.
select pg_temp.job('s3');
update public.generation_jobs set status='failed' where id=pg_temp.id('s3');
select is((app.fail_song_job(pg_temp.id('s3'),'PROVIDER_TIMEOUT')).status,'refunded','sweeper-failed job is refunded');
select is((select count(*) from app.reconcile_credits() where user_id=pg_temp.uid()),0::bigint,'ledger reconciles');

select ok(not has_function_privilege('authenticated','app.complete_song_job(uuid,text,integer,jsonb)','execute'),'clients cannot complete');
select ok(has_function_privilege('service_role','app.fail_song_job(uuid,text)','execute'),'service can fail');
select * from finish();
rollback;
