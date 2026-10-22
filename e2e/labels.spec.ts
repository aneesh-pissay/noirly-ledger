import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Txn = { id: string; tags: string[]; merchant: string | null; projectId: string | null };
type Project = { id: string; name: string; spentMinor: number; incomeMinor: number; transactionCount: number };

test.describe("tags, merchants and projects", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Lu Labels");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("label transactions, filter by them and total them up", async () => {
    const ws = await personalWorkspaceId(owner);
    const made = await owner.api.post(`/api/workspaces/${ws}/projects`, { data: { name: "Goa trip" } });
    expect(made.status(), await made.text()).toBe(201);
    const { project } = (await made.json()) as { project: Project };
    const txn = async (data: object, status = 201) => {
      const response = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", date: today(), ...data } });
      expect(response.status(), await response.text()).toBe(status);
      return status === 201 ? ((await response.json()) as { transaction: Txn }).transaction : null;
    };
    const dinner = (await txn({ amountMajor: "40.00", merchant: "  Blue  Bottle ", tags: ["#Trip", "food", "trip"], projectId: project.id }))!;
    expect(dinner).toMatchObject({ merchant: "Blue Bottle", tags: ["trip", "food"], projectId: project.id });
    await txn({ amountMajor: "10.00", merchant: "blue bottle", tags: ["work"] });
    await txn({ type: "income", amountMajor: "25.00", merchant: "Friend", projectId: project.id, tags: ["trip"] });
    await txn({ amountMajor: "1.00", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, 400);
    await txn({ amountMajor: "1.00", projectId: "000000000000000000000000" }, 400);

    const list = async (query: string) => ((await (await owner.api.get(`/api/workspaces/${ws}/transactions?${query}`)).json()) as { items: Txn[] }).items;
    expect(await list("tag=%23TRIP")).toHaveLength(2);
    expect(await list("merchant=BLUE%20BOTTLE")).toHaveLength(2);
    expect(await list(`projectId=${project.id}&tag=food`)).toHaveLength(1);

    const { merchants } = (await (await owner.api.get(`/api/workspaces/${ws}/merchants`)).json()) as { merchants: Array<{ name: string; count: number; spentMinor: number }> };
    expect(merchants[0]).toMatchObject({ count: 2, spentMinor: 5_000 });
    const { tags } = (await (await owner.api.get(`/api/workspaces/${ws}/tags`)).json()) as { tags: Array<{ tag: string; count: number }> };
    expect(tags[0]).toEqual({ tag: "trip", count: 2 });

    // A refund keeps the expense's merchant, project and tags, and comes off the project's spending.
    const refund = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "refund", refundOfId: dinner.id, amountMajor: "15.00", currency: "USD", date: today() } });
    expect(((await refund.json()) as { transaction: Txn }).transaction).toMatchObject({ merchant: "Blue Bottle", projectId: project.id, tags: ["trip", "food"] });
    const projects = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/projects`)).json()) as { projects: Project[] }).projects;
    expect((await projects())[0]).toMatchObject({ spentMinor: 2_500, incomeMinor: 2_500, transactionCount: 3 });

    // Clearing labels, and what an archived or used project allows.
    const cleared = await owner.api.patch(`/api/transactions/${dinner.id}`, { data: { tags: [], merchant: null } });
    expect(((await cleared.json()) as { transaction: Txn }).transaction).toMatchObject({ tags: [], merchant: null, projectId: project.id });
    expect((await owner.api.delete(`/api/projects/${project.id}`)).status()).toBe(409);
    expect((await owner.api.patch(`/api/projects/${project.id}`, { data: { archived: true } })).ok()).toBe(true);
    await txn({ amountMajor: "1.00", projectId: project.id }, 400);
    // Editing a transaction already on the archived project is fine.
    expect((await owner.api.patch(`/api/transactions/${dinner.id}`, { data: { note: "Dinner", projectId: project.id } })).ok()).toBe(true);
  });

  test("label a transaction in the app and follow the links", async ({ browser }) => {
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/projects");
    await page.getByLabel("Name").fill("Kitchen");
    await page.getByRole("button", { name: "Add project" }).click();
    await expect(page.locator('[data-project="Kitchen"]')).toContainText("0 transactions");

    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Amount", { exact: true }).fill("120");
    await dialog.getByLabel("Merchant").fill("Tile Depot");
    await dialog.getByLabel("Project").selectOption({ label: "Kitchen" });
    await dialog.getByLabel("Tags").fill("reno, diy");
    await page.screenshot({ path: "test-results/labels-composer.png" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: "Tile Depot" })).toBeVisible();
    await page.screenshot({ path: "test-results/labels-list.png" });
    await page.getByRole("link", { name: "#diy" }).click();
    await expect(page).toHaveURL(/\/transactions\?tag=diy/);
    await expect(page.getByText("Showing #diy")).toBeVisible();

    await page.goto("/projects");
    await expect(page.locator('[data-project="Kitchen"]')).toContainText("120.00 USD");
    await expect(page.getByRole("list", { name: "Merchants" })).toContainText("Tile Depot");
    await expect(page.getByRole("list", { name: "Tags" })).toContainText("#reno");
    await page.screenshot({ path: "test-results/projects.png", fullPage: true });
    await context.close();
  });
});
