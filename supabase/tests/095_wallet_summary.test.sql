begin;
select plan(5);
-- T-20: wallet summary (0016).
insert into auth.users(id) values ('95000000-0000-4000-8000-000000000001');
select is((select balance||':'||held||':'||available from app.wallet_summary('95000000-0000-4000-8000-000000000001')),'0:0:0','no account reads as zeros');
select app.grant_credits('95000000-0000-4000-8000-000000000001',30,'signup_grant','test',null,'w1');
select app.start_job('95000000-0000-4000-8000-000000000001','generate','mock-music-a',10,'w-job',2);
select is((select balance||':'||held||':'||available from app.wallet_summary('95000000-0000-4000-8000-000000000001')),'30:10:20','a hold lowers available');
select is((select count(*) from app.wallet_summary(gen_random_uuid())),1::bigint,'always one row');
select ok(not has_function_privilege('authenticated','app.wallet_summary(uuid)','execute'),'clients cannot call it');
select ok(has_function_privilege('service_role','app.wallet_summary(uuid)','execute'),'service can');
select * from finish();
rollback;
