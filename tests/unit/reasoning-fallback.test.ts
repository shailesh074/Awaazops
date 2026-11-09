import { afterEach, describe, expect, it, vi } from "vitest";
import { FallbackReasoningProvider } from "@/server/providers/reasoning/fallback";
import { RulesReasoningProvider } from "@/server/providers/reasoning/rules";
import type { ReasoningProvider, ReasoningResult } from "@/server/providers/reasoning/types";
import { ProviderError } from "@/server/providers/errors";

const INPUT = { transcript: "order 4821 ka customer ghar pe nahi hai", language: "hi-en" as const, referenceTime: "2026-11-06T08:30:00.000Z" };

const VALID_RAW = {
  orderReference: { spoken: "order 4821", confidence: 0.9 },
  issue: { value: "CUSTOMER_UNAVAILABLE", quote: "ghar pe nahi", confidence: 0.9 },
  requestedAction: { value: "MARK_CUSTOMER_UNAVAILABLE", quote: "ghar pe nahi", confidence: 0.8 },
  time: { quote: null, kind: null, dayOffset: null, weekday: null, startHour: null, startMinute: null, endHour: null, endMinute: null, confidence: null },
  notes: { value: null, quote: null, confidence: null },
  ambiguities: [],
};

/** A stand-in LLM provider whose behaviour each test controls. */
function fakeLlm(opts: { configured?: boolean; extract?: (signal?: AbortSignal) => Promise<ReasoningResult> }): ReasoningProvider {
  return {
    id: "claude",
    isConfigured: () => opts.configured ?? true,
    extract: (input) => opts.extract!(input.signal),
  };
}
const llmResult = (raw: unknown): ReasoningResult => ({ raw, provenance: { provider: "claude", simulated: false, model: "test-model", latencyMs: 5, createdAt: "2026-11-06T08:30:00.000Z" } });
const chain = (llm: ReasoningProvider, timeoutMs = 1000) => new FallbackReasoningProvider(llm, new RulesReasoningProvider(), timeoutMs);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
vi.spyOn(console, "warn").mockImplementation(() => {});

describe("FallbackReasoningProvider", () => {
  it("uses the LLM when it answers with valid output", async () => {
    const out = await chain(fakeLlm({ extract: async () => llmResult(VALID_RAW) })).extract(INPUT);
    expect(out.provenance.provider).toBe("claude");
    expect(out.provenance.fallbackFrom).toBeUndefined();
    expect(out.raw).toEqual(VALID_RAW);
  });

  it("falls back to rules when the LLM is not configured, without calling it", async () => {
    const extract = vi.fn();
    const out = await chain(fakeLlm({ configured: false, extract })).extract(INPUT);
    expect(extract).not.toHaveBeenCalled();
    expect(out.provenance).toMatchObject({ provider: "rules", simulated: false, fallbackFrom: "claude", fallbackReason: "not configured" });
  });

  it("falls back to rules when the LLM fails", async () => {
    const out = await chain(fakeLlm({ extract: async () => { throw new ProviderError("claude", "UPSTREAM_ERROR", "Reasoning request failed (529)."); } })).extract(INPUT);
    expect(out.provenance).toMatchObject({ provider: "rules", fallbackFrom: "claude" });
    expect(out.provenance.fallbackReason).toMatch(/service error.*529/);
  });

  it("falls back to rules when the LLM refuses", async () => {
    const out = await chain(fakeLlm({ extract: async () => { throw new ProviderError("claude", "INVALID_RESPONSE", "The model declined to process this transcript."); } })).extract(INPUT);
    expect(out.provenance.fallbackReason).toMatch(/refused.*declined/);
  });

  it("falls back to rules on timeout and aborts the LLM request", async () => {
    let seen: AbortSignal | undefined;
    const llm = fakeLlm({ extract: (signal) => { seen = signal; return new Promise(() => {}); } }); // never resolves
    const out = await chain(llm, 50).extract(INPUT);
    expect(out.provenance).toMatchObject({ provider: "rules", fallbackFrom: "claude" });
    expect(out.provenance.fallbackReason).toMatch(/timed out.*50 ms/);
    expect(seen?.aborted).toBe(true);
  });

  it("falls back to rules when the LLM output does not match the schema", async () => {
    const out = await chain(fakeLlm({ extract: async () => llmResult({ orderReference: "4821" }) })).extract(INPUT);
    expect(out.provenance).toMatchObject({ provider: "rules", fallbackFrom: "claude" });
    expect(out.provenance.fallbackReason).toMatch(/^invalid output/);
  });

  it("produces the rules engine's real extraction on fallback (no fabricated content)", async () => {
    const fallback = await chain(fakeLlm({ configured: false })).extract(INPUT);
    const direct = await new RulesReasoningProvider().extract(INPUT);
    expect(fallback.raw).toEqual(direct.raw);
  });
});

describe("getReasoningProvider", () => {
  async function load(env: Record<string, string>) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const mod = await import("@/server/providers/reasoning");
    const { FallbackReasoningProvider: F } = await import("@/server/providers/reasoning/fallback");
    const { RulesReasoningProvider: R } = await import("@/server/providers/reasoning/rules");
    const { ClaudeReasoningProvider: C } = await import("@/server/providers/reasoning/claude");
    return { provider: mod.getReasoningProvider(), F, R, C };
  }

  it("defaults to the rules engine — no API key needed", async () => {
    const { provider, R } = await load({ AWAAZ_REASONING_PROVIDER: "", AWAAZ_LLM_PROVIDER: "" });
    expect(provider).toBeInstanceOf(R);
    expect(provider.isConfigured()).toBe(true);
  });

  it("maps the legacy AWAAZ_LLM_PROVIDER=mock to rules", async () => {
    const { provider, R } = await load({ AWAAZ_REASONING_PROVIDER: "", AWAAZ_LLM_PROVIDER: "mock" });
    expect(provider).toBeInstanceOf(R);
  });

  it("wraps an LLM with the rules fallback by default", async () => {
    const { provider, F } = await load({ AWAAZ_REASONING_PROVIDER: "claude", ANTHROPIC_API_KEY: "" });
    expect(provider).toBeInstanceOf(F);
    expect(provider.isConfigured()).toBe(true); // usable even with no key
  });

  it("uses the LLM alone only when fallback is explicitly disabled", async () => {
    const { provider, C } = await load({ AWAAZ_REASONING_PROVIDER: "claude", AWAAZ_REASONING_FALLBACK: "none" });
    expect(provider).toBeInstanceOf(C);
  });
});
