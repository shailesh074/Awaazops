-- Stream changes to the dispatcher console. Supabase Realtime applies each table's RLS policies to every
-- subscriber, so dispatchers receive all rows and agents only their own — the same rules as reads.
-- (Only change notifications are used; the page then re-reads through the normal RLS-scoped queries.)

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.voice_reports, public.audit_events, public.orders;
