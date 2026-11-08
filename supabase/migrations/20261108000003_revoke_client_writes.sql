-- Supabase's default privileges grant ALL on new public tables to `anon` and `authenticated`.
-- RLS already blocks every client write (there are no write policies), but grants are the first barrier:
-- remove them so a direct write fails with "permission denied" rather than silently matching zero rows.
-- Writes happen only through the service role and the SECURITY DEFINER functions.

revoke insert, update, delete, truncate, references, trigger on
  public.agents, public.orders, public.voice_reports, public.transcripts, public.extractions, public.validations,
  public.operational_actions, public.prompt_audio, public.audit_events
from anon, authenticated;

-- Anonymous visitors read nothing at all (RLS returned zero rows; now the privilege is gone too).
revoke select on
  public.agents, public.orders, public.voice_reports, public.transcripts, public.extractions, public.validations,
  public.operational_actions, public.prompt_audio, public.audit_events
from anon;

revoke usage, select, update on sequence public.report_seq from anon, authenticated;
