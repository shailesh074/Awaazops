import Link from "next/link";
import { Suspense } from "react";
import { BrandLockup } from "@/components/shared/brand-mark";
import { ConsoleNav, ConsoleNavLinks } from "@/components/layout/console-nav";
import { ConsoleMobileNav } from "@/components/layout/console-mobile-nav";

/** Desktop-first shell for the Operations Dashboard and Intelligence Testing Lab. */
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
        <Link href="/" className="mb-8 px-2.5">
          <BrandLockup />
        </Link>
        {/* usePathname is URL data under Cache Components; Suspense keeps the shell prerenderable. */}
        <Suspense fallback={<ConsoleNavLinks pathname={null} />}>
          <ConsoleNav />
        </Suspense>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:hidden">
          <ConsoleMobileNav />
          <Link href="/">
            <BrandLockup />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
