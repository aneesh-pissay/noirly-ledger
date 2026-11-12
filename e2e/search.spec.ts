import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Txn = { id: string; note: string | null };

test.describe("transaction search and saved views", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Sia Search");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  async function setUp(ws: string) {
    const { category } = (await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Cafes" } })).json()) as { category: { id: string } };
    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", date: today(), ...data } });
    for (const data of [
      { amountMajor: "4.50", note: "Flat white", merchant: "Blue Bottle", tags: ["coffee"], categoryId: category.id },
      { amountMajor: "450.00", note: "Rent share" },
      { amountMajor: "1250.50", note: "Flights", tags: ["trip"], clearing: "pending" },
    ]) {
      expect((await txn(data)).status()).toBe(201);
    }
    return category.id;
  }

  test("one box finds notes, merchants, tags, categories and amounts", async () => {
    const ws = await personalWorkspaceId(owner);
    await setUp(ws);
    const notes = async (query: string) =>
      ((await (await owner.api.get(`/api/workspaces/${ws}/transactions?${query}`)).json()) as { items: Txn[] }).items.map((t) => t.note).sort();
    expect(await notes("q=blue")).toEqual(["Flat white"]);
    expect(await notes("q=FLAT")).toEqual(["Flat white"]);
    expect(await notes("q=%23coffee")).toEqual(["Flat white"]);
    expect(await notes("q=cafe")).toEqual(["Flat white"]);
    // "450" is 450.00, not 4.50.
    expect(await notes("q=450")).toEqual(["Rent share"]);
    expect(await notes(`q=${encodeURIComponent("1,250.50")}`)).toEqual(["Flights"]);
    expect(await notes("q=a.b(")).toEqual([]);
    expect(await notes("min=100")).toEqual(["Flights", "Rent share"]);
    expect(await notes("min=100&max=500")).toEqual(["Rent share"]);
    expect(await notes("clearing=pending")).toEqual(["Flights"]);
    expect(await notes("clearing=cleared")).toEqual(["Flat white", "Rent share"]);

    const save = (data: object) => owner.api.post(`/api/workspaces/${ws}/views`, { data });
    expect((await save({ name: "Nothing", filters: {} })).status()).toBe(400);
    const saved = await save({ name: "Big ones", filters: { min: "100", junk: "x" } });
    expect(saved.status(), await saved.text()).toBe(201);
    const { view } = (await saved.json()) as { view: { id: string; filters: Record<string, string> } };
    expect(view.filters).toEqual({ min: "100" });
    expect((await owner.api.delete(`/api/views/${view.id}`)).ok()).toBe(true);
  });

  test("search, save a view, and come back to it", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    await setUp(ws);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    const rows = page.locator("div.absolute");
    await expect(rows).toHaveCount(3);
    await page.getByLabel("Search", { exact: true }).fill("blue");
    await page.getByLabel("Search", { exact: true }).press("Enter");
    await expect(page).toHaveURL(/\/transactions\?q=blue/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Blue Bottle");

    await page.getByLabel("Save this view as").fill("Coffee runs");
    await page.getByRole("button", { name: "Save view" }).click();
    await expect(page.getByLabel("Saved views")).toHaveValue(/[a-f0-9]{24}/);
    await page.screenshot({ path: "test-results/search.png" });

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(rows).toHaveCount(3);
    await page.getByLabel("Saved views").selectOption({ label: "Coffee runs" });
    await expect(rows).toHaveCount(1);
    await expect(page.getByLabel("Search", { exact: true })).toHaveValue("blue");

    await page.getByRole("button", { name: "More filters" }).click();
    await page.getByRole("button", { name: "Clear" }).click();
    await page.getByLabel("At least").fill("100");
    await page.getByLabel("At least").blur();
    await expect(rows).toHaveCount(2);
    await expect(page.getByText("Nothing matches this search.")).toHaveCount(0);
    await context.close();
  });
});
