-- T-18: synchronous lyricist calls (TD-10) use start_job for admission and
-- Idempotency-Key replay, and finish atomically with settle or release.

create or replace function app.start_job(p_user_id uuid, p_operation text, p_model_id text, p_amount bigint, p_idem_key text, p_concurrency_limit integer)
returns public.generation_jobs
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare j public.generation_jobs; r app.credit_reservations; lyricist boolean := p_operation in ('lyrics','rewrite');
begin
  perform app.lock_credit_account(p_user_id);
  if p_operation is null or p_operation not in ('lyrics','rewrite','generate','extend','remix','stems','cover','video','align')
    or p_model_id is null or not exists(select 1 from public.models where id = p_model_id)
    or p_amount is null or p_amount <= 0 or p_idem_key is null or p_idem_key = ''
    or p_concurrency_limit is null or p_concurrency_limit < 1 then raise exception 'invalid job' using errcode = 'SS004'; end if;
  select * into j from public.generation_jobs where user_id = p_user_id and idempotency_key = p_idem_key;
  if found then
    select * into r from app.credit_reservations where id = j.reservation_id;
    if r.id is null or j.operation <> p_operation or j.model_id is distinct from p_model_id or r.amount <> p_amount or r.start_concurrency_limit is distinct from p_concurrency_limit then
      raise exception 'idempotency mismatch' using errcode = 'SS004';
    end if;
    return j;
  end if;
  if exists (select 1 from app.moderation_account_status(p_user_id) s
    where s.status in ('suspended','banned','deleted') or (s.status = 'cooldown' and s.cooldown_until > now())) then
    raise exception 'account restricted' using errcode = 'SS002';
  end if;
  -- Lyricist calls are synchronous and do not count towards the music limit.
  if p_operation in ('generate','extend','remix','stems') and (select count(*) from public.generation_jobs
    where user_id = p_user_id and operation in ('generate','extend','remix','stems')
      and status not in ('ready','failed','refunded','cancelled')) >= p_concurrency_limit then
    raise exception 'concurrency limit' using errcode = 'SS003';
  end if;
  -- A lyricist request lasts at most two 30 s model calls; a crashed request's
  -- hold is released by expire_reservations within the sweeper interval.
  r := app.reserve_credits(p_user_id,null,p_amount,'job:'||p_user_id||':'||p_idem_key,
    case when lyricist then interval '5 minutes' else interval '30 minutes' end);
  if r.status <> 'active' or r.job_id is not null then raise exception 'invalid reservation' using errcode = 'SS004'; end if;
  insert into public.generation_jobs(user_id,operation,model_id,reservation_id,idempotency_key,status)
    values(p_user_id,p_operation,p_model_id,r.id,p_idem_key,case when lyricist then 'running' else 'queued' end) returning * into j;
  update app.credit_reservations set job_id = j.id, start_concurrency_limit = p_concurrency_limit where id = r.id;
  return j;
end;
$$;

-- Lyricist jobs never run in a worker, so an expired hold always ends them.
create or replace function app.expire_reservations() returns integer
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare candidate record; r app.credit_reservations; job public.generation_jobs; expired integer := 0;
begin
  -- Global deterministic account order prevents competing sweeps deadlocking.
  for candidate in select id,user_id from app.credit_reservations where status = 'active' and expires_at <= now() order by user_id,id loop
    perform app.lock_credit_account(candidate.user_id);
    select * into r from app.credit_reservations where id = candidate.id for update;
    if r.status <> 'active' or r.expires_at > now() then continue; end if;
    job := null;
    -- Hold the job lock through expiry, serializing a concurrent transition to running.
    select * into job from public.generation_jobs where id = r.job_id for update;
    if job.status in ('running','finishing') and job.operation not in ('lyrics','rewrite') then continue; end if;
    perform app.release_reservation(r.id,'expired');
    update app.credit_reservations set status = 'expired' where id = r.id;
    if job.operation in ('lyrics','rewrite') and job.status not in ('ready','failed','refunded','cancelled') then
      update public.generation_jobs set status = 'failed', error_code = 'PROVIDER_TIMEOUT' where id = job.id;
    end if;
    expired := expired + 1;
  end loop;
  return expired;
