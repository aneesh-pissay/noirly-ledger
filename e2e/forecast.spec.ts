import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

function monthDay(back: number, day: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10);
}

type Baseline = {
  baseline: { startCashMinor: number; monthlyIncomeMinor: number; spendingByCategory: Record<string, number> };
  lines: Array<{ categoryId: string; monthlyMinor: number; source: string }>;
};

test.describe("forecast and what-ifs", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Fay Forecast");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  /** 1,000 in the bank today; each of the last three months had 3,000 income and 600 on food, plus 100 uncategorized once. */
  async function setUp(ws: string) {
    expect((await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Checking", kind: "bank", currency: "USD", openingMajor: "1000.00", openingDate: today() } })).status()).toBe(201);
    const { category } = (await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Food" } })).json()) as { category: { id: string } };
    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { currency: "USD", ...data } });
    for (const back of [1, 2, 3]) {
      expect((await txn({ type: "income", amountMajor: "3000.00", date: monthDay(back, 5) })).status()).toBe(201);
      expect((await txn({ type: "expense", amountMajor: "600.00", date: monthDay(back, 6), categoryId: category.id })).status()).toBe(201);
    }
    expect((await txn({ type: "expense", amountMajor: "100.00", date: monthDay(2, 9) })).status()).toBe(201);
    // This month's spending isn't part of the typical month.
    expect((await txn({ type: "expense", amountMajor: "999.00", date: today(), categoryId: category.id })).status()).toBe(201);
    return category.id;
  }

  test("a typical month from recent months or budgets, and saved scenarios", async () => {
    const ws = await personalWorkspaceId(owner);
    const food = await setUp(ws);
    const get = async (basis: string) => ((await (await owner.api.get(`/api/workspaces/${ws}/forecast?basis=${basis}`)).json()) as { forecast: Baseline }).forecast;
    const recent = await get("recent");
    expect(recent.baseline).toEqual({ startCashMinor: 100_000, monthlyIncomeMinor: 300_000, spendingByCategory: { [food]: 60_000, uncategorized: 3_333 } });

    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: food, period: "monthly", limitMajor: "500.00" } })).ok()).toBe(true);
    const budgets = await get("budgets");
    expect(budgets.lines.find((l) => l.categoryId === food)).toEqual({ categoryId: food, monthlyMinor: 50_000, source: "budget" });

    const changes = [
      { kind: "income", pct: 10, fromMonth: 3 },
      { kind: "one_off", amountMinor: -500_000, month: 6, label: "Car down payment" },
      { kind: "recurring", amountMinor: -25_000, fromMonth: 7, months: 36, label: "Car EMI" },
    ];
    const created = await owner.api.post(`/api/workspaces/${ws}/scenarios`, { data: { name: "New car", changes } });
    expect(created.status(), await created.text()).toBe(201);
    const { scenario } = (await created.json()) as { scenario: { id: string } };
    expect((await owner.api.post(`/api/workspaces/${ws}/scenarios`, { data: { name: "Bad", changes: [{ kind: "income", pct: 5, amountMinor: 100 }] } })).status()).toBe(400);
    expect((await owner.api.put(`/api/scenarios/${scenario.id}`, { data: { name: "New car (cheaper)", changes: changes.slice(0, 2) } })).ok()).toBe(true);
    const { scenarios } = (await (await owner.api.get(`/api/workspaces/${ws}/scenarios`)).json()) as { scenarios: Array<{ name: string; changes: unknown[] }> };
    expect(scenarios).toEqual([expect.objectContaining({ name: "New car (cheaper)", changes: changes.slice(0, 2) })]);
    expect((await owner.api.delete(`/api/scenarios/${scenario.id}`)).ok()).toBe(true);
  });

  test("try a change on the Forecast page and save it", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    await setUp(ws);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/forecast");
    await expect(page.getByText("Cash today")).toBeVisible();
    await expect(page.getByText("1,000.00 USD").first()).toBeVisible();
    // 12 months of 2,366.67 a month on top of 1,000.
    await expect(page.getByText("29,400.04 USD").first()).toBeVisible();

    const form = page.getByRole("form", { name: "Add a change" });
    await form.getByLabel("Change").selectOption("one_off");
    await form.getByLabel(/^Amount/).fill("40000");
    await form.getByLabel("What it is (optional)").fill("Renovation");
    await form.getByRole("button", { name: "Add change" }).click();
    await expect(page.getByRole("list", { name: "Changes" })).toContainText("Renovation: −40,000.00 USD in");
    await expect(page.getByRole("alert").filter({ hasText: "Cash would run out in" })).toBeVisible();
    await page.getByLabel("Scenario name").fill("Renovate");
    await page.getByRole("button", { name: "Save scenario" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Scenario saved." })).toBeVisible();
    await page.screenshot({ path: "test-results/forecast.png", fullPage: true });

    await page.reload();
    await page.getByLabel("Saved scenarios").selectOption({ label: "Renovate" });
    await expect(page.getByRole("list", { name: "Changes" })).toContainText("Renovation");
    await context.close();
  });
});
