import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase mode only: refreshes the auth session cookie on each request and makes OPTIMISTIC role
 * redirects. This is not the security boundary — pages and API routes re-check the viewer, and Postgres
 * RLS filters every read (see src/server/auth/session.ts).
 */
const AGENT_PATHS = ["/agent"];
const DISPATCHER_PATHS = ["/dashboard", "/lab"];
const under = (path: string, roots: string[]) => roots.some((r) => path === r || path.startsWith(`${r}/`));

export async function proxy(request: NextRequest) {
  if (process.env.AWAAZ_DATA_BACKEND !== "supabase") return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Validates the JWT and refreshes it if needed.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const role = (claims?.app_metadata as { role?: string } | undefined)?.role;
  const path = request.nextUrl.pathname;

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = target === "/login" && path !== "/" ? `?next=${encodeURIComponent(path)}` : "";
    const res = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) res.cookies.set(c); // keep refreshed session cookies
    return res;
  };

  const protectedPath = under(path, AGENT_PATHS) || under(path, DISPATCHER_PATHS);
  if (protectedPath && !role) return redirectTo("/login");
  if (under(path, AGENT_PATHS) && role === "dispatcher") return redirectTo("/dashboard");
  if (under(path, DISPATCHER_PATHS) && role === "agent") return redirectTo("/agent");
  if (path === "/login" && role) return redirectTo(role === "dispatcher" ? "/dashboard" : "/agent");

  return response;
}

export const config = {
  // Everything except static assets and images; API routes included so their session refreshes too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wav|mp3)$).*)"],
};
