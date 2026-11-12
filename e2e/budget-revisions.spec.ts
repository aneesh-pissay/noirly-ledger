import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Revision = { id: string; budgetId: string; reason: string; previousLimitMinor: number | null; limitMinor: number | null; note: string | null; moveId: string | null };
type Budget = { id: string; limitAmountMinor: number };

test.describe("budget moves and history", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Rae Revision");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  async function setUp(ws: string) {
    const category = async (name: string) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name } })).json()) as { category: { id: string } }).category.id;
    const budget = async (categoryId: string, period: string, limitMajor: string) => {
      const response = await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId, period, limitMajor } });
      expect(response.ok(), await response.text()).toBe(true);
      return ((await response.json()) as { budget: Budget }).budget;
    };
    const [food, fun, gym] = [await category("Food"), await category("Fun"), await category("Gym")];
    return { food, budget, foodBudget: await budget(food, "monthly", "300.00"), funBudget: await budget(fun, "monthly", "100.00"), gymBudget: await budget(gym, "weekly", "20.00") };
  }

  test("every change is kept; money moves between budgets and limits can be restored", async () => {
    const ws = await personalWorkspaceId(owner);
    const { food, budget, foodBudget, funBudget, gymBudget } = await setUp(ws);
    await budget(food, "monthly", "350.00");
    const history = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/budget-revisions`)).json()) as { revisions: Revision[] }).revisions;
    const limits = async () => {
      const { summary } = (await (await owner.api.get(`/api/workspaces/${ws}/dashboard?range=mtd`)).json()) as { summary: { budgets: Array<{ budget: Budget }> } };
      return Object.fromEntries(summary.budgets.map((r) => [r.budget.id, r.budget.limitAmountMinor]));
    };
    expect((await history()).map((r) => r.reason)).toEqual(["edited", "created", "created", "created"]);

    const move = (data: object) => owner.api.post(`/api/workspaces/${ws}/budgets/move`, { data: { fromBudgetId: foodBudget.id, toBudgetId: funBudget.id, amountMajor: "50.00", ...data } });
    const moved = await move({ note: "Concert" });
    expect(await moved.json()).toMatchObject({ fromLimitMinor: 30_000, toLimitMinor: 15_000 });
    const [inRevision, outRevision] = await history();
    expect(outRevision).toMatchObject({ reason: "moved_out", budgetId: foodBudget.id, previousLimitMinor: 35_000, limitMinor: 30_000, note: "Concert" });
    expect(inRevision).toMatchObject({ reason: "moved_in", budgetId: funBudget.id, limitMinor: 15_000, moveId: outRevision!.moveId });

    // Not more than the whole limit, and only between budgets of the same period.
    expect((await move({ amountMajor: "300.01" })).status()).toBe(400);
    const mixed = await move({ toBudgetId: gymBudget.id });
    expect(mixed.status()).toBe(400);
    expect((await mixed.json()).message).toContain("same period");

    // Back to the 350 it had before the move.
    const edited = (await history()).find((r) => r.reason === "edited")!;
    expect((await owner.api.post(`/api/budget-revisions/${edited.id}/restore`)).ok()).toBe(true);
    expect((await limits())[foodBudget.id]).toBe(35_000);
    expect((await history())[0]).toMatchObject({ reason: "restored", previousLimitMinor: 30_000, limitMinor: 35_000 });

    // Deleting keeps the history; there's nothing to restore from a deletion.
    expect((await owner.api.delete(`/api/budgets/${funBudget.id}`)).ok()).toBe(true);
    const deleted = (await history())[0]!;
    expect(deleted).toMatchObject({ reason: "deleted", limitMinor: null });
    expect((await owner.api.post(`/api/budget-revisions/${deleted.id}/restore`)).status()).toBe(400);
    const one = (await (await owner.api.get(`/api/workspaces/${ws}/budget-revisions?budgetId=${funBudget.id}`)).json()) as { revisions: Revision[] };
    expect(one.revisions.map((r) => r.reason)).toEqual(["deleted", "moved_in", "created"]);
  });

  test("move money and restore on the Budgets page", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    await setUp(ws);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/budgets");
    const form = page.getByRole("form", { name: "Move between budgets" });
    await form.getByLabel("From").selectOption({ label: "Food (monthly, 300.00 USD)" });
    await form.getByLabel("To").selectOption({ label: "Fun (monthly, 100.00 USD)" });
    await form.getByLabel(/Amount/).fill("75");
    await form.getByLabel("Why (optional)").fill("Birthday");
    await form.getByRole("button", { name: "Move" }).click();
    await expect(page.locator('[data-budget="Fun"]')).toContainText("175.00 USD");
    const history = page.getByRole("list", { name: "Budget history" });
    await expect(history.locator('[data-revision="moved_in"]')).toContainText("Fun · Money moved in · Birthday");
    await expect(history.locator('[data-revision="moved_out"]')).toContainText("300.00 USD → 225.00 USD");
    await page.screenshot({ path: "test-results/budget-revisions.png", fullPage: true });
    // The Food budget's first limit can be brought back.
    await history.locator('[data-revision="created"]', { hasText: "Food" }).getByRole("button", { name: "Restore" }).click();
    await expect(page.locator('[data-budget="Food"]')).toContainText("300.00 USD");
    await expect(history.locator('[data-revision="restored"]')).toContainText("225.00 USD → 300.00 USD");
    await context.close();
  });
});
