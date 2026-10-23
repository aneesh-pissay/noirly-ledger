import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Category = { id: string; name: string; color: string; parentId: string | null };

test.describe("subcategories", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Sol Subcat");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("one level deep, with budgets and spending rolling up", async () => {
    const ws = await personalWorkspaceId(owner);
    const create = (data: object) => owner.api.post(`/api/workspaces/${ws}/categories`, { data });
    const made = async (data: object) => {
      const response = await create(data);
      expect(response.status(), await response.text()).toBe(201);
      return ((await response.json()) as { category: Category }).category;
    };
    const food = await made({ name: "Food", color: "#ff0000" });
    const groceries = await made({ name: "Groceries", parentId: food.id, color: "#00ff00" });
    const travel = await made({ name: "Travel" });
    expect(groceries.parentId).toBe(food.id);

    // No grandchildren, and a category with subcategories stays at the top.
    expect((await create({ name: "Veg", parentId: groceries.id })).status()).toBe(400);
    expect((await owner.api.patch(`/api/categories/${food.id}`, { data: { parentId: travel.id } })).status()).toBe(400);
    expect((await owner.api.patch(`/api/categories/${travel.id}`, { data: { parentId: travel.id } })).status()).toBe(400);
    // Renaming changes only the name.
    const renamed = await owner.api.patch(`/api/categories/${groceries.id}`, { data: { name: "Supermarket" } });
    expect((await renamed.json()).category).toMatchObject({ name: "Supermarket", color: "#00ff00", parentId: food.id });

    // A budget on Food covers spending in its subcategory; the dashboard rolls it up.
    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: food.id, period: "monthly", limitMajor: "100.00" } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "30.00", currency: "USD", date: today(), categoryId: groceries.id } })).status()).toBe(201);
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "5.00", currency: "USD", date: today(), categoryId: food.id } })).status()).toBe(201);
    const { summary } = (await (await owner.api.get(`/api/workspaces/${ws}/dashboard?range=mtd`)).json()) as {
      summary: { budgets: Array<{ budget: { categoryId: string }; spentMinor: number }>; byCategory: Array<{ categoryId: string | null; amountMinor: number }> };
    };
    expect(summary.budgets.find((b) => b.budget.categoryId === food.id)!.spentMinor).toBe(3_500);
    expect(summary.byCategory.find((c) => c.categoryId === food.id)!.amountMinor).toBe(3_500);
    expect(summary.byCategory.find((c) => c.categoryId === groceries.id)).toBeUndefined();

    // Deleting the parent keeps its subcategory, now at the top.
    expect((await owner.api.delete(`/api/categories/${food.id}`)).ok()).toBe(true);
    const { categories } = (await (await owner.api.get(`/api/workspaces/${ws}/categories`)).json()) as { categories: Category[] };
    expect(categories.find((c) => c.id === groceries.id)!.parentId).toBeNull();
  });

  test("add a subcategory and use it in the app", async ({ browser }) => {
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/categories");
    await page.getByLabel("Name").fill("Home");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.locator('[data-category="Home"]')).toBeVisible();
    await page.getByLabel("Name").fill("Electricity");
    await page.getByLabel("Inside").selectOption({ label: "Home" });
    await page.getByRole("button", { name: "Add" }).click();
    const child = page.locator('[data-category="Home › Electricity"]');
    await expect(child).toBeVisible();
    // A parent with subcategories can't be moved.
    await expect(page.locator('[data-category="Home"]').getByRole("combobox", { name: "Move Home" })).toHaveCount(0);
    await page.screenshot({ path: "test-results/subcategories.png", fullPage: true });

    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Category").selectOption({ label: "Home › Electricity" });
    await dialog.getByLabel("Amount", { exact: true }).fill("42");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("div.absolute", { hasText: "Home › Electricity" })).toBeVisible();

    // Moving it back to the top level.
    await page.goto("/categories");
    await child.getByRole("combobox", { name: "Move Electricity" }).selectOption({ label: "Top level" });
    await expect(page.locator('[data-category="Electricity"]')).toBeVisible();
    await context.close();
  });
});
