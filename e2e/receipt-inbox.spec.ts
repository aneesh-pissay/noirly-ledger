import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Txn = { id: string; receiptUrl: string | null };
type Inbox = { receipts: Array<{ id: string; name: string; date: string | null; amountMinor: number | null; merchant: string | null; transactionId: string | null; suggestions: Txn[] }> };

const pdf = (name: string) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
const png = (name: string) => ({ name, mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a", "hex") });

test.describe("receipt inbox", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Rita Receipts");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("upload in bulk, match the clear ones, pick the rest", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const add = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { transaction: Txn }).transaction;
    };
    const swiggy = await add({ amountMajor: "450.00", date: "2026-10-01", merchant: "Swiggy" });
    const bigbasket = await add({ amountMajor: "812.40", date: "2026-10-05", merchant: "BigBasket" });
    const groceries = await add({ amountMajor: "812.40", date: "2026-10-06", note: "Groceries" });
    const dinner = await add({ amountMajor: "1200.00", date: "2026-10-08", note: "Dinner" });
    const txn = async (id: string) =>
      ((await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: Txn[] }).items.find((t) => t.id === id)!;
    const inbox = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/receipt-inbox`)).json()) as Inbox).receipts;

    // Only receipt files, and every one is checked before any is saved.
    const bad = await owner.api.post(`/api/workspaces/${ws}/receipt-inbox`, { multipart: { files: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") } } });
    expect(bad.status()).toBe(400);

    for (const file of [pdf("2026-10-01 Swiggy 450.pdf"), png("BigBasket_Rs812.40_05-10-2026.png"), pdf("scan.pdf"), png("receipt 99.png")]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/receipt-inbox`, { multipart: { files: file } })).status()).toBe(201);
    }
    const listed = await inbox();
    const named = (name: string) => listed.find((r) => r.name === name)!;
    expect(named("BigBasket_Rs812.40_05-10-2026.png")).toMatchObject({ date: "2026-10-05", amountMinor: 81_240, merchant: "BigBasket" });
    expect(named("BigBasket_Rs812.40_05-10-2026.png").suggestions.map((t) => t.id)).toEqual([bigbasket.id, groceries.id]);
    expect(named("scan.pdf")).toMatchObject({ date: null, amountMinor: null, suggestions: [] });

    // The two that stand out are attached; the ones with nothing to go on wait.
    const all = await owner.api.post(`/api/workspaces/${ws}/receipt-inbox/match-all`);
    expect(await all.json()).toEqual({ matched: 2 });
    expect((await txn(swiggy.id)).receiptUrl).toBeTruthy();
    expect((await txn(bigbasket.id)).receiptUrl).toBeTruthy();
    expect((await txn(groceries.id)).receiptUrl).toBeNull();

    // A second receipt for a transaction that has one becomes one more file on it.
    expect((await owner.api.post(`/api/workspaces/${ws}/receipt-inbox`, { multipart: { files: pdf("swiggy tip 450.pdf") } })).status()).toBe(201);
    const tip = (await inbox()).find((r) => r.name === "swiggy tip 450.pdf")!;
    expect((await owner.api.post(`/api/receipt-inbox/${tip.id}/match`, { data: { transactionId: swiggy.id } })).ok()).toBe(true);
    const { activity } = (await (await owner.api.get(`/api/transactions/${swiggy.id}/activity`)).json()) as { activity: { attachments: Array<{ name: string }> } };
    expect(activity.attachments.map((a) => a.name)).toEqual(["swiggy tip 450.pdf"]);
    expect((await owner.api.post(`/api/receipt-inbox/${tip.id}/match`, { data: { transactionId: groceries.id } })).status()).toBe(409);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    await page.getByRole("link", { name: "Match receipts" }).click();
    await expect(page).toHaveURL(/\/transactions\/receipts$/);
    const scan = page.locator('[data-receipt="scan.pdf"]');
    await expect(scan).toContainText("Add its amount to find its transaction.");
    await scan.getByLabel("Amount of scan.pdf").fill("1200");
    await scan.getByLabel("Date of scan.pdf").fill("2026-10-07");
    await scan.getByLabel("Shop on scan.pdf").click();
    // Both saved: the date narrows it to the transaction a day after.
    await expect(scan.getByLabel("Date of scan.pdf")).toHaveValue("2026-10-07");
    const picks = scan.getByRole("list", { name: "Transactions for scan.pdf" });
    await expect(picks).toContainText("Dinner");
    await page.screenshot({ path: "test-results/receipt-inbox.png", fullPage: true });
    await picks.getByRole("button", { name: "Attach" }).click();
    await expect(page.getByRole("status")).toHaveText("Receipt attached.");
    await expect(page.locator('[data-matched-receipt="scan.pdf"]')).toContainText("Attached · 1,200.00 INR · 2026-10-07");
    await page.locator('[data-receipt="receipt 99.png"]').getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("region", { name: "To match" })).toContainText("Nothing waiting.");
    expect((await txn(dinner.id)).receiptUrl).toBeTruthy();
    await context.close();
  });
});
