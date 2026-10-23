import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

/** A financial year starting this month: its first day, last day, and the day before it (UTC). */
function yearEdges() {
  const now = new Date();
  const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  return {
    month: now.getUTCMonth() + 1,
    first: day(now.getUTCFullYear(), now.getUTCMonth(), 1),
    last: day(now.getUTCFullYear() + 1, now.getUTCMonth(), 0),
    before: day(now.getUTCFullYear(), now.getUTCMonth(), 0),
  };
}

test.describe("yearly budgets", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Yara Yearly");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("a yearly budget runs over the financial year", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const { month, first, last, before } = yearEdges();
    expect((await owner.api.patch(`/api/workspaces/${ws}/settings`, { data: { fiscalYearStartMonth: month } })).ok()).toBe(true);
    const { category } = (await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Insurance" } })).json()) as { category: { id: string } };
    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: category.id, period: "yearly", limitMajor: "1200.00" } })).ok()).toBe(true);
    // In the year: its first day. Not in it: the day before.
    for (const [date, amountMajor] of [[first, "400.00"], [before, "99.00"]]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor, currency: "USD", date, categoryId: category.id } })).status()).toBe(201);
    }
    const { summary } = (await (await owner.api.get(`/api/workspaces/${ws}/dashboard?range=mtd`)).json()) as {
      summary: { budgets: Array<{ spentMinor: number; remainingMinor: number; periodFrom: string; periodTo: string }> };
    };
    expect(summary.budgets[0]).toMatchObject({ spentMinor: 40_000, remainingMinor: 80_000, periodFrom: first, periodTo: last });

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/budgets");
    await expect(page.getByText(`yearly · ${first} to ${last}`)).toBeVisible();
    await expect(page.locator("li", { hasText: "Insurance" })).toContainText("800.00 USD");
    await page.getByLabel("Category").selectOption({ label: "Insurance" });
    await expect(page.getByLabel("Period").locator("option", { hasText: "Yearly (financial year)" })).toHaveCount(1);
    await page.screenshot({ path: "test-results/yearly-budgets.png", fullPage: true });
    await context.close();
  });
});
