-- T-04: schema and read policies only; backend behavior arrives in later tasks.
create table app.moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  surface text not null check (surface in ('description', 'lyrics', 'style', 'rewrite_instruction', 'cover_instruction', 'gift', 'title', 'profile', 'output_lyrics', 'output_image', 'output_transcript')),
  input_sha256 text not null,
  policy_version text not null,
  layers jsonb not null,
  category text not null,
  severity text not null,
  action text not null check (action in ('allow', 'allow_explicit', 'block', 'hard_block')),
  classifier_model text references public.models(id) on delete restrict,
  latency_ms integer check (latency_ms >= 0),
  created_at timestamptz not null default now()
);
alter table app.moderation_decisions enable row level security;
revoke all on app.moderation_decisions from service_role;
grant select, insert, update, delete on app.moderation_decisions to service_role;

create index moderation_decisions_user_id_created_at_idx on app.moderation_decisions (user_id, created_at);
create index moderation_decisions_input_sha256_idx on app.moderation_decisions (input_sha256);
create index moderation_decisions_classifier_model_idx on app.moderation_decisions (classifier_model);
alter table public.songs add constraint songs_moderation_decision_fk foreign key (moderation_decision_id) references app.moderation_decisions(id) on delete restrict;
create table restricted.moderation_evidence (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references app.moderation_decisions(id) on delete restrict,
  text text not null,
  -- Null expiry is a legal hold; retention handling belongs to T-15/T-40.
  expires_at timestamptz default (now() + interval '90 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table restricted.moderation_evidence enable row level security;
revoke all on restricted.moderation_evidence from service_role;
grant select, insert, update, delete on restricted.moderation_evidence to service_role;
create trigger set_updated_at before update on restricted.moderation_evidence
for each row execute function app.set_updated_at();

create index moderation_evidence_decision_id_idx on restricted.moderation_evidence (decision_id);
create index moderation_evidence_expires_at_idx on restricted.moderation_evidence (expires_at);
create table app.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_kind text not null,
  target_id uuid not null,
  reason text not null,
  note text,
  status text not null,
  priority text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.reports enable row level security;
revoke all on app.reports from service_role;
grant select, insert, update, delete on app.reports to service_role;
create trigger set_updated_at before update on app.reports
for each row execute function app.set_updated_at();

create index reports_reporter_id_idx on app.reports (reporter_id);
create index reports_target_kind_target_id_idx on app.reports (target_kind, target_id);
create index reports_status_priority_idx on app.reports (status, priority);
create table app.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('report', 'hard_block', 'flag', 'appeal')),
  subject_user_id uuid references public.profiles(id) on delete set null,
  target jsonb not null,
  priority text not null,
  status text not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.moderation_cases enable row level security;
revoke all on app.moderation_cases from service_role;
grant select, insert, update, delete on app.moderation_cases to service_role;
create trigger set_updated_at before update on app.moderation_cases
for each row execute function app.set_updated_at();

create index moderation_cases_subject_user_id_idx on app.moderation_cases (subject_user_id);
create index moderation_cases_assigned_to_idx on app.moderation_cases (assigned_to);
create index moderation_cases_status_priority_idx on app.moderation_cases (status, priority);
create table app.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.moderation_cases(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  reason_code text not null,
  reason_text text,
  notice_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.moderation_actions enable row level security;
revoke all on app.moderation_actions from service_role;
grant select, insert, update, delete on app.moderation_actions to service_role;
create trigger set_updated_at before update on app.moderation_actions
for each row execute function app.set_updated_at();

create index moderation_actions_case_id_idx on app.moderation_actions (case_id);
create index moderation_actions_actor_id_idx on app.moderation_actions (actor_id);
create table app.appeals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references app.moderation_actions(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete set null,
  text text not null,
  decided_by uuid references public.profiles(id) on delete set null,
  outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table app.appeals enable row level security;
revoke all on app.appeals from service_role;
grant select, insert, update, delete on app.appeals to service_role;
create trigger set_updated_at before update on app.appeals
for each row execute function app.set_updated_at();

create index appeals_action_id_idx on app.appeals (action_id);
create index appeals_user_id_idx on app.appeals (user_id);
create index appeals_decided_by_idx on app.appeals (decided_by);
