import { describe, expect, it } from "vitest";
import { classifySpokenReply } from "@/lib/spoken-reply";

describe("spoken yes/no classifier", () => {
  it.each([
    "haan",
    "Haan ji",
    "haan ji, kar do",
    "theek hai",
    "yes",
    "Yes, confirm it.",
    "okay",
    "हाँ",
    "हां जी",
    "ठीक है",
    "bilkul sahi hai",
  ])("hears %j as yes", (text) => expect(classifySpokenReply(text)).toBe("yes"));

  it.each(["nahi", "Nahin", "no", "cancel karo", "galat hai", "नहीं", "मत करो", "reject it"])("hears %j as no", (text) =>
    expect(classifySpokenReply(text)).toBe("no"),
  );

  it.each([
    ["", "silence"],
    ["   ", "whitespace only"],
    ["haan nahi", "mixed signals"],
    ["sahi nahi hai", "negated yes"],
    ["theek hai na", "tag question"],
    ["confirm mat karo", "negated confirm"],
    ["haan but slot 6 baje karo", "extra content"],
    ["order 4821", "no decision word"],
    ["haan haan haan haan haan haan haan", "too long"],
    ["hmm", "hesitation"],
  ])("treats %j as unclear (%s)", (text) => expect(classifySpokenReply(text)).toBe("unclear"));
});
