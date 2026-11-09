"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signInWithGoogle, type SignInState } from "./actions";

const initial: SignInState = { error: null };

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" className="h-10 w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <GoogleMark />} Continue with Google
    </Button>
  );
}

export function LoginForm({ next, googleEnabled, notice }: { next?: string; googleEnabled: boolean; notice: string | null }) {
  const [state, action, pending] = useActionState(signIn, initial);
  const error = state.error ?? notice;
  return (
    <div className="space-y-4">
      {googleEnabled ? (
        <>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next ?? ""} />
            <GoogleButton />
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or with email <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <p aria-live="polite" className="min-h-4 text-xs text-pretty text-destructive">
          {error}
        </p>
        <Button type="submit" className="h-10 w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Sign in
        </Button>
      </form>
      <p className="text-xs text-pretty text-muted-foreground">
        No self sign-up: an administrator gives each account its role (agent or dispatcher) before it can sign in.
      </p>
    </div>
  );
}
