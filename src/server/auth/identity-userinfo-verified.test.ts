import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearIdentityUserInfoCache,
  fetchIdentityUserInfo,
} from "@/src/server/auth/identity-userinfo";

/** Identity's userinfo answer for a mobile access token. */
function identityReplies(body: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
}

const sub = "6a0c1f2e3d4b5a6978809a1b";

describe("fetchIdentityUserInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearIdentityUserInfoCache();
  });

  it("accepts a verified email", async () => {
    identityReplies({ sub, email: "ada@example.com", email_verified: true });
    await expect(fetchIdentityUserInfo("token-verified")).resolves.toMatchObject({ sub });
  });

  it("refuses an email Identity hasn't verified", async () => {
    identityReplies({ sub, email: "squatter@example.com", email_verified: false });
    await expect(fetchIdentityUserInfo("token-unverified")).rejects.toThrow(/not verified/);
    // A missing claim is not a yes.
    identityReplies({ sub, email: "squatter@example.com" });
    await expect(fetchIdentityUserInfo("token-no-claim")).rejects.toThrow(/not verified/);
  });
});
