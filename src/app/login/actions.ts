"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseBackend } from "@/server/env";
import { createUserClient } from "@/server/supabase/clients";

export interface SignInState {
  error: string | null;
}

const credentials = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/** Only same-site relative paths are allowed as a post-login destination. */
function safeNext(next: string | undefined, role: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return role === "dispatcher" ? "/dashboard" : "/agent";
}

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
  if (role !== "agent" && role !== "dispatcher") {
    await supabase.auth.signOut();
    return { error: "This account has no AwaazOps role yet. Ask an administrator to set it up." };
  }
  redirect(safeNext(parsed.data.next, role));
}

export async function signOut(): Promise<void> {
  if (isSupabaseBackend()) {
    const supabase = await createUserClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
