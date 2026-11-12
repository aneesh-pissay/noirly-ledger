import { afterEach, describe, expect, it } from "vitest";
import { open, seal } from "./secret-box";

describe("secret box", () => {
  const before = process.env.LEDGER_SECRET_KEY;
  afterEach(() => {
    process.env.LEDGER_SECRET_KEY = before;
  });

  it("opens what it sealed, and nothing tampered with or sealed under another key", () => {
    process.env.LEDGER_SECRET_KEY = "k".repeat(32);
    const sealed = seal("nfp_w_secret");
    expect(sealed).not.toContain("nfp_w_secret");
    expect(open(sealed)).toBe("nfp_w_secret");
    expect(seal("nfp_w_secret")).not.toBe(sealed);
    const parts = sealed.split(".");
    expect(() => open([...parts.slice(0, 3), Buffer.from("other").toString("base64url")].join("."))).toThrow();
    process.env.LEDGER_SECRET_KEY = "j".repeat(32);
    expect(() => open(sealed)).toThrow();
  });
});
