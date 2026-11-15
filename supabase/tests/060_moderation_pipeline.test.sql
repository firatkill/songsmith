begin;
select no_plan();
-- DB-12: moderation decisions, hard-block side effects and friction (TRD §10.2, §10.3).
insert into auth.users (id) values
 ('60000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002'),
 ('60000000-0000-4000-8000-000000000003'),
 ('60000000-0000-4000-8000-000000000004'),
 ('60000000-0000-4000-8000-000000000005');

create function pg_temp.decide(p_user uuid, p_category text, p_action text, p_text text default 'evidence')
returns uuid language sql as $$
  select decision_id from app.record_moderation_decision(
    p_user, 'description', repeat('b', 64), 'v1', '{}'::jsonb, p_category,
    case when p_action = 'hard_block' then 'critical' when p_action = 'block' then 'high' else 'none' end,
    p_action, 0, 86400, 3, 3600, 6, null, p_text)
$$;

-- Privileges: service_role only.
select ok(has_function_privilege('service_role', 'app.record_moderation_decision(uuid,text,text,text,jsonb,text,text,text,integer,integer,integer,integer,integer,text,text)', 'execute'), 'service can record decisions');
select ok(not has_function_privilege('anon', 'app.record_moderation_decision(uuid,text,text,text,jsonb,text,text,text,integer,integer,integer,integer,integer,text,text)', 'execute'), 'anon cannot record decisions');
select ok(not has_function_privilege('authenticated', 'app.record_moderation_decision(uuid,text,text,text,jsonb,text,text,text,integer,integer,integer,integer,integer,text,text)', 'execute'), 'authenticated cannot record decisions');
select ok(not has_function_privilege('authenticated', 'app.moderation_account_status(uuid)', 'execute'), 'authenticated cannot read restriction status');
select ok(has_function_privilege('service_role', 'app.moderation_account_status(uuid)', 'execute'), 'service can read restriction status');

-- Allowed decisions store no text and change nothing.
select pg_temp.decide('60000000-0000-4000-8000-000000000001', 'none', 'allow', null);
select pg_temp.decide('60000000-0000-4000-8000-000000000001', 'explicit', 'allow_explicit', null);
select is((select count(*) from restricted.moderation_evidence e join app.moderation_decisions d on d.id = e.decision_id where d.user_id = '60000000-0000-4000-8000-000000000001'), 0::bigint, 'allowed decisions store no evidence');
select is((select status from public.profiles where id = '60000000-0000-4000-8000-000000000001'), 'active', 'allowed decisions keep the account active');

-- Category and action must agree.
select throws_ok($$select pg_temp.decide('60000000-0000-4000-8000-000000000001', 'hate', 'allow', null)$$, '22023', 'invalid moderation arguments', 'mismatched action is rejected');

-- Hard block: held evidence, critical case, suspension.
select pg_temp.decide('60000000-0000-4000-8000-000000000002', 'minor_sexual', 'hard_block');
select ok((select e.expires_at is null from restricted.moderation_evidence e join app.moderation_decisions d on d.id = e.decision_id where d.user_id = '60000000-0000-4000-8000-000000000002'), 'hard-block evidence is on legal hold');
select results_eq($$select kind, priority, status from app.moderation_cases where subject_user_id = '60000000-0000-4000-8000-000000000002'$$, $$values ('hard_block'::text, 'critical'::text, 'open'::text)$$, 'critical case opened');
select is((select status from public.profiles where id = '60000000-0000-4000-8000-000000000002'), 'suspended', 'hard block suspends');

-- Friction: two blocks stay active, the third starts a cooldown with an end time.
select pg_temp.decide('60000000-0000-4000-8000-000000000003', 'hate', 'block') from generate_series(1, 2);
select is((select status from public.profiles where id = '60000000-0000-4000-8000-000000000003'), 'active', 'two blocks stay active');
select ok((select e.expires_at > now() + interval '89 days' from restricted.moderation_evidence e join app.moderation_decisions d on d.id = e.decision_id where d.user_id = '60000000-0000-4000-8000-000000000003' limit 1), 'block evidence expires after 90 days');
select pg_temp.decide('60000000-0000-4000-8000-000000000003', 'spam', 'block');
select ok((select status = 'cooldown' and cooldown_until > now() + interval '59 minutes' from public.profiles where id = '60000000-0000-4000-8000-000000000003'), 'third block starts a one-hour cooldown');

-- An expired cooldown lapses when the status is read.
update public.profiles set cooldown_until = clock_timestamp() - interval '1 second' where id = '60000000-0000-4000-8000-000000000003';
select results_eq($$select status, cooldown_until from app.moderation_account_status('60000000-0000-4000-8000-000000000003')$$, $$values ('active'::text, null::timestamptz)$$, 'expired cooldown lapses');

-- Classifier errors never count; old blocks leave the window.
select pg_temp.decide('60000000-0000-4000-8000-000000000004', 'classifier_error', 'block', null) from generate_series(1, 5);
select is((select status from public.profiles where id = '60000000-0000-4000-8000-000000000004'), 'active', 'classifier errors do not count');
select pg_temp.decide('60000000-0000-4000-8000-000000000004', 'hate', 'block') from generate_series(1, 2);
update app.moderation_decisions set created_at = created_at - interval '25 hours' where user_id = '60000000-0000-4000-8000-000000000004' and category = 'hate';
select pg_temp.decide('60000000-0000-4000-8000-000000000004', 'hate', 'block');
select is((select status from public.profiles where id = '60000000-0000-4000-8000-000000000004'), 'active', 'blocks older than the window do not count');

-- Six blocks suspend with a review case; suspension is never downgraded.
select pg_temp.decide('60000000-0000-4000-8000-000000000005', 'harassment', 'block') from generate_series(1, 6);
select is((select status from public.profiles where id = '60000000-0000-4000-8000-000000000005'), 'suspended', 'six blocks suspend');
select results_eq($$select kind, priority from app.moderation_cases where subject_user_id = '60000000-0000-4000-8000-000000000005'$$, $$values ('flag'::text, 'high'::text)$$, 'suspension opens one flag case');
select pg_temp.decide('60000000-0000-4000-8000-000000000005', 'harassment', 'block');
select is((select status from public.profiles where id = '60000000-0000-4000-8000-000000000005'), 'suspended', 'later blocks do not downgrade a suspension');
update public.profiles set status = 'banned' where id = '60000000-0000-4000-8000-000000000005';
select pg_temp.decide('60000000-0000-4000-8000-000000000005', 'minor_sexual', 'hard_block');
select is((select status from public.profiles where id = '60000000-0000-4000-8000-000000000005'), 'banned', 'hard block does not downgrade a ban');

select * from finish();
rollback;
