import { NextResponse, type NextRequest } from "next/server";
import { hasAppRole, safeNext } from "@/server/auth/redirect";
import { createUserClient } from "@/server/supabase/clients";

/**
 * GET /auth/callback — where Google (via Supabase) returns after sign-in. Exchanges the one-time code for a
 * session cookie. A Google account only gets in if an administrator has given it a role; otherwise the
 * session is ended immediately and the login page explains why.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const toLogin = (error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, url.origin));

  const code = url.searchParams.get("code");
  if (!code) return toLogin(url.searchParams.get("error") === "access_denied" ? "cancelled" : "oauth");

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return toLogin("oauth");

  const role = (data.user.app_metadata as { role?: string }).role;
  if (!hasAppRole(role)) {
    await supabase.auth.signOut();
    return toLogin("no_role");
  }
  return NextResponse.redirect(new URL(safeNext(url.searchParams.get("next"), role), url.origin));
}
