import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Plan = { incomeMinor: number; receivedIncomeMinor: number; expectedIncomeMinor: number | null; assignedMinor: number; leftMinor: number; state: string };

test.describe("zero-based budgeting", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Zed Zero");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("income less what budgets assign, aiming for zero", async () => {
    const ws = await personalWorkspaceId(owner);
    const month = today().slice(0, 7);
    const category = async (name: string) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name } })).json()) as { category: { id: string } }).category.id;
    const [food, fun, insurance, trip] = [await category("Food"), await category("Fun"), await category("Insurance"), await category("Trip")];
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "income", amountMajor: "3000.00", currency: "USD", date: today() } })).status()).toBe(201);

    const get = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/plan?month=${month}`)).json()) as { plan: Plan }).plan;
    // With nothing expected, it plans with what's arrived.
    expect(await get()).toMatchObject({ receivedIncomeMinor: 300_000, incomeMinor: 300_000, assignedMinor: 0, leftMinor: 300_000, state: "unassigned" });

    const budget = (categoryId: string, period: string, limitMajor: string, extra: object = {}) =>
      owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId, period, limitMajor, ...extra } });
    expect((await budget(food, "monthly", "2500.00")).ok()).toBe(true);
    // 150 a week is 650 a month; 1,200 a year is 100. A one-off date range isn't part of the month.
    expect((await budget(fun, "weekly", "150.00")).ok()).toBe(true);
    expect((await budget(insurance, "yearly", "1200.00")).ok()).toBe(true);
    expect((await budget(trip, "custom", "900.00", { periodStart: today(), periodEnd: today() })).ok()).toBe(true);

    const put = (expectedIncomeMajor: string | null, m = month) => owner.api.put(`/api/workspaces/${ws}/plan`, { data: { month: m, expectedIncomeMajor } });
    expect((await put("4000.00")).ok()).toBe(true);
    expect(await get()).toMatchObject({ expectedIncomeMinor: 400_000, incomeMinor: 400_000, assignedMinor: 325_000, leftMinor: 75_000, state: "unassigned" });
    expect((await put("3000.00")).ok()).toBe(true);
    expect(await get()).toMatchObject({ leftMinor: -25_000, state: "overassigned" });
    expect((await put("3250.00")).ok()).toBe(true);
    expect((await get()).state).toBe("balanced");
    expect((await put(null)).ok()).toBe(true);
    expect((await get()).expectedIncomeMinor).toBeNull();
    expect((await put("1.00", "2026-13")).status()).toBe(400);

    const member = await newUser("Moe Member");
    try {
      const team = await newTeam(owner, [member]);
      expect((await member.api.put(`/api/workspaces/${team.workspaceId}/plan`, { data: { month, expectedIncomeMajor: "1.00" } })).status()).toBe(403);
      expect((await member.api.get(`/api/workspaces/${team.workspaceId}/plan?month=${month}`)).ok()).toBe(true);
    } finally {
      await disposeAll(member);
    }
  });

  test("assign income to categories on the Budgets page", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    for (const name of ["Rent", "Groceries"]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name } })).status()).toBe(201);
    }
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/budgets");
    const plan = page.getByRole("region", { name: "Monthly plan" });
    await plan.getByLabel(/Income to plan with/).fill("2000");
    await plan.getByLabel(/Income to plan with/).press("Enter");
    await expect(plan.getByRole("status")).toContainText("2,000.00 USD left to assign");
    await plan.getByLabel("Assign to Rent").fill("1500");
    await plan.getByLabel("Assign to Rent").press("Enter");
    await expect(plan.getByRole("status")).toContainText("500.00 USD left to assign");
    await plan.getByLabel("Assign to Groceries").fill("500");
    await plan.getByLabel("Assign to Groceries").press("Enter");
    await expect(plan.getByRole("status")).toContainText("Every bit of income has a job");
    // The amounts are monthly budgets, listed below too.
    await expect(page.locator('[data-budget="Rent"]')).toContainText("1,500.00 USD");
    await page.screenshot({ path: "test-results/zero-based.png", fullPage: true });

    // Clearing an amount removes its budget.
    await plan.getByLabel("Assign to Groceries").fill("");
    await plan.getByLabel("Assign to Groceries").press("Enter");
    await expect(plan.getByRole("status")).toContainText("500.00 USD left to assign");
    await context.close();
  });
});
