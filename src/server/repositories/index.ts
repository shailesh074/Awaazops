import "server-only";
import { MemoryRepository } from "./memory";
import type { OperationsRepository } from "./types";

export type * from "./types";

let repo: OperationsRepository | undefined;

/** Single access point for persistence. Switches to Supabase in step 8. */
export function getRepository(): OperationsRepository {
  return (repo ??= new MemoryRepository());
}
