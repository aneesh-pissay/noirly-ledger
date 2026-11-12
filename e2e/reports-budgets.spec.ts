import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

/** A day of last month (1-based). */
function lastMonthDay(day: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day)).toISOString().slice(0, 10);
}

type Period = { from: string; limitMinor: number; spentMinor: number; status: string; inProgress: boolean; paceMinor: number | null };
type Report = {
  budgets: Array<{ name: string; periods: Period[]; totals: { limitMinor: number; spentMinor: number; overCount: number } }>;
  summary: { limitMinor: number; spentMinor: number; overBudgets: number; unbudgetedMinor: number };
};

test.describe("budget versus actual", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Bea Budget");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("each budget's periods against what was spent, and spending no budget covers", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const category = async (name: string, parentId?: string) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name, ...(parentId ? { parentId } : {}) } })).json()) as { category: { id: string } }).category.id;
    const pantry = await category("Pantry");
    const snacks = await category("Snacks", pantry);
    const hobby = await category("Hobby");
    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: pantry, period: "monthly", limitMajor: "300.00" } })).ok()).toBe(true);
    const spend = async (categoryId: string, amountMajor: string, date: string) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", categoryId, amountMajor, date } });
      expect(res.status(), await res.text()).toBe(201);
    };
    await spend(pantry, "350.00", lastMonthDay(10));
    // A subcategory counts toward its parent's budget.
    await spend(snacks, "50.00", today());
    await spend(hobby, "20.00", today());

    const report = (await (await owner.api.get(`/api/workspaces/${ws}/reports/budgets?from=${lastMonthDay(1)}&to=${today()}`)).json()) as Report;
    const budget = report.budgets.find((b) => b.name === "Pantry")!;
    expect(budget.periods.map((p) => [p.from, p.limitMinor, p.spentMinor, p.status, p.inProgress])).toEqual([
      [lastMonthDay(1), 30_000, 35_000, "over", false],
      [`${today().slice(0, 7)}-01`, 30_000, 5_000, "under", true],
    ]);
    expect(budget.periods[1]!.paceMinor).not.toBeNull();
    expect(budget.totals).toMatchObject({ limitMinor: 60_000, spentMinor: 40_000, overCount: 1 });
    expect(report.summary).toMatchObject({ limitMinor: 60_000, spentMinor: 40_000, overBudgets: 1, unbudgetedMinor: 2_000 });

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/reports");
    await page.getByLabel("From").fill(lastMonthDay(1));
    await page.getByRole("tab", { name: "Budget vs actual" }).click();
    const card = page.locator('[data-budget="Pantry"]');
    await expect(card.locator(`[data-period="${lastMonthDay(1)}"]`)).toContainText("Over");
    await expect(card).toContainText("so far");
    await page.screenshot({ path: "test-results/reports-budgets.png", fullPage: true });
    await context.close();
  });
});
