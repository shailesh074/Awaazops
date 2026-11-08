import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { BrandLockup } from "@/components/shared/brand-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { isSupabaseBackend } from "@/server/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

async function LoginBody({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  await connection();
  if (!isSupabaseBackend()) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Demo mode: no database is connected, so there is no sign-in. You can use both the agent portal and the
          dispatcher console.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/agent" className="rounded-lg border px-3 py-2 text-center hover:bg-surface-raised">Agent portal</Link>
          <Link href="/dashboard" className="rounded-lg border px-3 py-2 text-center hover:bg-surface-raised">Dashboard</Link>
        </div>
      </div>
    );
  }
  const next = (await searchParams).next;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3">
          <BrandLockup />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">Delivery agents and dispatchers use the same sign-in.</p>
          </div>
        </div>
        <div className="rounded-xl border bg-surface p-5">
          <Suspense fallback={<Skeleton className="h-52 w-full" />}>
            <LoginBody searchParams={props.searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
