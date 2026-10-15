import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { expect, request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext } from "@playwright/test";
import { E2E_AUTH_SECRET, E2E_BASE_URL, SESSION_COOKIE } from "./env";

export const today = () => new Date().toISOString().slice(0, 10);

export type TestUser = {
  name: string;
  /** Session cookie value, as the Identity sign-in would set it. */
  token: string;
  /** Signed-in API client, sending the CSRF header the web app sends. */
  api: APIRequestContext;
  id: string;
};

/**
 * A brand-new person with a minted session (the JWT Auth.js would produce
 * after Identity sign-in). Ledger provisions them, with a personal
 * workspace, on their first request.
 */
export async function newUser(name: string): Promise<TestUser> {
  const sub = `e2e-${randomUUID()}`;
  const token = await encode({
    secret: E2E_AUTH_SECRET,
    salt: SESSION_COOKIE,
    token: {
      sub,
      identitySub: sub,
      name,
      email: `${sub}@noirly.test`,
      signedInAt: Date.now(),
    },
  });
  const api = await playwrightRequest.newContext({
    baseURL: E2E_BASE_URL,
    extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${token}`, "x-noirly-csrf": "1" },
  });
  const me = await api.get("/api/me");
  expect(me.ok(), await me.text()).toBe(true);
  const { user } = (await me.json()) as { user: { id: string } };
  return { name, token, api, id: user.id };
}

export async function personalWorkspaceId(user: TestUser): Promise<string> {
  const { workspaces } = (await (await user.api.get("/api/workspaces")).json()) as {
    workspaces: Array<{ id: string; kind: string }>;
  };
  return workspaces.find((w) => w.kind === "personal")!.id;
}

/** A team owned by `owner`, with `members` joined through real invites and one pool. */
export async function newTeam(owner: TestUser, members: TestUser[] = [], role: "member" | "approver" = "member") {
  const created = await owner.api.post("/api/workspaces", {
    data: { name: `Team ${randomUUID().slice(0, 6)}`, baseCurrency: "USD" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { workspace } = (await created.json()) as { workspace: { id: string } };
  for (const member of members) {
    const invite = await owner.api.post(`/api/workspaces/${workspace.id}/invites`, { data: { role } });
    expect(invite.ok(), await invite.text()).toBe(true);
    const { invite: { token } } = (await invite.json()) as { invite: { token: string } };
    const accepted = await member.api.post("/api/invites/accept", { data: { token } });
    expect(accepted.ok(), await accepted.text()).toBe(true);
  }
  const pool = await owner.api.post(`/api/workspaces/${workspace.id}/budget-pools`, {
    data: { name: "Ops", limitMajor: "5000.00" },
  });
  expect(pool.status(), await pool.text()).toBe(201);
  const { pool: { id: poolId } } = (await pool.json()) as { pool: { id: string } };
  return { workspaceId: workspace.id, poolId };
}

/** A browser context signed in as `user`. */
export async function browserAs(browser: Browser, user: TestUser): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  await context.addCookies([
    { name: SESSION_COOKIE, value: user.token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" },
  ]);
  return context;
}

export async function disposeAll(...users: TestUser[]) {
  await Promise.all(users.map((user) => user.api.dispose()));
}
