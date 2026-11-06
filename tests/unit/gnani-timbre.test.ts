import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { speakable, spokenClock } from "@/server/providers/tts/speakable";

// Contract under test: docs.gnani.ai/api/TTS/tts-inference (read 2026-11-06). fetch is stubbed.

describe("speakable", () => {
  it("reads order numbers digit by digit in each language", () => {
    expect(speakable("Order 4821: customer unavailable mark karun?", "hi-en")).toBe("Order chaar aath do ek: customer unavailable mark karun?");
    expect(speakable("Order 4907: please confirm.", "en")).toBe("Order four nine zero seven: please confirm.");
    expect(speakable("ऑर्डर 4821 नहीं मिला।", "hi")).toBe("ऑर्डर चार आठ दो एक नहीं मिला।");
  });

  it("speaks dates and times naturally", () => {
    expect(speakable("Order 4821: delivery 06 Nov, 18:00 ke baad reschedule karun?", "hi-en")).toBe(
      "Order chaar aath do ek: delivery 6 November, shaam 6 baje ke baad reschedule karun?",
    );
    expect(speakable("reschedule the delivery after 06 Nov, 18:00?", "en")).toBe("reschedule the delivery after 6 November at 6 PM?");
    expect(speakable("डिलीवरी 06 Nov, 18:00 के बाद", "hi")).toBe("डिलीवरी 6 नवंबर, शाम 6 बजे के बाद");
    expect(speakable("between 06 Nov, 19:00 and 20:00", "en")).toBe("between 6 November at 7 PM and 8 PM");
    expect(speakable("09 Nov ko", "hi-en")).toBe("9 November ko");
  });

  it("names Hindi day periods", () => {
    expect(spokenClock(9, 0, "hi-en")).toBe("subah 9 baje");
    expect(spokenClock(14, 30, "hi-en")).toBe("dopahar 2 baj kar 30 minute");
    expect(spokenClock(21, 0, "hi")).toBe("रात 9 बजे");
    expect(spokenClock(0, 0, "en")).toBe("12 AM");
  });

  it("drops typographic quotes", () => {
    expect(speakable("update to “leave it at reception”?", "en")).toBe("update to leave it at reception?");
  });
});

async function provider(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("GNANI_API_KEY", "test-key");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { GnaniTimbreProvider } = await import("@/server/providers/tts/gnani-timbre");
  return new GnaniTimbreProvider();
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const audio = (type = "audio/mpeg") => new Response(new Uint8Array([0xff, 0xf3, 0x84, 0xc4]), { status: 200, headers: { "content-type": type } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("GnaniTimbreProvider", () => {
  it("sends the documented JSON request with the language's voice and spoken-form text", async () => {
    fetchMock.mockResolvedValue(audio());
    const p = await provider();
    const out = await p.synthesize("Order 4821: customer unavailable mark karun?", { language: "hi-en" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.vachana.ai/api/v1/tts/inference");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", "X-API-Key-ID": "test-key" });
    expect(JSON.parse(init.body)).toEqual({
      text: "Order chaar aath do ek: customer unavailable mark karun?",
      model: "timbre-v2.5",
      voice: "Poorvi",
      language: "hi-en",
      speed: 1.0,
      audio_config: { sample_rate: 24000, num_channels: 1, container: "mp3", bitrate: "64k" },
    });

    expect(out.mimeType).toBe("audio/mpeg");
    expect(out.audio?.byteLength).toBe(4);
    expect(out.text).toBe("Order 4821: customer unavailable mark karun?"); // display text unchanged
    expect(out.provenance).toMatchObject({ provider: "gnani-timbre", simulated: false, model: "timbre-v2.5 · Poorvi" });
  });

  it.each([
    ["hi", "Nalini", "hi-IN"],
    ["en", "Kaveri", "en-IN"],
  ] as const)("maps %s to voice %s / %s", async (language, voice, code) => {
    fetchMock.mockResolvedValue(audio());
    await (await provider()).synthesize("x", { language });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ voice, language: code });
  });

  it("uses the documented WAV audio_config when configured", async () => {
    fetchMock.mockResolvedValue(audio("audio/wav"));
    await (await provider({ GNANI_TTS_CONTAINER: "wav" })).synthesize("x", { language: "en" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).audio_config).toEqual({
      sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: "linear_pcm", container: "wav",
    });
  });

  it("maps the documented flat error body", async () => {
    fetchMock.mockResolvedValue(json(500, { success: false, message: "No audio generated during synthesis", status_code: 500 }));
    await expect((await provider()).synthesize("x", { language: "hi" })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
      message: expect.stringContaining("No audio generated during synthesis"),
    });
  });

  it("maps auth errors to NOT_CONFIGURED", async () => {
    fetchMock.mockResolvedValue(json(401, { detail: { error_code: "INVALID_API_KEY", message: "Unauthorized", status_code: 401 } }));
    await expect((await provider()).synthesize("x", { language: "en" })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("rejects a non-audio success response", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await expect((await provider()).synthesize("x", { language: "en" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("retries once on 429 through the shared Gnani queue", async () => {
    fetchMock
      .mockResolvedValueOnce(json(429, { detail: { error_code: "RATE_LIMITED", message: "Only 1 active request is allowed at a time.", status_code: 429 } }))
      .mockResolvedValueOnce(audio());
    const out = await (await provider()).synthesize("x", { language: "en" });
    expect(out.audio).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
