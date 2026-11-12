import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Flow = {
  startMinor: number;
  points: Array<{ date: string; balanceMinor: number }>;
  lowestMinor: number;
  lowestDate: string;
  firstShortDate: string | null;
  nextIncomeDate: string | null;
  billsBeforeIncomeMinor: number;
};

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("cash flow", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Cass Flow");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("bills and income day by day, with the shortfall before payday", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    // Rupees at 0.012 to the workspace's dollars: ₹1,000 is $12.
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const account = async (data: object) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { currency: "INR", openingDate: day(-60), ...data } })).json()) as { account: { id: string } }).account;
    const bank = await account({ name: "Bank", kind: "bank", openingMajor: "20000.00" });
    const card = await account({ name: "Card", kind: "credit_card", openingMajor: "0" });
    const txn = async (data: object) => expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { currency: "INR", ...data } })).status()).toBe(201);
    const bill = async (data: object) => expect((await owner.api.post(`/api/workspaces/${ws}/payments`, { data: { currency: "INR", ...data } })).status()).toBe(201);

    await bill({ name: "Electricity", amountMajor: "1000.00", dueDate: day(-2) });
    await bill({ name: "Rent", amountMajor: "25000.00", dueDate: day(1), accountId: bank.id });
    // Spending on the card stays off cash until the card is paid.
    await txn({ type: "expense", amountMajor: "3000.00", date: day(2), accountId: card.id, note: "Groceries" });
    await txn({ type: "transfer", amountMajor: "2000.00", date: day(3), accountId: bank.id, toAccountId: card.id, note: "Card payment" });
    await txn({ type: "income", amountMajor: "50000.00", date: day(5), accountId: bank.id, note: "Salary", recurrence: { frequency: "monthly", interval: 1 } });

    const { projection } = (await (await owner.api.get(`/api/workspaces/${ws}/projection?days=30`)).json()) as { projection: { cashFlow: Flow; upcoming: Array<{ label: string; bill?: boolean }> } };
    const flow = projection.cashFlow;
    expect(flow).toMatchObject({
      startMinor: 24_000,
      lowestMinor: -9_600,
      lowestDate: day(3),
      firstShortDate: day(1),
      nextIncomeDate: day(5),
      billsBeforeIncomeMinor: 1_200 + 30_000 + 2_400,
    });
    expect(flow.points.slice(0, 6).map((p) => p.balanceMinor)).toEqual([22_800, -7_200, -7_200, -9_600, -9_600, 50_400]);
    expect(flow.points).toHaveLength(31);
    expect(projection.upcoming.filter((u) => u.bill).map((u) => u.label)).toEqual(["Electricity", "Rent"]);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    const note = page.getByRole("note").filter({ hasText: "Money on hand goes below zero" });
    await expect(note).toContainText(`Money on hand goes below zero on ${day(1)}, down to -96.00 USD on ${day(3)}.`);
    await expect(page.locator("[data-cash-flow]")).toContainText(`Bills before income on ${day(5)}`);
    const chart = page.getByRole("img", { name: /^Money on hand from/ });
    // The line is drawn (a path the browser can't read draws nothing).
    expect(await chart.locator("path").first().evaluate((p) => (p as SVGPathElement).getTotalLength())).toBeGreaterThan(100);
    await chart.hover({ position: { x: 5, y: 40 } });
    await expect(page.getByRole("tooltip")).toContainText("Electricity: -12.00 USD");
    await page.screenshot({ path: "test-results/cash-flow.png", fullPage: true });

    await page.goto("/recurring");
    await expect(page.getByRole("region", { name: "Cash flow ahead" })).toContainText("On hand today");
    await context.close();
  });
});
