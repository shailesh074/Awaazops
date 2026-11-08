import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "@/server/env";

/**
 * Service-role client: bypasses RLS. Used only by the server pipeline (writes) and admin scripts —
 * never for serving a user's reads, and never sent to the browser.
 */
let service: SupabaseClient | undefined;
export function createServiceClient(): SupabaseClient {
  const env = getServerEnv();
  return (service ??= createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/**
 * User-scoped client bound to the request's auth cookies. Every query runs as the signed-in user,
 * so Postgres row-level security decides what they can read.
 */
export async function createUserClient(): Promise<SupabaseClient> {
  const env = getServerEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        // Server Components can't set cookies; the proxy refreshes the session on every request instead.
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // ignored in Server Components
        }
      },
    },
  });
}
