-- T-06: provision identity rows without overwriting existing seeded profiles.
create function app.create_auth_profile() returns trigger
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare
  generated_handle text := 'user_' || left(replace(new.id::text, '-', ''), 12);
  violated_constraint text;
begin
  -- Keep the deterministic first candidate; retry only handle collisions.
  -- Five total attempts: never let signup commit without a profile.
  for attempt in 1..5 loop
    begin
      insert into public.profiles (id, handle, display_name, locale, is_adult, status)
      values (new.id, generated_handle, generated_handle,
        case when new.raw_user_meta_data->>'locale' in ('tr', 'en') then new.raw_user_meta_data->>'locale' else 'en' end,
        false, 'active') on conflict (id) do nothing;
      exit;
    exception when unique_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      if violated_constraint <> 'profiles_handle_key' or attempt = 5 then
        raise;
      end if;
      generated_handle := 'user_' || encode(extensions.gen_random_bytes(6), 'hex');
    end;
  end loop;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
alter function app.create_auth_profile() owner to postgres;
create trigger create_auth_profile after insert on auth.users
for each row execute function app.create_auth_profile();

create table app.signup_blocks (
  email_hash text primary key check (email_hash ~ '^[a-f0-9]{64}$'),
  blocked_until timestamptz not null
);
alter table app.signup_blocks enable row level security;
grant select, insert, update, delete on app.signup_blocks to service_role;

create function app.before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  if exists (select 1 from app.signup_blocks
    where email_hash = encode(extensions.digest(lower(btrim(event->'user'->>'email')), 'sha256'), 'hex')
      and blocked_until > now()) then
    return '{"error":{"http_code":403,"message":"Unable to create account."}}'::jsonb;
  end if;
  return '{}'::jsonb;
end;
$$;
alter function app.before_user_created(jsonb) owner to postgres;

-- Serialize consent writes per user; append history and mirror flags atomically.
create function app.record_consent(p_user_id uuid, p_kind text, p_version text, p_granted boolean, p_source text)
returns void language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if p_source not in ('web', 'ios', 'android') then raise exception 'Invalid source'; end if;
  insert into public.consents (user_id, kind, version, granted, source, at)
    values (p_user_id, p_kind, p_version, p_granted, p_source, clock_timestamp());
  if p_kind = 'marketing' then
    update public.user_settings set marketing_email_opt_in = p_granted where user_id = p_user_id;
  elsif p_kind = 'analytics' then
    update public.user_settings set analytics_consent = p_granted where user_id = p_user_id;
  end if;
end;
$$;
alter function app.record_consent(uuid, text, text, boolean, text) owner to postgres;
revoke update, delete, truncate on public.consents from service_role;
revoke execute on all functions in schema app from public;
revoke all on function app.before_user_created(jsonb) from anon, authenticated, service_role;
grant usage on schema app to supabase_auth_admin;
grant execute on function app.before_user_created(jsonb) to supabase_auth_admin;
grant execute on function app.create_auth_profile() to service_role;
grant execute on function app.record_consent(uuid, text, text, boolean, text) to service_role;
