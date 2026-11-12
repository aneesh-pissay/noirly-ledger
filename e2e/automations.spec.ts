import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Automation = { id: string; name: string; lastOk: boolean | null; lastResult: string | null; nextRunOn: string };

/** A day in the month `back` months before this one. */
function dayInMonthBefore(back: number, day = 10) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10);
}

test.describe("scheduled automations", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ari Automation");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("a budget refresh sets the limit from what was spent, a sweep fills a goal, a digest says how it went", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const food = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Groceries" } })).json()) as { category: { id: string } }).category.id;
    const budget = ((await (await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: food, period: "monthly", limitMajor: "500.00" } })).json()) as { budget: { id: string } }).budget;
    const spend = async (date: string, amountMajor: string) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", date, amountMajor, categoryId: food, merchant: "Market" } });
      expect(res.status(), await res.text()).toBe(201);
    };
    await spend(dayInMonthBefore(2), "200.00");
    await spend(dayInMonthBefore(1), "300.00");

    const create = (data: Record<string, unknown>) => owner.api.post(`/api/workspaces/${ws}/automations`, { data });
    const run = async (id: string) => ((await (await owner.api.post(`/api/workspaces/${ws}/automations/${id}/run`)).json()) as { automation: Automation }).automation;

    // What each kind needs.
    expect((await create({ name: "Digest", kind: "digest", frequency: "weekly", runDay: 1, params: {} })).status()).toBe(400);
    expect((await create({ name: "Weekly refresh", kind: "budget_refresh", frequency: "weekly", runDay: 1, params: {} })).status()).toBe(400);
    expect((await create({ name: "Sweep", kind: "sweep", frequency: "monthly", runDay: 1, params: {} })).status()).toBe(400);

    // Average of two months (200 and 300), plus 10%: 275.
    const refresh = await create({ name: "Refresh", kind: "budget_refresh", frequency: "monthly", runDay: 1, params: { months: 2, adjustPct: 10 } });
    expect(refresh.status(), await refresh.text()).toBe(201);
    const refreshed = await run(((await refresh.json()) as { automation: Automation }).automation.id);
    expect(refreshed).toMatchObject({ lastOk: true, lastResult: "Changed 1 of 1 budget" });
    const { revisions } = (await (await owner.api.get(`/api/workspaces/${ws}/budget-revisions`)).json()) as { revisions: Array<{ budgetId: string; reason: string; previousLimitMinor: number; limitMinor: number }> };
    expect(revisions[0]).toMatchObject({ budgetId: budget.id, reason: "automated", previousLimitMinor: 50_000, limitMinor: 27_500 });

    // Last month the limit was 500 and 300 went: half of the 200 left is 100.
    const { goal } = (await (await owner.api.post(`/api/workspaces/${ws}/savings-goals`, { data: { name: "Holiday", targetMajor: "1000.00", currency: "USD" } })).json()) as { goal: { id: string } };
    const sweep = await create({ name: "Sweep", kind: "sweep", frequency: "monthly", runDay: 1, params: { goalId: goal.id, sweepPct: 50 } });
    expect(sweep.status(), await sweep.text()).toBe(201);
    const swept = await run(((await sweep.json()) as { automation: Automation }).automation.id);
    expect(swept.lastOk, swept.lastResult ?? "").toBe(true);
    const { goals } = (await (await owner.api.get(`/api/workspaces/${ws}/savings-goals`)).json()) as { goals: Array<{ id: string; currentAmountMinor: number }> };
    expect(goals.find((g) => g.id === goal.id)?.currentAmountMinor).toBe(10_000);

    const digest = await create({ name: "Monthly digest", kind: "digest", frequency: "monthly", runDay: 1, params: { recipientIds: [owner.id] } });
    expect(digest.status(), await digest.text()).toBe(201);
    expect(await run(((await digest.json()) as { automation: Automation }).automation.id)).toMatchObject({ lastOk: true, lastResult: "Sent to 1" });
    const { notifications } = (await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string; body: string }> };
    const note = notifications.find((n) => n.title.startsWith("Your digest"));
    expect(note?.body).toContain("spending 300.00");
    expect(note?.body).toContain("Most went on Groceries");

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/automations");
    await expect(page.locator('[data-automation="Refresh"] [data-last-run]')).toContainText("Changed 1 of 1 budget");
    await expect(page.locator('[data-automation="Monthly digest"]')).toContainText("On the 1st of every month");
    await page.screenshot({ path: "test-results/automations.png", fullPage: true });
    await context.close();
  });
});
