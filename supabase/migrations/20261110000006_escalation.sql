-- Escalation to dispatch: an agent who cannot resolve a report (e.g. the order number is not in the system)
-- hands it to dispatch instead of discarding it. A dispatcher then links the right order (re-verified and
-- confirmed by the dispatcher) or closes it with a note. Additive: widens the status check only; no data change.

alter table public.voice_reports drop constraint voice_reports_status_check;
alter table public.voice_reports add constraint voice_reports_status_check check (status in (
  'RECORDED','TRANSCRIBED','EXTRACTED','VALIDATED','NEEDS_CLARIFICATION','AWAITING_CONFIRMATION','ESCALATED',
  'EDITED','CONFIRMED','EXECUTED','REJECTED','FAILED'
));
