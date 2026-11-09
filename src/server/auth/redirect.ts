/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNext(next: string | null | undefined, role: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
  return role === "dispatcher" ? "/dashboard" : "/agent";
}

export const hasAppRole = (role: unknown): role is "agent" | "dispatcher" => role === "agent" || role === "dispatcher";
