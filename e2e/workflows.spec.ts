import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Notification = { title: string; body: string };
const notes = async (user: TestUser) => ((await (await user.api.get("/api/notifications")).json()) as { notifications: Notification[] }).notifications;

test.describe("trigger-condition-action workflows", () => {
  let owner: TestUser;
  let mel: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Wren Workflow");
    mel = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, mel);
  });

  test("a big travel expense is tagged, commented on and announced; smaller ones aren't", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const travel = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Trips" } })).json()) as { category: { id: string } }).category.id;
    const flights = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Flights", parentId: travel } })).json()) as { category: { id: string } }).category.id;
    const create = (data: Record<string, unknown>) => owner.api.post(`/api/workspaces/${ws}/workflows`, { data });
    expect((await create({ name: "Nothing", trigger: "transaction.added", actions: [] })).status()).toBe(400);
    const made = await create({
      name: "Big trip spend",
      trigger: "transaction.added",
      conditions: [{ field: "amount", op: "gte", value: "10000" }, { field: "category", op: "is", value: travel }],
      actions: [
        { type: "notify", audience: "owners", message: "{{amount}} at {{merchant}} ({{category}})" },
        { type: "add_tags", tags: ["#Big"] },
        { type: "comment", message: "Keep the receipt" },
      ],
    });
    expect(made.status(), await made.text()).toBe(201);

    const add = async (amountMajor: string) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", date: today(), amountMajor, categoryId: flights, merchant: "Airline" } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { transaction: { id: string } }).transaction.id;
    };
    const small = await add("50.00");
    const big = await add("150.00");

    // The workflow's changes are on the transaction, not on the response it already returned.
    const get = async (id: string) => ((await (await owner.api.get(`/api/transactions/${id}`)).json()) as { transaction: { tags: string[] } }).transaction;
    expect((await get(small)).tags).toEqual([]);
    expect((await get(big)).tags).toEqual(["big"]);
    const activity = (await (await owner.api.get(`/api/transactions/${big}/activity`)).json()) as { comments: Array<{ body: string }>; history: Array<{ detail: string | null }> };
    expect(activity.comments.map((c) => c.body)).toContain("[Big trip spend] Keep the receipt");
    expect(activity.history.some((h) => h.detail === "Workflow: Big trip spend")).toBe(true);
    expect((await notes(owner)).find((n) => n.title === "Big trip spend")?.body).toBe("150.00 USD at Airline (Flights)");

    const { workflows } = (await (await owner.api.get(`/api/workspaces/${ws}/workflows`)).json()) as { workflows: Array<{ runCount: number; runs: Array<{ ok: boolean; results: string[] }> }> };
    expect(workflows[0]).toMatchObject({ runCount: 1 });
    expect(workflows[0]!.runs[0]).toMatchObject({ ok: true, results: ["Notified 1", "Tagged #big", "Commented"] });

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/workflows");
    const card = page.locator('[data-workflow="Big trip spend"]');
    await expect(card).toContainText("Ran 1 time");
    await card.getByRole("button", { name: /Ran 1 time/ }).click();
    await expect(card.locator("[data-run]")).toContainText("Tagged #big");
    await page.screenshot({ path: "test-results/workflows.png", fullPage: true });
    await context.close();
  });

  test("team expenses: tell someone when one's submitted, and the submitter when it's approved", async () => {
    const { workspaceId: ws, poolId } = await newTeam(owner, [mel]);
    const create = (data: Record<string, unknown>) => owner.api.post(`/api/workspaces/${ws}/workflows`, { data });
    expect((await create({ name: "Ops watch", trigger: "expense.submitted", conditions: [{ field: "pool", op: "is", value: poolId }], actions: [{ type: "notify", audience: "people", userIds: [owner.id], message: "{{member}} wants {{amount}} for {{note}}" }] })).status()).toBe(201);
    expect((await create({ name: "Approved", trigger: "expense.approved", actions: [{ type: "notify", audience: "member", message: "Your {{amount}} was approved" }] })).status()).toBe(201);

    const res = await mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor: "25.00", currency: "USD", date: today(), note: "Printer paper" } });
    expect(res.ok(), await res.text()).toBe(true);
    expect((await notes(owner)).find((n) => n.title === "Ops watch")?.body).toBe("Mel Member wants 25.00 USD for Printer paper");
    const { approval } = (await res.json()) as { approval: { id: string } };
    expect((await owner.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).ok()).toBe(true);
    expect((await notes(mel)).find((n) => n.title === "Approved")?.body).toBe("Your 25.00 USD was approved");
  });
});
