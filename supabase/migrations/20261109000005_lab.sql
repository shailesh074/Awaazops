-- Intelligence Testing Lab: labelled samples, benchmark runs and per-sample results.
-- Dispatchers read; only the server writes (service role). Audio lives in the private `lab-audio` bucket.

create table public.lab_samples (
  id                     text primary key,
  title                  text not null,
  language               text not null check (language in ('hi','en','hi-en')),
  accent                 text not null,
  noise                  text not null check (noise in ('clean','moderate','heavy')),
  duration_ms            integer not null check (duration_ms >= 0),
  audio_path             text not null,
  mime_type              text not null,
  -- Ground truth. A null reference transcript means WER is not computed for this sample.
  reference_transcript   text,
  expected_order         text,
  expected_issue         text check (expected_issue in ('CUSTOMER_UNAVAILABLE','WRONG_ADDRESS','RESCHEDULE_REQUEST','UNCLEAR_INSTRUCTIONS','PACKAGE_UNDELIVERABLE','OTHER')),
  expected_action        text check (expected_action in ('RESCHEDULE','MARK_CUSTOMER_UNAVAILABLE','FLAG_ADDRESS_ISSUE','UPDATE_INSTRUCTIONS','MARK_DELIVERY_FAILED','ESCALATE_TO_DISPATCHER')),
  expects_clarification  boolean not null default false,
  created_by             text not null,
  created_at             timestamptz not null default now()
);

create table public.lab_runs (
  id            text primary key,
  label         text not null,
  status        text not null check (status in ('running','completed','failed')),
  providers     jsonb not null,
  sample_count  integer not null,
  created_by    text not null,
  created_at    timestamptz not null,
  completed_at  timestamptz
);
create index lab_runs_created_idx on public.lab_runs (created_at desc);

create table public.lab_results (
  run_id              text not null references public.lab_runs (id) on delete cascade,
  sample_id           text not null references public.lab_samples (id) on delete cascade,
  transcript          text not null default '',
  payload             jsonb,
  validation_outcome  text check (validation_outcome in ('VERIFIED','NEEDS_CLARIFICATION','REJECTED')),
  stage_latency       jsonb not null default '{}'::jsonb,
  provenance          jsonb not null default '{}'::jsonb,
  error               text,
  primary key (run_id, sample_id)
);

alter table public.lab_samples enable row level security;
alter table public.lab_runs    enable row level security;
alter table public.lab_results enable row level security;

grant select on public.lab_samples, public.lab_runs, public.lab_results to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.lab_samples, public.lab_runs, public.lab_results from anon, authenticated;
revoke select on public.lab_samples, public.lab_runs, public.lab_results from anon;

create policy lab_samples_read on public.lab_samples for select to authenticated using ((select app.role()) = 'dispatcher');
create policy lab_runs_read    on public.lab_runs    for select to authenticated using ((select app.role()) = 'dispatcher');
create policy lab_results_read on public.lab_results for select to authenticated using ((select app.role()) = 'dispatcher');

insert into storage.buckets (id, name, public) values ('lab-audio', 'lab-audio', false)
on conflict (id) do nothing;
