import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Account = { id: string; name: string; balanceMinor: number; transactionCount: number };

test.describe("transfers", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Tara Transfer");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("a transfer moves money out of one account and into the other", async () => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const add = async (data: object) => {
      const response = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { openingDate: today(), ...data } });
      expect(response.status(), await response.text()).toBe(201);
      return ((await response.json()) as { account: Account }).account;
    };
    const bank = await add({ name: "Checking", kind: "bank", currency: "USD", openingMajor: "1000.00" });
    const card = await add({ name: "Visa", kind: "credit_card", currency: "USD", openingMajor: "400.00" });
    const rupees = await add({ name: "SBI", kind: "bank", currency: "INR", openingMajor: "0" });
    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "transfer", date: today(), currency: "USD", ...data } });

    // Paying the card from the bank lowers both: less in the bank, less owed.
    const payment = await txn({ amountMajor: "150.00", accountId: bank.id, toAccountId: card.id });
    expect(payment.status(), await payment.text()).toBe(201);
    // Across currencies, the amount received is in the other account's currency.
    expect((await txn({ amountMajor: "100.00", accountId: bank.id, toAccountId: rupees.id })).status()).toBe(400);
    const abroad = await txn({ amountMajor: "100.00", accountId: bank.id, toAccountId: rupees.id, toAmountMajor: "8300.00" });
    expect(abroad.status(), await abroad.text()).toBe(201);

    // Same account, or only one side, isn't a transfer.
    expect((await txn({ amountMajor: "1.00", accountId: bank.id, toAccountId: bank.id })).status()).toBe(400);
    expect((await txn({ amountMajor: "1.00", toAccountId: card.id })).status()).toBe(400);
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "1.00", currency: "USD", date: today(), accountId: bank.id, toAccountId: card.id } })).status()).toBe(400);

    const balances = async () => {
      const { accounts } = (await (await owner.api.get(`/api/workspaces/${ws}/accounts`)).json()) as { accounts: Account[] };
      return Object.fromEntries(accounts.map((a) => [a.name, a.balanceMinor]));
    };
    expect(await balances()).toEqual({ Checking: 75_000, Visa: 25_000, SBI: 830_000 });

    // The receiving account lists the transfer too, and an account with one can't be deleted.
    const listed = (await (await owner.api.get(`/api/workspaces/${ws}/transactions?accountId=${card.id}`)).json()) as { items: unknown[] };
    expect(listed.items).toHaveLength(1);
    expect((await owner.api.delete(`/api/accounts/${card.id}`)).status()).toBe(409);

    // Editing the amount keeps the same-currency received amount in step; turning it into spending drops the "to" side.
    const { transaction } = (await payment.json()) as { transaction: { id: string } };
    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { amountMajor: "200.00" } })).ok()).toBe(true);
    expect(await balances()).toMatchObject({ Checking: 70_000, Visa: 20_000 });
    const asExpense = await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { type: "expense" } });
    expect(asExpense.ok()).toBe(true);
    expect((await asExpense.json()).transaction.toAccountId).toBeNull();
    expect(await balances()).toMatchObject({ Checking: 70_000, Visa: 40_000 });
  });

  test("transfer between accounts in the app", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    for (const data of [
      { name: "Checking", kind: "bank", currency: "USD", openingMajor: "500.00" },
      { name: "SBI", kind: "bank", currency: "INR", openingMajor: "0" },
    ]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { openingDate: today(), ...data } })).status()).toBe(201);
    }
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Type").selectOption("transfer");
    await expect(dialog.getByLabel("Category")).toBeHidden();
    await dialog.getByLabel("From").selectOption({ label: "Checking (USD)" });
    await dialog.getByLabel("To", { exact: true }).selectOption({ label: "SBI (INR)" });
    await dialog.getByLabel("Amount", { exact: true }).fill("50");
    await dialog.getByLabel("Amount received (INR)").fill("4150");
    await page.screenshot({ path: "test-results/transfer-composer.png" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Checking → SBI")).toBeVisible();

    await page.goto("/accounts");
    await expect(page.locator('[data-account="Checking"]')).toContainText("450.00 USD");
    await expect(page.locator('[data-account="SBI"]')).toContainText("4,150.00 INR");
    await page.screenshot({ path: "test-results/transfer-accounts.png", fullPage: true });
    await context.close();
  });
});
