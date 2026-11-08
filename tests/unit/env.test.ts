import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return import("@/server/env");
}

describe("server env", () => {
  it("defaults to the in-memory demo backend", async () => {
    const { getServerEnv, isSupabaseBackend } = await loadEnv({ AWAAZ_DATA_BACKEND: "" });
    expect(getServerEnv().AWAAZ_DATA_BACKEND).toBe("memory");
    expect(isSupabaseBackend()).toBe(false);
  });

  it("refuses a half-configured Supabase backend with a clear message", async () => {
    const { getServerEnv } = await loadEnv({ AWAAZ_DATA_BACKEND: "supabase", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" });
    expect(() => getServerEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY: required when AWAAZ_DATA_BACKEND=supabase/);
  });

  it("accepts a complete Supabase configuration", async () => {
    const { isSupabaseBackend } = await loadEnv({ AWAAZ_DATA_BACKEND: "supabase", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" });
    expect(isSupabaseBackend()).toBe(true);
  });
});
