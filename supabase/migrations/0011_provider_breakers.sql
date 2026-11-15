-- T-11: rolling retry window and atomic single-probe admission; no job wiring.
alter table app.provider_health
  add column consecutive_timeouts integer not null default 0 check (consecutive_timeouts >= 0),
  add column failure_times timestamptz[] not null default '{}',
  add column half_open_at timestamptz;

create function app.record_provider_result(provider text, ok boolean, kind text)
returns void language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  h app.provider_health;
  stamp timestamptz := clock_timestamp();
  failures timestamptz[];
  timeouts integer;
  retryable boolean;
begin
  if provider is null or provider !~ '^[a-zA-Z0-9_-]{1,128}$' or ok is null
    or (not ok and (kind is null or kind not in ('timeout','rate_limited','unavailable','rejected_by_provider_policy','invalid_request','unknown'))) then
    raise exception 'invalid provider result' using errcode = '22023';
  end if;
  insert into app.provider_health(provider) values (record_provider_result.provider) on conflict do nothing;
  select * into h from app.provider_health p where p.provider = record_provider_result.provider for update;
  if ok then
    update app.provider_health p set breaker_state = 'closed', opened_at = null,
      half_open_at = null, consecutive_timeouts = 0, failure_times = '{}', failure_count = 0, window_started_at = null
      where p.provider = record_provider_result.provider;
    return;
  end if;
  retryable := kind in ('timeout','rate_limited','unavailable');
  select coalesce(array_agg(t order by t), '{}') into failures from unnest(h.failure_times) t where t > stamp - interval '60 seconds';
  if retryable then failures := array_append(failures, stamp); end if;
  -- Only the last five failures are needed to determine the threshold.
  if cardinality(failures) > 5 then failures := failures[cardinality(failures)-4:cardinality(failures)]; end if;
  timeouts := case when kind = 'timeout' then least(h.consecutive_timeouts + 1, 3) else 0 end;
  update app.provider_health p set
    failure_times = failures, failure_count = cardinality(failures), window_started_at = failures[1], consecutive_timeouts = timeouts,
    breaker_state = case when retryable and (h.breaker_state = 'half_open' or cardinality(failures) >= 5 or timeouts >= 3) then 'open' else h.breaker_state end,
    opened_at = case when retryable and (h.breaker_state = 'half_open' or (h.breaker_state = 'closed' and (cardinality(failures) >= 5 or timeouts >= 3))) then stamp else h.opened_at end,
    -- Non-retryable failures (policy, bad request) mean the provider answered: no breaker change.
    half_open_at = case when retryable then null else h.half_open_at end
    where p.provider = record_provider_result.provider;
end;
$$;
revoke all on function app.record_provider_result(text, boolean, text) from public, anon, authenticated;
grant execute on function app.record_provider_result(text, boolean, text) to service_role;

create function app.claim_provider_probe(provider text)
returns boolean language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  h app.provider_health;
  stamp timestamptz := clock_timestamp();
begin
  if provider is null or provider !~ '^[a-zA-Z0-9_-]{1,128}$' then
    raise exception 'invalid provider' using errcode = '22023';
  end if;
  insert into app.provider_health(provider) values (claim_provider_probe.provider) on conflict do nothing;
  select * into h from app.provider_health p where p.provider = claim_provider_probe.provider for update;
  if h.breaker_state = 'closed' then return true; end if;
  if h.breaker_state = 'open' and h.opened_at <= stamp - interval '120 seconds' then
    update app.provider_health p set breaker_state = 'half_open', half_open_at = stamp where p.provider = claim_provider_probe.provider;
    return true;
  end if;
  -- A probe that never reported (crashed job) must not keep the provider closed forever.
  if h.breaker_state = 'half_open' and h.half_open_at <= stamp - interval '120 seconds' then
    update app.provider_health p set half_open_at = stamp where p.provider = claim_provider_probe.provider;
    return true;
  end if;
  return false;
end;
$$;
revoke all on function app.claim_provider_probe(text) from public, anon, authenticated;
grant execute on function app.claim_provider_probe(text) to service_role;
