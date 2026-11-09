/**
 * DEMO Testing Lab dataset. Reference transcripts and expected fields are hand-labelled ground truth;
 * the "results" are scripted, SIMULATED outputs used to build the lab UI. Latencies are illustrative,
 * not measured. Scores computed from them are real arithmetic over simulated data.
 */
import type { LabResult, LabRun, LabSample, ValidationOutcome } from "@/domain";
import { buildPayload, ist, type PayloadSpec } from "./build";

interface Case {
  sample: LabSample;
  transcript: string;
  payload: PayloadSpec;
  outcome: ValidationOutcome;
  latency: { stt: number; reasoning: number; validation: number };
}

const CASES: Case[] = [
  {
    sample: {
      id: "L-01", title: "Reschedule after 6 pm", language: "hi-en", accent: "Delhi", noise: "clean", durationMs: 5200,
      referenceTranscript: "Order 4821 ka customer ghar pe nahi hai, shaam 6 baje ke baad aana.",
      expected: { orderReference: "4821", issue: "CUSTOMER_UNAVAILABLE", requestedAction: "RESCHEDULE", expectsClarification: false },
    },
    transcript: "Order 4821 ka customer ghar pe nahi hai, shaam 6 baje ke baad aana.",
    payload: { order: ["4821", "Order 4821", 0.95], issue: ["CUSTOMER_UNAVAILABLE", "customer ghar pe nahi hai", 0.92], action: ["RESCHEDULE", "shaam 6 baje ke baad aana", 0.86] },
    outcome: "VERIFIED", latency: { stt: 810, reasoning: 1290, validation: 34 },
  },
  {
    sample: {
      id: "L-02", title: "Address correction", language: "en", accent: "Bengaluru", noise: "moderate", durationMs: 6100,
      referenceTranscript: "Order number 5307, address is wrong, customer says flat 204 not 402.",
      expected: { orderReference: "5307", issue: "WRONG_ADDRESS", requestedAction: "FLAG_ADDRESS_ISSUE", expectsClarification: false },
    },
    transcript: "Order number 5307, address is wrong, customer says flat 204 not 402.",
    payload: { order: ["5307", "Order number 5307", 0.96], issue: ["WRONG_ADDRESS", "address is wrong", 0.94], action: ["FLAG_ADDRESS_ISSUE", "address is wrong", 0.83] },
    outcome: "VERIFIED", latency: { stt: 960, reasoning: 1340, validation: 37 },
  },
  {
    sample: {
      id: "L-03", title: "Damaged box, street noise", language: "hi-en", accent: "Mumbai", noise: "heavy", durationMs: 4800,
      referenceTranscript: "Order 6120 ka box damaged hai, customer ne refuse kiya.",
      expected: { orderReference: "6120", issue: "PACKAGE_UNDELIVERABLE", requestedAction: "MARK_DELIVERY_FAILED", expectsClarification: false },
    },
    transcript: "Order 6112 ka box damaged hai, customer ne refuse kiya.",
    payload: { order: ["6112", "Order 6112", 0.68], issue: ["PACKAGE_UNDELIVERABLE", "box damaged hai", 0.93], action: ["MARK_DELIVERY_FAILED", "customer ne refuse kiya", 0.88] },
    outcome: "NEEDS_CLARIFICATION", latency: { stt: 1420, reasoning: 1380, validation: 41 },
  },
  {
    sample: {
      id: "L-04", title: "Neighbour handover", language: "en", accent: "Chennai", noise: "moderate", durationMs: 5600,
      referenceTranscript: "4410 customer not at home, neighbour will take, but no ID.",
      expected: { orderReference: "4410", issue: "CUSTOMER_UNAVAILABLE", requestedAction: "ESCALATE_TO_DISPATCHER", expectsClarification: false },
    },
    transcript: "4410 customer not at home, neighbour will take but no ID.",
    payload: { order: ["4410", "4410", 0.87], issue: ["CUSTOMER_UNAVAILABLE", "customer not at home", 0.93], action: ["ESCALATE_TO_DISPATCHER", "neighbour will take but no ID", 0.66] },
    outcome: "VERIFIED", latency: { stt: 990, reasoning: 1460, validation: 39 },
  },
  {
    sample: {
      id: "L-05", title: "No order number", language: "hi", accent: "Lucknow", noise: "clean", durationMs: 3900,
      referenceTranscript: "Customer ne kaha kal subah aana, abhi ghar pe koi nahi hai.",
      expected: { orderReference: null, issue: "RESCHEDULE_REQUEST", requestedAction: "RESCHEDULE", expectsClarification: true },
    },
    transcript: "Customer ne kaha kal subah aana, abhi ghar pe koi nahi hai.",
    payload: { issue: ["RESCHEDULE_REQUEST", "kal subah aana", 0.85], action: ["RESCHEDULE", "kal subah aana", 0.79], ambiguities: ["No order number mentioned."] },
    outcome: "NEEDS_CLARIFICATION", latency: { stt: 760, reasoning: 1210, validation: 29 },
  },
  {
    sample: {
      id: "L-06", title: "Evening window", language: "hi", accent: "Kolkata", noise: "moderate", durationMs: 4400,
      referenceTranscript: "Order 2290 shaam saat se aath ke beech dena hai.",
      expected: { orderReference: "2290", issue: "RESCHEDULE_REQUEST", requestedAction: "RESCHEDULE", expectsClarification: false },
    },
    transcript: "Order 2290 shaam saat se aath ke beech dena hai.",
    payload: { order: ["2290", "Order 2290", 0.95], issue: ["RESCHEDULE_REQUEST", "shaam saat se aath ke beech", 0.84], action: ["RESCHEDULE", "dena hai", 0.8] },
    outcome: "VERIFIED", latency: { stt: 880, reasoning: 1330, validation: 35 },
  },
  {
    sample: {
      id: "L-07", title: "Building missing", language: "hi-en", accent: "Hyderabad", noise: "heavy", durationMs: 4100,
      referenceTranscript: "Bhai 6655 ka address pe building hi nahi hai.",
      expected: { orderReference: "6655", issue: "WRONG_ADDRESS", requestedAction: "FLAG_ADDRESS_ISSUE", expectsClarification: false },
    },
    transcript: "Bhai 6655 ka address pe building hi nahi hai.",
    payload: { order: ["6655", "6655", 0.86], issue: ["WRONG_ADDRESS", "building hi nahi hai", 0.88], action: ["MARK_DELIVERY_FAILED", "building hi nahi hai", 0.58] },
    outcome: "VERIFIED", latency: { stt: 1380, reasoning: 1410, validation: 36 },
  },
  {
    sample: {
      id: "L-08", title: "Spoken Hindi digits", language: "hi", accent: "Punjab", noise: "moderate", durationMs: 4700,
      referenceTranscript: "Order chaar aath do ek, customer phone nahi utha raha.",
      expected: { orderReference: "4821", issue: "CUSTOMER_UNAVAILABLE", requestedAction: "MARK_CUSTOMER_UNAVAILABLE", expectsClarification: false },
    },
    transcript: "Order chaar aath do ek, customer phone nahi utha raha.",
    payload: { order: ["4821", "Order chaar aath do ek", 0.82], issue: ["CUSTOMER_UNAVAILABLE", "customer phone nahi utha raha", 0.9], action: ["MARK_CUSTOMER_UNAVAILABLE", "phone nahi utha raha", 0.81] },
    outcome: "VERIFIED", latency: { stt: 930, reasoning: 1520, validation: 40 },
  },
  {
    sample: {
      id: "L-09", title: "Reception drop-off", language: "en", accent: "Bengaluru", noise: "clean", durationMs: 5000,
      referenceTranscript: "Order 4907, security not allowing entry, customer said leave it at reception.",
      expected: { orderReference: "4907", issue: "UNCLEAR_INSTRUCTIONS", requestedAction: "UPDATE_INSTRUCTIONS", expectsClarification: false },
    },
    transcript: "Order 4907, security not allowing entry, customer said leave it at reception.",
    payload: { order: ["4907", "Order 4907", 0.97], issue: ["UNCLEAR_INSTRUCTIONS", "security not allowing entry", 0.86], action: ["UPDATE_INSTRUCTIONS", "leave it at reception", 0.91] },
    outcome: "VERIFIED", latency: { stt: 790, reasoning: 1250, validation: 33 },
  },
  {
    sample: {
      id: "L-10", title: "Out of station", language: "hi-en", accent: "Delhi", noise: "heavy", durationMs: 4300,
      referenceTranscript: "Order 5590 customer bahar gaye hain, Monday ko dena.",
      expected: { orderReference: "5590", issue: "RESCHEDULE_REQUEST", requestedAction: "RESCHEDULE", expectsClarification: false },
    },
    transcript: "Order 5590 customer bahar gaye hain, Monday ko dena.",
    payload: { order: ["5590", "Order 5590", 0.94], action: ["RESCHEDULE", "Monday ko dena", 0.87] },
    outcome: "VERIFIED", latency: { stt: 1460, reasoning: 1300, validation: 38 },
  },
];

export const LAB_SAMPLES: LabSample[] = CASES.map((c) => c.sample);

const results: LabResult[] = CASES.map((c) => ({
  sampleId: c.sample.id,
  transcript: c.transcript,
  payload: buildPayload(c.transcript, c.payload),
  validationOutcome: c.outcome,
  stageLatencyMs: c.latency,
  simulated: true,
}));

export const LAB_RUNS: LabRun[] = [
  {
    id: "RUN-003",
    label: "Baseline · mock providers",
    createdAt: ist("15:10"),
    providers: { stt: "mock-stt", reasoning: "mock-llm" },
    simulated: true,
    results,
    source: "demo",
    status: "completed",
  },
];
