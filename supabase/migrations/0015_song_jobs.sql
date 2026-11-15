-- T-19: song generation jobs end to end (TRD §9.3, §12.1).

-- Private bucket for owner audio; public renditions arrive with T-36.
insert into storage.buckets (id, name, public) values ('private-media', 'private-media', false)
on conflict (id) do nothing;

-- One asset row per song, kind and label, so a retried store step updates it.
alter table public.song_assets add constraint song_assets_song_kind_label_key unique nulls not distinct (song_id, kind, label);

-- Called by POST /v1/songs right after start_job, in one transaction: stores
-- the request (Postgres is the source of truth; Redis gets IDs only), creates
-- the pending song and records the route. A replay keeps the first values.
create function app.claim_song_job(p_job_id uuid, p_body_sha256 text, p_request jsonb, p_route jsonb, p_correlation_id uuid, p_song jsonb)
returns public.generation_jobs
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare j public.generation_jobs; song uuid;
begin
  if p_body_sha256 is null or length(p_body_sha256) <> 64 or p_body_sha256 ~ '[^a-f0-9]'
    or p_request is null or jsonb_typeof(p_request) <> 'object'
    or p_route is null or jsonb_typeof(p_route) <> 'object'
    or p_song is null or jsonb_typeof(p_song) <> 'object' or coalesce(btrim(p_song->>'title'), '') = '' then
    raise exception 'invalid song job' using errcode = 'SS004';
  end if;
  select * into j from public.generation_jobs where id = p_job_id for update;
  if not found or j.operation <> 'generate' then raise exception 'invalid job' using errcode = 'SS004'; end if;
  if j.steps ? 'request' then return j; end if;
  insert into public.songs (owner_id, title, lyrics, sections, language, style, instrumental, explicit, model_id, moderation_decision_id, status)
    values (j.user_id, p_song->>'title', coalesce(p_song->>'lyrics', ''), coalesce(p_song->'sections', '[]'),
      p_song->>'language', coalesce(p_song->'style', '{}'), coalesce((p_song->>'instrumental')::boolean, false),
      coalesce((p_song->>'explicit')::boolean, false), j.model_id, (p_song->>'moderation_decision_id')::uuid, 'pending')
    returning id into song;
  update public.generation_jobs set song_id = song, route_reason = p_route, correlation_id = p_correlation_id,
    steps = steps || jsonb_build_object('bodySha256', p_body_sha256, 'request', p_request)
    where id = j.id returning * into j;
  return j;
end;
$$;

-- Success: charge the used model's price (never more than the hold, FR-29),
-- record the assets and mark song and job ready, in one transaction.
create function app.complete_song_job(p_job_id uuid, p_model_id text, p_duration_ms integer, p_assets jsonb)
returns public.generation_jobs
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare j public.generation_jobs; r app.credit_reservations; price bigint; charged bigint; asset jsonb;
begin
  select * into j from public.generation_jobs where id = p_job_id;
  if not found or j.operation <> 'generate' or j.song_id is null or p_duration_ms is null or p_duration_ms < 0
    or p_assets is null or jsonb_typeof(p_assets) <> 'array' or jsonb_array_length(p_assets) = 0 then
    raise exception 'invalid song job' using errcode = 'SS004';
  end if;
  perform app.lock_credit_account(j.user_id);
  select * into j from public.generation_jobs where id = p_job_id for update;
  if j.status = 'ready' then return j; end if;
  if j.status not in ('queued','running','finishing') then raise exception 'job not running' using errcode = 'SS004'; end if;
  select * into r from app.credit_reservations where id = j.reservation_id;
  if r.status <> 'active' then raise exception 'reservation not active' using errcode = 'SS004'; end if;
  select credits into price from public.model_prices where model_id = p_model_id and operation = j.operation;
  if price is null then raise exception 'model not priced' using errcode = 'SS004'; end if;
  charged := least(price, r.amount);
  perform app.settle_reservation(r.id, charged);
  for asset in select * from jsonb_array_elements(p_assets) loop
    insert into public.song_assets (song_id, kind, label, bucket, path, bytes, sha256)
      values (j.song_id, asset->>'kind', asset->>'label', asset->>'bucket', asset->>'path', (asset->>'bytes')::bigint, asset->>'sha256')
      on conflict (song_id, kind, label) do update set bucket = excluded.bucket, path = excluded.path, bytes = excluded.bytes, sha256 = excluded.sha256;
  end loop;
  update public.songs set status = 'ready', model_id = p_model_id, duration_ms = p_duration_ms, credit_cost = charged
    where id = j.song_id;
  update public.generation_jobs set status = 'ready', model_id = p_model_id, stage_detail = 'ready', heartbeat_at = now()
    where id = j.id returning * into j;
  return j;
end;
$$;

-- Failure that is not the user's fault (FR-10): release the hold, mark the job
-- refunded and the song failed. Also used by the sweeper after recoveries.
create function app.fail_song_job(p_job_id uuid, p_error_code text)
returns public.generation_jobs
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare j public.generation_jobs;
begin
  select * into j from public.generation_jobs where id = p_job_id;
  if not found or j.operation <> 'generate' or p_error_code is null or p_error_code !~ '^[A-Z_]{1,40}$' then
    raise exception 'invalid job' using errcode = 'SS004';
  end if;
  perform app.lock_credit_account(j.user_id);
  select * into j from public.generation_jobs where id = p_job_id for update;
  if j.status in ('ready','refunded','cancelled') then return j; end if;
  if j.reservation_id is not null then perform app.release_reservation(j.reservation_id, 'job_failed'); end if;
  update public.songs set status = 'failed' where id = j.song_id and status = 'pending';
  update public.generation_jobs set status = 'refunded', error_code = coalesce(j.error_code, p_error_code),
    stage_detail = 'failed', heartbeat_at = now()
    where id = j.id returning * into j;
  return j;
end;
$$;

revoke execute on all functions in schema app from public;
revoke all on function app.claim_song_job(uuid,text,jsonb,jsonb,uuid,jsonb), app.complete_song_job(uuid,text,integer,jsonb),
  app.fail_song_job(uuid,text) from anon, authenticated;
grant execute on function app.claim_song_job(uuid,text,jsonb,jsonb,uuid,jsonb), app.complete_song_job(uuid,text,integer,jsonb),
  app.fail_song_job(uuid,text) to service_role;
