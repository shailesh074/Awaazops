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

  const live = {
    AWAAZ_DATA_BACKEND: "supabase", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    AWAAZ_STT_PROVIDER: "gnani-prisma", AWAAZ_TTS_PROVIDER: "gnani-timbre", GNANI_API_KEY: "key",
  };

  it("refuses demo defaults on a Vercel production deployment, naming every missing setting", async () => {
    const { getServerEnv } = await loadEnv({ VERCEL_ENV: "production", AWAAZ_DATA_BACKEND: "", AWAAZ_STT_PROVIDER: "", AWAAZ_TTS_PROVIDER: "", GNANI_API_KEY: "" });
    expect(() => getServerEnv()).toThrow(/AWAAZ_DATA_BACKEND.*AWAAZ_STT_PROVIDER.*AWAAZ_TTS_PROVIDER.*GNANI_API_KEY/);
  });

  it("refuses an explicit mock provider in production", async () => {
    const { getServerEnv } = await loadEnv({ ...live, VERCEL_ENV: "production", AWAAZ_TTS_PROVIDER: "mock" });
    expect(() => getServerEnv()).toThrow(/AWAAZ_TTS_PROVIDER: must be "gnani-timbre"/);
  });

  it("accepts a fully live production configuration", async () => {
    const { getServerEnv } = await loadEnv({ ...live, VERCEL_ENV: "production" });
    expect(getServerEnv().AWAAZ_STT_PROVIDER).toBe("gnani-prisma");
  });

  it("keeps demo mode available on preview deployments", async () => {
    const { getServerEnv } = await loadEnv({ VERCEL_ENV: "preview", AWAAZ_DATA_BACKEND: "", AWAAZ_STT_PROVIDER: "" });
    expect(getServerEnv().AWAAZ_DATA_BACKEND).toBe("memory");
  });
});
