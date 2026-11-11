-- T-08: Postgres remains authoritative across Redis loss.
alter table public.generation_jobs add column recoveries integer not null default 0 check (recoveries >= 0);

create function app.save_job_step(job_id uuid, step text, value jsonb)
returns void language plpgsql security definer set search_path = app, public, pg_temp
as $$
begin
  if step is null or step !~ '^[a-z][a-z0-9_]{0,63}$' or value is null then
    raise exception 'invalid step' using errcode = '22023';
  end if;
  update public.generation_jobs j
  set steps = jsonb_set(jsonb_set(j.steps, '{done}', coalesce(j.steps->'done', '{}'::jsonb)), array['done', step], value), heartbeat_at = now()
  where j.id = job_id;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
end;
$$;

create function app.touch_job(job_id uuid, stage_detail text)
returns void language plpgsql security definer set search_path = app, public, pg_temp
as $$
begin
  update public.generation_jobs j set heartbeat_at = now(), stage_detail = touch_job.stage_detail where j.id = job_id;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
end;
$$;

create function app.record_job_recovery(job_id uuid)
returns integer language plpgsql security definer set search_path = app, public, pg_temp
as $$
declare recovery_count integer;
begin
  -- Serialize claims and refresh the heartbeat so concurrent sweepers cannot
  -- count the same stale observation twice. NULL means another actor won.
  update public.generation_jobs j set recoveries = j.recoveries + 1, heartbeat_at = now()
  where j.id = job_id and j.status in ('queued', 'moderating', 'running', 'finishing')
    and j.heartbeat_at < now() - interval '15 minutes'
  returning j.recoveries into recovery_count;
  return recovery_count;
end;
$$;
revoke all on function app.save_job_step(uuid, text, jsonb), app.touch_job(uuid, text), app.record_job_recovery(uuid) from public, anon, authenticated;
grant execute on function app.save_job_step(uuid, text, jsonb), app.touch_job(uuid, text), app.record_job_recovery(uuid) to service_role;
