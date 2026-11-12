import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Totals = { incomeMinor: number; expenseMinor: number; netMinor: number; savingsRatePct: number | null };
type CashTotals = { openingMinor: number; inMinor: number; outMinor: number; otherMinor: number; closingMinor: number };

/** The first day of last month. */
function lastMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

test.describe("cash-flow and income-versus-expense reports", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Rita Reports");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("income against spending, and money on hand with cards and transfers counted right", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const from = lastMonthStart();
    const add = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { account: { id: string } }).account.id;
    };
    const bank = await add({ name: "Bank", kind: "bank", currency: "USD", openingMajor: "1000.00", openingDate: from });
    const wallet = await add({ name: "Wallet", kind: "wallet", currency: "USD", openingMajor: "0", openingDate: from });
    const card = await add({ name: "Card", kind: "credit_card", currency: "USD", openingMajor: "0", openingDate: from });
    const txn = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { date: today(), currency: "USD", ...data } });
      expect(res.status(), await res.text()).toBe(201);
    };
    await txn({ type: "income", amountMajor: "500.00", accountId: bank });
    await txn({ type: "expense", amountMajor: "200.00", accountId: bank });
    // On the card: spending, but not cash out until the card is paid.
    await txn({ type: "expense", amountMajor: "100.00", accountId: card });
    await txn({ type: "transfer", amountMajor: "100.00", accountId: bank, toAccountId: card });
    // Between two cash accounts: neither in nor out.
    await txn({ type: "transfer", amountMajor: "50.00", accountId: bank, toAccountId: wallet });

    const q = `from=${from}&to=${today()}&granularity=month`;
    const income = (await (await owner.api.get(`/api/workspaces/${ws}/reports/income-expense?${q}`)).json()) as { totals: Totals; rows: Array<{ label: string }> };
    expect(income.rows).toHaveLength(2);
    expect(income.totals).toEqual({ incomeMinor: 50_000, expenseMinor: 30_000, netMinor: 20_000, savingsRatePct: 40 });

    const cash = (await (await owner.api.get(`/api/workspaces/${ws}/reports/cash-flow?${q}`)).json()) as { hasCashAccounts: boolean; totals: CashTotals; rows: Array<CashTotals> };
    expect(cash.hasCashAccounts).toBe(true);
    // The bank's opening balance arrives with the account (other), then 500 in and 300 out.
    expect(cash.totals).toEqual({ openingMinor: 0, inMinor: 50_000, outMinor: 30_000, otherMinor: 100_000, closingMinor: 120_000 });
    expect(cash.rows.at(-1)).toMatchObject({ openingMinor: 100_000, closingMinor: 120_000 });

    expect((await owner.api.get(`/api/workspaces/${ws}/reports/income-expense?from=${today()}&to=${from}`)).status()).toBe(400);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/reports");
    await page.getByLabel("From").fill(from);
    await page.getByLabel("Periods").selectOption("month");
    const incomeTable = page.getByRole("table", { name: "Income vs expense by period" });
    await expect(incomeTable.locator("tfoot")).toContainText("40%");
    await page.getByRole("tab", { name: "Cash flow" }).click();
    await expect(page.getByRole("table", { name: "Cash flow by period" })).toContainText("1,200.00");
    await page.screenshot({ path: "test-results/reports-cash-flow.png", fullPage: true });
    await context.close();
  });

  test("cash flow says when there are no accounts to follow", async () => {
    const ws = await personalWorkspaceId(owner);
    const report = (await (await owner.api.get(`/api/workspaces/${ws}/reports/cash-flow?from=${today()}&to=${today()}`)).json()) as { hasCashAccounts: boolean };
    expect(report.hasCashAccounts).toBe(false);
  });
});
