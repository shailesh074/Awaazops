"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;
const DEBOUNCE_MS = 600;

/**
 * Keeps server-rendered pages current. Supabase mode: Realtime change notifications (RLS-filtered per
 * subscriber) trigger a re-render; the page then re-reads through its normal RLS-scoped queries, so the
 * notification payload itself is never displayed. Demo mode: light polling while the tab is visible.
 */
export function LiveRefresh({
  mode,
  supabaseUrl,
  supabaseAnonKey,
  tables,
  className,
}: {
  mode: "supabase" | "memory";
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  tables: string[];
  className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"connecting" | "live" | "polling" | "offline">(mode === "memory" ? "polling" : "connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableKey = tables.join(",");

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    if (mode === "memory" || !supabaseUrl || !supabaseAnonKey) {
      const id = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh();
      }, POLL_MS);
      return () => clearInterval(id);
    }

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
    let channel = supabase.channel("awaazops-console");
    for (const table of tableKey.split(",")) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe((status) => {
      setState(status === "SUBSCRIBED" ? "live" : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "offline" : "connecting");
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [mode, supabaseUrl, supabaseAnonKey, tableKey, router]);

  const label = { connecting: "Connecting", live: "Live", polling: "Auto-refresh", offline: "Offline" }[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase", state === "live" ? "text-success" : "text-muted-foreground", className)}
      title={state === "live" ? "Updates appear as they happen" : state === "polling" ? "Demo mode: refreshes every 15 s" : state === "offline" ? "Realtime unavailable — refresh to update" : "Connecting to realtime updates"}
    >
      <span className={cn("size-1.5 rounded-full", state === "live" ? "animate-pulse bg-success" : state === "offline" ? "bg-destructive" : "bg-muted-foreground/60")} />
      {label}
    </span>
  );
}
