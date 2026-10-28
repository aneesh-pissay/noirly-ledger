import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Debt = { id: string; name: string; kind: string; balanceMinor: number; annualRatePct: number; minimumMinor: number; fromSchedule: boolean; needsTerms: boolean };

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("paying off debt", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Dev Debt");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("snowball against avalanche, with extra a month, and a loan prepayment what-if", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const account = async (data: object) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { currency: "USD", openingDate: day(-30), ...data } })).json()) as { account: { id: string } }).account;
    const bank = await account({ name: "Checking", kind: "bank", openingMajor: "10000.00" });
    await account({ name: "Card", kind: "credit_card", openingMajor: "1000.00" });
    const car = await account({ name: "Car loan", kind: "loan", openingMajor: "10000.00" });
    const friend = await account({ name: "Friend", kind: "loan", openingMajor: "500.00" });
    const loan = await owner.api.post(`/api/workspaces/${ws}/loans`, {
      data: { name: "Car loan", loanAccountId: car.id, payFromAccountId: bank.id, principalMajor: "10000.00", annualRatePct: 9, months: 48, firstDate: day(20) },
    });
    expect(loan.status(), await loan.text()).toBe(201);

    const debts = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/debts`)).json()) as { debts: Debt[]; strategy: string; extraMonthlyMinor: number });
    const first = await debts();
    expect(first.debts.map((d) => [d.name, d.balanceMinor, d.annualRatePct, d.minimumMinor, d.fromSchedule, d.needsTerms])).toEqual([
      ["Car loan", 1_000_000, 9, 24_885, true, false],
      ["Card", 100_000, 42, 5_000, false, false],
      ["Friend", 50_000, 0, 0, false, true],
    ]);
    expect(first).toMatchObject({ strategy: "avalanche", extraMonthlyMinor: 0 });

    // Terms typed in for a loan without a schedule; and the extra a month.
    const put = (data: object) => owner.api.put(`/api/workspaces/${ws}/debts`, { data });
    expect((await put({ debt: { accountId: friend.id, annualRatePct: 0, minimumMajor: "50.00" } })).ok()).toBe(true);
    expect((await put({ extraMonthlyMajor: "200.00" })).ok()).toBe(true);
    expect((await put({ debt: { accountId: bank.id, annualRatePct: 5 } })).status()).toBe(400);
    const second = await debts();
    expect(second.debts.find((d) => d.name === "Friend")).toMatchObject({ minimumMinor: 5_000, needsTerms: false });
    expect(second.extraMonthlyMinor).toBe(20_000);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    const order = page.getByRole("list", { name: "Payoff order" });
    // Avalanche: the 42% card goes first.
    await expect(order.locator("li").first()).toContainText("Card");
    await expect(page.locator('[data-strategy="avalanche"]')).toHaveAttribute("aria-checked", "true");
    await expect(page.locator('[data-strategy="avalanche"]')).toContainText("saves");
    // Snowball: the smallest, the friend, goes first.
    await page.locator('[data-strategy="snowball"]').click();
    await expect(page.locator('[data-strategy="snowball"]')).toHaveAttribute("aria-checked", "true");
    await expect(order.locator("li").first()).toContainText("Friend");
    await page.screenshot({ path: "test-results/debt-plan.png", fullPage: true });
    expect((await debts()).strategy).toBe("snowball");

    // A loan's prepayment what-if, on the Recurring page.
    await page.goto("/recurring");
    const card = page.locator('[data-loan="Car loan"]');
    await card.getByRole("button", { name: "What if I prepay?" }).click();
    await expect(card.locator("[data-prepay-result]")).toContainText("As it stands: 4 years to go");
    await card.getByLabel("Lump sum with the next EMI").fill("2000");
    await expect(card.locator("[data-prepay-result]")).toContainText("sooner. Saves");
    await card.getByLabel("After a lump sum").selectOption("emi");
    await expect(card.locator("[data-prepay-result]")).toContainText("with the EMI down to");
    await page.screenshot({ path: "test-results/prepay.png", fullPage: true });
    await context.close();
  });
});
