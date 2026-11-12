import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";
import { E2E_BASE_URL, E2E_CRON_SECRET, E2E_MONGODB_URI } from "./env";

/** The database as it is, past the app's hooks: what someone with a copy of it would see. */
async function raw<T>(run: (db: mongoose.Connection) => Promise<T>) {
  const db = await mongoose.createConnection(E2E_MONGODB_URI).asPromise();
  try {
    return await run(db);
  } finally {
    await db.close();
  }
}

test.describe("sensitive data at rest", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Sen Sitive");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("notes are sealed in the database, read back as text, and still found by search", async () => {
    const ws = await personalWorkspaceId(owner);
    const add = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "42.00", currency: "USD", date: today(), merchant: "Market", note: "Weekly groceries for Asha" } });
    expect(add.status(), await add.text()).toBe(201);
    const { transaction } = (await add.json()) as { transaction: { id: string; note: string } };
    expect(transaction.note).toBe("Weekly groceries for Asha");

    const stored = await raw((db) => db.collection("transactions").findOne({ _id: new mongoose.Types.ObjectId(transaction.id) }));
    expect(String(stored!.note)).toMatch(/^enc1:/);
    expect(JSON.stringify(stored)).not.toContain("Asha");
    expect(JSON.stringify(stored)).not.toContain("groc");

    const search = async (q: string) => ((await (await owner.api.get(`/api/workspaces/${ws}/transactions?q=${encodeURIComponent(q)}`)).json()) as { items: Array<{ id: string; note: string }> }).items;
    expect((await search("groc wee")).map((t) => t.note)).toEqual(["Weekly groceries for Asha"]);
    expect(await search("grocx")).toEqual([]);

    // Changing it: sealed in the database and in the history; the audit history says only that it changed.
    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { note: "Party supplies" } })).ok()).toBe(true);
    expect((await search("party")).map((t) => t.id)).toEqual([transaction.id]);
    expect(await search("groc")).toEqual([]);
    const activity = (await (await owner.api.get(`/api/transactions/${transaction.id}/activity`)).json()) as { history: Array<{ changes: Array<{ field: string; from: unknown; to: unknown }> }> };
    expect(activity.history.flatMap((h) => h.changes).find((c) => c.field === "note")).toMatchObject({ from: "Weekly groceries for Asha", to: "Party supplies" });
    const leaks = await raw(async (db) => [
      JSON.stringify(await db.collection("transaction_changes").find({ transactionId: new mongoose.Types.ObjectId(transaction.id) }).toArray()),
      JSON.stringify(await db.collection("audit_entries").find({ entityId: transaction.id }).toArray()),
    ]);
    for (const text of leaks) {
      expect(text).not.toContain("Party");
      expect(text).not.toContain("Asha");
    }

    // A bill's note too.
    const bill = await owner.api.post(`/api/workspaces/${ws}/payments`, { data: { name: "Rent", amountMajor: "900.00", currency: "USD", dueDate: today(), note: "Flat 4B, landlord Ravi" } });
    const { payment } = (await bill.json()) as { payment: { id: string; note: string } };
    expect(payment.note).toBe("Flat 4B, landlord Ravi");
    expect(String((await raw((db) => db.collection("scheduled_payments").findOne({ _id: new mongoose.Types.ObjectId(payment.id) })))!.note)).toMatch(/^enc1:/);
  });

  test("notes stored before sealing are sealed by the daily run", async () => {
    const ws = await personalWorkspaceId(owner);
    const add = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "5.00", currency: "USD", date: today(), note: "placeholder" } });
    const { transaction } = (await add.json()) as { transaction: { id: string } };
    const id = new mongoose.Types.ObjectId(transaction.id);
    await raw((db) => db.collection("transactions").updateOne({ _id: id }, { $set: { note: "Old plain note" }, $unset: { noteTerms: 1 } }));
    expect(((await (await owner.api.get(`/api/transactions/${transaction.id}`)).json()) as { transaction: { note: string } }).transaction.note).toBe("Old plain note");

    expect((await owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } })).ok()).toBe(true);
    expect(String((await raw((db) => db.collection("transactions").findOne({ _id: id })))!.note)).toMatch(/^enc1:/);
    const found = ((await (await owner.api.get(`/api/workspaces/${ws}/transactions?q=plain`)).json()) as { items: Array<{ id: string }> }).items;
    expect(found.map((t) => t.id)).toEqual([transaction.id]);
  });

  test("account numbers are sealed, shown masked, and shown whole only on asking, which is recorded", async ({ browser, playwright }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Bad", kind: "bank", currency: "USD", openingDate: today(), number: "12#4" } })).status()).toBe(400);
    const made = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Savings", kind: "bank", currency: "USD", openingDate: today(), number: "5010 0123 4567 89" } });
    expect(made.status(), await made.text()).toBe(201);
    const { account } = (await made.json()) as { account: { id: string; numberMasked: string } };
    expect(account.numberMasked).toBe("•••• 6789");
    const listed = JSON.stringify(await (await owner.api.get(`/api/workspaces/${ws}/accounts`)).json());
    expect(listed).not.toContain("50100123");

    const stored = await raw((db) => db.collection("accounts").findOne({ _id: new mongoose.Types.ObjectId(account.id) }));
    expect(String(stored!.numberSealed)).toMatch(/^enc1:/);
    expect(JSON.stringify(stored)).not.toContain("50100123");

    const shown = await owner.api.post(`/api/accounts/${account.id}/number`);
    expect(await shown.json()).toEqual({ number: "50100123456789" });
    expect(shown.headers()["cache-control"]).toBe("no-store");
    const { entries } = (await (await owner.api.get(`/api/workspaces/${ws}/audit?entity=account`)).json()) as { entries: Array<{ action: string; summary: string }> };
    expect(entries[0]).toMatchObject({ action: "account.number_shown", summary: "Account number shown: Savings (•••• 6789)" });

    // Not with an access token.
    const { token } = (await (await owner.api.post("/api/me/access-tokens", { data: { name: "script", scope: "write", days: 30 } })).json()) as { token: string };
    const script = await playwright.request.newContext({ extraHTTPHeaders: { authorization: `Bearer ${token}` } });
    expect((await script.post(`${E2E_BASE_URL}/api/accounts/${account.id}/number`)).status()).toBe(403);
    await script.dispose();

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    const row = page.locator('[data-account="Savings"] [data-account-number]');
    await expect(row).toContainText("•••• 6789");
    await row.getByRole("button", { name: "Show" }).click();
    await expect(row).toContainText("50100123456789");
    await page.screenshot({ path: "test-results/sensitive-data.png", fullPage: true });
    await context.close();
  });
});
