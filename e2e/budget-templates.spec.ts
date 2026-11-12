import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

function daysFromToday(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type Row = { budget: { id: string; categoryId: string; period: string; limitAmountMinor: number; rollover: string; renew: boolean }; periodFrom: string; periodTo: string };

test.describe("budget templates and renewal", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Tess Template");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("apply, save and reapply templates; custom budgets renew", async () => {
    const ws = await personalWorkspaceId(owner);
    const { categories } = (await (await owner.api.get(`/api/workspaces/${ws}/categories`)).json()) as { categories: Array<{ id: string; name: string }> };
    const id = (name: string) => categories.find((c) => c.name === name)!.id;
    const rows = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/dashboard?range=mtd`)).json()) as { summary: { budgets: Row[] } }).summary.budgets;
    const apply = (templateId: string, monthlyIncomeMajor: string | null = null) =>
      owner.api.post(`/api/workspaces/${ws}/budget-templates/apply`, { data: { templateId, monthlyIncomeMajor } });

    // A built-in template of income shares needs the income.
    const noIncome = await apply("builtin:50-30-20");
    expect(noIncome.status()).toBe(400);
    expect((await noIncome.json()).message).toContain("monthly income");
    const applied = await apply("builtin:50-30-20", "5000.00");
    expect(await applied.json()).toMatchObject({ budgets: 8, categoriesCreated: 0 });
    let budgets = await rows();
    expect(budgets.find((r) => r.budget.categoryId === id("Housing"))!.budget).toMatchObject({ period: "monthly", limitAmountMinor: 125_000 });
    expect(budgets.find((r) => r.budget.categoryId === id("Travel"))!.budget.rollover).toBe("unspent");

    // Saved templates keep the current repeating budgets, with their categories by name.
    const { category: pets } = (await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Pets" } })).json()) as { category: { id: string } };
    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: pets.id, period: "weekly", limitMajor: "30.00" } })).ok()).toBe(true);
    const saved = await owner.api.post(`/api/workspaces/${ws}/budget-templates`, { data: { name: "Normal month" } });
    expect(saved.status(), await saved.text()).toBe(201);
    const { template } = (await saved.json()) as { template: { id: string; description: string } };
    expect(template.description).toContain("9 budgets");
    // With Pets gone, applying the template brings it back.
    expect((await owner.api.delete(`/api/categories/${pets.id}`)).ok()).toBe(true);
    expect(await (await apply(template.id)).json()).toMatchObject({ budgets: 9, categoriesCreated: 1 });
    const { templates } = (await (await owner.api.get(`/api/workspaces/${ws}/budget-templates`)).json()) as { templates: Array<{ id: string; builtIn: boolean }> };
    expect(templates.filter((t) => t.builtIn)).toHaveLength(2);
    expect((await owner.api.delete(`/api/budget-templates/${template.id}`)).ok()).toBe(true);

    // A 14-day budget that ended a week ago moves on by 14 days.
    const budget = (data: object) => owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: id("Shopping"), limitMajor: "100.00", ...data } });
    expect((await budget({ period: "monthly", renew: true })).status()).toBe(400);
    expect((await budget({ period: "custom", periodStart: daysFromToday(-3), periodEnd: daysFromToday(-5) })).status()).toBe(400);
    expect((await budget({ period: "custom", periodStart: daysFromToday(-20), periodEnd: daysFromToday(-7), renew: true })).ok()).toBe(true);
    budgets = await rows();
    const renewed = budgets.find((r) => r.budget.period === "custom")!;
    expect(renewed).toMatchObject({ periodFrom: daysFromToday(-6), periodTo: daysFromToday(7), budget: { renew: true } });
  });

  test("apply a template on the Budgets page", async ({ browser }) => {
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/budgets");
    const panel = page.getByRole("region", { name: "Budget templates" });
    await panel.getByLabel(/Monthly income/).fill("4000");
    await panel.locator('[data-template="Essentials first"]').getByRole("button", { name: "Apply" }).click();
    await expect(panel.getByRole("status")).toHaveText("Set 5 budgets.");
    await expect(page.locator('[data-budget="Housing"]')).toContainText("1,400.00 USD");
    await page.screenshot({ path: "test-results/budget-templates.png", fullPage: true });
    await context.close();
  });
});

test("applying a share-of-income template plans the month with that income", async () => {
  const owner = await newUser("Ian Income");
  try {
    const ws = await personalWorkspaceId(owner);
    const month = new Date().toISOString().slice(0, 7);
    expect((await owner.api.post(`/api/workspaces/${ws}/budget-templates/apply`, { data: { templateId: "builtin:essentials", monthlyIncomeMajor: "4000.00" } })).ok()).toBe(true);
    const plan = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/plan?month=${month}`)).json()) as { plan: { expectedIncomeMinor: number; leftMinor: number } }).plan;
    expect(await plan()).toMatchObject({ expectedIncomeMinor: 400_000, leftMinor: 100_000 });
    // A month that already has an income keeps it.
    expect((await owner.api.put(`/api/workspaces/${ws}/plan`, { data: { month, expectedIncomeMajor: "5000.00" } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${ws}/budget-templates/apply`, { data: { templateId: "builtin:essentials", monthlyIncomeMajor: "4000.00" } })).ok()).toBe(true);
    expect((await plan()).expectedIncomeMinor).toBe(500_000);
  } finally {
    await disposeAll(owner);
  }
});
