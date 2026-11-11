-- T-09 primitives only. T-25 owns reservation-time enforcement.
create function app.rate_limit_hit(key text, window_seconds int, max int)
returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  start_at timestamptz;
begin
  if key is null or key = '' or window_seconds is null or window_seconds < 1 or window_seconds > 86400 or max is null or max < 1 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  start_at := to_timestamp(floor(extract(epoch from statement_timestamp()) / window_seconds) * window_seconds);
  return query
    insert into app.rate_limits as limits (key, window_start, count)
    values (rate_limit_hit.key, start_at, 1)
    on conflict on constraint rate_limits_key_window_start_key do update
      set count = least(limits.count + 1, rate_limit_hit.max::bigint + 1)
    returning limits.count <= rate_limit_hit.max,
      greatest(0::bigint, rate_limit_hit.max - limits.count)::int,
      start_at + make_interval(secs => window_seconds);
end;
$$;

-- Windows are bounded to one day. Preserve every potentially active window.
create function app.cleanup_rate_limits() returns bigint
language sql security definer set search_path = app, public, pg_temp as $$
  with removed as (
    delete from app.rate_limits where window_start < statement_timestamp() - interval '2 days' returning 1
  ) select count(*) from removed;
$$;

-- The explicit timestamp supports deterministic midnight tests; callers omit it.
create function app.add_cost(scope text, micro_usd bigint, at_time timestamptz default statement_timestamp()) returns void
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  if scope is null or micro_usd is null or micro_usd < 0 or at_time is null then
    raise exception 'invalid cost arguments' using errcode = '22023';
  end if;
  insert into app.cost_counters as counters (scope, day, micro_usd)
  values (add_cost.scope, (at_time at time zone 'Europe/Istanbul')::date, add_cost.micro_usd)
  on conflict on constraint cost_counters_scope_day_key do update
    set micro_usd = counters.micro_usd + excluded.micro_usd;
end;
$$;

-- Validated caps come from the shared registry/cache. No duplicate SQL defaults.
-- numeric addition avoids bigint overflow while comparing estimates and totals.
create function app.cap_status(user_id uuid, provider text, est_micro_usd bigint,
  user_cap bigint, provider_cap bigint, global_cap bigint)
returns table(exceeded text[], user_total text, provider_total text, global_total text)
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  today date := (statement_timestamp() at time zone 'Europe/Istanbul')::date;
  u bigint;
  p bigint;
  g bigint;
begin
  if user_id is null or provider is null or provider = '' or est_micro_usd is null or est_micro_usd < 0
    or user_cap is null or user_cap < 0 or provider_cap is null or provider_cap < 0 or global_cap is null or global_cap < 0 then
    raise exception 'invalid cap arguments' using errcode = '22023';
  end if;
  select coalesce(max(micro_usd) filter (where scope = 'user:' || user_id::text), 0),
    coalesce(max(micro_usd) filter (where scope = 'provider:' || provider), 0),
    coalesce(max(micro_usd) filter (where scope = 'global'), 0)
  into u, p, g from app.cost_counters where day = today
    and scope in ('user:' || user_id::text, 'provider:' || provider, 'global');
  return query select array_remove(array[
    case when u::numeric + est_micro_usd > user_cap then 'user' end,
    case when p::numeric + est_micro_usd > provider_cap then 'provider' end,
    case when g::numeric + est_micro_usd > global_cap then 'global' end
  ], null), u::text, p::text, g::text;
end;
$$;

revoke all on function app.rate_limit_hit(text, int, int), app.cleanup_rate_limits(), app.add_cost(text, bigint, timestamptz), app.cap_status(uuid, text, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function app.rate_limit_hit(text, int, int), app.cleanup_rate_limits(), app.add_cost(text, bigint, timestamptz), app.cap_status(uuid, text, bigint, bigint, bigint, bigint) to service_role;
