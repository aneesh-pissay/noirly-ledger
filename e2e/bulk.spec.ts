import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Txn = { id: string; note: string | null; categoryId: string | null; tags: string[]; clearing: string };

test.describe("bulk create, edit and delete", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Bo Bulk");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("change many at once, reporting the ones that can't change; add several all or nothing", async () => {
    const ws = await personalWorkspaceId(owner);
    const { category } = (await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Office" } })).json()) as { category: { id: string } };
    const bulkCreate = (transactions: object[]) => owner.api.post(`/api/workspaces/${ws}/transactions/bulk-create`, { data: { transactions } });
    const row = (note: string, amountMajor = "10.00") => ({ type: "expense", amountMajor, currency: "USD", date: today(), note, tags: ["old"] });

    // One bad row means none are added.
    const bad = await bulkCreate([row("Paper"), { ...row("Ink"), categoryId: "000000000000000000000000" }, row("Pens")]);
    expect(bad.status()).toBe(400);
    expect((await bad.json()).message).toMatch(/^Row 2: .*Nothing was added\.$/);
    const list = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: Txn[] }).items;
    expect(await list()).toHaveLength(0);

    const created = await bulkCreate([row("Paper"), row("Ink"), row("Pens")]);
    expect(created.status(), await created.text()).toBe(201);
    const ids = ((await created.json()) as { transactions: Txn[] }).transactions.map((t) => t.id);

    // Reconcile one so it can't change, then change all three.
    const { account } = (await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Bank", kind: "bank", currency: "USD", openingMajor: "100.00", openingDate: today() } })).json()) as { account: { id: string } };
    expect((await owner.api.patch(`/api/transactions/${ids[0]}`, { data: { accountId: account.id } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/accounts/${account.id}/reconcile`, { data: { statementMajor: "90.00", through: today() } })).ok()).toBe(true);

    const bulk = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions/bulk`, { data });
    const deleted = await bulk({ ids: [ids[0], "000000000000000000000000"], action: { kind: "delete" } });
    expect(await deleted.json()).toEqual({
      done: 0,
      failed: [
        { id: ids[0], error: "This transaction is reconciled. Mark it cleared before deleting it." },
        { id: "000000000000000000000000", error: "Not one of this workspace's transactions" },
      ],
    });
    const changed = await bulk({ ids, action: { kind: "update", change: { categoryId: category.id, addTags: ["#Supplies"], removeTags: ["old"], clearing: "pending" } } });
    const result = (await changed.json()) as { done: number; failed: Array<{ id: string }> };
    // The owner may take a reconciled one back to pending, so all three change.
    expect(result).toEqual({ done: 3, failed: [] });
    const after = await list();
    const byNote = (note: string) => after.find((t) => t.note === note)!;
    expect(byNote("Ink")).toMatchObject({ categoryId: category.id, tags: ["supplies"], clearing: "pending" });
    expect(byNote("Paper")).toMatchObject({ categoryId: category.id, clearing: "pending" });
    expect((await bulk({ ids, action: { kind: "update", change: {} } })).status()).toBe(400);

    expect(await (await bulk({ ids, action: { kind: "delete" } })).json()).toEqual({ done: 3, failed: [] });
    expect(await list()).toHaveLength(0);
  });

  test("select rows and change them, and add several in one go", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Office" } })).status()).toBe(201);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add several" }).click();
    const dialog = page.getByRole("dialog", { name: "Add several transactions" });
    for (const [i, [amount, note]] of [["12", "Paper"], ["30", "Ink"], ["4.5", "Pens"]].entries()) {
      await dialog.getByLabel(`Row ${i + 1} amount`).fill(amount!);
      await dialog.getByLabel(`Row ${i + 1} note`).fill(note!);
    }
    await expect(dialog).toContainText("3 to add");
    await dialog.getByRole("button", { name: "Add 3" }).click();
    await expect(dialog).toBeHidden();
    const rows = page.locator("div.absolute");
    await expect(rows).toHaveCount(3);

    await page.getByLabel("Select all shown").check();
    const bar = page.getByRole("region", { name: "Selected transactions" });
    await expect(bar).toContainText("3 selected");
    await page.screenshot({ path: "test-results/bulk.png" });
    await bar.getByLabel("Set category").selectOption({ label: "Office" });
    await expect(bar).toBeHidden();
    await expect(rows.filter({ hasText: "Office" })).toHaveCount(3);

    await page.getByRole("checkbox", { name: / Pens$/ }).check();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("region", { name: "Selected transactions" }).getByRole("button", { name: "Delete" }).click();
    await expect(rows).toHaveCount(2);
    await context.close();
  });
});
