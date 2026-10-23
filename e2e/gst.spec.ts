import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Gst = { ratePct: number; supply: string; gstin: string | null; taxableMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number; taxMinor: number; itcEligible: boolean };
type Txn = { id: string; gst: Gst | null };

const GSTIN = "27AAPFU0939F1ZV";

test.describe("GST on transactions", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Gita Gst");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("tax is worked out from what was paid, follows edits and refunds, and adds up", async () => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", date: today(), ...data } });
    const gst18 = { ratePct: 18, treatment: "taxable", supply: "intra", gstin: GSTIN.toLowerCase(), hsn: "9983 11", itcEligible: true };

    const made = await txn({ amountMajor: "1180.00", note: "Laptop repair", gst: gst18 });
    expect(made.status(), await made.text()).toBe(201);
    const { transaction } = (await made.json()) as { transaction: Txn };
    expect(transaction.gst).toMatchObject({ gstin: GSTIN, taxableMinor: 100_000, cgstMinor: 9_000, sgstMinor: 9_000, igstMinor: 0, taxMinor: 18_000, itcEligible: true });

    expect((await txn({ amountMajor: "10.00", gst: { ...gst18, gstin: "27AAPFU0939F1ZX" } })).status()).toBe(400);
    expect((await txn({ amountMajor: "10.00", gst: { ...gst18, ratePct: 15 } })).status()).toBe(400);
    expect((await txn({ type: "transfer", amountMajor: "10.00", gst: gst18 })).status()).toBe(400);

    // Between states it's IGST.
    const inter = (await (await txn({ amountMajor: "105.00", gst: { ratePct: 5, treatment: "taxable", supply: "inter" } })).json()) as { transaction: Txn };
    expect(inter.transaction.gst).toMatchObject({ igstMinor: 500, cgstMinor: 0 });

    // Changing the amount works the tax out again; a refund carries the GST.
    const edited = await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { amountMajor: "2360.00" } });
    expect(((await edited.json()) as { transaction: Txn }).transaction.gst).toMatchObject({ taxableMinor: 200_000, taxMinor: 36_000, gstin: GSTIN });
    const refund = await txn({ type: "refund", refundOfId: transaction.id, amountMajor: "590.00" });
    expect(((await refund.json()) as { transaction: Txn }).transaction.gst).toMatchObject({ taxableMinor: 50_000, taxMinor: 9_000 });

    const { summary } = (await (await owner.api.get(`/api/workspaces/${ws}/gst-summary?from=${today()}&to=${today()}`)).json()) as {
      summary: Array<{ currency: string; paid: { taxMinor: number; taxableMinor: number }; itcMinor: number; byRate: Array<{ ratePct: number }> }>;
    };
    expect(summary).toEqual([expect.objectContaining({ currency: "INR", paid: expect.objectContaining({ taxMinor: 36_000 - 9_000 + 500, taxableMinor: 200_000 - 50_000 + 10_000 }), itcMinor: 27_000 })]);
    expect(summary[0]!.byRate.map((r) => r.ratePct)).toEqual([5, 18]);
    expect((await owner.api.get(`/api/workspaces/${ws}/gst-summary?from=${today()}`)).status()).toBe(400);

    // Clearing it.
    const cleared = await owner.api.patch(`/api/transactions/${inter.transaction.id}`, { data: { gst: null } });
    expect(((await cleared.json()) as { transaction: Txn }).transaction.gst).toBeNull();
  });

  test("a category's GST fills in the composer, and Reports adds it up", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const { category } = (await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Restaurants" } })).json()) as { category: { id: string } };
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/categories");
    await page.getByLabel("GST for Restaurants").selectOption("5");
    await expect(page.getByLabel("GST for Restaurants")).toHaveValue("5");
    const { categories } = (await (await owner.api.get(`/api/workspaces/${ws}/categories`)).json()) as { categories: Array<{ id: string; defaultGst: { ratePct: number } | null }> };
    expect(categories.find((c) => c.id === category.id)!.defaultGst).toMatchObject({ ratePct: 5, treatment: "taxable" });

    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Amount", { exact: true }).fill("105");
    await dialog.getByLabel("Category").selectOption({ label: "Restaurants" });
    await expect(dialog.getByLabel("Rate")).toHaveValue("5");
    await expect(dialog.getByText("GST · 100.00 + CGST 2.50 + SGST 2.50")).toBeVisible();
    await page.screenshot({ path: "test-results/gst-composer.png" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/reports");
    const card = page.locator("[data-gst-currency]");
    await expect(card).toContainText("5%");
    await expect(card).toContainText("5.00 USD");
    await context.close();
  });
});
