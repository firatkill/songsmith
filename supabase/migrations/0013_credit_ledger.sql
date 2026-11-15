-- T-17: internal, append-only credit ledger. Payments and scheduling are later tasks.
create table app.credit_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0,
  held bigint not null default 0 check (held >= 0),
  updated_at timestamptz not null default now()
);
create table app.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  -- Retain immutable history after auth deletion; tombstone policy belongs to T-41.
  user_id uuid not null,
  sequence bigint generated always as identity unique,
  kind text not null check (kind in ('signup_grant','daily_grant','purchase','spend','refund','reversal','expiry','adjustment')),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null,
  ref_kind text not null,
  ref_id uuid,
  idempotency_key text unique not null check (length(idempotency_key) > 0),
  expires_at timestamptz,
  request jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  check ((kind in ('signup_grant','daily_grant','purchase','refund') and amount > 0)
    or (kind in ('spend','reversal','expiry') and amount < 0) or kind = 'adjustment')
);
create index credit_ledger_user_sequence_idx on app.credit_ledger(user_id, sequence);
create unique index credit_refund_once_idx on app.credit_ledger(ref_id) where kind = 'refund';
create table app.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.generation_jobs(id) on delete set null,
  amount bigint not null check (amount > 0),
  status text not null default 'active' check (status in ('active','settled','released','expired')),
  idempotency_key text unique not null check (length(idempotency_key) > 0),
  expires_at timestamptz not null,
  settled_ledger_id uuid references app.credit_ledger(id),
  start_concurrency_limit integer,
  settled_amount bigint check (settled_amount >= 0 and settled_amount <= amount),
  release_reason text,
  request jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);
create index credit_reservations_active_idx on app.credit_reservations(user_id, expires_at) where status = 'active';
alter table public.generation_jobs add constraint generation_jobs_reservation_fk
  foreign key (reservation_id) references app.credit_reservations(id) on delete set null;
