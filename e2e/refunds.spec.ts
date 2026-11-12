import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Txn = { id: string; type: string; categoryId: string | null; accountId: string | null; refundedMinor: number };

test.describe("refunds", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Rhea Refund");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("a refund takes back part of its expense: spending, budget and account", async () => {
    const ws = await personalWorkspaceId(owner);
    const { categories } = (await (await owner.api.get(`/api/workspaces/${ws}/categories`)).json()) as { categories: Array<{ id: string }> };
    const categoryId = categories[0]!.id;
    const accountRes = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Card", kind: "credit_card", currency: "USD", openingMajor: "0", openingDate: today() } });
    const { account } = (await accountRes.json()) as { account: { id: string } };
    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { date: today(), currency: "USD", ...data } });

    const bought = await txn({ type: "expense", amountMajor: "120.00", categoryId, accountId: account.id, note: "Shoes" });
    const { transaction: expense } = (await bought.json()) as { transaction: Txn };
    const summary = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/dashboard?range=7d`)).json()) as { summary: { expenseMinor: number; incomeMinor: number } }).summary;
    const before = await summary();

    // The refund lands in the expense's category and account.
    const back = await txn({ type: "refund", refundOfId: expense.id, amountMajor: "45.00" });
    expect(back.status(), await back.text()).toBe(201);
    const { transaction: refund } = (await back.json()) as { transaction: Txn };
    expect(refund).toMatchObject({ categoryId, accountId: account.id });

    // No more than what's left, in the expense's currency, and only against an expense.
    expect((await txn({ type: "refund", refundOfId: expense.id, amountMajor: "75.01" })).status()).toBe(400);
    expect((await txn({ type: "refund", refundOfId: expense.id, amountMajor: "1.00", currency: "EUR" })).status()).toBe(400);
    expect((await txn({ type: "refund", refundOfId: refund.id, amountMajor: "1.00" })).status()).toBe(400);
    expect((await txn({ type: "refund", amountMajor: "1.00" })).status()).toBe(400);
    expect((await txn({ type: "income", refundOfId: expense.id, amountMajor: "1.00" })).status()).toBe(400);

    // Spending drops by the refund; income doesn't rise. The card owes less.
    const after = await summary();
    expect(after.expenseMinor).toBe(before.expenseMinor - 4_500);
    expect(after.incomeMinor).toBe(before.incomeMinor);
    const { accounts } = (await (await owner.api.get(`/api/workspaces/${ws}/accounts`)).json()) as { accounts: Array<{ id: string; balanceMinor: number }> };
    expect(accounts.find((a) => a.id === account.id)!.balanceMinor).toBe(7_500);
    const fetched = (await (await owner.api.get(`/api/transactions/${expense.id}`)).json()) as { transaction: Txn };
    expect(fetched.transaction.refundedMinor).toBe(4_500);

    // The pair stays linked: the expense can't shrink below its refunds, change type or go first.
    expect((await owner.api.patch(`/api/transactions/${expense.id}`, { data: { amountMajor: "40.00" } })).status()).toBe(400);
    expect((await owner.api.patch(`/api/transactions/${expense.id}`, { data: { type: "income" } })).status()).toBe(409);
    expect((await owner.api.patch(`/api/transactions/${refund.id}`, { data: { type: "income" } })).status()).toBe(409);
    expect((await owner.api.patch(`/api/transactions/${refund.id}`, { data: { amountMajor: "120.01" } })).status()).toBe(400);
    expect((await owner.api.patch(`/api/transactions/${refund.id}`, { data: { amountMajor: "120.00" } })).ok()).toBe(true);
    expect((await owner.api.delete(`/api/transactions/${expense.id}`)).status()).toBe(409);
    expect((await owner.api.delete(`/api/transactions/${refund.id}`)).ok()).toBe(true);
    expect((await owner.api.delete(`/api/transactions/${expense.id}`)).ok()).toBe(true);
  });

  test("refund an expense from its row", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "60.00", currency: "USD", date: today(), note: "Headphones" } })).status()).toBe(201);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    const row = page.locator("div.absolute", { hasText: "Headphones" });
    await row.getByRole("button", { name: "Refund" }).click();
    const dialog = page.getByRole("dialog", { name: "Refund" });
    await expect(dialog.getByLabel("Amount (USD)")).toHaveValue("60.00");
    await dialog.getByLabel("Amount (USD)").fill("20");
    await dialog.getByLabel("Note").fill("Returned the case");
    await dialog.getByRole("button", { name: "Save refund" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Part refunded");
    const refundRow = page.locator("div.absolute", { hasText: "Returned the case" });
    await expect(refundRow).toContainText("Refund");
    await expect(refundRow.getByRole("button", { name: "Refund" })).toHaveCount(0);
    await page.screenshot({ path: "test-results/refunds.png" });

    // The expense can't go while its refund is there.
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("This expense has refunds. Delete them first.")).toBeVisible();
    await context.close();
  });
});
