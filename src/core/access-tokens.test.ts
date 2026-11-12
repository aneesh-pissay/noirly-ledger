import { describe, expect, it } from "vitest";
import { isAccessToken, scopeAllows, tokenHint, tokenScope } from "./access-tokens";
import { decisionEvent, webhookEventsProblem } from "./webhooks";

describe("access tokens", () => {
  it("reads the scope from the token, and only from ours", () => {
    const secret = "A".repeat(43);
    expect(tokenScope(`nlp_r_${secret}`)).toBe("read");
    expect(tokenScope(`nlp_w_${secret}`)).toBe("write");
    expect(tokenScope(`nlp_x_${secret}`)).toBeNull();
    expect(tokenScope(`nfp_w_${secret}`)).toBeNull();
    expect(tokenScope("nlp_w_short")).toBeNull();
    expect(isAccessToken(`nlp_w_${secret}`)).toBe(true);
    expect(isAccessToken("eyJhbGciOi")).toBe(false);
  });

  it("lets read-only tokens read only", () => {
    expect(scopeAllows("read", "GET")).toBe(true);
    expect(scopeAllows("read", "head")).toBe(true);
    expect(scopeAllows("read", "POST")).toBe(false);
    expect(scopeAllows("read", "DELETE")).toBe(false);
    expect(scopeAllows("write", "PATCH")).toBe(true);
  });

  it("hints without giving the token away", () => {
    const token = `nlp_w_${"x".repeat(39)}WXYZ`;
    expect(tokenHint(token)).toBe("nlp_w_xxxx…WXYZ");
  });
});

describe("webhook events", () => {
  it("checks the events picked", () => {
    expect(webhookEventsProblem([])).toMatch(/at least one/);
    expect(webhookEventsProblem(["transaction.created", "nope"])).toBe("Unknown event");
    expect(webhookEventsProblem(["budget.alert"])).toBeNull();
  });

  it("only a final decision is an event", () => {
    expect(decisionEvent("approved")).toBe("expense.approved");
    expect(decisionEvent("rejected")).toBe("expense.rejected");
    expect(decisionEvent("pending")).toBeNull();
  });
});
