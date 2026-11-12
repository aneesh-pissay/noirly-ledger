import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

/** YYYY-MM-DD for a day of the month `back` months before this one (UTC). */
function monthDay(back: number, day: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10);
}

type Row = { budget: { categoryId: string; rollover: string }; spentMinor: number; carriedInMinor: number; availableMinor: number; remainingMinor: number };

test.describe("budget rollover", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Rio Rollover");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("unspent carries forward, and overspending too when asked", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const category = async (name: string) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name } })).json()) as { category: { id: string } }).category.id;
    const food = await category("Food");
    const fun = await category("Fun");
    const spend = async (categoryId: string, date: string, amountMajor: string) =>
      expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor, currency: "USD", date, categoryId } })).status()).toBe(201);
    // Limit 100 a month, counting from two months ago.
    // Food: 60, then 130 → carries 40, then 10. Fun: 60, then 200 → carries 40, then -60 (or 0 for unspent only).
    await spend(food, monthDay(2, 10), "60.00");
    await spend(food, monthDay(1, 10), "130.00");
    await spend(fun, monthDay(2, 10), "60.00");
    await spend(fun, monthDay(1, 10), "200.00");
    await spend(fun, monthDay(0, 1), "5.00");
    const budget = (categoryId: string, rollover: string, extra: object = {}) =>
      owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId, period: "monthly", limitMajor: "100.00", rollover, rolloverSince: monthDay(2, 1), ...extra } });
    expect((await budget(food, "unspent")).ok()).toBe(true);
    expect((await budget(fun, "both")).ok()).toBe(true);
    expect((await budget(food, "unspent", { period: "custom", periodStart: monthDay(0, 1), periodEnd: monthDay(0, 20) })).status()).toBe(400);

    const rows = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/dashboard?range=mtd`)).json()) as { summary: { budgets: Row[] } }).summary.budgets;
    const byCategory = async (id: string) => (await rows()).find((r) => r.budget.categoryId === id)!;
    expect(await byCategory(food)).toMatchObject({ carriedInMinor: 1_000, availableMinor: 11_000, spentMinor: 0, remainingMinor: 11_000 });
    expect(await byCategory(fun)).toMatchObject({ carriedInMinor: -6_000, availableMinor: 4_000, spentMinor: 500, remainingMinor: 3_500 });

    // Only unspent: the overspend wipes out what built up, but takes nothing from this month.
    expect((await budget(fun, "unspent")).ok()).toBe(true);
    expect(await byCategory(fun)).toMatchObject({ carriedInMinor: 0, availableMinor: 10_000 });
    // Turning it off starts fresh.
    expect((await budget(food, "none")).ok()).toBe(true);
    expect(await byCategory(food)).toMatchObject({ carriedInMinor: 0, budget: { rollover: "none" } });

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/budgets");
    await page.getByLabel("Category").selectOption({ label: "Food" });
    await page.getByLabel("Limit (USD)").fill("100");
    await page.getByLabel("At the end of a period").selectOption({ label: "Carry over what's unspent" });
    await page.getByLabel("Carry from (optional)").fill(monthDay(2, 1));
    await page.getByRole("button", { name: "Save budget" }).click();
    const row = page.locator('[data-budget="Food"]');
    await expect(row).toContainText("10.00 USD carried in, 110.00 USD available");
    await expect(row).toContainText(`counting from ${monthDay(2, 1)}`);
    await expect(page.locator('[data-budget="Fun"]')).toContainText("Nothing carried in ·");
    await page.screenshot({ path: "test-results/rollover.png", fullPage: true });
    await context.close();
  });
});
