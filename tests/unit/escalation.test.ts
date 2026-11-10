import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  closeEscalation,
  confirmReport,
  editReport,
  escalateReport,
  resolveEscalation,
  submitReport,
} from "@/server/pipeline/process-report";
import { getRepository } from "@/server/repositories";

// Mock speech-to-text, the real rules engine, real verification and the in-memory repository.
// AG-101's open orders in the seed: ORD-4821 (13:00), ORD-4907 (15:00), ORD-4952 (16:00). ORD-3388 is another agent's.
const AGENT = "AG-101";
const DISPATCHER = "dispatcher-1";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T14:00:00+05:30"));
});
afterAll(() => vi.useRealTimers());

const submit = (mockTranscript: string, language: "hi-en" | "en" = "en") =>
  submitReport({ agentId: AGENT, language, audio: null, mockTranscript });
const events = async (id: string) => (await getRepository().listAudit()).filter((e) => e.reportId === id);

describe("unknown order: route picker", () => {
  it("names the agent's open orders in the clarification question", async () => {
    const r = await submit("the order number is 108 and i found that no one is here to pick up it");
    expect(r.report.status).toBe("NEEDS_CLARIFICATION");
    expect(r.extraction?.payload.issue.value).toBe("CUSTOMER_UNAVAILABLE");
    expect(r.validation?.clarificationQuestion).toBe("I couldn't find order 108. Please say the order number again. Your orders today: 4821, 4907 and 4952.");
  });

  it("lists the route in Hinglish when no order was spoken at all", async () => {
    const r = await submit("customer ghar pe nahi hai", "hi-en");
    expect(r.validation?.clarificationQuestion).toBe("Yeh kaunse order ke baare mein hai? Order number boliye. Aapke route par orders: 4821, 4907 aur 4952.");
  });

  it("picking an order from the route re-verifies it and then waits for confirmation", async () => {
    const r = await submit("order 108, nobody answered the door");
    const picked = await editReport(r.report.id, AGENT, { orderReference: "4907" });
    expect(picked.report.status).toBe("AWAITING_CONFIRMATION");
    expect(picked.order?.id).toBe("ORD-4907");
    expect(picked.action).toBeNull(); // nothing executes without the agent's confirmation
  });
});

describe("send to dispatcher", () => {
  it("keeps the report for dispatch without changing any order", async () => {
    const before = await getRepository().getOrder("ORD-4952");
    const r = await submit("order 108 no one is here");
    const sent = await escalateReport(r.report.id, AGENT, "Label on the parcel is torn");
    expect(sent.report.status).toBe("ESCALATED");
    expect(sent.priority).toBe("HIGH");
    expect(sent.action).toBeNull();
    expect(await getRepository().getOrder("ORD-4952")).toEqual(before);
    const escalated = (await events(r.report.id)).find((e) => e.event === "REPORT_ESCALATED");
    expect(escalated).toMatchObject({ actorId: AGENT, actorRole: "AGENT", after: { status: "ESCALATED", note: "Label on the parcel is torn" } });
    // The agent can no longer confirm or re-send it.
    await expect(confirmReport(r.report.id, AGENT)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(escalateReport(r.report.id, AGENT, null)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("only from 'needs clarification', and only by the reporting agent", async () => {
    const verified = await submit("order 4952 customer is not at home");
    expect(verified.report.status).toBe("AWAITING_CONFIRMATION");
    await expect(escalateReport(verified.report.id, AGENT, null)).rejects.toMatchObject({ code: "INVALID_STATE" });
    const unknown = await submit("order 108 no one is here");
    await expect(escalateReport(unknown.report.id, "AG-102", null)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("dispatcher resolution", () => {
  it("refuses an order that is not on the reporting agent's route, and changes nothing", async () => {
    const r = await submit("order 108 no one is here");
    await escalateReport(r.report.id, AGENT, null);
    await expect(resolveEscalation(r.report.id, DISPATCHER, { orderId: "ORD-3388", requestedAction: "MARK_CUSTOMER_UNAVAILABLE" })).rejects.toMatchObject({
      code: "INVALID_STATE",
      message: expect.stringMatching(/not on this agent's route.*stays with dispatch/),
    });
    expect((await getRepository().getReport(r.report.id))?.report.status).toBe("ESCALATED");
  });

  it("links the right order after verification and executes it, confirmed by the dispatcher", async () => {
    const r = await submit("order 108 no one is here to receive it");
    await escalateReport(r.report.id, AGENT, null);
    const done = await resolveEscalation(r.report.id, DISPATCHER, { orderId: "ORD-4821", requestedAction: "MARK_CUSTOMER_UNAVAILABLE" });
    expect(done.report.status).toBe("EXECUTED");
    expect(done.action).toMatchObject({ orderId: "ORD-4821", type: "MARK_CUSTOMER_UNAVAILABLE", confirmedBy: DISPATCHER });
    const trail = await events(r.report.id);
    expect(trail.map((e) => e.event)).toEqual(
      expect.arrayContaining(["REPORT_ESCALATED", "ESCALATION_RESOLVED", "ACTION_CONFIRMED", "ACTION_EXECUTED", "ORDER_UPDATED"]),
    );
    expect(trail.find((e) => e.event === "ACTION_CONFIRMED")).toMatchObject({ actorId: DISPATCHER, actorRole: "DISPATCHER", after: { via: { channel: "dispatcher" } } });
    await expect(resolveEscalation(r.report.id, DISPATCHER, { orderId: "ORD-4821", requestedAction: "MARK_CUSTOMER_UNAVAILABLE" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("closes with a note and no change", async () => {
    const r = await submit("order 108 no one is here");
    await escalateReport(r.report.id, AGENT, null);
    const closed = await closeEscalation(r.report.id, DISPATCHER, "Duplicate of an earlier report");
    expect(closed.report.status).toBe("REJECTED");
    expect(closed.action).toBeNull();
    expect((await events(r.report.id)).find((e) => e.event === "ESCALATION_CLOSED")).toMatchObject({ actorRole: "DISPATCHER", after: { note: "Duplicate of an earlier report" } });
  });

  it("cannot resolve a report that was not sent to dispatch", async () => {
    const r = await submit("order 108 no one is here");
    await expect(resolveEscalation(r.report.id, DISPATCHER, { orderId: "ORD-4907", requestedAction: "MARK_CUSTOMER_UNAVAILABLE" })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(closeEscalation(r.report.id, DISPATCHER, "n/a")).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
