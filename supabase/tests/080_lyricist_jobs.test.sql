begin;
select no_plan();
-- T-18: lyricist jobs (0014). The sign-up trigger does not fire without e-mail confirmation.
insert into auth.users(id) values ('80000000-0000-4000-8000-000000000001');
update public.profiles set is_adult = true where id = '80000000-0000-4000-8000-000000000001';
create function pg_temp.uid() returns uuid language sql as $$select '80000000-0000-4000-8000-000000000001'::uuid$$;
select app.grant_credits(pg_temp.uid(),10,'signup_grant','test',null,'g1');
create function pg_temp.job(p_key text, p_operation text default 'lyrics') returns public.generation_jobs language sql as $$
  select app.start_job(pg_temp.uid(),p_operation,'mock-text',1,p_key,1)
$$;
create function pg_temp.hash(p text) returns text language sql as $$select encode(extensions.digest(p,'sha256'),'hex')$$;

-- Admission: lyricist jobs run synchronously and ignore the music concurrency limit.
select is((pg_temp.job('l1')).status,'running','lyrics job starts running');
select is((pg_temp.job('l2','rewrite')).status,'running','rewrite job starts running');
select lives_ok($$select app.start_job(pg_temp.uid(),'generate','mock-music-a',1,'m1',1)$$,'music job admitted at limit 1 despite lyricist jobs');
select throws_ok($$select app.start_job(pg_temp.uid(),'generate','mock-music-a',1,'m2',1)$$,'SS003','concurrency limit','music limit still applies');
select is((pg_temp.job('l1')).id,(select id from public.generation_jobs where idempotency_key='l1'),'replay returns the same job');
select is((select held from app.credit_accounts where user_id=pg_temp.uid()),3::bigint,'replay holds nothing new');
select ok((select expires_at <= now() + interval '5 minutes' from app.credit_reservations where idempotency_key = 'job:'||pg_temp.uid()||':l1'),'lyricist hold lasts five minutes');

-- Claim stores the body hash once.
select is((app.claim_lyricist_job((select id from public.generation_jobs where idempotency_key='l1'),pg_temp.hash('a'))).steps->'lyricist'->>'bodySha256',pg_temp.hash('a'),'claim stores the hash');
select is((app.claim_lyricist_job((select id from public.generation_jobs where idempotency_key='l1'),pg_temp.hash('b'))).steps->'lyricist'->>'bodySha256',pg_temp.hash('a'),'second claim keeps the first hash');
select throws_ok($$select app.claim_lyricist_job((select id from public.generation_jobs where idempotency_key='m1'),pg_temp.hash('a'))$$,'SS004','invalid job','claim refuses music jobs');
select throws_ok($$select app.claim_lyricist_job((select id from public.generation_jobs where idempotency_key='l1'),'nothex')$$,'SS004','invalid hash','claim validates the hash');

-- Complete settles the full price with the result, once.
select is((app.complete_lyricist_job((select id from public.generation_jobs where idempotency_key='l1'),'{"lyrics":{}}')).status,'ready','complete marks ready');
select is((select steps->'lyricist'->'result' from public.generation_jobs where idempotency_key='l1'),'{"lyrics":{}}'::jsonb,'result stored');
select is((select balance from app.credit_accounts where user_id=pg_temp.uid()),9::bigint,'full price charged');
select lives_ok($$select app.complete_lyricist_job((select id from public.generation_jobs where idempotency_key='l1'),'{"lyrics":{}}')$$,'second complete is a no-op');
select is((select count(*) from app.credit_ledger where user_id=pg_temp.uid() and kind='spend'),1::bigint,'charged once');
select throws_ok($$select app.fail_lyricist_job((select id from public.generation_jobs where idempotency_key='l1'),'bad code')$$,'SS004','invalid job','fail validates the code');
select is((app.fail_lyricist_job((select id from public.generation_jobs where idempotency_key='l1'),'INTERNAL')).status,'ready','fail after complete is a no-op');

-- Fail releases the hold and records the code.
select app.claim_lyricist_job((select id from public.generation_jobs where idempotency_key='l2'),pg_temp.hash('c'));
select is((app.fail_lyricist_job((select id from public.generation_jobs where idempotency_key='l2'),'LYRICS_INVALID')).error_code,'LYRICS_INVALID','fail records the code');
select is((select status from app.credit_reservations where idempotency_key='job:'||pg_temp.uid()||':l2'),'released','fail releases the hold');
select throws_ok($$select app.complete_lyricist_job((select id from public.generation_jobs where idempotency_key='l2'),'{}')$$,'SS004','job not running','complete after fail refused');
select is((select balance - held from app.credit_accounts where user_id=pg_temp.uid()),8::bigint,'only the music hold remains');

-- A crashed lyricist request is ended by expire_reservations even though it is running.
select pg_temp.job('l3');
update app.credit_reservations set expires_at = now() - interval '1 second' where idempotency_key = 'job:'||pg_temp.uid()||':l3';
select is(app.expire_reservations(),1,'expired lyricist hold released');
select is((select status||':'||error_code from public.generation_jobs where idempotency_key='l3'),'failed:PROVIDER_TIMEOUT','crashed lyricist job failed');
select is((select count(*) from app.reconcile_credits() where user_id=pg_temp.uid()),0::bigint,'ledger reconciles');

-- Model output never counts towards friction or suspends the account.
select app.record_moderation_decision(pg_temp.uid(),'output_lyrics',pg_temp.hash('o'||n),'v1','{}','hate','high','block',1,86400,1,3600,1,null,'evidence')
  from generate_series(1,3) n;
select is((select status from public.profiles where id=pg_temp.uid()),'active','output blocks add no friction');
select is((select count(*) from restricted.moderation_evidence e join app.moderation_decisions d on d.id=e.decision_id where d.user_id=pg_temp.uid()),3::bigint,'output blocks keep evidence');
select app.record_moderation_decision(pg_temp.uid(),'output_lyrics',pg_temp.hash('oh'),'v1','{}','threat','critical','hard_block',1,86400,3,3600,6,null,'evidence');
select is((select status from public.profiles where id=pg_temp.uid()),'active','output hard block does not suspend');
select is((select count(*) from app.moderation_cases where subject_user_id=pg_temp.uid() and kind='hard_block'),1::bigint,'output hard block opens a case');
select app.record_moderation_decision(pg_temp.uid(),'description',pg_temp.hash('i'),'v1','{}','hate','high','block',1,86400,1,3600,6,null,'evidence');
select is((select status from public.profiles where id=pg_temp.uid()),'cooldown','input blocks still count');

-- Grants: service_role only.
select ok(not has_function_privilege('authenticated','app.complete_lyricist_job(uuid,jsonb)','execute'),'clients cannot complete');
select ok(not has_function_privilege('anon','app.claim_lyricist_job(uuid,text)','execute'),'anon cannot claim');
select ok(has_function_privilege('service_role','app.fail_lyricist_job(uuid,text)','execute'),'service can fail');
select ok(has_function_privilege('service_role','app.start_job(uuid,text,text,bigint,text,integer)','execute'),'replaced start_job keeps its grant');
select * from finish();
rollback;
