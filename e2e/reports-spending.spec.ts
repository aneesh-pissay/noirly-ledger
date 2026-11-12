import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type Row = { key: string; name: string; amountMinor: number; count: number; changePct: number | null; children?: Row[] };
type Report = { totalMinor: number; previousTotalMinor: number; changePct: number | null; categories: Row[]; merchants: Row[] };

test.describe("category and merchant spending analysis", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Sid Spender");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("by category with subcategories, by merchant, against the days before", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const category = async (name: string, parentId?: string) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name, ...(parentId ? { parentId } : {}) } })).json()) as { category: { id: string } }).category.id;
    const food = await category("Eating");
    const dining = await category("Dining", food);
    const travel = await category("Trips");
    const txn = async (data: Record<string, unknown>) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", date: today(), ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { transaction: { id: string } }).transaction.id;
    };
    await txn({ amountMajor: "30.00", categoryId: dining, merchant: "Cafe One" });
    await txn({ amountMajor: "20.00", categoryId: dining, merchant: "cafe one" });
    const groceries = await txn({ amountMajor: "40.00", categoryId: food, merchant: "Mart" });
    await txn({ type: "refund", amountMajor: "10.00", refundOfId: groceries });
    await txn({ amountMajor: "100.00", merchant: "Agency", splits: [{ categoryId: travel, amountMajor: "60.00" }, { categoryId: dining, amountMajor: "40.00" }] });
    // The week before.
    await txn({ amountMajor: "50.00", categoryId: travel, date: daysAgo(10) });

    const report = (await (await owner.api.get(`/api/workspaces/${ws}/reports/spending?from=${daysAgo(6)}&to=${today()}`)).json()) as Report;
    expect(report.totalMinor).toBe(18_000);
    expect(report.previousTotalMinor).toBe(5_000);
    expect(report.changePct).toBe(260);
    const eating = report.categories.find((c) => c.name === "Eating")!;
    expect(eating.amountMinor).toBe(12_000);
    expect(eating.children!.map((c) => [c.name, c.amountMinor])).toEqual([["Dining", 9_000], ["Eating (general)", 3_000]]);
    expect(report.categories.find((c) => c.name === "Trips")).toMatchObject({ amountMinor: 6_000, changePct: 20 });
    // Merchants by name, whatever the spelling's case; the split counts once per line.
    expect(report.merchants.map((m) => [m.name, m.amountMinor])).toEqual([["Agency", 10_000], ["Cafe One", 5_000], ["Mart", 3_000]]);

    // A category's transactions include its subcategories'.
    const listed = (await (await owner.api.get(`/api/workspaces/${ws}/transactions?categoryId=${food}`)).json()) as { items: Array<{ id: string }> };
    expect(listed.items.length).toBeGreaterThanOrEqual(4);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/reports");
    await page.getByLabel("From").fill(daysAgo(6));
    await page.getByRole("tab", { name: "Spending" }).click();
    const table = page.getByRole("table", { name: "Spending by category" });
    await expect(table.locator('[data-category="Eating"]')).toContainText("120.00");
    await table.getByRole("button", { name: "Show Eating subcategories" }).click();
    await expect(table.locator('[data-subcategory="Dining"]')).toContainText("90.00");
    await expect(page.getByRole("table", { name: "Spending by merchant" }).locator('[data-merchant="Agency"]')).toBeVisible();
    await page.screenshot({ path: "test-results/reports-spending.png", fullPage: true });
    // A row opens its transactions.
    await table.getByRole("link", { name: "Trips" }).click();
    await expect(page).toHaveURL(/\/transactions\?category=/);
    await context.close();
  });
});