end;
$$;

-- Stores the request's body hash before the model call so a replay with a
-- different body is refused (TRD §9 idempotency).
create function app.claim_lyricist_job(p_job_id uuid, p_body_sha256 text) returns public.generation_jobs
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare j public.generation_jobs;
begin
  if p_body_sha256 is null or length(p_body_sha256) <> 64 or p_body_sha256 ~ '[^a-f0-9]' then
    raise exception 'invalid hash' using errcode = 'SS004';
  end if;
  select * into j from public.generation_jobs where id = p_job_id for update;
  if not found or j.operation not in ('lyrics','rewrite') then raise exception 'invalid job' using errcode = 'SS004'; end if;
  if j.steps ? 'lyricist' then return j; end if;
  update public.generation_jobs set steps = jsonb_set(steps, '{lyricist}', jsonb_build_object('bodySha256', p_body_sha256)),
    heartbeat_at = now() where id = j.id returning * into j;
  return j;
end;
$$;

-- Success: charge the full price and store the result in one transaction.
create function app.complete_lyricist_job(p_job_id uuid, p_result jsonb) returns public.generation_jobs
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare j public.generation_jobs; r app.credit_reservations;
begin
  select * into j from public.generation_jobs where id = p_job_id;
  if not found or j.operation not in ('lyrics','rewrite') or p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'invalid job' using errcode = 'SS004';
  end if;
  perform app.lock_credit_account(j.user_id);
  select * into j from public.generation_jobs where id = p_job_id for update;
  if j.status = 'ready' then return j; end if;
  if j.status <> 'running' then raise exception 'job not running' using errcode = 'SS004'; end if;
  select * into r from app.credit_reservations where id = j.reservation_id;
  if r.status <> 'active' then raise exception 'reservation not active' using errcode = 'SS004'; end if;
  perform app.settle_reservation(r.id, r.amount);
  update public.generation_jobs set status = 'ready', heartbeat_at = now(),
    steps = jsonb_set(steps, '{lyricist,result}', p_result, true)
    where id = j.id returning * into j;
  return j;
end;
$$;

-- Failure: release the hold (FR-10) and record a catalogue error code.
create function app.fail_lyricist_job(p_job_id uuid, p_error_code text) returns public.generation_jobs
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id = p_job_id;
  if not found or j.operation not in ('lyrics','rewrite') or p_error_code is null or p_error_code !~ '^[A-Z_]{1,40}$' then
    raise exception 'invalid job' using errcode = 'SS004';
  end if;
  perform app.lock_credit_account(j.user_id);
  select * into j from public.generation_jobs where id = p_job_id for update;
  if j.status in ('ready','failed','refunded','cancelled') then return j; end if;
  if j.reservation_id is not null then perform app.release_reservation(j.reservation_id, 'lyricist_failed'); end if;
  update public.generation_jobs set status = 'failed', error_code = p_error_code, heartbeat_at = now()
    where id = j.id returning * into j;
  return j;
end;
$$;

create or replace function app.record_moderation_decision(
  p_user_id uuid, p_surface text, p_input_sha256 text, p_policy_version text,
  p_layers jsonb, p_category text, p_severity text, p_action text,
  p_latency_ms integer,
  p_window_seconds integer, p_cooldown_threshold integer,
  p_cooldown_seconds integer, p_suspend_threshold integer,
  p_classifier_model text default null, p_text text default null
) returns table(decision_id uuid, case_id uuid)
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  current_status text;
  decision uuid;
  review_case uuid;
  block_count bigint;
  recorded_at timestamptz;
  -- T-18: a model's output is not the user's input. Output decisions keep
  -- evidence and open a review case for hard blocks, but never count towards
  -- friction or suspend the account.
  model_output boolean := p_surface like 'output\_%';
