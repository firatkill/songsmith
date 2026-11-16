-- T-21: service-only mutations; authenticated clients retain own-row reads.
alter table public.notifications add column dedupe_key text;
alter table public.notifications add column deliveries jsonb not null default '{}' check (jsonb_typeof(deliveries) = 'object');
create unique index notifications_dedupe_idx on public.notifications (user_id, kind, dedupe_key);
create index notifications_page_idx on public.notifications (user_id, created_at desc, id desc);
revoke insert, update, delete on public.notifications from anon, authenticated;
-- Existing explicit service-role grants are retained (0005).
