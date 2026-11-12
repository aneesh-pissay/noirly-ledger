import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Txn = { id: string; categoryId: string | null; merchant: string | null; tags: string[]; note: string | null };

test.describe("rules for incoming transactions", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Rory Rules");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("fill in new, imported and past transactions, never over what was chosen", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const category = async (name: string) => ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name } })).json()) as { category: { id: string } }).category.id;
    const delivery = await category("Delivery");
    const eatingOut = await category("Eating out");
    const misc = await category("Misc");
    const add = async (data: Record<string, unknown>) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "USD", date: today(), ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { transaction: Txn }).transaction;
    };
    const rule = (data: Record<string, unknown>) => owner.api.post(`/api/workspaces/${ws}/transaction-rules`, { data });

    // Before any rule: a Zomato order goes in bare.
    const earlier = await add({ amountMajor: "8.00", note: "ZOMATO ORDER 1" });
    expect(earlier.categoryId).toBeNull();

    expect((await rule({ name: "Nothing", value: "x", set: {} })).status()).toBe(400);
    expect((await rule({ name: "Swiggy", value: "swiggy", set: { categoryId: delivery, merchant: "Swiggy", tags: ["#Food"] } })).status()).toBe(201);
    expect((await rule({ name: "Zomato", value: "zomato", set: { categoryId: delivery, merchant: "Zomato" } })).status()).toBe(201);

    // New: filled in, whatever the text's case and spacing.
    const order = await add({ amountMajor: "12.00", note: "UPI/SWIGGY   ORDER 4411" });
    expect(order).toMatchObject({ categoryId: delivery, merchant: "Swiggy", tags: ["food"] });
    // A category chosen by hand stays.
    const chosen = await add({ amountMajor: "30.00", note: "swiggy dine-out", categoryId: eatingOut });
    expect(chosen).toMatchObject({ categoryId: eatingOut, merchant: "Swiggy" });

    // Past: counted first, then filled in, with a note in its history.
    const check = await owner.api.post(`/api/workspaces/${ws}/transaction-rules/apply`, { data: { dryRun: true } });
    expect(((await check.json()) as { changed: number }).changed).toBe(1);
    expect((await owner.api.post(`/api/workspaces/${ws}/transaction-rules/apply`, { data: { dryRun: false } })).ok()).toBe(true);
    const filled = ((await (await owner.api.get(`/api/transactions/${earlier.id}`)).json()) as { transaction: Txn }).transaction;
    expect(filled).toMatchObject({ categoryId: delivery, merchant: "Zomato" });
    const activity = (await (await owner.api.get(`/api/transactions/${earlier.id}/activity`)).json()) as { history: Array<{ detail: string | null }> };
    expect(activity.history.some((h) => h.detail === "Filled in by rules")).toBe(true);

    // Imports: the rules come first, the import's category fills in the rest.
    const [y, m, d] = today().split("-");
    const csv = `Date,Description,Amount\n${d}/${m}/${y},UPI/SWIGGY ORDER 99,-4.50\n${d}/${m}/${y},HARDWARE STORE,-20.00\n`;
    const file = { name: "statement.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };
    const preview = (await (await owner.api.post(`/api/workspaces/${ws}/imports/preview`, { multipart: { file } })).json()) as { preview: { mapping: unknown; rows: Array<{ description: string; rule: { names: string[]; categoryId: string | null } | null }> } };
    expect(preview.preview.rows.map((r) => r.rule?.names ?? null)).toEqual([["Swiggy"], null]);
    const imported = await owner.api.post(`/api/workspaces/${ws}/imports`, { multipart: { file, mapping: JSON.stringify(preview.preview.mapping), categoryId: misc } });
    expect(imported.status(), await imported.text()).toBe(201);
    const { items } = (await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: Txn[] };
    expect(items.find((t) => t.note === "UPI/SWIGGY ORDER 99")).toMatchObject({ categoryId: delivery, merchant: "Swiggy" });
    expect(items.find((t) => t.note === "HARDWARE STORE")).toMatchObject({ categoryId: misc });

    const rules = ((await (await owner.api.get(`/api/workspaces/${ws}/transaction-rules`)).json()) as { rules: Array<{ name: string; appliedCount: number }> }).rules;
    expect(rules.find((r) => r.name === "Swiggy")!.appliedCount).toBe(3);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/rules");
    await expect(page.locator('[data-rule="Swiggy"]')).toContainText("used 3 times");
    await page.screenshot({ path: "test-results/transaction-rules.png", fullPage: true });
    await context.close();
  });
});
