import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

/** A day `back` months before this one. */
function monthsAgo(back: number, day = 10) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10);
}

type Row = { label: string; expenseMinor: number; inProgress: boolean; spendingChangePct: number | null; spendingYearChangePct: number | null };
type Report = { granularity: string; rows: Row[]; risers: Array<{ name: string; changeMinor: number }>; rising: Array<{ name: string; streak: number }> };

test.describe("monthly, quarterly and yearly trends", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Tia Trends");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("month on month, a year earlier, and categories on the rise", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const gadgets = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Gadgets" } })).json()) as { category: { id: string } }).category.id;
    const spend = async (amountMajor: string, date: string) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", categoryId: gadgets, amountMajor, date } });
      expect(res.status(), await res.text()).toBe(201);
    };
    await spend("100.00", monthsAgo(4));
    await spend("150.00", monthsAgo(3));
    await spend("200.00", monthsAgo(2));
    await spend("300.00", monthsAgo(1));
    await spend("10.00", today());
    // The same month as two months ago, a year earlier.
    await spend("100.00", monthsAgo(14));

    const from = monthsAgo(4, 1);
    const report = (await (await owner.api.get(`/api/workspaces/${ws}/reports/trends?from=${from}&to=${today()}&granularity=month`)).json()) as Report;
    expect(report.rows).toHaveLength(5);
    expect(report.rows.at(-1)).toMatchObject({ expenseMinor: 1_000, inProgress: true, spendingChangePct: null });
    expect(report.rows[3]).toMatchObject({ expenseMinor: 30_000, spendingChangePct: 50 });
    expect(report.rows[2]!.spendingYearChangePct).toBe(100);
    expect(report.risers[0]).toMatchObject({ name: "Gadgets", changeMinor: 10_000 });
    expect(report.rising).toEqual([expect.objectContaining({ name: "Gadgets", streak: 4 })]);

    // Weeks are too short for a trend: they come back as months.
    const weekly = (await (await owner.api.get(`/api/workspaces/${ws}/reports/trends?from=${from}&to=${today()}&granularity=week`)).json()) as Report;
    expect(weekly.granularity).toBe("month");

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/reports");
    await page.getByLabel("From").fill(from);
    await page.getByLabel("Periods").selectOption("month");
    await page.getByRole("tab", { name: "Trends" }).click();
    await expect(page.getByRole("table", { name: "Trends by period" })).toContainText("+50%");
    await expect(page.locator('[data-rising="Gadgets"]')).toContainText("4 in a row");
    await page.screenshot({ path: "test-results/reports-trends.png", fullPage: true });
    await context.close();
  });
});
