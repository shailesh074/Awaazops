import Link from "next/link";
import { ArrowUpRight, FlaskConical, LayoutDashboard, Mic } from "lucide-react";
import { BrandLockup } from "@/components/shared/brand-mark";

const PIPELINE = [
  { label: "Voice", detail: "Gnani Prisma v2.5" },
  { label: "Intelligence", detail: "Rules engine · optional LLM" },
  { label: "Verification", detail: "Reliability Engine" },
  { label: "Action", detail: "Confirmed + audited" },
] as const;

const MODULES = [
  {
    href: "/agent",
    icon: Mic,
    title: "Agent Portal",
    body: "Delivery agents report issues by voice and confirm before anything changes.",
  },
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    title: "Operations Dashboard",
    body: "Dispatchers see verified exceptions, actions and the full audit trail.",
  },
  {
    href: "/lab",
    icon: FlaskConical,
    title: "Intelligence Testing Lab",
    body: "Measure accuracy and latency on Hindi, Hinglish, accented and noisy speech.",
  },
] as const;

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 lg:py-14">
      <header className="mb-16 flex items-center justify-between">
        <BrandLockup />
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Preview build
        </span>
      </header>

      <section className="mb-14 max-w-3xl space-y-5">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Spoken delivery issues, turned into verified operations.
        </h1>
        <p className="max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
          AwaazOps listens to delivery agents in Hindi, English and Hinglish, extracts what happened,
          checks it against real orders and records an action only after the agent confirms it.
        </p>
      </section>

      {/* gap-px over a border-coloured background draws hairline dividers at every breakpoint */}
      <ol className="mb-14 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        {PIPELINE.map((step, i) => (
          <li key={step.label} className="bg-surface p-4">
            <p className="font-mono text-[10px] text-muted-foreground tabular">0{i + 1}</p>
            <p className="mt-2 text-sm font-medium">{step.label}</p>
            <p className="text-xs text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>

      <section className="grid gap-3 md:grid-cols-3">
        {MODULES.map(({ href, icon: Icon, title, body }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border bg-surface p-5 transition-colors hover:border-primary/40 hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-lg border bg-background">
                <Icon className="size-4 text-primary" aria-hidden="true" />
              </span>
              <ArrowUpRight
                className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                aria-hidden="true"
              />
            </div>
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </Link>
        ))}
      </section>

      <footer className="mt-auto pt-16 text-xs text-muted-foreground">
        Speech runs on Gnani Prisma v2.5 and Timbre v2.5. Every result is labelled with the engine that
        produced it — live service, deterministic rules, or simulated.
      </footer>
    </div>
  );
}
