import { connection } from "next/server";
import { getServerEnv, isSupabaseBackend } from "@/server/env";
import { LiveRefresh } from "./live-refresh";

/**
 * Server wrapper: hands the browser only public configuration (project URL + anon key, which RLS protects).
 * Reads runtime env, so render inside <Suspense>.
 */
export async function LiveUpdates({ tables, className }: { tables: string[]; className?: string }) {
  await connection();
  if (!isSupabaseBackend()) return <LiveRefresh mode="memory" tables={tables} className={className} />;
  const env = getServerEnv();
  return (
    <LiveRefresh
      mode="supabase"
      supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL}
      supabaseAnonKey={env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
      tables={tables}
      className={className}
    />
  );
}
