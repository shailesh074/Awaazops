import "server-only";
import { isSupabaseBackend } from "@/server/env";
import { createServiceClient, createUserClient } from "@/server/supabase/clients";
import { MemoryRepository } from "./memory";
import { SupabaseRepository } from "./supabase";
import type { OperationsRepository } from "./types";

export * from "./types";

let memory: MemoryRepository | undefined;
let service: SupabaseRepository | undefined;

/**
 * Server-side (pipeline) repository. With Supabase this uses the service role, so callers MUST have
 * authorised the acting user first (see src/server/auth). Never use it to serve a user's reads.
 */
export function getRepository(): OperationsRepository {
  if (isSupabaseBackend()) return (service ??= new SupabaseRepository(createServiceClient()));
  return (memory ??= new MemoryRepository());
}

/** Repository scoped to the signed-in user: with Supabase, every read is filtered by row-level security. */
export async function getReadRepository(): Promise<OperationsRepository> {
  if (isSupabaseBackend()) return new SupabaseRepository(await createUserClient());
  return (memory ??= new MemoryRepository());
}
