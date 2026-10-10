import { describe, expect, it } from "vitest";
import { extractBearerToken } from "@/src/server/auth/identity-userinfo";

describe("extractBearerToken", () => {
  it("parses Bearer tokens", () => {
    expect(extractBearerToken("Bearer abc.def")).toBe("abc.def");
    expect(extractBearerToken("bearer xyz")).toBe("xyz");
  });

  it("returns null for missing or invalid headers", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
  });
});
