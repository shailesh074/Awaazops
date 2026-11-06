import "server-only";
import type { ReasoningInput, ReasoningProvider, ReasoningResult } from "./types";

/**
 * SIMULATED reasoning. Uses a few transparent keyword rules — not a model — so the pipeline and UI
 * can be exercised end-to-end. It emits the same raw shape the real LLM will, so it goes through
 * the same validation. Always marked simulated.
 */
export class MockReasoningProvider implements ReasoningProvider {
  readonly id = "mock-llm" as const;

  isConfigured(): boolean {
    return true;
  }

  async extract({ transcript }: ReasoningInput): Promise<ReasoningResult> {
    const started = performance.now();
    const span = (re: RegExp) => {
      const m = re.exec(transcript);
      return m ? { quote: m[0], start: m.index, end: m.index + m[0].length } : null;
    };

    const orderSpan = span(/order\s*(?:no\.?|number)?\s*#?\s*\d{3,}/i);
    const orderDigits = orderSpan?.quote.match(/\d{3,}/)?.[0] ?? null;
    const unavailableSpan = span(/ghar pe nahi|not at home|available nahi|phone nahi utha/i);
    const timeSpan = span(/(shaam|subah|dopahar|raat)\s*\d{1,2}\s*baje(\s*ke\s*baad)?/i);

    const raw = {
      orderReference: { value: orderDigits, evidence: orderSpan, confidence: orderSpan ? 0.9 : 0 },
      issue: {
        value: unavailableSpan ? "CUSTOMER_UNAVAILABLE" : null,
        evidence: unavailableSpan,
        confidence: unavailableSpan ? 0.8 : 0,
      },
      requestedAction: {
        value: timeSpan ? "RESCHEDULE" : unavailableSpan ? "MARK_CUSTOMER_UNAVAILABLE" : null,
        evidence: timeSpan ?? unavailableSpan,
        confidence: timeSpan || unavailableSpan ? 0.7 : 0,
      },
      // Time resolution to ISO is the normaliser's job (step 6); the mock only reports the phrase.
      timeConstraint: { value: null, evidence: timeSpan, confidence: timeSpan ? 0.5 : 0 },
      notes: { value: null, evidence: null, confidence: 0 },
      ambiguities: orderSpan ? [] : ["No order number found in transcript."],
    };

    return {
      raw,
      provenance: {
        provider: this.id,
        simulated: true,
        latencyMs: Math.round(performance.now() - started),
        createdAt: new Date().toISOString(),
      },
    };
  }
}
