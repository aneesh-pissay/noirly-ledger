import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Txn = { id: string; categoryId: string | null; splits: Array<{ categoryId: string | null; amountMinor: number }> };

test.describe("split transactions", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Sky Split");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("lines count in their own categories, budgets and refunds included", async () => {
    const ws = await personalWorkspaceId(owner);
    const category = async (name: string) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name } })).json()) as { category: { id: string } }).category.id;
    const food = await category("Food");
    const home = await category("Home");
    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", date: today(), ...data } });
    const lines = [{ categoryId: food, amountMajor: "60.00" }, { categoryId: home, amountMajor: "40.00", note: "Bulbs" }];

    // The lines must add up, on spending or income, without a category of its own.
    const off = await txn({ amountMajor: "90.00", splits: lines });
    expect(off.status()).toBe(400);
    expect((await off.json()).message).toContain("10.00 more than the amount");
    expect((await txn({ type: "transfer", amountMajor: "100.00", splits: lines })).status()).toBe(400);
    expect((await txn({ amountMajor: "100.00", categoryId: food, splits: lines })).status()).toBe(400);

    const made = await txn({ amountMajor: "100.00", splits: lines, note: "Supermarket" });
    expect(made.status(), await made.text()).toBe(201);
    const { transaction } = (await made.json()) as { transaction: Txn };
    expect(transaction.categoryId).toBeNull();
    expect(transaction.splits.map((l) => l.amountMinor)).toEqual([6_000, 4_000]);

    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: food, period: "monthly", limitMajor: "500.00" } })).ok()).toBe(true);
    const summary = async () =>
      ((await (await owner.api.get(`/api/workspaces/${ws}/dashboard?range=mtd`)).json()) as {
        summary: { budgets: Array<{ budget: { categoryId: string }; spentMinor: number }>; byCategory: Array<{ categoryId: string | null; amountMinor: number }> };
      }).summary;
    let s = await summary();
    expect(s.budgets[0]!.spentMinor).toBe(6_000);
    expect(s.byCategory.find((c) => c.categoryId === home)!.amountMinor).toBe(4_000);
    // Filtering by a line's category finds it.
    const listed = (await (await owner.api.get(`/api/workspaces/${ws}/transactions?categoryId=${home}`)).json()) as { items: Txn[] };
    expect(listed.items.map((t) => t.id)).toEqual([transaction.id]);

    // A refund splits like its expense.
    const refund = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "refund", refundOfId: transaction.id, amountMajor: "50.00", currency: "USD", date: today() } });
    expect(refund.status(), await refund.text()).toBe(201);
    expect(((await refund.json()) as { transaction: Txn }).transaction.splits.map((l) => l.amountMinor)).toEqual([3_000, 2_000]);
    s = await summary();
    expect(s.budgets[0]!.spentMinor).toBe(3_000);

    // Changing the amount needs lines that still add up; dropping the split gives it one category.
    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { amountMajor: "120.00" } })).status()).toBe(400);
    const rebalanced = await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { amountMajor: "120.00", splits: [{ categoryId: food, amountMajor: "70.00" }, { categoryId: home, amountMajor: "50.00" }] } });
    expect(rebalanced.ok(), await rebalanced.text()).toBe(true);
    const single = await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { splits: null, categoryId: home } });
    expect(((await single.json()) as { transaction: Txn }).transaction).toMatchObject({ categoryId: home, splits: [] });
  });

  test("split a transaction in the composer", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    for (const name of ["Food", "Home"]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name } })).status()).toBe(201);
    }
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Amount", { exact: true }).fill("80");
    await dialog.getByLabel("Category").selectOption({ label: "Food" });
    await dialog.getByRole("button", { name: "Split" }).click();
    const split = dialog.getByRole("group", { name: "Split" });
    await split.getByLabel("Line 1 amount").fill("50");
    await expect(split).toContainText("30.00 left to split");
    await split.getByLabel("Line 2 category").selectOption({ label: "Home" });
    await split.getByLabel("Line 2 amount").fill("30");
    await expect(split).toContainText("Adds up");
    await page.screenshot({ path: "test-results/split-composer.png" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Split · Food, Home")).toBeVisible();
    await context.close();
  });
});
