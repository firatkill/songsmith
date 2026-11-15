-- T-20: the balance the create flow shows before Generate (FR-08). Read only;
-- available = balance - held is computed here so TypeScript never derives it.
create function app.wallet_summary(p_user_id uuid)
returns table (balance bigint, held bigint, available bigint)
language sql stable security definer set search_path = app, public, pg_temp as $$
  select coalesce(a.balance, 0), coalesce(a.held, 0), coalesce(a.balance - a.held, 0)
  from (select 1) one
  left join app.credit_accounts a on a.user_id = p_user_id
$$;
revoke execute on function app.wallet_summary(uuid) from public, anon, authenticated;
grant execute on function app.wallet_summary(uuid) to service_role;
