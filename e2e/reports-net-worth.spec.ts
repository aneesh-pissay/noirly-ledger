import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

function lastMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

type Report = {
  hasAccounts: boolean;
  netWorth: { start: { netMinor: number }; end: { assetsMinor: number; liabilitiesMinor: number; netMinor: number }; rows: unknown[]; movers: Array<{ name: string; effectOnNetMinor: number }> };
  debt: { debts: Array<{ name: string; startMinor: number; endMinor: number; paidMinor: number; chargedMinor: number }>; totals: { endMinor: number } };
};

test.describe("net worth and debt progress reports", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Nia Networth");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("net worth by period, what moved it, and each debt paid and added", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const from = lastMonthStart();
    const add = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { currency: "USD", openingDate: from, ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { account: { id: string } }).account.id;
    };
    const bank = await add({ name: "Bank", kind: "bank", openingMajor: "1000.00" });
    const card = await add({ name: "Card", kind: "credit_card", openingMajor: "0" });
    const loan = await add({ name: "Car loan", kind: "loan", openingMajor: "5000.00" });
    const txn = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { date: today(), currency: "USD", ...data } });
      expect(res.status(), await res.text()).toBe(201);
    };
    await txn({ type: "income", amountMajor: "500.00", accountId: bank });
    await txn({ type: "expense", amountMajor: "200.00", accountId: card });
    await txn({ type: "transfer", amountMajor: "150.00", accountId: bank, toAccountId: card });
    await txn({ type: "transfer", amountMajor: "300.00", accountId: bank, toAccountId: loan });

    const report = (await (await owner.api.get(`/api/workspaces/${ws}/reports/net-worth?from=${from}&to=${today()}&granularity=month`)).json()) as Report;
    expect(report.hasAccounts).toBe(true);
    expect(report.netWorth.rows).toHaveLength(2);
    // Opened on the range's first day: nothing counts the day before.
    expect(report.netWorth.start.netMinor).toBe(0);
    expect(report.netWorth.end).toEqual({ assetsMinor: 105_000, liabilitiesMinor: 475_000, netMinor: -370_000 });
    expect(report.netWorth.movers[0]).toMatchObject({ name: "Car loan", effectOnNetMinor: -470_000 });

    const byName = (name: string) => report.debt.debts.find((d) => d.name === name)!;
    expect(byName("Card")).toMatchObject({ endMinor: 5_000, paidMinor: 15_000, chargedMinor: 20_000 });
    expect(byName("Car loan")).toMatchObject({ endMinor: 470_000, paidMinor: 30_000, chargedMinor: 0 });
    expect(report.debt.totals.endMinor).toBe(475_000);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/reports");
    await page.getByLabel("From").fill(from);
    await page.getByRole("tab", { name: "Net worth & debt" }).click();
    await expect(page.getByRole("table", { name: "Debt progress" }).locator('[data-debt="Card"]')).toContainText("200.00");
    await expect(page.getByRole("table", { name: "Accounts by effect on net worth" }).locator('[data-account="Bank"]')).toContainText("+");
    await page.screenshot({ path: "test-results/reports-net-worth.png", fullPage: true });
    await context.close();
  });

  test("says when there are no accounts", async () => {
    const ws = await personalWorkspaceId(owner);
    const report = (await (await owner.api.get(`/api/workspaces/${ws}/reports/net-worth?from=${today()}&to=${today()}`)).json()) as { hasAccounts: boolean };
    expect(report.hasAccounts).toBe(false);
  });
});
