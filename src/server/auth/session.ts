import "server-only";
import { redirect } from "next/navigation";
import { isSupabaseBackend } from "@/server/env";
import { createUserClient } from "@/server/supabase/clients";
import { ReportError } from "@/server/pipeline/errors";
import { DEMO_AGENT_ID } from "@/mocks/fleet";

export type Role = "agent" | "dispatcher";

export interface Viewer {
  /** Null in demo mode. */
  userId: string | null;
  email: string | null;
  /** "demo" may act as the demo agent and view the dispatcher console. */
  role: Role | "demo";
  /** The agent this viewer acts as (agents and demo only). */
  agentId: string | null;
}

const DEMO_VIEWER: Viewer = { userId: null, email: null, role: "demo", agentId: DEMO_AGENT_ID };

export const canActAsAgent = (v: Viewer) => (v.role === "agent" || v.role === "demo") && Boolean(v.agentId);
export const canDispatch = (v: Viewer) => v.role === "dispatcher" || v.role === "demo";

/**
 * The signed-in viewer, or null. In Supabase mode the JWT is verified with getClaims() (not trusted from
 * the cookie), and role/agent come from app_metadata, which only the server can set.
 */
export async function getViewer(): Promise<Viewer | null> {
  if (!isSupabaseBackend()) return DEMO_VIEWER;
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const meta = (claims.app_metadata ?? {}) as { role?: string; agent_id?: string };
  const role: Role | null = meta.role === "agent" || meta.role === "dispatcher" ? meta.role : null;
  if (!role) return null; // signed in but not provisioned — no access
  return { userId: claims.sub, email: (claims.email as string | undefined) ?? null, role, agentId: role === "agent" ? (meta.agent_id ?? null) : null };
}

/** Home route for a viewer's role. */
export const homeFor = (v: Viewer) => (v.role === "dispatcher" ? "/dashboard" : "/agent");

// ── Pages: redirect ───────────────────────────────────────────────────────────────────────────────────

export async function requireAgentPage(): Promise<Viewer & { agentId: string }> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!canActAsAgent(v)) redirect(homeFor(v));
  return v as Viewer & { agentId: string };
}

export async function requireDispatcherPage(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!canDispatch(v)) redirect(homeFor(v));
  return v;
}

// ── API routes: 401 / 403 ─────────────────────────────────────────────────────────────────────────────

export async function requireAgentApi(): Promise<Viewer & { agentId: string }> {
  const v = await getViewer();
  if (!v) throw new ReportError("UNAUTHENTICATED", "Sign in required.");
  if (!canActAsAgent(v)) throw new ReportError("FORBIDDEN", "Only delivery agents can do this.");
  return v as Viewer & { agentId: string };
}

export async function requireViewerApi(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new ReportError("UNAUTHENTICATED", "Sign in required.");
  return v;
}
