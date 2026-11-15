-- T-15: legal holds have no expiry; notifications owns the admin e-mail alert.
alter table public.profiles add column cooldown_until timestamptz;
create index moderation_decisions_cache_idx on app.moderation_decisions (user_id, input_sha256, created_at desc);

create function app.moderation_account_status(p_user_id uuid)
returns table(status text, cooldown_until timestamptz)
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile missing' using errcode = '22023'; end if;
  update public.profiles p set status = 'active', cooldown_until = null
    where p.id = p_user_id and p.status = 'cooldown' and p.cooldown_until <= clock_timestamp();
  return query select p.status, p.cooldown_until from public.profiles p where p.id = p_user_id;
end;
$$;

create function app.record_moderation_decision(
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
    update public.profiles set status = 'suspended', cooldown_until = null
      where id = p_user_id and status not in ('suspended','banned','deleted');
  elsif p_action = 'block' and p_category <> 'classifier_error' then
    insert into restricted.moderation_evidence (decision_id,text) values (decision,p_text);
    select count(*) into block_count from app.moderation_decisions
      where user_id = p_user_id and action in ('block','hard_block') and category <> 'classifier_error'
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
revoke all on function app.moderation_account_status(uuid), app.record_moderation_decision(uuid,text,text,text,jsonb,text,text,text,integer,integer,integer,integer,integer,text,text) from anon, authenticated;
grant execute on function app.moderation_account_status(uuid), app.record_moderation_decision(uuid,text,text,text,jsonb,text,text,text,integer,integer,integer,integer,integer,text,text) to service_role;
