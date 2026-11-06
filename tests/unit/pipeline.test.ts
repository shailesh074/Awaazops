import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { confirmReport, editReport, rejectReport, submitReport } from "@/server/pipeline/process-report";
import { getRepository } from "@/server/repositories";

// End-to-end through the mock providers, the real validation engine and the in-memory repository.
// Demo agent AG-101 owns ORD-4821 and ORD-4952 in the seed data.
const AGENT = "AG-101";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T14:00:00+05:30"));
});
afterAll(() => vi.useRealTimers());

const submit = (mockTranscript: string) =>
  submitReport({ agentId: AGENT, language: "hi-en", audio: null, mockTranscript });

describe("report pipeline", () => {
  it("verifies, waits for confirmation, then executes and audits", async () => {
    const stages: string[] = [];
    const r = await submitReport(
      {
        agentId: AGENT,
        language: "hi-en",
        audio: null,
        mockTranscript: "Boss, order 4821 ka customer ghar pe nahi hai. Usne bola shaam 6 baje ke baad delivery karna.",
      },
      (e) => e.state === "done" && stages.push(e.stage),
    );
    expect(stages).toEqual(["stt", "reasoning", "validation", "tts"]);
    expect(r.report.status).toBe("AWAITING_CONFIRMATION");
    expect(r.action).toBeNull();
    expect((await getRepository().getOrder("ORD-4821"))?.status).toBe("ATTEMPTED"); // untouched before confirm

    const done = await confirmReport(r.report.id, AGENT);
    expect(done.report.status).toBe("EXECUTED");
    expect(done.action?.type).toBe("RESCHEDULE");
    expect(done.order?.status).toBe("RESCHEDULED");

    const events = (await getRepository().listAudit()).filter((e) => e.reportId === r.report.id).map((e) => e.event);
    expect(events).toEqual(expect.arrayContaining(["REPORT_SUBMITTED", "VALIDATION_COMPLETED", "ACTION_CONFIRMED", "ACTION_EXECUTED", "ORDER_UPDATED"]));
  });

  it("cannot confirm twice", async () => {
    const r = await submit("Order 4952 ka customer ghar pe nahi hai.");
    await confirmReport(r.report.id, AGENT);
    await expect(confirmReport(r.report.id, AGENT)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("asks for clarification on an unknown order and blocks confirmation", async () => {
    const r = await submit("Boss 9134 wala order, customer ghar pe nahi hai.");
    expect(r.report.status).toBe("NEEDS_CLARIFICATION");
    expect(r.validation?.clarificationQuestion).toMatch(/9134 nahi mila/);
    await expect(confirmReport(r.report.id, AGENT)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("refuses another agent's order", async () => {
    const r = await submit("Order 3388 ka customer available nahi hai, kal try karna.");
    expect(r.report.status).toBe("REJECTED");
    expect(r.validation?.outcome).toBe("REJECTED");
  });

  it("lets the agent fix a missing order number by edit", async () => {
    const r = await submit("Customer ne bola kal aana, abhi bahar hai.");
    expect(r.report.status).toBe("NEEDS_CLARIFICATION");
    const edited = await editReport(r.report.id, AGENT, { orderReference: "4952" });
    expect(edited.report.status).toBe("AWAITING_CONFIRMATION");
    expect(edited.order?.id).toBe("ORD-4952");
  });

  it("refuses actions by a different agent", async () => {
    const r = await submit("Order 4952 ka customer ghar pe nahi hai.");
    await expect(confirmReport(r.report.id, "AG-999")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rejected = await rejectReport(r.report.id, AGENT);
    expect(rejected.report.status).toBe("REJECTED");
  });
});
