import "server-only";
import { getServerEnv } from "@/server/env";

/**
 * Which sign-in methods the Supabase project has enabled, read from its public auth settings endpoint.
 * Used to show "Continue with Google" only when it will actually work. Fails closed (false).
 */
export async function isGoogleSignInEnabled(): Promise<boolean> {
  const env = getServerEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { external?: { google?: boolean } };
    return body.external?.google === true;
  } catch {
    return false;
  }
}
