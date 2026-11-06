import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Contract under test: docs.gnani.ai/api/STT/speech-to-text (read 2026-11-06).
// fetch is stubbed — these tests pin our request/response handling to the documented shapes.

const wav = (bytes = 64) => ({ data: new ArrayBuffer(bytes), mimeType: "audio/wav", durationMs: 4000 });

async function provider(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("GNANI_API_KEY", "test-key");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { GnaniPrismaProvider } = await import("@/server/providers/stt/gnani-prisma");
  return new GnaniPrismaProvider();
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("GnaniPrismaProvider", () => {
  it("sends the documented multipart request", async () => {
    fetchMock.mockResolvedValue(
      json(200, { success: true, request_id: "req_abc123", transcript: "order 4821 ka customer ghar pe nahi hai", model: "prisma-v2.5", processing_time: 0.14, end_to_end_latency: 0.17 }),
    );
    const p = await provider();
    const out = await p.transcribe(wav(), { language: "hi-en" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.vachana.ai/stt/v3");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key-ID"]).toBe("test-key");
    const form = init.body as FormData;
    expect(form.get("audio_file")).toBeInstanceOf(Blob);
    expect((form.get("audio_file") as File).name).toBe("report.wav");
    expect(form.get("language_code")).toBe("en-IN"); // Hinglish → en-IN per docs
    expect(form.get("format")).toBe("transcribe");
    expect(form.has("model")).toBe(false); // omitted → prisma-v2.5 (documented default)

    expect(out.text).toBe("order 4821 ka customer ghar pe nahi hai");
    expect(out.confidence).toBeNull(); // not provided by the API — never invented
    expect(out.provenance).toMatchObject({ provider: "gnani-prisma", simulated: false, model: "prisma-v2.5", requestId: "req_abc123" });
  });

  it("maps Hindi to hi-IN and sends the v3.0 model when configured", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, transcript: "नमस्ते", model: "prisma-v3.0" }));
    const p = await provider({ GNANI_STT_MODEL: "prisma-v3.0" });
    await p.transcribe(wav(), { language: "hi" });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("language_code")).toBe("hi-IN");
    expect(form.get("model")).toBe("prisma-v3.0");
  });

  it("ignores mockTranscript", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, transcript: "real words", model: "prisma-v2.5" }));
    const out = await (await provider()).transcribe(wav(), { language: "en", mockTranscript: "scripted" });
    expect(out.text).toBe("real words");
  });

  it("refuses undocumented audio formats without calling the API", async () => {
    const p = await provider();
    await expect(p.transcribe({ ...wav(), mimeType: "audio/webm;codecs=opus" }, { language: "en" })).rejects.toMatchObject({ code: "UNSUPPORTED_INPUT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses clips over 30 seconds", async () => {
    const p = await provider();
    await expect(p.transcribe({ ...wav(), durationMs: 45_000 }, { language: "en" })).rejects.toMatchObject({ code: "UNSUPPORTED_INPUT" });
  });

  it("returns empty text for no speech (pipeline turns that into a failed report)", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, transcript: "", model: "prisma-v2.5" }));
    const out = await (await provider()).transcribe(wav(), { language: "en" });
    expect(out.text).toBe("");
    expect(out.segments).toEqual([]);
  });

  it("retries once on 429 (one active request per key)", async () => {
    fetchMock
      .mockResolvedValueOnce(json(429, { detail: { error_code: "RATE_LIMITED", message: "Only 1 active request is allowed at a time.", status_code: 429 } }))
      .mockResolvedValueOnce(json(200, { success: true, transcript: "ok", model: "prisma-v2.5" }));
    const out = await (await provider()).transcribe(wav(), { language: "en" });
    expect(out.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps auth failures to NOT_CONFIGURED with the documented error code", async () => {
    fetchMock.mockResolvedValue(json(401, { detail: { error_code: "INVALID_API_KEY", message: "Invalid key", status_code: 401 } }));
    await expect((await provider()).transcribe(wav(), { language: "en" })).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
      message: expect.stringContaining("INVALID_API_KEY"),
    });
  });

  it("maps 400 envelope errors to UNSUPPORTED_INPUT", async () => {
    fetchMock.mockResolvedValue(json(400, { success: false, error: { type: "MAX_AUDIO_DURATION_EXCEEDED", message: "Too long" } }));
    await expect((await provider()).transcribe(wav(), { language: "en" })).rejects.toMatchObject({
      code: "UNSUPPORTED_INPUT",
      message: expect.stringContaining("MAX_AUDIO_DURATION_EXCEEDED"),
    });
  });

  it("rejects an unexpected success shape", async () => {
    fetchMock.mockResolvedValue(json(200, { text: "wrong field" }));
    await expect((await provider()).transcribe(wav(), { language: "en" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("reports NOT_CONFIGURED without a key", async () => {
    vi.resetModules();
    vi.stubEnv("GNANI_API_KEY", "");
    const { GnaniPrismaProvider } = await import("@/server/providers/stt/gnani-prisma");
    const p = new GnaniPrismaProvider();
    expect(p.isConfigured()).toBe(false);
    await expect(p.transcribe(wav(), { language: "en" })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});
