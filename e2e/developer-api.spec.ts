import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";
import { E2E_BASE_URL } from "./env";

type Received = { headers: Record<string, string | string[] | undefined>; body: string };

const RECEIVER_PORT = 3198;

test.describe("developer API: access tokens and webhooks", () => {
  let owner: TestUser;
  let server: Server;
  const received: Received[] = [];

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(RECEIVER_PORT, "127.0.0.1", resolve));
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test.beforeEach(async () => {
    owner = await newUser("Dev Eloper");
    received.length = 0;
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("tokens read and write as you, read-only ones only read, and revoked ones stop", async ({ playwright }) => {
    const ws = await personalWorkspaceId(owner);
    const make = async (scope: "read" | "write") => {
      const res = await owner.api.post("/api/me/access-tokens", { data: { name: `${scope} script`, scope, days: 30 } });
      expect(res.status(), await res.text()).toBe(201);
      return (await res.json()) as { token: string; accessToken: { id: string; hint: string } };
    };
    const reader = await make("read");
    const writer = await make("write");
    expect(reader.token).toMatch(/^nlp_r_/);
    expect(writer.accessToken.hint).toBe(`${writer.token.slice(0, 10)}…${writer.token.slice(-4)}`);

    const as = (token: string) => playwright.request.newContext({ baseURL: E2E_BASE_URL, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
    const read = await as(reader.token);
    const write = await as(writer.token);
    expect(((await (await read.get("/api/me")).json()) as { user: { id: string } }).user.id).toBe(owner.id);
    expect((await read.get(`/api/workspaces/${ws}/transactions`)).ok()).toBe(true);
    const refused = await read.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "5.00", currency: "USD", date: today() } });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error).toBe("read_only_token");
    // No CSRF header needed with a token.
    expect((await write.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "5.00", currency: "USD", date: today(), merchant: "Script" } })).status()).toBe(201);
    // Tokens can't manage tokens or delete the account.
    expect((await write.get("/api/me/access-tokens")).status()).toBe(403);
    expect((await write.delete("/api/me")).status()).toBe(403);

    expect((await owner.api.delete(`/api/me/access-tokens/${writer.accessToken.id}`)).ok()).toBe(true);
    expect((await write.get("/api/me")).status()).toBe(401);
    expect((await (await owner.api.get("/api/me/access-tokens")).json()).tokens).toHaveLength(1);
    await read.dispose();
    await write.dispose();
  });

  test("a webhook gets signed events for what it picked, and its deliveries are logged", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const hookUrl = `http://localhost:${RECEIVER_PORT}/hook`;
    expect((await owner.api.post(`/api/workspaces/${ws}/webhooks`, { data: { url: "http://10.0.0.5/hook", events: ["transaction.created"] } })).status()).toBe(400);
    expect((await owner.api.post(`/api/workspaces/${ws}/webhooks`, { data: { url: hookUrl, events: [] } })).status()).toBe(400);
    const made = await owner.api.post(`/api/workspaces/${ws}/webhooks`, { data: { url: hookUrl, events: ["transaction.created", "transaction.deleted"] } });
    expect(made.status(), await made.text()).toBe(201);
    const { webhook, secret } = (await made.json()) as { webhook: { id: string }; secret: string };

    const add = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "12.50", currency: "USD", date: today(), merchant: "Cafe" } });
    expect(add.status()).toBe(201);
    const { transaction } = (await add.json()) as { transaction: { id: string } };
    // Not picked: no event.
    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { note: "latte" } })).ok()).toBe(true);
    expect((await owner.api.delete(`/api/transactions/${transaction.id}`)).ok()).toBe(true);

    await expect.poll(() => received.length).toBe(2);
    const [created, deleted] = received.map((r) => ({ ...r, event: JSON.parse(r.body) as { id: string; type: string; data: { id: string; merchant?: string } } }));
    expect(created!.event).toMatchObject({ type: "transaction.created", data: { id: transaction.id, merchant: "Cafe" } });
    expect(deleted!.event).toMatchObject({ type: "transaction.deleted", data: { id: transaction.id, workspaceId: ws } });
    expect(created!.headers["noirly-event"]).toBe("transaction.created");
    expect(created!.headers["noirly-delivery"]).toBe(created!.event.id);
    const signature = String(created!.headers["noirly-signature"]);
    const t = /t=(\d+)/.exec(signature)![1]!;
    expect(signature).toContain(`v1=${createHmac("sha256", secret).update(`${t}.${created!.body}`).digest("hex")}`);

    const test = await owner.api.post(`/api/webhooks/${webhook.id}/test`);
    expect(((await test.json()) as { delivery: { status: string; lastStatusCode: number } }).delivery).toMatchObject({ status: "succeeded", lastStatusCode: 200 });
    const { deliveries } = (await (await owner.api.get(`/api/webhooks/${webhook.id}/deliveries`)).json()) as { deliveries: Array<{ eventType: string; status: string }> };
    expect(deliveries.map((d) => d.eventType)).toEqual(["ping", "transaction.deleted", "transaction.created"]);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/api");
    await expect(page.locator(`[data-webhook="${hookUrl}"]`)).toContainText("Transaction added");
    await page.screenshot({ path: "test-results/developer-api.png", fullPage: true });
    await context.close();
  });
});