create table app.credit_lots (
  ledger_id uuid primary key references app.credit_ledger(id),
  user_id uuid not null,
  remaining bigint not null check (remaining >= 0),
  expires_at timestamptz
);
create index credit_lots_user_expiry_idx on app.credit_lots(user_id, expires_at) where remaining > 0;
create table app.signup_grants (
  email_hash text primary key check (email_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null,
  granted_at timestamptz not null default now()
);
alter table app.credit_accounts enable row level security;
revoke all on app.credit_accounts from public, anon, authenticated, service_role;
grant select on app.credit_accounts to service_role;
alter table app.credit_ledger enable row level security;
revoke all on app.credit_ledger from public, anon, authenticated, service_role;
grant select on app.credit_ledger to service_role;
alter table app.credit_reservations enable row level security;
revoke all on app.credit_reservations from public, anon, authenticated, service_role;
grant select on app.credit_reservations to service_role;
alter table app.credit_lots enable row level security;
revoke all on app.credit_lots from public, anon, authenticated, service_role;
grant select on app.credit_lots to service_role;
alter table app.signup_grants enable row level security;
revoke all on app.signup_grants from public, anon, authenticated, service_role;
grant select on app.signup_grants to service_role;
revoke all on sequence app.credit_ledger_sequence_seq from public, anon, authenticated, service_role;
create trigger set_updated_at before update on app.credit_accounts for each row execute function app.set_updated_at();
create trigger set_updated_at before update on app.credit_reservations for each row execute function app.set_updated_at();

create function app.reject_credit_mutation() returns trigger
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  raise exception 'credit ledger is append-only' using errcode = 'SS004';
end;
$$;
create trigger credit_ledger_append_only before update or delete or truncate on app.credit_ledger
for each statement execute function app.reject_credit_mutation();

-- Private helpers are deliberately not executable by service_role.
create function app.lock_credit_account(p_user_id uuid) returns app.credit_accounts
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare a app.credit_accounts;
begin
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'invalid account' using errcode = 'SS004';
  end if;
  insert into app.credit_accounts(user_id) values (p_user_id) on conflict do nothing;
  select * into a from app.credit_accounts where user_id = p_user_id for update;
  return a;
end;
$$;

create function app.consume_credit_lots(p_user_id uuid, p_amount bigint) returns void
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare lot record; needed bigint := p_amount; used bigint;
begin
  perform app.lock_credit_account(p_user_id);
  for lot in select l.* from app.credit_lots l join app.credit_ledger e on e.id = l.ledger_id
    where l.user_id = p_user_id and l.remaining > 0
    order by l.expires_at asc nulls last, e.sequence for update of l loop
    exit when needed = 0;
    used := least(needed, lot.remaining);
    update app.credit_lots set remaining = remaining - used where ledger_id = lot.ledger_id;
    needed := needed - used;
  end loop;
  -- Reversals and guaranteed settlements may exceed the remaining lots.
  -- Debt has no lot; consume only the credits that still exist.
end;
$$;

create function app.post_credit_entry(p_user_id uuid, p_amount bigint, p_kind text,
  p_ref_kind text, p_ref_id uuid, p_idem_key text, p_expires_at timestamptz, p_request jsonb)
returns app.credit_ledger
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare a app.credit_accounts; e app.credit_ledger;
begin
  a := app.lock_credit_account(p_user_id);
  if p_amount is null or p_amount = 0 or p_idem_key is null or p_idem_key = '' or p_ref_kind is null then
    raise exception 'invalid credit arguments' using errcode = 'SS004';
  end if;
  select * into e from app.credit_ledger where idempotency_key = p_idem_key;
  if found then
    if e.user_id <> p_user_id or e.request <> p_request then
      raise exception 'idempotency mismatch' using errcode = 'SS004';
    end if;
    return e;
  end if;
  -- Only settlement posts spends through this private helper. Its reservation
  -- guarantees the charge even if a later reversal reduced the balance.
  if p_amount < 0 and p_kind not in ('reversal','spend') and a.balance - a.held + p_amount < 0 then
    raise exception 'insufficient credits' using errcode = 'SS001';
  end if;
  insert into app.credit_ledger(user_id,kind,amount,balance_after,ref_kind,ref_id,idempotency_key,expires_at,request)
    values(p_user_id,p_kind,p_amount,a.balance+p_amount,p_ref_kind,p_ref_id,p_idem_key,p_expires_at,p_request)
    on conflict (idempotency_key) do nothing returning * into e;
  if not found then
    select * into e from app.credit_ledger where idempotency_key = p_idem_key;
    if e.user_id <> p_user_id or e.request <> p_request then
      raise exception 'idempotency mismatch' using errcode = 'SS004';
    end if;
    return e;
  end if;
  update app.credit_accounts set balance = balance + p_amount where user_id = p_user_id;
  if p_amount > 0 then
    -- Incoming credits first repay debt; only the positive balance creates lots.
    insert into app.credit_lots(ledger_id,user_id,remaining,expires_at) values(e.id,p_user_id,greatest(e.balance_after,0)-greatest(a.balance,0),p_expires_at);
  elsif p_kind <> 'expiry' then
    perform app.consume_credit_lots(p_user_id,-p_amount);
  end if;
  return e;
end;
$$;

create function app.grant_credits(p_user_id uuid, p_amount bigint, p_kind text,
  p_ref_kind text, p_ref_id uuid, p_idem_key text, p_expires_at timestamptz default null)
returns app.credit_ledger
language plpgsql security definer set search_path = app, public, pg_temp as $$
begin
  perform app.lock_credit_account(p_user_id);
  if p_amount is null or p_amount <= 0 or p_kind is null or p_kind not in ('signup_grant','daily_grant') then
    raise exception 'invalid grant' using errcode = 'SS004';
  end if;
  return app.post_credit_entry(p_user_id,p_amount,p_kind,p_ref_kind,p_ref_id,p_idem_key,p_expires_at,
    jsonb_build_array('grant',p_user_id,p_amount,p_kind,p_ref_kind,p_ref_id,p_expires_at));
end;
$$;

create function app.reserve_credits(p_user_id uuid, p_job_id uuid, p_amount bigint,
  p_idem_key text, p_ttl interval default interval '30 minutes') returns app.credit_reservations
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare a app.credit_accounts; r app.credit_reservations; args jsonb;
begin
  a := app.lock_credit_account(p_user_id);
  if p_amount is null or p_amount <= 0 or p_ttl is null or p_ttl <= interval '0'
    or p_idem_key is null or p_idem_key = '' then
    raise exception 'invalid reservation' using errcode = 'SS004';
  end if;
  args := jsonb_build_array(p_user_id,p_job_id,p_amount,p_ttl);
  select * into r from app.credit_reservations where idempotency_key = p_idem_key;
  if found then
    if r.request <> args then raise exception 'idempotency mismatch' using errcode = 'SS004'; end if;
    return r;
  end if;
  if exists (select 1 from app.moderation_account_status(p_user_id) s
    where s.status in ('suspended','banned','deleted') or (s.status = 'cooldown' and s.cooldown_until > now())) then
    raise exception 'account restricted' using errcode = 'SS002';
  end if;
  if p_job_id is not null and not exists (select 1 from public.generation_jobs where id = p_job_id and user_id = p_user_id) then
    raise exception 'invalid job' using errcode = 'SS004';
  end if;
  if a.balance - a.held < p_amount then raise exception 'insufficient credits' using errcode = 'SS001'; end if;
  insert into app.credit_reservations(user_id,job_id,amount,idempotency_key,expires_at,request)
    values(p_user_id,p_job_id,p_amount,p_idem_key,now()+p_ttl,args)
    on conflict (idempotency_key) do nothing returning * into r;
  if not found then
    select * into r from app.credit_reservations where idempotency_key = p_idem_key;
    if r.request <> args then raise exception 'idempotency mismatch' using errcode = 'SS004'; end if;
    return r;
  end if;
  update app.credit_accounts set held = held + p_amount where user_id = p_user_id;
  return r;
end;
$$;

create function app.settle_reservation(p_reservation_id uuid, p_final_amount bigint) returns app.credit_reservations
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare r app.credit_reservations; e app.credit_ledger;
begin
  select * into r from app.credit_reservations where id = p_reservation_id;
  if not found then raise exception 'invalid reservation' using errcode = 'SS004'; end if;
  perform app.lock_credit_account(r.user_id);
  select * into r from app.credit_reservations where id = p_reservation_id for update;
  if p_final_amount is null or p_final_amount < 0 or p_final_amount > r.amount then
    raise exception 'invalid settlement' using errcode = 'SS004';
  end if;
  if r.status = 'settled' then
    if r.settled_amount <> p_final_amount then raise exception 'idempotency mismatch' using errcode = 'SS004'; end if;
    return r;
  end if;
  if r.status <> 'active' then raise exception 'reservation not active' using errcode = 'SS004'; end if;
  update app.credit_accounts set held = held - r.amount where user_id = r.user_id;
  if p_final_amount > 0 then
    e := app.post_credit_entry(r.user_id,-p_final_amount,'spend','reservation',r.id,
      'reservation:'||r.id||':settle',null,jsonb_build_array('settle',r.id,p_final_amount));
  end if;
  update app.credit_reservations set status = 'settled', settled_ledger_id = e.id, settled_amount = p_final_amount
    where id = r.id returning * into r;
  return r;
end;
$$;

create function app.release_reservation(p_reservation_id uuid, p_reason text) returns app.credit_reservations
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare r app.credit_reservations;
begin
  select * into r from app.credit_reservations where id = p_reservation_id;
  if not found then raise exception 'invalid reservation' using errcode = 'SS004'; end if;
  perform app.lock_credit_account(r.user_id);
  select * into r from app.credit_reservations where id = p_reservation_id for update;
  if r.status <> 'active' then return r; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'invalid reason' using errcode = 'SS004'; end if;
  update app.credit_accounts set held = held - r.amount where user_id = r.user_id;
  update app.credit_reservations set status = 'released', release_reason = p_reason where id = r.id returning * into r;
  return r;
end;
$$;

create function app.refund_spend(p_ledger_id uuid, p_reason text, p_idem_key text) returns app.credit_ledger
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare spent app.credit_ledger; refunded app.credit_ledger; args jsonb;
begin
  select * into spent from app.credit_ledger where id = p_ledger_id;
  if not found or spent.kind <> 'spend' then raise exception 'invalid spend' using errcode = 'SS004'; end if;
  perform app.lock_credit_account(spent.user_id);
  if p_reason is null or btrim(p_reason) = '' or p_idem_key is null or p_idem_key = '' then
    raise exception 'invalid refund' using errcode = 'SS004';
  end if;
  args := jsonb_build_array('refund',p_ledger_id,p_reason);
  select * into refunded from app.credit_ledger where idempotency_key = p_idem_key;
  if found then
    if refunded.request <> args then raise exception 'idempotency mismatch' using errcode = 'SS004'; end if;
    return refunded;
  end if;
  select * into refunded from app.credit_ledger where kind = 'refund' and ref_id = p_ledger_id;
  if found then raise exception 'spend already refunded' using errcode = 'SS004'; end if;
  return app.post_credit_entry(spent.user_id,-spent.amount,'refund','spend',spent.id,p_idem_key,null,args);
end;
$$;

create function app.adjust_credits(p_user_id uuid, p_amount bigint, p_actor_id uuid, p_reason text, p_idem_key text)
returns app.credit_ledger
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare e app.credit_ledger; existed boolean;
begin
  perform app.lock_credit_account(p_user_id);
  if p_actor_id is null or p_reason is null or btrim(p_reason) = '' then raise exception 'invalid adjustment' using errcode = 'SS004'; end if;
  existed := exists(select 1 from app.credit_ledger where idempotency_key = p_idem_key);
  e := app.post_credit_entry(p_user_id,p_amount,'adjustment','admin',p_actor_id,p_idem_key,null,
    jsonb_build_array('adjust',p_user_id,p_amount,p_actor_id,p_reason));
  if not existed then
    insert into app.audit_log(actor_id,action,target,diff) values(p_actor_id,'credits.adjust',p_user_id::text,
      jsonb_build_object('reason',p_reason,'amount',p_amount,'balance_before',e.balance_after-p_amount,'balance_after',e.balance_after,'ledger_id',e.id));
  end if;
  return e;
end;
$$;

create function app.start_job(p_user_id uuid, p_operation text, p_model_id text, p_amount bigint, p_idem_key text, p_concurrency_limit integer)
returns public.generation_jobs
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare j public.generation_jobs; r app.credit_reservations;
begin
  perform app.lock_credit_account(p_user_id);
  if p_operation is null or p_operation not in ('generate','extend','remix','stems','cover','video','align')
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
  if p_operation in ('generate','extend','remix','stems') and (select count(*) from public.generation_jobs
    where user_id = p_user_id and operation in ('generate','extend','remix','stems')
      and status not in ('ready','failed','refunded','cancelled')) >= p_concurrency_limit then
    raise exception 'concurrency limit' using errcode = 'SS003';
  end if;
  r := app.reserve_credits(p_user_id,null,p_amount,'job:'||p_user_id||':'||p_idem_key);
  if r.status <> 'active' or r.job_id is not null then raise exception 'invalid reservation' using errcode = 'SS004'; end if;
  insert into public.generation_jobs(user_id,operation,model_id,reservation_id,idempotency_key,status)
    values(p_user_id,p_operation,p_model_id,r.id,p_idem_key,'queued') returning * into j;
  update app.credit_reservations set job_id = j.id, start_concurrency_limit = p_concurrency_limit where id = r.id;
  return j;
end;
$$;

create function app.expire_reservations() returns integer
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare candidate record; r app.credit_reservations; job_status text; expired integer := 0;
begin
  -- Global deterministic account order prevents competing sweeps deadlocking.
  for candidate in select id,user_id from app.credit_reservations where status = 'active' and expires_at <= now() order by user_id,id loop
    perform app.lock_credit_account(candidate.user_id);
    select * into r from app.credit_reservations where id = candidate.id for update;
    if r.status <> 'active' or r.expires_at > now() then continue; end if;
    job_status := null;
    -- Hold the job lock through expiry, serializing a concurrent transition to running.
    select status into job_status from public.generation_jobs where id = r.job_id for update;
    if job_status in ('running','finishing') then continue; end if;
    perform app.release_reservation(r.id,'expired');
    update app.credit_reservations set status = 'expired' where id = r.id;
    expired := expired + 1;
  end loop;
  return expired;
end;
$$;

create function app.reconcile_credits() returns table(user_id uuid, "check" text, expected numeric, actual numeric)
language sql security definer set search_path = app, public, pg_temp as $$
  -- A single statement snapshot avoids false positives during concurrent commits.
  with totals as (
    select a.*, coalesce((select sum(e.amount) from app.credit_ledger e where e.user_id = a.user_id),0) ledger_total,
      coalesce((select sum(r.amount) from app.credit_reservations r where r.user_id = a.user_id and r.status = 'active'),0) reserved_total,
      coalesce((select sum(l.remaining) from app.credit_lots l where l.user_id = a.user_id),0) lot_total
    from app.credit_accounts a
  ), chain as (
    select e.user_id,e.balance_after,sum(e.amount) over (partition by e.user_id order by e.sequence) total from app.credit_ledger e
  )
  select t.user_id,'balance',t.ledger_total,t.balance::numeric from totals t where t.balance <> t.ledger_total
  union all select t.user_id,'held',t.reserved_total,t.held::numeric from totals t where t.held <> t.reserved_total
  union all select c.user_id,'balance_after',c.total,c.balance_after::numeric from chain c where c.total <> c.balance_after
  union all select t.user_id,'lots',greatest(t.balance,0)::numeric,t.lot_total from totals t where t.lot_total <> greatest(t.balance,0);
$$;

-- Partial expiry needs another immutable row when held credits become available.
-- The original key is preserved for the first portion; later keys encode the
-- remaining amount observed under the account lock (PRD D-107).
create function app.expire_credits() returns integer
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare candidate record; lot app.credit_lots; a app.credit_accounts;
  amount_to_expire bigint; entry_key text; expired integer := 0;
begin
  for candidate in select l.ledger_id,l.user_id from app.credit_lots l
    join app.credit_ledger e on e.id=l.ledger_id
    join app.credit_accounts account on account.user_id=l.user_id
    where l.expires_at <= now() and l.remaining > 0
    order by l.user_id,l.expires_at,e.sequence loop
    a := app.lock_credit_account(candidate.user_id);
    select * into lot from app.credit_lots where ledger_id=candidate.ledger_id for update;
    if lot.remaining = 0 or lot.expires_at > now() then continue; end if;
    amount_to_expire := least(lot.remaining,greatest(a.balance-a.held,0));
    if amount_to_expire = 0 then continue; end if;
    entry_key := 'expiry:'||lot.ledger_id;
    if exists(select 1 from app.credit_ledger where idempotency_key=entry_key) then
      entry_key := entry_key||':'||lot.remaining;
    end if;
    perform app.post_credit_entry(lot.user_id,-amount_to_expire,'expiry','lot',lot.ledger_id,entry_key,null,
      jsonb_build_array('expiry',lot.ledger_id,lot.remaining,amount_to_expire));
    update app.credit_lots set remaining=remaining-amount_to_expire where ledger_id=lot.ledger_id;
    expired := expired+1;
  end loop;
  return expired;
end;
$$;

create function app.grant_signup_credits() returns trigger
language plpgsql security definer set search_path = app, public, pg_temp as $$
declare credits bigint := 30; hash text; claimed text; configured jsonb;
begin
  if new.email_confirmed_at is null or new.email is null then return new; end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then return new; end if;
  perform app.lock_credit_account(new.id);
  hash := encode(extensions.digest(lower(btrim(new.email)), 'sha256'), 'hex');
  if exists(select 1 from app.credit_ledger where idempotency_key = 'signup:'||new.id and user_id = new.id) then return new; end if;
  select value into configured from app.flags where key = 'signup_grant_credits';
  if jsonb_typeof(configured) = 'number' and configured::text ~ '^[0-9]+$' then
    if configured::numeric between 1 and 2147483647 then credits := configured::text::bigint; end if;
  end if;
  insert into app.signup_grants(email_hash,user_id) values(hash,new.id)
    on conflict do nothing returning email_hash into claimed;
  if claimed is not null then
    perform app.grant_credits(new.id,credits,'signup_grant','signup',new.id,'signup:'||new.id);
  end if;
  return new;
exception when others then
  -- Never include SQLERRM, email, or auth metadata in logs. The subtransaction
  -- rolls back both the eligibility claim and grant, while Auth remains usable.
  raise warning 'signup credit grant failed for user %', new.id;
  return new;
end;
$$;
-- Alphabetical order follows create_auth_profile on INSERT.
create trigger grant_signup_credits after insert or update of email_confirmed_at on auth.users
for each row execute function app.grant_signup_credits();

revoke execute on all functions in schema app from public;
revoke all on function app.reject_credit_mutation(), app.lock_credit_account(uuid),
  app.consume_credit_lots(uuid,bigint), app.post_credit_entry(uuid,bigint,text,text,uuid,text,timestamptz,jsonb),
  app.grant_signup_credits() from anon, authenticated, service_role;
grant execute on function app.grant_credits(uuid,bigint,text,text,uuid,text,timestamptz),
  app.reserve_credits(uuid,uuid,bigint,text,interval), app.start_job(uuid,text,text,bigint,text,integer),
  app.settle_reservation(uuid,bigint), app.release_reservation(uuid,text), app.refund_spend(uuid,text,text),
  app.adjust_credits(uuid,bigint,uuid,text,text), app.expire_reservations(), app.expire_credits(), app.reconcile_credits() to service_role;
