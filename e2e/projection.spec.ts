import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Projection = {
  through: string;
  availableToSpendMinor: number;
  accounts: Array<{ name: string; todayMinor: number; projectedMinor: number; lowestMinor: number; lowestDate: string | null }>;
  upcoming: Array<{ label: string; date: string; recurring: boolean }>;
};

function daysFromToday(days: number) {
  const date = new Date(`${today()}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Checking opens with 1,500; rent of 1,200 repeats monthly from 20 days ago
 * (so the next one lands in about 10 days); 300 goes to the card in 5 days,
 * salary of 2,500 arrives in 15, and a 50 expense with no account in 3.
 */
async function seed(owner: TestUser) {
  const ws = await personalWorkspaceId(owner);
  const add = async (data: object) => {
    const response = await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { currency: "USD", openingDate: daysFromToday(-60), ...data } });
    expect(response.status(), await response.text()).toBe(201);
    return ((await response.json()) as { account: { id: string } }).account;
  };
  const bank = await add({ name: "Checking", kind: "bank", openingMajor: "1500.00" });
  const card = await add({ name: "Visa", kind: "credit_card", openingMajor: "300.00" });
  const txn = async (data: object) => {
    const response = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { currency: "USD", ...data } });
    expect(response.status(), await response.text()).toBe(201);
  };
  await txn({ type: "expense", amountMajor: "1200.00", accountId: bank.id, date: daysFromToday(-20), note: "Rent", recurrence: { frequency: "monthly", interval: 1 } });
  await txn({ type: "transfer", amountMajor: "300.00", accountId: bank.id, toAccountId: card.id, date: daysFromToday(5), note: "Card payment" });
  await txn({ type: "income", amountMajor: "2500.00", accountId: bank.id, date: daysFromToday(15), note: "Salary" });
  await txn({ type: "expense", amountMajor: "50.00", date: daysFromToday(3), note: "Gift" });
  return ws;
}

test.describe("projections", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Pia Projection");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("balances ahead and what's available to spend", async () => {
    const ws = await seed(owner);
    const get = async (days: number) =>
      ((await (await owner.api.get(`/api/workspaces/${ws}/projection?days=${days}`)).json()) as { projection: Projection }).projection;

    const month = await get(30);
    expect(month.through).toBe(daysFromToday(30));
    const checking = month.accounts.find((a) => a.name === "Checking")!;
    // Today leaves out the future-dated card payment and salary.
    expect(checking).toMatchObject({ todayMinor: 30_000, projectedMinor: 130_000, lowestMinor: -120_000 });
    expect(checking.lowestDate! > daysFromToday(5) && checking.lowestDate! < daysFromToday(15)).toBe(true);
    expect(month.accounts.find((a) => a.name === "Visa")).toMatchObject({ todayMinor: 30_000, projectedMinor: 0 });
    // 1,300 in the bank, nothing owed on the card, less the 50 with no account.
    expect(month.availableToSpendMinor).toBe(125_000);
    expect(month.upcoming.map((u) => u.label)).toEqual(["Gift", "Card payment", "Rent", "Salary"]);
    expect(month.upcoming.find((u) => u.label === "Rent")!.recurring).toBe(true);

    // Sixty days takes a second rent.
    const two = await get(60);
    expect(two.upcoming.filter((u) => u.label === "Rent")).toHaveLength(2);
    expect(two.availableToSpendMinor).toBe(5_000);
  });

  test("looking ahead on the accounts page", async ({ browser }) => {
    await seed(owner);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    const panel = page.getByRole("region", { name: "Projections" });
    await expect(panel).toContainText("1250.00 USD");
    await expect(panel.locator('[data-projection="Checking"]')).toContainText("Drops to -1200.00 USD");
    await expect(panel.getByRole("list", { name: "Coming up" })).toContainText("Rent · Checking · repeats");
    await expect(panel.getByRole("list", { name: "Coming up" })).toContainText("Card payment · Checking → Visa");
    await page.screenshot({ path: "test-results/projection.png", fullPage: true });
    await panel.getByRole("tab", { name: "60 days" }).click();
    await expect(panel).toContainText("50.00 USD");
    await context.close();
  });
});

test("account balances are as of today; future-dated ones are scheduled", async ({ browser }) => {
  const owner = await newUser("Sam Scheduled");
  try {
    await seed(owner);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    const row = page.locator('[data-account="Checking"]');
    await expect(row).toContainText("300.00 USD");
    await expect(row).toContainText("2 scheduled");
    await context.close();
  } finally {
    await disposeAll(owner);
  }
});
