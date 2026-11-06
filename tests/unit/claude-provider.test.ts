import { afterEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { ClaudeReasoningProvider, SYSTEM_PROMPT } from "@/server/providers/llm/claude";

// The SDK client is injected and faked: these tests pin the request we send and how responses are handled.

afterEach(() => vi.unstubAllEnvs());

function fakeClient(response: Record<string, unknown> | Error) {
  const parse = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

const OUTPUT = {
  orderReference: { spoken: "order 4,907", confidence: 0.95 },
  issue: { value: "UNCLEAR_INSTRUCTIONS", quote: "security is not allowing entry", confidence: 0.9 },
  requestedAction: { value: "UPDATE_INSTRUCTIONS", quote: "leave it at reception", confidence: 0.9 },
  time: { quote: null, kind: null, dayOffset: null, weekday: null, startHour: null, startMinute: null, endHour: null, endMinute: null, confidence: 0 },
  notes: { value: "Leave at reception", quote: "leave it at reception", confidence: 0.9 },
  ambiguities: [],
};

describe("ClaudeReasoningProvider", () => {
  it("sends a structured-output request with a cached static system prompt", async () => {
    vi.stubEnv("LLM_MODEL", "claude-opus-5-5");
    const { client, parse } = fakeClient({ id: "msg_1", model: "claude-opus-5-5", stop_reason: "end_turn", parsed_output: OUTPUT });
    const out = await new ClaudeReasoningProvider(client).extract({ transcript: "order 4,907 ...", language: "hi-en", referenceTime: "2026-11-06T08:30:00Z" });

    const req = (parse.mock.calls[0] as unknown as [Anthropic.Beta.Messages.MessageCreateParamsNonStreaming & { fallbacks?: unknown }])[0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(req.output_config?.effort).toBe("low");
    expect(req.output_config?.format).toBeDefined();
    expect(req.system?.[0]).toMatchObject({ text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } });
    expect(req.messages[0].content).toContain("Hinglish");
    expect(req.messages[0].content).toContain("<transcript>\norder 4,907 ...\n</transcript>");
    expect(req).not.toHaveProperty("thinking"); // Opus 5.5: depth is controlled by effort

    expect(out.raw).toEqual(OUTPUT);
    expect(out.provenance).toMatchObject({ provider: "claude", simulated: false, model: "claude-opus-5-5", requestId: "msg_1" });
  });

  it("keeps the static prompt free of per-request data (cache-safe)", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("treats a refusal as an error, not as content", async () => {
    const { client } = fakeClient({ id: "m", model: "x", stop_reason: "refusal", parsed_output: null });
    await expect(new ClaudeReasoningProvider(client).extract({ transcript: "t", language: "en", referenceTime: "2026-11-06T08:30:00Z" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("treats truncated output as an error", async () => {
    const { client } = fakeClient({ id: "m", model: "x", stop_reason: "max_tokens", parsed_output: null });
    await expect(new ClaudeReasoningProvider(client).extract({ transcript: "t", language: "en", referenceTime: "2026-11-06T08:30:00Z" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("maps a schema parse failure to INVALID_RESPONSE", async () => {
    const { client } = fakeClient(new SyntaxError("Unexpected token"));
    await expect(new ClaudeReasoningProvider(client).extract({ transcript: "t", language: "en", referenceTime: "2026-11-06T08:30:00Z" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("reports NOT_CONFIGURED without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const p = new ClaudeReasoningProvider();
    expect(p.isConfigured()).toBe(false);
    await expect(p.extract({ transcript: "t", language: "en", referenceTime: "2026-11-06T08:30:00Z" })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});
