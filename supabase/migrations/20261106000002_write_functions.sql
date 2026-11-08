-- Server-side write path. Each function is one transaction; only the service role may execute them.
-- Inputs are the domain objects as JSON (camelCase), so the TypeScript side passes them through unchanged.

create or replace function public.next_report_id() returns text
  language sql volatile security definer set search_path = public
  as $$ select 'R-' || nextval('public.report_seq')::text $$;

-- Upserts a report and its artefacts (transcript, extraction, validation) atomically.
create or replace function public.save_report(p jsonb) returns void
  language plpgsql security definer set search_path = public
  as $$
declare
  r jsonb := p -> 'report';
  rid text := r ->> 'id';
begin
  insert into voice_reports (id, agent_id, language, status, audio_path, audio_duration_ms, failure_reason, timings,
                             timing_source, priority, confirmation_prompt, created_at, updated_at)
  values (rid, r ->> 'agentId', r ->> 'language', r ->> 'status', r ->> 'audioPath', (r ->> 'audioDurationMs')::int,
          r ->> 'failureReason', coalesce(r -> 'timings', '[]'::jsonb), r ->> 'timingSource', p ->> 'priority',
          p ->> 'confirmationPrompt', (r ->> 'createdAt')::timestamptz, (r ->> 'updatedAt')::timestamptz)
  on conflict (id) do update set
    status = excluded.status, audio_path = excluded.audio_path, audio_duration_ms = excluded.audio_duration_ms,
    failure_reason = excluded.failure_reason, timings = excluded.timings, priority = excluded.priority,
    confirmation_prompt = excluded.confirmation_prompt, updated_at = excluded.updated_at;

  if jsonb_typeof(p -> 'transcript') = 'object' then
    insert into transcripts (report_id, id, text, language, confidence, segments, provenance)
    values (rid, p -> 'transcript' ->> 'id', p -> 'transcript' ->> 'text', p -> 'transcript' ->> 'language',
            (p -> 'transcript' ->> 'confidence')::double precision, coalesce(p -> 'transcript' -> 'segments', '[]'::jsonb),
            p -> 'transcript' -> 'provenance')
    on conflict (report_id) do update set text = excluded.text, confidence = excluded.confidence,
      segments = excluded.segments, provenance = excluded.provenance;
  end if;

  if jsonb_typeof(p -> 'extraction') = 'object' then
    insert into extractions (report_id, id, payload, provenance)
    values (rid, p -> 'extraction' ->> 'id', p -> 'extraction' -> 'payload', p -> 'extraction' -> 'provenance')
    on conflict (report_id) do update set payload = excluded.payload, provenance = excluded.provenance;
  end if;

  if jsonb_typeof(p -> 'validation') = 'object' then
    insert into validations (report_id, outcome, checks, resolved_order_id, clarification_question)
    values (rid, p -> 'validation' ->> 'outcome', p -> 'validation' -> 'checks',
            p -> 'validation' ->> 'resolvedOrderId', p -> 'validation' ->> 'clarificationQuestion')
    on conflict (report_id) do update set outcome = excluded.outcome, checks = excluded.checks,
      resolved_order_id = excluded.resolved_order_id, clarification_question = excluded.clarification_question;
  end if;
end $$;

-- Appends audit events (array of AuditEvent without id); returns the stored events.
create or replace function public.append_audit(p_events jsonb) returns setof audit_events
  language sql security definer set search_path = public
  as $$
  insert into audit_events (id, actor_id, actor_role, entity, entity_id, report_id, event, before, after, created_at)
  select 'AE-' || lpad(nextval(pg_get_serial_sequence('public.audit_events', 'seq'))::text, 6, '0'),
         e ->> 'actorId', e ->> 'actorRole', e ->> 'entity', e ->> 'entityId', e ->> 'reportId', e ->> 'event',
         e -> 'before', e -> 'after', (e ->> 'createdAt')::timestamptz
  from jsonb_array_elements(p_events) as e
  returning *;
$$;

-- Executes a CONFIRMED report's action in one transaction:
--   1. updates the order only if it is unchanged since it was read (optimistic concurrency),
--   2. records the operational action,
--   3. moves the report CONFIRMED → EXECUTED,
--   4. appends the audit events.
-- Raises ORDER_CHANGED or REPORT_NOT_CONFIRMED (SQLSTATE P0001) and changes nothing if a guard fails.
create or replace function public.commit_confirmed_action(
  p_report_id text,
  p_report_timings jsonb,
  p_executed_at timestamptz,
  p_action jsonb,
  p_order jsonb,
  p_expected_order_updated_at timestamptz,
  p_audit jsonb
) returns void
  language plpgsql security definer set search_path = public
  as $$
begin
  update orders set
    status = p_order ->> 'status',
    instructions = p_order ->> 'instructions',
    slot_start = (p_order ->> 'slotStart')::timestamptz,
    slot_end = (p_order ->> 'slotEnd')::timestamptz,
    updated_at = (p_order ->> 'updatedAt')::timestamptz
  where id = p_order ->> 'id' and updated_at = p_expected_order_updated_at;
  if not found then
    raise exception 'ORDER_CHANGED' using errcode = 'P0001';
  end if;

  update voice_reports set status = 'EXECUTED', timings = p_report_timings, updated_at = p_executed_at
  where id = p_report_id and status = 'CONFIRMED';
  if not found then
    raise exception 'REPORT_NOT_CONFIRMED' using errcode = 'P0001';
  end if;

  insert into operational_actions (id, report_id, order_id, type, payload, status, confirmed_by, confirmed_at, executed_at)
  values (p_action ->> 'id', p_report_id, p_action ->> 'orderId', p_action ->> 'type', coalesce(p_action -> 'payload', '{}'::jsonb),
          p_action ->> 'status', p_action ->> 'confirmedBy', (p_action ->> 'confirmedAt')::timestamptz,
          (p_action ->> 'executedAt')::timestamptz);

  perform public.append_audit(p_audit);
end $$;

-- Supabase grants EXECUTE on new public functions to anon/authenticated by default; revoke explicitly.
revoke all on function public.next_report_id(), public.save_report(jsonb), public.append_audit(jsonb),
  public.commit_confirmed_action(text, jsonb, timestamptz, jsonb, jsonb, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.next_report_id(), public.save_report(jsonb), public.append_audit(jsonb),
  public.commit_confirmed_action(text, jsonb, timestamptz, jsonb, jsonb, timestamptz, jsonb) to service_role;
