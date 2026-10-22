import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Account = { id: string; name: string; balanceMinor: number; transactionCount: number; archived: boolean };

test.describe("accounts", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Olive Owner");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("balances follow the transactions in each account, in its own currency", async () => {
    const ws = await personalWorkspaceId(owner);
    // Amounts in other currencies need a rate to the base currency.
    for (const [currency, rate] of [["INR", "0.012"], ["EUR", "1.08"]]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency, rate, effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    }
    const add = async (data: object) => {
      const response = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data });
      expect(response.status(), await response.text()).toBe(201);
      return ((await response.json()) as { account: Account }).account;
    };
    const bank = await add({ name: "HDFC savings", kind: "bank", currency: "INR", openingMajor: "10000.00", openingDate: today() });
    const card = await add({ name: "Amex", kind: "credit_card", currency: "INR", openingMajor: "0", openingDate: today() });
    const euro = await add({ name: "Euro wallet", kind: "wallet", currency: "EUR", openingMajor: "-5.00", openingDate: today() });
    expect(euro.balanceMinor).toBe(-500);

    const txn = (data: object) => owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { date: today(), ...data } });
    expect((await txn({ type: "income", amountMajor: "2500.00", currency: "INR", accountId: bank.id })).status()).toBe(201);
    expect((await txn({ type: "expense", amountMajor: "499.50", currency: "INR", accountId: bank.id })).status()).toBe(201);
    expect((await txn({ type: "expense", amountMajor: "1200.00", currency: "INR", accountId: card.id })).status()).toBe(201);
    // A payment towards the card lowers what's owed.
    expect((await txn({ type: "income", amountMajor: "200.00", currency: "INR", accountId: card.id })).status()).toBe(201);

    // The amount must be in the account's currency, and the account in this workspace.
    const wrong = await txn({ type: "expense", amountMajor: "1.00", currency: "USD", accountId: bank.id });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).message).toContain("INR");
    expect((await txn({ type: "expense", amountMajor: "1.00", currency: "INR", accountId: "not-an-id" })).status()).toBe(400);
    const other = await newTeam(owner);
    expect((await owner.api.post(`/api/workspaces/${other.workspaceId}/transactions`, { data: { type: "expense", amountMajor: "1.00", currency: "INR", date: today(), accountId: bank.id } })).status()).toBe(400);

    const { accounts } = (await (await owner.api.get(`/api/workspaces/${ws}/accounts`)).json()) as { accounts: Account[] };
    const byName = (name: string) => accounts.find((a) => a.name === name)!;
    expect(byName("HDFC savings")).toMatchObject({ balanceMinor: 1_200_050, transactionCount: 2 });
    expect(byName("Amex")).toMatchObject({ balanceMinor: 100_000, transactionCount: 2 });

    // One account's transactions, and moving one to another account.
    const listed = (await (await owner.api.get(`/api/workspaces/${ws}/transactions?accountId=${card.id}`)).json()) as { items: Array<{ id: string; type: string }> };
    expect(listed.items).toHaveLength(2);
    const payment = listed.items.find((t) => t.type === "income")!;
    expect((await owner.api.patch(`/api/transactions/${payment.id}`, { data: { accountId: bank.id } })).ok()).toBe(true);
    const after = (await (await owner.api.get(`/api/workspaces/${ws}/accounts`)).json()) as { accounts: Account[] };
    expect(after.accounts.find((a) => a.id === card.id)!.balanceMinor).toBe(120_000);
    expect(after.accounts.find((a) => a.id === bank.id)!.balanceMinor).toBe(1_220_050);

    // An account in use can't change currency or be deleted, only archived; an archived one takes no new transactions.
    expect((await owner.api.patch(`/api/accounts/${bank.id}`, { data: { currency: "USD" } })).status()).toBe(409);
    expect((await owner.api.delete(`/api/accounts/${bank.id}`)).status()).toBe(409);
    expect((await owner.api.patch(`/api/accounts/${bank.id}`, { data: { archived: true } })).ok()).toBe(true);
    expect((await txn({ type: "expense", amountMajor: "1.00", currency: "INR", accountId: bank.id })).status()).toBe(400);
    expect((await owner.api.delete(`/api/accounts/${euro.id}`)).ok()).toBe(true);
  });

  test("members of a team can see accounts but not change them", async () => {
    const member = await newUser("Milo Member");
    try {
      const team = await newTeam(owner, [member]);
      const created = await owner.api.post(`/api/workspaces/${team.workspaceId}/accounts`, { data: { name: "Ops card", kind: "credit_card", currency: "USD", openingDate: today() } });
      expect(created.status()).toBe(201);
      const { account } = (await created.json()) as { account: Account };
      expect((await member.api.get(`/api/workspaces/${team.workspaceId}/accounts`)).ok()).toBe(true);
      expect((await member.api.post(`/api/workspaces/${team.workspaceId}/accounts`, { data: { name: "Mine", kind: "cash", currency: "USD", openingDate: today() } })).status()).toBe(403);
      expect((await member.api.patch(`/api/accounts/${account.id}`, { data: { name: "Renamed" } })).status()).toBe(403);
      // But they can record their own spending against it.
      expect((await member.api.post(`/api/workspaces/${team.workspaceId}/transactions`, { data: { type: "expense", amountMajor: "3.00", currency: "USD", date: today(), accountId: account.id } })).status()).toBe(201);
    } finally {
      await disposeAll(member);
    }
  });

  test("add an account and spend from it in the app", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible();
    await page.getByLabel("Name").fill("Pocket cash");
    await page.getByLabel("Kind").selectOption({ label: "Cash" });
    await page.getByLabel("Currency").selectOption("INR");
    await page.getByLabel(/Balance on the start date/).fill("500");
    await page.getByRole("button", { name: "Add account" }).click();
    const row = page.locator('[data-account="Pocket cash"]');
    await expect(row).toContainText("500.00 INR");
    await expect(row).toContainText("0 transactions");

    // The composer locks the currency to the chosen account's.
    await page.goto("/transactions");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add transaction" });
    await dialog.getByLabel("Account").selectOption({ label: "Pocket cash (INR)" });
    await expect(dialog.getByLabel("Currency")).toHaveValue("INR");
    await expect(dialog.getByLabel("Currency")).toBeDisabled();
    await dialog.getByLabel("Amount").fill("120");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Pocket cash").first()).toBeVisible();

    await page.goto("/accounts");
    await expect(row).toContainText("380.00 INR");
    await page.screenshot({ path: "test-results/accounts.png", fullPage: true });
    await row.getByRole("link", { name: "1 transaction" }).click();
    await expect(page).toHaveURL(/\/transactions\?account=/);
    await expect(page.getByText("Showing Pocket cash")).toBeVisible();
    await context.close();
  });
});