begin
  if p_window_seconds is null or p_window_seconds < 1
    or p_cooldown_threshold is null or p_cooldown_threshold < 1
    or p_cooldown_seconds is null or p_cooldown_seconds < 1
    or p_suspend_threshold is null or p_suspend_threshold < 1
    or p_input_sha256 is null or length(p_input_sha256) <> 64 or p_input_sha256 ~ '[^a-f0-9]'
    or p_policy_version is null or p_policy_version = ''
    or p_layers is null or jsonb_typeof(p_layers) <> 'object'
    or p_severity is null or p_severity not in ('none','low','high','critical')
    or p_latency_ms is null or p_latency_ms < 0
    or p_category is null or p_action is null
    or p_action <> (case
      when p_category in ('minor_sexual','threat','terrorism','private_data') then 'hard_block'
      when p_category in ('sexual_explicit','hate','harassment','self_harm','serious_crime','artist_impersonation','copyrighted_lyrics','spam','classifier_error') then 'block'
      when p_category = 'explicit' then 'allow_explicit'
      when p_category = 'none' then 'allow'
      else 'invalid'
    end) then
    raise exception 'invalid moderation arguments' using errcode = '22023';
  end if;
  -- Serialize before inserting/counting so concurrent calls see committed predecessors.
  select p.status into current_status from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'profile missing' using errcode = '22023'; end if;
  recorded_at := clock_timestamp();
  insert into app.moderation_decisions (user_id,surface,input_sha256,policy_version,layers,category,severity,action,classifier_model,latency_ms,created_at)
    values (p_user_id,p_surface,p_input_sha256,p_policy_version,p_layers,p_category,p_severity,p_action,p_classifier_model,p_latency_ms,recorded_at)
    returning id into decision;
  if p_action = 'hard_block' then
    insert into restricted.moderation_evidence (decision_id,text,expires_at) values (decision,p_text,null);
    insert into app.moderation_cases (kind,subject_user_id,target,priority,status)
      values ('hard_block',p_user_id,to_jsonb(decision),'critical','open') returning id into review_case;
    if not model_output then
      update public.profiles set status = 'suspended', cooldown_until = null
        where id = p_user_id and status not in ('suspended','banned','deleted');
    end if;
  elsif p_action = 'block' and p_category <> 'classifier_error' and model_output then
    insert into restricted.moderation_evidence (decision_id,text) values (decision,p_text);
  elsif p_action = 'block' and p_category <> 'classifier_error' then
    insert into restricted.moderation_evidence (decision_id,text) values (decision,p_text);
    select count(*) into block_count from app.moderation_decisions
      where user_id = p_user_id and action in ('block','hard_block') and category <> 'classifier_error'
        and surface not like 'output\_%'
        and created_at >= recorded_at - make_interval(secs => p_window_seconds);
    if current_status not in ('suspended','banned','deleted') then
      if block_count >= p_suspend_threshold then
        update public.profiles set status = 'suspended', cooldown_until = null where id = p_user_id;
        insert into app.moderation_cases (kind,subject_user_id,target,priority,status)
          values ('flag',p_user_id,to_jsonb(decision),'high','open') returning id into review_case;
      elsif block_count >= p_cooldown_threshold then
        update public.profiles set status = 'cooldown',
          cooldown_until = greatest(cooldown_until, recorded_at + make_interval(secs => p_cooldown_seconds))
          where id = p_user_id;
      end if;
    end if;
  end if;
  return query select decision, review_case;
end;
$$;
revoke execute on all functions in schema app from public;
revoke all on function app.claim_lyricist_job(uuid,text), app.complete_lyricist_job(uuid,jsonb),
  app.fail_lyricist_job(uuid,text) from anon, authenticated;
grant execute on function app.claim_lyricist_job(uuid,text), app.complete_lyricist_job(uuid,jsonb),
  app.fail_lyricist_job(uuid,text) to service_role;
