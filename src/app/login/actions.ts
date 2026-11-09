"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseBackend } from "@/server/env";
import { hasAppRole, safeNext } from "@/server/auth/redirect";
import { createUserClient } from "@/server/supabase/clients";

export interface SignInState {
  error: string | null;
}

const credentials = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseBackend()) redirect("/agent");
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  // One generic message: don't reveal whether the email exists.
  if (error || !data.user) return { error: "Email or password is incorrect." };

  const role = (data.user.app_metadata as { role?: string }).role;
  if (!hasAppRole(role)) {
    await supabase.auth.signOut();
    return { error: "This account has no AwaazOps role yet. Ask an administrator to set it up." };
  }
  redirect(safeNext(parsed.data.next, role));
}

/** Starts Google sign-in. Supabase sends the browser to Google, then back to /auth/callback. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!isSupabaseBackend()) redirect("/agent");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const next = formData.get("next");
  const callback = new URL("/auth/callback", `${proto}://${host}`);
  if (typeof next === "string" && next) callback.searchParams.set("next", safeNext(next, undefined));

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  if (isSupabaseBackend()) {
    const supabase = await createUserClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
