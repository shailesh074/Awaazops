import { LogOut } from "lucide-react";
import { connection } from "next/server";
import { getViewer } from "@/server/auth/session";
import { signOut } from "@/app/login/actions";
import { cn } from "@/lib/utils";

/** Who is signed in, with sign-out. Reads the session, so render it inside <Suspense>. */
export async function ViewerMenu({ compact = false }: { compact?: boolean }) {
  await connection();
  const viewer = await getViewer();
  if (!viewer) return null;

  if (viewer.role === "demo") {
    return (
      <span className="font-mono text-[10px] tracking-[0.14em] text-simulated uppercase" title="No database connected — no sign-in">
        Demo mode
      </span>
    );
  }

  const label = viewer.role === "dispatcher" ? "Dispatcher" : `Agent ${viewer.agentId ?? ""}`;
  return (
    <form action={signOut} className={cn("flex items-center gap-2", compact ? "" : "w-full justify-between")}>
      <span className="min-w-0 text-xs">
        <span className="block truncate text-foreground">{viewer.email}</span>
        {!compact ? <span className="block text-muted-foreground">{label}</span> : null}
      </span>
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </form>
  );
}
