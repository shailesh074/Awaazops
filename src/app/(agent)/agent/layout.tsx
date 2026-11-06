import Link from "next/link";
import { BrandLockup } from "@/components/shared/brand-mark";
import { AgentTabBar } from "@/components/layout/agent-tab-bar";

/** Mobile-first shell: delivery agents use the portal on their phones. */
export default function AgentLayout({ children }: LayoutProps<"/agent">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link href="/">
            <BrandLockup />
          </Link>
          <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Agent
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</main>
      <AgentTabBar />
    </div>
  );
}
