/**
 * DEMO scripts for the Agent Portal while speech-to-text is mocked.
 * The mock STT provider returns the chosen script as the transcript (it cannot hear the recording);
 * everything after that — reasoning, verification, confirmation — runs through the real pipeline.
 */
export interface DemoScript {
  id: string;
  label: string;
  /** What the verification engine is expected to do with it. */
  hint: string;
  transcript: string;
}

export const DEMO_SCRIPTS: DemoScript[] = [
  {
    id: "reschedule",
    label: "Customer unavailable, reschedule",
    hint: "Expect: verified → confirmation",
    transcript: "Boss, order 4821 ka customer ghar pe nahi hai. Usne bola shaam 6 baje ke baad delivery karna.",
  },
  {
    id: "instructions",
    label: "New gate instructions",
    hint: "Expect: verified → confirmation",
    transcript: "Order 4952 ka customer bol raha hai gate number 2 se aana, main gate band hai.",
  },
  {
    id: "unknown-order",
    label: "Order number not found",
    hint: "Expect: database check fails → clarification",
    transcript: "Boss 9134 wala order, customer ghar pe nahi hai.",
  },
  {
    id: "missing-order",
    label: "No order number spoken",
    hint: "Expect: missing field → clarification",
    transcript: "Customer ne bola kal aana, abhi bahar hai.",
  },
  {
    id: "not-my-order",
    label: "Order on another agent's route",
    hint: "Expect: assignment check fails → refused",
    transcript: "Order 3388 ka customer available nahi hai, kal try karna.",
  },
];
