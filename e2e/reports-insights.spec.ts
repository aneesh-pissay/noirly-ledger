import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type Report = {
  unusual: Array<{ merchantName: string | null; basis: string; timesUsual: number; usualMinor: number }>;
  variances: Array<{ name: string; actualMinor: number; expectedMinor: number; varianceMinor: number; flagged: boolean; spike: boolean }>;
  savings: { savingsRatePct: number | null; usualSavingsRatePct: number | null; potentialMinor: number };
};

test.describe("anomaly, variance and savings analysis", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ian Insights");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("an unusual expense, a category well up on usual, and what it does to savings", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const coffee = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Coffee" } })).json()) as { category: { id: string } }).category.id;
    const add = async (data: Record<string, unknown>) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { currency: "USD", ...data } });
      expect(res.status(), await res.text()).toBe(201);
    };
    const coffeeAt = (amountMajor: string, date: string) => add({ type: "expense", amountMajor, date, categoryId: coffee, merchant: "Bean Bar" });
    // The usual: 5.00 a week at Bean Bar, and 100.00 coming in.
    for (const d of [10, 17, 24, 40]) await coffeeAt("5.00", daysAgo(d));
    for (const d of [10, 17, 24]) await add({ type: "income", amountMajor: "100.00", date: daysAgo(d) });
    // This week: 30.00 in one go.
    await coffeeAt("30.00", today());
    await add({ type: "income", amountMajor: "100.00", date: today() });

    const report = (await (await owner.api.get(`/api/workspaces/${ws}/reports/insights?from=${daysAgo(6)}&to=${today()}`)).json()) as Report;
    expect(report.unusual).toEqual([expect.objectContaining({ merchantName: "Bean Bar", basis: "merchant", usualMinor: 500, timesUsual: 6 })]);
    expect(report.variances.find((v) => v.name === "Coffee")).toMatchObject({ actualMinor: 3_000, expectedMinor: 500, varianceMinor: 2_500, flagged: true, spike: true });
    expect(report.savings).toMatchObject({ savingsRatePct: 70, usualSavingsRatePct: 95, potentialMinor: 2_500 });

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/reports");
    await page.getByLabel("From").fill(daysAgo(6));
    await page.getByRole("tab", { name: "Insights" }).click();
    await expect(page.getByRole("list", { name: "Unusual spending" })).toContainText("6× the usual");
    await expect(page.getByRole("table", { name: "Category variance" }).locator('[data-variance="Coffee"]')).toContainText("spike");
    await page.screenshot({ path: "test-results/reports-insights.png", fullPage: true });
    await context.close();
  });
});
