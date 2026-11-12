import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Txn = { id: string; date: string; note: string | null };
type Pair = { first: Txn; second: Txn; reason: string };

test.describe("duplicate transactions", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Dee Dupe");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("spotted on entry, on import and in review", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const { account } = (await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "HDFC", kind: "bank", currency: "INR", openingMajor: "5000.00", openingDate: "2026-09-01" } })).json()) as { account: { id: string } };
    const add = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", accountId: account.id, ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { transaction: Txn }).transaction;
    };
    const swiggy = await add({ amountMajor: "450.00", date: "2026-10-01", merchant: "Swiggy" });
    await add({ amountMajor: "450.00", date: "2026-10-20", merchant: "Swiggy" });

    // While entering: the same amount two days later with a matching name, but not something else.
    const check = async (data: object) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/duplicates/check`, { data: { type: "expense", amountMajor: "450", currency: "INR", accountId: account.id, upiRef: null, ...data } })).json()) as { matches: Array<{ transaction: Txn; reason: string }> }).matches;
    expect((await check({ date: "2026-10-03", text: "SWIGGY BANGALORE" })).map((m) => [m.transaction.id, m.reason])).toEqual([[swiggy.id, "nearby"]]);
    expect(await check({ date: "2026-10-03", text: "Petrol" })).toEqual([]);
    expect(await check({ date: "2026-10-10", text: "Swiggy" })).toEqual([]);

    // On import: a statement line posted a day after the one typed in.
    const csv = "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n02/10/26,UPI-SWIGGY-428512345678,428512345678,02/10/26,450.00,,4550.00\n05/10/26,ATM WDL,,05/10/26,450.00,,4100.00";
    const preview = await owner.api.post(`/api/workspaces/${ws}/imports/preview`, { multipart: { file: { name: "hdfc.csv", mimeType: "text/csv", buffer: Buffer.from(csv) }, accountId: account.id } });
    expect(((await preview.json()) as { preview: { rows: Array<{ duplicate: boolean }> } }).preview.rows.map((r) => r.duplicate)).toEqual([true, false]);

    // In review: two the same day, whatever their notes.
    const extra = await add({ amountMajor: "450.00", date: "2026-10-20", note: "typed twice" });
    const pairs = ((await (await owner.api.get(`/api/workspaces/${ws}/duplicates`)).json()) as { pairs: Pair[] }).pairs;
    expect(pairs.map((p) => [p.second.id, p.reason])).toEqual([[extra.id, "same-day"]]);
    expect((await owner.api.post(`/api/transactions/${extra.id}/not-duplicate`, { data: { otherId: extra.id } })).status()).toBe(400);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    const panel = page.getByRole("region", { name: "Possible duplicates" });
    await expect(panel).toContainText("1 possible duplicate");
    await panel.getByRole("button", { name: "Review" }).click();
    await expect(panel.locator("[data-duplicate-pair]")).toContainText("typed twice");
    await panel.getByRole("button", { name: "Keep both" }).click();
    await expect(panel).toBeHidden();

    // The Add dialog warns before saving one again, and still saves it.
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Account").selectOption({ label: "HDFC (INR)" });
    await dialog.getByLabel("Amount", { exact: true }).fill("450");
    await dialog.getByLabel("Date").fill("2026-10-01");
    await dialog.getByLabel("Merchant").fill("Swiggy");
    const warning = dialog.locator("[data-duplicate-warning]");
    await expect(warning).toContainText("Looks already recorded");
    await expect(warning).toContainText("2026-10-01 · Swiggy");
    await page.screenshot({ path: "test-results/duplicate-warning.png" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(panel).toContainText("1 possible duplicate");
    await expect(panel.getByRole("button", { name: "Hide" })).toBeVisible();
    await page.screenshot({ path: "test-results/duplicates-panel.png", fullPage: true });
    await panel.getByRole("button", { name: "Delete the second" }).click();
    await expect(panel).toBeHidden();
    await context.close();
  });
});
