import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Impact = { categoryId: string; state: string; leftMinor: number; addMinor: number };

function lastMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString().slice(0, 10);
}

test.describe("overspending warnings", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Owen Over");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  async function setUp(ws: string) {
    const category = async (data: object) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data })).json()) as { category: { id: string } }).category.id;
    const food = await category({ name: "Food" });
    const groceries = await category({ name: "Groceries", parentId: food });
    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: food, period: "monthly", limitMajor: "100.00", alertThresholdPct: 80 } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "60.00", currency: "USD", date: today(), categoryId: food } })).status()).toBe(201);
    return { food, groceries };
  }

  test("a draft expense is checked against its budgets without being saved", async () => {
    const ws = await personalWorkspaceId(owner);
    const { food, groceries } = await setUp(ws);
    const check = async (lines: Array<{ categoryId: string; amountMajor: string }>, extra: object = {}) =>
      (await (await owner.api.post(`/api/workspaces/${ws}/budget-check`, { data: { lines, currency: "USD", date: today(), ...extra } })).json()) as { impacts: Impact[]; missingRate: boolean };

    expect((await check([{ categoryId: food, amountMajor: "10.00" }])).impacts[0]).toMatchObject({ state: "ok", leftMinor: 3_000 });
    expect((await check([{ categoryId: food, amountMajor: "25.00" }])).impacts[0]).toMatchObject({ state: "near", leftMinor: 1_500 });
    expect((await check([{ categoryId: food, amountMajor: "50.00" }])).impacts[0]).toMatchObject({ state: "over", leftMinor: -1_000 });
    // A subcategory falls under its parent's budget, and split lines add up.
    expect((await check([{ categoryId: groceries, amountMajor: "50.00" }])).impacts[0]).toMatchObject({ categoryId: food, state: "over" });
    expect((await check([{ categoryId: food, amountMajor: "20.00" }, { categoryId: groceries, amountMajor: "30.00" }])).impacts[0]).toMatchObject({ addMinor: 5_000 });
    // Outside the budget's current period, or without a rate, there's nothing to check.
    expect((await check([{ categoryId: food, amountMajor: "50.00" }], { date: lastMonth() })).impacts).toEqual([]);
    expect(await check([{ categoryId: food, amountMajor: "50.00" }], { currency: "JPY" })).toEqual({ impacts: [], missingRate: true });

    const { items } = (await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: unknown[] };
    expect(items).toHaveLength(1);
  });

  test("the composer warns as you type", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    await setUp(ws);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Category").selectOption({ label: "Food" });
    await dialog.getByLabel("Amount", { exact: true }).fill("10");
    const status = dialog.getByRole("status", { name: "Budget check" });
    await expect(status).toHaveText("Leaves 30.00 USD of Food's monthly budget.");
    await dialog.getByLabel("Amount", { exact: true }).fill("50");
    await expect(status).toHaveText("Over budget: This takes Food 10.00 USD over its monthly budget.");
    await page.screenshot({ path: "test-results/overspend-warning.png" });
    // Income isn't checked.
    await dialog.getByLabel("Type").selectOption("income");
    await expect(status).toBeHidden();
    await context.close();
  });
});
