import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Account = { id: string; name: string; balanceMinor: number; clearedBalanceMinor: number; pendingCount: number; reconciledThrough: string | null };
type Txn = { id: string; clearing: string };

test.describe("pending, cleared and reconciled", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Cleo Clearing");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("reconciling an account checks cleared transactions against the statement", async () => {
    const ws = await personalWorkspaceId(owner);
    const created = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Checking", kind: "bank", currency: "USD", openingMajor: "1000.00", openingDate: "2026-01-01" } });
    const { account } = (await created.json()) as { account: Account };
    const txn = async (data: object) => {
      const response = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { currency: "USD", accountId: account.id, date: today(), ...data } });
      expect(response.status(), await response.text()).toBe(201);
      return ((await response.json()) as { transaction: Txn }).transaction;
    };
    const rent = await txn({ type: "expense", amountMajor: "300.00" });
    expect(rent.clearing).toBe("cleared");
    const coffee = await txn({ type: "expense", amountMajor: "5.00", clearing: "pending" });
    expect(coffee.clearing).toBe("pending");
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "1.00", currency: "USD", date: today(), clearing: "reconciled" } })).status()).toBe(400);

    const get = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/accounts`)).json()) as { accounts: Account[] }).accounts[0]!;
    expect(await get()).toMatchObject({ balanceMinor: 69_500, clearedBalanceMinor: 70_000, pendingCount: 1 });

    // A statement that doesn't match changes nothing and says by how much.
    const off = await owner.api.post(`/api/accounts/${account.id}/reconcile`, { data: { statementMajor: "695.00", through: today() } });
    expect(off.status()).toBe(409);
    expect((await off.json()).message).toContain("5.00 more than the statement");
    const ok = await owner.api.post(`/api/accounts/${account.id}/reconcile`, { data: { statementMajor: "700.00", through: today() } });
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).reconciled).toBe(1);
    expect(await get()).toMatchObject({ reconciledThrough: today(), pendingCount: 1 });

    // Reconciled: fixed until marked cleared again; the pending one stays pending and editable.
    const get1 = async (id: string) => ((await (await owner.api.get(`/api/transactions/${id}`)).json()) as { transaction: Txn }).transaction;
    expect((await get1(rent.id)).clearing).toBe("reconciled");
    expect((await get1(coffee.id)).clearing).toBe("pending");
    expect((await owner.api.patch(`/api/transactions/${rent.id}`, { data: { amountMajor: "301.00" } })).status()).toBe(409);
    expect((await owner.api.delete(`/api/transactions/${rent.id}`)).status()).toBe(409);
    expect((await owner.api.patch(`/api/transactions/${rent.id}`, { data: { note: "October rent" } })).ok()).toBe(true);
    expect((await owner.api.patch(`/api/transactions/${rent.id}`, { data: { clearing: "reconciled" } })).ok()).toBe(true);
    expect((await owner.api.patch(`/api/transactions/${coffee.id}`, { data: { clearing: "reconciled" } })).status()).toBe(400);
    expect((await owner.api.patch(`/api/transactions/${rent.id}`, { data: { clearing: "cleared" } })).ok()).toBe(true);
    expect((await owner.api.patch(`/api/transactions/${rent.id}`, { data: { amountMajor: "301.00" } })).ok()).toBe(true);
  });

  test("only approvers can reconcile, or undo a reconciliation", async () => {
    const member = await newUser("Mo Member");
    try {
      const team = await newTeam(owner, [member]);
      const { account } = (await (await owner.api.post(`/api/workspaces/${team.workspaceId}/accounts`, { data: { name: "Ops", kind: "bank", currency: "USD", openingDate: today() } })).json()) as { account: Account };
      const made = await member.api.post(`/api/workspaces/${team.workspaceId}/transactions`, { data: { type: "expense", amountMajor: "10.00", currency: "USD", date: today(), accountId: account.id } });
      const { transaction } = (await made.json()) as { transaction: Txn };
      expect((await member.api.post(`/api/accounts/${account.id}/reconcile`, { data: { statementMajor: "-10.00", through: today() } })).status()).toBe(403);
      expect((await owner.api.post(`/api/accounts/${account.id}/reconcile`, { data: { statementMajor: "-10.00", through: today() } })).ok()).toBe(true);
      expect((await member.api.patch(`/api/transactions/${transaction.id}`, { data: { clearing: "cleared" } })).status()).toBe(403);
    } finally {
      await disposeAll(member);
    }
  });

  test("mark cleared and reconcile in the app", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const { account } = (await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Checking", kind: "bank", currency: "USD", openingMajor: "200.00", openingDate: "2026-01-01" } })).json()) as { account: Account };
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "40.00", currency: "USD", date: today(), accountId: account.id, note: "Groceries", clearing: "pending" } })).status()).toBe(201);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();

    await page.goto("/accounts");
    const row = page.locator('[data-account="Checking"]');
    await expect(row).toContainText("200.00 cleared · 1 pending");

    await page.goto("/transactions");
    const groceries = page.locator("div.absolute", { hasText: "Groceries" });
    await groceries.getByRole("button", { name: "Mark cleared" }).click();
    await expect(groceries.getByRole("button", { name: "Mark pending" })).toBeVisible();

    await page.goto("/accounts");
    await expect(row).not.toContainText("pending");
    await row.getByRole("button", { name: "Reconcile" }).click();
    const form = page.getByRole("form", { name: "Reconcile Checking" });
    await form.getByLabel(/Statement balance/).fill("150");
    await form.getByRole("button", { name: "Reconcile" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "more than the statement" })).toBeVisible();
    await form.getByLabel(/Statement balance/).fill("160");
    await form.getByRole("button", { name: "Reconcile" }).click();
    await expect(page.getByText("Reconciled 1 transaction.")).toBeVisible();
    await expect(row).toContainText(`Reconciled through ${today()}`);
    await page.screenshot({ path: "test-results/reconcile.png", fullPage: true });

    await page.goto("/transactions");
    await expect(groceries).toContainText("Reconciled");
    await page.screenshot({ path: "test-results/clearing-list.png" });
    await context.close();
  });
});
