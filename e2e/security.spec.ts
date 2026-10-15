import { test, expect, request as playwrightRequest } from "@playwright/test";
import { disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";
import { E2E_BASE_URL, SESSION_COOKIE } from "./env";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("security", () => {
  let owner: TestUser;
  let member: TestUser;
  let team: { workspaceId: string; poolId: string };

  test.beforeEach(async () => {
    owner = await newUser("Olive Owner");
    member = await newUser("Milo Member");
    team = await newTeam(owner, [member]);
  });

  test.afterEach(async () => {
    await disposeAll(owner, member);
  });

  test("the test-login route is gone", async () => {
    const anonymous = await playwrightRequest.newContext({ baseURL: E2E_BASE_URL });
    expect((await anonymous.post("/api/e2e/bootstrap", { headers: { authorization: "Bearer anything" } })).status()).toBe(404);
    await anonymous.dispose();
  });

  test("cookie requests without the CSRF header, or from another site, are refused", async () => {
    const bare = await playwrightRequest.newContext({
      baseURL: E2E_BASE_URL,
      extraHTTPHeaders: { cookie: `${SESSION_COOKIE}=${owner.token}` },
    });
    const res = await bare.post(`/api/workspaces/${team.workspaceId}/categories`, { data: { name: "Nope" } });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("csrf_failed");
    // Reads still work without it.
    expect((await bare.get(`/api/workspaces/${team.workspaceId}/categories`)).ok()).toBe(true);
    await bare.dispose();

    const foreign = await owner.api.post(`/api/workspaces/${team.workspaceId}/categories`, {
      data: { name: "Nope" },
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status()).toBe(403);
  });

  test("receipts belong to their workspace", async () => {
    const personal = await personalWorkspaceId(owner);
    // Members can't upload into a workspace they aren't in.
    const intrude = await member.api.post(`/api/workspaces/${personal}/receipts`, {
      multipart: { file: { name: "r.png", mimeType: "image/png", buffer: png } },
    });
    expect(intrude.status()).toBe(403);

    const upload = await owner.api.post(`/api/workspaces/${personal}/receipts`, {
      multipart: { file: { name: "r.png", mimeType: "image/png", buffer: png } },
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const saved = (await upload.json()) as { key: string; url: string };
    expect(saved.url).toBe(`/api/receipts/${saved.key}`);

    expect((await owner.api.get(saved.url)).status()).toBe(200);
    expect((await member.api.get(saved.url)).status()).toBe(404);

    // Nor can one workspace's transaction point at another workspace's receipt.
    const borrowed = await member.api.post(`/api/workspaces/${team.workspaceId}/transactions`, {
      data: { type: "expense", amountMajor: "1.00", currency: "USD", date: today(), receiptStorageKey: saved.key },
    });
    expect(borrowed.status()).toBe(400);

    // A client-sent URL is ignored; the link always comes from the key.
    const own = await owner.api.post(`/api/workspaces/${personal}/transactions`, {
      data: {
        type: "expense", amountMajor: "1.00", currency: "USD", date: today(),
        receiptStorageKey: saved.key, receiptUrl: "https://evil.example/x.png",
      },
    });
    expect(own.status(), await own.text()).toBe(201);
    expect((await own.json()).transaction.receiptUrl).toBe(saved.url);
  });

  test("members can't change rates, categories, budgets or others' transactions", async () => {
    const ws = team.workspaceId;
    expect((await member.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "EUR", rate: "9.99" } })).status()).toBe(403);
    expect((await member.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Mine" } })).status()).toBe(403);
    const { categories } = await (await owner.api.get(`/api/workspaces/${ws}/categories`)).json();
    expect((await member.api.post(`/api/workspaces/${ws}/budgets`, {
      data: { categoryId: categories[0].id, period: "monthly", limitMajor: "10.00" },
    })).status()).toBe(403);

    const { transaction } = await (await owner.api.post(`/api/workspaces/${ws}/transactions`, {
      data: { type: "expense", amountMajor: "5.00", currency: "USD", date: today() },
    })).json();
    expect((await member.api.patch(`/api/transactions/${transaction.id}`, { data: { amountMajor: "0.01" } })).status()).toBe(403);
    expect((await member.api.delete(`/api/transactions/${transaction.id}`)).status()).toBe(403);

    // Their own is fine.
    const mine = await (await member.api.post(`/api/workspaces/${ws}/transactions`, {
      data: { type: "expense", amountMajor: "2.00", currency: "USD", date: today() },
    })).json();
    expect((await member.api.patch(`/api/transactions/${mine.transaction.id}`, { data: { note: "taxi" } })).ok()).toBe(true);

    // A malformed id is a 400, not a server error.
    expect((await member.api.post(`/api/workspaces/${ws}/transactions`, {
      data: { type: "expense", amountMajor: "1.00", currency: "USD", date: today(), categoryId: "not-an-id" },
    })).status()).toBe(400);
  });

  test("approved pool expenses can't be edited, and deleting one gives the money back", async () => {
    const { transaction, approval } = await (await member.api.post(`/api/workspaces/${team.workspaceId}/expenses`, {
      data: { budgetPoolId: team.poolId, amountMajor: "40.00", currency: "USD", date: today() },
    })).json();
    expect((await owner.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).ok()).toBe(true);
    const spent = async () => (await (await owner.api.get(`/api/budget-pools/${team.poolId}`)).json()).pool.currentSpendMinor;
    expect(await spent()).toBe(4000);

    expect((await member.api.patch(`/api/transactions/${transaction.id}`, { data: { amountMajor: "1.00" } })).status()).toBe(409);
    expect((await member.api.delete(`/api/transactions/${transaction.id}`)).status()).toBe(403);
    expect((await owner.api.delete(`/api/transactions/${transaction.id}`)).ok()).toBe(true);
    expect(await spent()).toBe(0);
  });

  test("a withdrawn expense can't be approved", async () => {
    const { transaction, approval } = await (await member.api.post(`/api/workspaces/${team.workspaceId}/expenses`, {
      data: { budgetPoolId: team.poolId, amountMajor: "25.00", currency: "USD", date: today() },
    })).json();
    expect((await member.api.delete(`/api/transactions/${transaction.id}`)).ok()).toBe(true);
    expect((await owner.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).status()).toBe(409);
    expect((await (await owner.api.get(`/api/budget-pools/${team.poolId}`)).json()).pool.currentSpendMinor).toBe(0);
  });

  test("approvers can't approve their own expense when someone else can", async () => {
    expect((await owner.api.patch(`/api/workspaces/${team.workspaceId}/members`, {
      data: { userId: member.id, role: "approver" },
    })).ok()).toBe(true);
    const { approval } = await (await owner.api.post(`/api/workspaces/${team.workspaceId}/expenses`, {
      data: { budgetPoolId: team.poolId, amountMajor: "9.00", currency: "USD", date: today() },
    })).json();
    expect((await owner.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).status()).toBe(403);
    expect((await member.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).ok()).toBe(true);
  });
});
