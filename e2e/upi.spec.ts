import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Txn = { id: string; note: string | null; upiRef: string | null; upiId: string | null };

test.describe("UPI references", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Uma Upi");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("stored tidily, searchable, and never recorded twice", async () => {
    const ws = await personalWorkspaceId(owner);
    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "250.00", currency: "INR", date: today(), ...data } });
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);

    const made = await txn({ note: "Chai", upiRef: "4321 5678 9012", upiId: " Ravi.K@OKHDFC " });
    expect(made.status(), await made.text()).toBe(201);
    const { transaction } = (await made.json()) as { transaction: Txn };
    expect(transaction).toMatchObject({ upiRef: "432156789012", upiId: "ravi.k@okhdfc" });

    const bad = await txn({ upiRef: "12345" });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).message).toContain("12 digits");
    expect((await txn({ upiId: "ravi" })).status()).toBe(400);
    const again = await txn({ note: "Chai again", upiRef: "432156789012" });
    expect(again.status()).toBe(409);
    expect((await again.json()).message).toBe(`That UPI reference is already recorded, on ${today()} (Chai)`);

    const other = (await (await txn({ note: "Snacks" })).json()) as { transaction: Txn };
    expect((await owner.api.patch(`/api/transactions/${other.transaction.id}`, { data: { upiRef: "4321-5678-9012" } })).status()).toBe(409);
    // Saving the same reference on its own transaction is fine.
    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { upiRef: "432156789012", note: "Chai x2" } })).ok()).toBe(true);

    const notes = async (q: string) =>
      ((await (await owner.api.get(`/api/workspaces/${ws}/transactions?q=${encodeURIComponent(q)}`)).json()) as { items: Txn[] }).items.map((t) => t.note);
    expect(await notes("4321 5678 9012")).toEqual(["Chai x2"]);
    expect(await notes("okhdfc")).toEqual(["Chai x2"]);

    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { upiRef: null } })).ok()).toBe(true);
    const { activity } = (await (await owner.api.get(`/api/transactions/${transaction.id}/activity`)).json()) as { activity: { history: Array<{ changes: Array<{ field: string; from: unknown; to: unknown }> }> } };
    expect(activity.history[0]!.changes).toEqual([{ field: "upiRef", from: "432156789012", to: null }]);
    // Once it's off that transaction, the reference can be used again.
    expect((await txn({ note: "Later", upiRef: "432156789012" })).status()).toBe(201);
  });

  test("add a UPI reference in the composer and see it in the details", async ({ browser }) => {
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Amount", { exact: true }).fill("80");
    await dialog.getByLabel("Note").fill("Auto");
    await dialog.getByText("UPI details").click();
    await dialog.getByLabel("UPI reference").fill("9988 7766 5544");
    await dialog.getByLabel("UPI ID").fill("driver@ybl");
    await page.screenshot({ path: "test-results/upi-composer.png" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: /^Details for .* Auto$/ }).click();
    await expect(page.getByRole("dialog", { name: "Transaction details" })).toContainText("UPI 9988 7766 5544 · driver@ybl");
    await context.close();
  });
});
