import { describe, expect, it } from "vitest";
import { hasAppRole, safeNext } from "@/server/auth/redirect";

describe("post-login redirect", () => {
  it("keeps same-site paths", () => expect(safeNext("/lab", "dispatcher")).toBe("/lab"));
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "", null, undefined])("refuses %j and falls back to the role home", (next) => {
    expect(safeNext(next, "dispatcher")).toBe("/dashboard");
    expect(safeNext(next, "agent")).toBe("/agent");
  });
  it("only accepts provisioned roles", () => {
    expect(hasAppRole("agent")).toBe(true);
    expect(hasAppRole("dispatcher")).toBe(true);
    expect(hasAppRole(undefined)).toBe(false);
    expect(hasAppRole("admin")).toBe(false);
  });
});
