"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  FlaskConical,
  LayoutDashboard,
  Mic,
  Package,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Operations",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/exceptions", label: "Exceptions", icon: AlertTriangle },
      { href: "/dashboard/orders", label: "Orders", icon: Package },
      { href: "/dashboard/audit", label: "Audit trail", icon: Activity },
    ],
  },
  {
    title: "Intelligence",
    items: [{ href: "/lab", label: "Testing Lab", icon: FlaskConical }],
  },
  {
    title: "Field",
    items: [{ href: "/agent", label: "Agent Portal", icon: Mic }],
  },
];

function isActive(pathname: string, href: string) {
  // "/dashboard" is active only on the overview itself; nested items match by prefix.
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Reads the pathname for active-link state. Render inside <Suspense> (see layout). */
export function ConsoleNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <ConsoleNavLinks pathname={pathname} onNavigate={onNavigate} />;
}

/**
 * Hook-free nav. With `pathname={null}` it is the prerendered Suspense fallback: identical links,
 * no active state, so the static shell never blocks on URL data.
 */
export function ConsoleNavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-6">
      {SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <p className="px-2.5 pb-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground/80 uppercase">
            {section.title}
          </p>
          {section.items.map(({ href, label, icon: Icon }) => {
            const active = pathname !== null && isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("size-4", active ? "text-primary" : "text-muted-foreground/80")}
                  aria-hidden="true"
                />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
