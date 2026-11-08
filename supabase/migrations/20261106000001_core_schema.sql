-- AwaazOps core schema.
-- Conventions: text IDs match the domain ("ORD-4821", "R-1043"); enumerations are CHECK constraints whose
-- values mirror src/domain (a unit test keeps them in sync); every table has row-level security enabled.
-- Writes happen server-side only (service role / SECURITY DEFINER functions); signed-in users only read.

create schema if not exists app;

-- ── Identity helpers (claims are set server-side in auth.users.app_metadata) ─────────────────────────────
create or replace function app.role() returns text
  language sql stable
  as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') $$;

create or replace function app.agent_id() returns text
  language sql stable
  as $$ select (auth.jwt() -> 'app_metadata' ->> 'agent_id') $$;

grant usage on schema app to authenticated;
grant execute on function app.role(), app.agent_id() to authenticated;

-- ── Fleet ─────────────────────────────────────────────────────────────────────────────────────────────
create table public.agents (
  id                 text primary key,
  name               text not null,
  phone_masked       text not null,
  hub                text not null,
  preferred_language text not null
);

create table public.orders (
  id                    text primary key,
  customer_name         text not null,
  customer_phone_masked text not null,
  address_line          text not null,
  locality              text not null,
  city                  text not null,
  pincode               text not null,
  status                text not null check (status in ('OUT_FOR_DELIVERY','ATTEMPTED','RESCHEDULED','DELIVERED','FAILED','ON_HOLD')),
  priority              text not null check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  assigned_agent_id     text references public.agents (id),
  slot_start            timestamptz not null,
  slot_end              timestamptz not null,
  instructions          text,
  updated_at            timestamptz not null default now()
);
create index orders_assigned_agent_idx on public.orders (assigned_agent_id);

-- ── Voice reports and their pipeline artefacts ────────────────────────────────────────────────────────
create sequence public.report_seq start with 1043;

create table public.voice_reports (
  id                  text primary key,
  agent_id            text not null references public.agents (id),
  language            text not null check (language in ('hi','en','hi-en')),
  status              text not null check (status in ('RECORDED','TRANSCRIBED','EXTRACTED','VALIDATED','NEEDS_CLARIFICATION','AWAITING_CONFIRMATION','EDITED','CONFIRMED','EXECUTED','REJECTED','FAILED')),
  audio_path          text,
  audio_duration_ms   integer check (audio_duration_ms >= 0),
  failure_reason      text,
  timings             jsonb not null default '[]'::jsonb,
  timing_source       text not null check (timing_source in ('measured','illustrative')),
  priority            text not null check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  confirmation_prompt text,
  created_at          timestamptz not null,
  updated_at          timestamptz not null
);
create index voice_reports_agent_idx on public.voice_reports (agent_id, created_at desc);
create index voice_reports_status_idx on public.voice_reports (status);

create table public.transcripts (
  report_id  text primary key references public.voice_reports (id) on delete cascade,
  id         text not null,
  text       text not null,
  language   text not null check (language in ('hi','en','hi-en')),
  confidence double precision check (confidence between 0 and 1),
  segments   jsonb not null default '[]'::jsonb,
  provenance jsonb not null
);

create table public.extractions (
  report_id  text primary key references public.voice_reports (id) on delete cascade,
  id         text not null,
  payload    jsonb not null,
  provenance jsonb not null
);

create table public.validations (
  report_id              text primary key references public.voice_reports (id) on delete cascade,
  outcome                text not null check (outcome in ('VERIFIED','NEEDS_CLARIFICATION','REJECTED')),
  checks                 jsonb not null,
  resolved_order_id      text references public.orders (id),
  clarification_question text
);

create table public.operational_actions (
  id           text primary key,
  report_id    text not null unique references public.voice_reports (id),
  order_id     text not null references public.orders (id),
  type         text not null check (type in ('RESCHEDULE','MARK_CUSTOMER_UNAVAILABLE','FLAG_ADDRESS_ISSUE','UPDATE_INSTRUCTIONS','MARK_DELIVERY_FAILED','ESCALATE_TO_DISPATCHER')),
  payload      jsonb not null default '{}'::jsonb,
  status       text not null check (status in ('PENDING','EXECUTED','FAILED')),
  confirmed_by text not null,
  confirmed_at timestamptz not null,
  executed_at  timestamptz
);

-- Synthesized prompt audio lives in Storage; this row ties it to the exact prompt text it was made from.
create table public.prompt_audio (
  report_id    text primary key references public.voice_reports (id) on delete cascade,
  storage_path text not null,
  mime_type    text not null,
  text         text not null,
  provenance   jsonb not null
);

-- ── Append-only audit trail ───────────────────────────────────────────────────────────────────────────
create table public.audit_events (
  seq        bigint generated always as identity primary key,
  id         text not null unique,
  actor_id   text not null,
  actor_role text not null check (actor_role in ('AGENT','DISPATCHER','SYSTEM')),
  entity     text not null check (entity in ('REPORT','ORDER','ACTION')),
  entity_id  text not null,
  report_id  text references public.voice_reports (id),
  event      text not null,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null
);
create index audit_events_report_idx on public.audit_events (report_id);
create index audit_events_created_idx on public.audit_events (created_at desc);

create or replace function app.audit_is_append_only() returns trigger
  language plpgsql
  as $$ begin raise exception 'audit_events is append-only' using errcode = '42501'; end $$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function app.audit_is_append_only();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function app.audit_is_append_only();

-- ── Row-level security: dispatchers read everything, agents read their own, nobody writes directly ───
alter table public.agents              enable row level security;
alter table public.orders              enable row level security;
alter table public.voice_reports       enable row level security;
alter table public.transcripts         enable row level security;
alter table public.extractions         enable row level security;
alter table public.validations         enable row level security;
alter table public.operational_actions enable row level security;
alter table public.prompt_audio        enable row level security;
alter table public.audit_events        enable row level security;

grant select on public.agents, public.orders, public.voice_reports, public.transcripts, public.extractions,
  public.validations, public.operational_actions, public.prompt_audio, public.audit_events to authenticated;

create policy agents_read on public.agents for select to authenticated
  using ((select app.role()) = 'dispatcher' or id = (select app.agent_id()));

create policy orders_read on public.orders for select to authenticated
  using ((select app.role()) = 'dispatcher' or assigned_agent_id = (select app.agent_id()));

create policy reports_read on public.voice_reports for select to authenticated
  using ((select app.role()) = 'dispatcher' or agent_id = (select app.agent_id()));

-- Child tables follow their report.
create policy transcripts_read on public.transcripts for select to authenticated
  using (exists (select 1 from public.voice_reports r where r.id = report_id));
create policy extractions_read on public.extractions for select to authenticated
  using (exists (select 1 from public.voice_reports r where r.id = report_id));
create policy validations_read on public.validations for select to authenticated
  using (exists (select 1 from public.voice_reports r where r.id = report_id));
create policy actions_read on public.operational_actions for select to authenticated
  using (exists (select 1 from public.voice_reports r where r.id = report_id));
create policy prompt_audio_read on public.prompt_audio for select to authenticated
  using (exists (select 1 from public.voice_reports r where r.id = report_id));

create policy audit_read on public.audit_events for select to authenticated
  using ((select app.role()) = 'dispatcher'
         or exists (select 1 from public.voice_reports r where r.id = report_id));

-- ── Private storage buckets (accessed server-side only; no storage policies for end users) ────────────
insert into storage.buckets (id, name, public) values
  ('recordings', 'recordings', false),
  ('prompt-audio', 'prompt-audio', false)
on conflict (id) do nothing;
