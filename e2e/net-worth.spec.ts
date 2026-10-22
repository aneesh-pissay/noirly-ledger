import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Point = { date: string; assetsMinor: number; liabilitiesMinor: number; netMinor: number };
type NetWorth = { baseCurrency: string; assetsMinor: number; liabilitiesMinor: number; netMinor: number; history: Point[]; missingRates: string[]; accounts: Array<{ name: string; baseBalanceMinor: number | null }> };

/** YYYY-MM-DD for the given day of the month `back` months before this one (UTC, like the server). */
function monthDay(back: number, day: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10);
}

test.describe("net worth", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Nia Networth");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("assets minus liabilities in the base currency, month by month", async () => {
    const ws = await personalWorkspaceId(owner);
    const add = async (data: object) => {
      const response = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data });
      expect(response.status(), await response.text()).toBe(201);
      return ((await response.json()) as { account: { id: string } }).account;
    };
    const opened = monthDay(2, 1);
    const bank = await add({ name: "Checking", kind: "bank", currency: "USD", openingMajor: "1000.00", openingDate: opened });
    await add({ name: "Card", kind: "credit_card", currency: "USD", openingMajor: "200.00", openingDate: opened });
    await add({ name: "SBI", kind: "bank", currency: "INR", openingMajor: "10000.00", openingDate: opened });
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "100.00", currency: "USD", date: monthDay(1, 15), accountId: bank.id } })).status()).toBe(201);

    const get = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/net-worth?months=3`)).json()) as { netWorth: NetWorth }).netWorth;
    // Without an INR rate, the rupee account is left out and flagged.
    let worth = await get();
    expect(worth).toMatchObject({ baseCurrency: "USD", assetsMinor: 90_000, liabilitiesMinor: 20_000, netMinor: 70_000, missingRates: ["INR"] });
    expect(worth.accounts.find((a) => a.name === "SBI")!.baseBalanceMinor).toBeNull();
    // Before the accounts opened, at the end of the month they opened, last month, today.
    expect(worth.history.map((p) => p.netMinor)).toEqual([0, 80_000, 70_000, 70_000]);
    expect(worth.history.at(-1)!.date).toBe(today());

    // A rate from this month on counts the rupees today but not in earlier months.
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: monthDay(0, 1) } })).ok()).toBe(true);
    worth = await get();
    expect(worth).toMatchObject({ assetsMinor: 102_000, netMinor: 82_000, missingRates: [] });
    expect(worth.history.map((p) => p.netMinor)).toEqual([0, 80_000, 70_000, 82_000]);
  });

  test("net worth on the accounts page", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    for (const data of [
      { name: "Checking", kind: "bank", currency: "USD", openingMajor: "2500.00", openingDate: monthDay(3, 1) },
      { name: "Car loan", kind: "loan", currency: "USD", openingMajor: "900.00", openingDate: monthDay(1, 1) },
    ]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/accounts`, { data })).status()).toBe(201);
    }
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    const panel = page.getByRole("region", { name: "Net worth" });
    await expect(panel).toContainText("2,500.00 USD");
    await expect(panel).toContainText("900.00 USD");
    await expect(panel).toContainText("1,600.00 USD");
    await expect(panel.getByText("Net worth over time")).toBeVisible();
    await page.screenshot({ path: "test-results/net-worth.png", fullPage: true });
    await panel.getByRole("button", { name: "View as table" }).click();
    await expect(panel.getByRole("cell", { name: today() })).toBeVisible();
    await context.close();
  });
});
