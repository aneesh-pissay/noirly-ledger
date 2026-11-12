import { describe, expect, it } from "vitest";
import { isSensitiveRemoval, isSensitiveRoleChange, pendingState } from "./dual-control";

describe("two-person approval", () => {
  it("counts changes to who decides as sensitive", () => {
    const change = (from: "owner" | "approver" | "member", to: "owner" | "approver" | "member", fromCustomRoleId: string | null = null, toCustomRoleId?: string | null) =>
      isSensitiveRoleChange({ from, to, fromCustomRoleId, toCustomRoleId });
    expect(change("member", "approver")).toBe(true);
    expect(change("approver", "member")).toBe(true);
    expect(change("approver", "owner")).toBe(true);
    expect(change("member", "member")).toBe(false);
    expect(change("approver", "approver")).toBe(false);
    // A custom role given or taken away, or swapped.
    expect(change("member", "member", null, "r1")).toBe(true);
    expect(change("member", "member", "r1", null)).toBe(true);
    expect(change("member", "member", "r1", "r1")).toBe(false);
    // Left out: the custom role stays as it is.
    expect(change("member", "member", "r1", undefined)).toBe(false);
  });

  it("removing an owner or approver is sensitive, a member isn't", () => {
    expect(isSensitiveRemoval("owner")).toBe(true);
    expect(isSensitiveRemoval("approver")).toBe(true);
    expect(isSensitiveRemoval("member")).toBe(false);
  });

  it("a request left waiting past its time has expired", () => {
    const at = new Date("2026-11-03T00:00:00Z");
    expect(pendingState("pending", at, new Date("2026-11-02T23:59:59Z"))).toBe("pending");
    expect(pendingState("pending", at, at)).toBe("expired");
    expect(pendingState("approved", at, new Date("2026-12-01T00:00:00Z"))).toBe("approved");
  });
});
