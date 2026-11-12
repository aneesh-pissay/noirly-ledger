import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Layout = { widgets: Array<{ type: string; size: string }>; custom: boolean };

test.describe("customizable dashboard and drill-down", () => {
  let owner: TestUser;
  let mel: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Dee Dashboard");
    mel = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, mel);
  });

  test("each person's own layout per workspace, cleaned and resettable", async () => {
    const { workspaceId: ws } = await newTeam(owner, [mel]);
    const get = async (user: TestUser) => (await (await user.api.get(`/api/workspaces/${ws}/dashboard-layout`)).json()) as Layout;
    expect((await get(owner)).custom).toBe(false);
    expect((await get(owner)).widgets[0]).toEqual({ type: "summary", size: "full" });

    // Unknown widgets are dropped and each kept once.
    const saved = await owner.api.put(`/api/workspaces/${ws}/dashboard-layout`, {
      data: { widgets: [{ type: "net-worth", size: "full" }, { type: "bogus", size: "half" }, { type: "net-worth", size: "half" }, { type: "budgets", size: "half" }] },
    });
    expect(saved.ok(), await saved.text()).toBe(true);
    expect(await get(owner)).toEqual({ widgets: [{ type: "net-worth", size: "full" }, { type: "budgets", size: "half" }], custom: true });

    // Mel's dashboard is still the default; strangers can't read either.
    expect((await get(mel)).custom).toBe(false);
    const stranger = await newUser("Sam Stranger");
    expect((await stranger.api.get(`/api/workspaces/${ws}/dashboard-layout`)).status()).toBe(403);
    await disposeAll(stranger);

    expect((await owner.api.put(`/api/workspaces/${ws}/dashboard-layout`, { data: { widgets: null } })).ok()).toBe(true);
    expect((await get(owner)).custom).toBe(false);
  });

  test("customize the home dashboard, and drill from a category to its transactions", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const category = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Books" } })).json()) as { category: { id: string } }).category.id;
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "42.00", currency: "USD", date: today(), categoryId: category, merchant: "Paper Stop" } })).status()).toBe(201);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/home");
    const dashboard = page.getByRole("region", { name: "Dashboard" });
    await expect(dashboard.locator('[data-widget="merchants"]')).toContainText("Paper Stop");

    await dashboard.getByRole("button", { name: "Customize" }).click();
    await dashboard.getByRole("button", { name: "Remove Top merchants" }).click();
    await dashboard.getByRole("group", { name: "Add a widget" }).getByRole("button", { name: "+ Net worth" }).click();
    await dashboard.getByRole("button", { name: "Save layout" }).click();
    await page.reload();
    await expect(dashboard.locator('[data-widget="merchants"]')).toHaveCount(0);
    await expect(dashboard.locator('[data-widget="net-worth"]')).toBeVisible();
    await page.screenshot({ path: "test-results/dashboard-widgets.png", fullPage: true });

    // A category opens its transactions over the dates shown.
    await dashboard.locator('[data-widget="categories"]').getByRole("link", { name: /Books/ }).click();
    await expect(page).toHaveURL(new RegExp(`/transactions\\?category=${category}&from=`));
    await expect(page.getByText("Paper Stop")).toBeVisible();
    await context.close();
  });
});
