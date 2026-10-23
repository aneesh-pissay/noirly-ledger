import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Workspace = { id: string; kind: string; purpose: string; name: string };

test.describe("personal, household and business workspaces", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Hana Home");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  const create = async (user: TestUser, name: string, purpose?: string) => {
    const response = await user.api.post("/api/workspaces", { data: { name, baseCurrency: "INR", ...(purpose ? { purpose } : {}) } });
    expect(response.status(), await response.text()).toBe(201);
    return ((await response.json()) as { workspace: Workspace }).workspace;
  };
  const categoryNames = async (id: string) =>
    ((await (await owner.api.get(`/api/workspaces/${id}/categories`)).json()) as { categories: Array<{ name: string }> }).categories.map((c) => c.name);

  test("each purpose starts with its own categories, and the owner can change it", async () => {
    const home = await create(owner, "Our home", "household");
    const shop = await create(owner, "My shop", "business");
    const team = await create(owner, "Marketing");
    expect([home.purpose, shop.purpose, team.purpose]).toEqual(["household", "business", "team"]);
    expect(await categoryNames(home.id)).toEqual(expect.arrayContaining(["Groceries", "Kids", "Income"]));
    expect(await categoryNames(shop.id)).toEqual(expect.arrayContaining(["Software and subscriptions", "Taxes and fees", "Transfer"]));
    expect(await categoryNames(team.id)).toContain("Food & Drink");

    const { workspaces } = (await (await owner.api.get("/api/workspaces")).json()) as { workspaces: Workspace[] };
    expect(workspaces.find((w) => w.kind === "personal")!.purpose).toBe("personal");

    expect((await owner.api.patch(`/api/workspaces/${team.id}/settings`, { data: { purpose: "business" } })).ok()).toBe(true);
    expect((await owner.api.patch(`/api/workspaces/${await personalWorkspaceId(owner)}/settings`, { data: { purpose: "household" } })).status()).toBe(400);
    expect((await owner.api.patch(`/api/workspaces/${team.id}/settings`, { data: { purpose: "garage" } })).status()).toBe(400);

    const member = await newUser("Mel Member");
    try {
      const shared = await newTeam(owner, [member]);
      expect((await member.api.patch(`/api/workspaces/${shared.workspaceId}/settings`, { data: { purpose: "household" } })).status()).toBe(403);
    } finally {
      await disposeAll(member);
    }
  });

  test("a household has its own books, kept apart from personal ones", async ({ browser }) => {
    const team = await create(owner, "Marketing");
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/home");
    await page.getByRole("button", { name: "+ New shared workspace" }).click();
    await page.getByRole("radio", { name: /^Household/ }).check();
    await page.getByLabel("Name", { exact: true }).fill("Our home");
    await page.getByLabel("Base currency").selectOption("INR");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/w\/[a-f0-9]{24}$/);
    const homeId = page.url().split("/w/")[1]!;
    await expect(page.getByText("HOUSEHOLD · OWNER")).toBeVisible();
    await expect(page.getByRole("link", { name: "Shared pots" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Budgets" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Approvals" })).toHaveCount(0);
    await expect(page.getByText("Base currency INR.")).toBeVisible();
    await expect(page.getByRole("link", { name: /Our home\s*household/ })).toBeVisible();
    await page.screenshot({ path: "test-results/household-home.png", fullPage: true });

    // A transaction added here goes to the household, not the personal workspace.
    await page.goto(`/w/${homeId}/transactions`);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await expect(dialog.getByLabel("Currency")).toHaveValue("INR");
    await dialog.getByLabel("Category").selectOption({ label: "Groceries" });
    await dialog.getByLabel("Amount", { exact: true }).fill("1250");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Groceries").first()).toBeVisible();
    const list = async (id: string) => ((await (await owner.api.get(`/api/workspaces/${id}/transactions`)).json()) as { items: unknown[] }).items.length;
    expect(await list(homeId)).toBe(1);
    expect(await list(await personalWorkspaceId(owner))).toBe(0);

    await page.goto(`/w/${homeId}/budgets`);
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
    // A team has no books of its own.
    // (The page streams, so the status is 200; what renders is the not-found page.)
    await page.goto(`/w/${team.id}/transactions`);
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
    await context.close();
  });
});
