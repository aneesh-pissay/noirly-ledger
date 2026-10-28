import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Row = { number: number; date: string; principalMinor: number; interestMinor: number; amountMinor: number; status: string };
type Loan = { id: string; summary: { emiMinor: number; paidCount: number; overdueCount: number; principalLeftMinor: number; nextDate: string | null }; rows: Row[] };

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("loan repayment schedules", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Lona Loan");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("a home loan's EMIs: recorded as paid, on the calendar and in the projection", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const account = async (data: object) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { currency: "INR", openingDate: day(-200), ...data } })).json()) as { account: { id: string } }).account;
    const bank = await account({ name: "Salary account", kind: "bank", openingMajor: "500000.00" });
    const loanAccount = await account({ name: "Home loan account", kind: "loan", openingMajor: "2000000.00" });
    const { categories } = (await (await owner.api.get(`/api/workspaces/${ws}/categories`)).json()) as { categories: Array<{ id: string; name: string }> };
    const housing = categories.find((c) => c.name === "Housing")!;

    const create = (data: object) =>
      owner.api.post(`/api/workspaces/${ws}/loans`, {
        data: { name: "Home loan", loanAccountId: loanAccount.id, payFromAccountId: bank.id, categoryId: housing.id, principalMajor: "2000000.00", annualRatePct: 8.5, months: 240, firstDate: day(-40), ...data },
      });
    expect((await create({ loanAccountId: bank.id })).status()).toBe(400);
    const created = await create({});
    expect(created.status(), await created.text()).toBe(201);
    const { loan } = (await created.json()) as { loan: Loan };
    expect((await create({})).status()).toBe(409);
    // ₹20 lakh over 20 years at 8.5%: ₹17,356.47 a month; the first two EMIs' dates have passed unrecorded.
    expect(loan.summary).toMatchObject({ emiMinor: 1_735_647, paidCount: 0, overdueCount: 2, nextDate: day(-40) });
    const [first, second, third] = loan.rows;
    expect([first!.status, second!.status, third!.status]).toEqual(["overdue", "overdue", "upcoming"]);

    // Recording an EMI: principal to the loan account, interest as housing spending.
    const recordRes = await owner.api.post(`/api/loans/${loan.id}/emis`, { data: {} });
    expect(recordRes.status(), await recordRes.text()).toBe(200);
    const recorded = ((await recordRes.json()) as { loan: Loan }).loan;
    expect(recorded.summary).toMatchObject({ paidCount: 1, principalLeftMinor: 200_000_000 - first!.principalMinor });
    const txns = ((await (await owner.api.get(`/api/workspaces/${ws}/transactions?accountId=${bank.id}`)).json()) as { items: Array<{ type: string; amountMinor: number; categoryId: string | null; date: string; note: string }> }).items;
    expect(txns.map((t) => [t.type, t.amountMinor, t.date, t.note]).sort()).toEqual([
      ["expense", first!.interestMinor, day(-40), "Home loan · EMI 1/240 interest"],
      ["transfer", first!.principalMinor, day(-40), "Home loan · EMI 1/240 principal"],
    ]);
    const { accounts } = (await (await owner.api.get(`/api/workspaces/${ws}/accounts`)).json()) as { accounts: Array<{ id: string; balanceMinor: number }> };
    expect(accounts.find((a) => a.id === loanAccount.id)!.balanceMinor).toBe(200_000_000 - first!.principalMinor);
    expect(accounts.find((a) => a.id === bank.id)!.balanceMinor).toBe(50_000_000 - first!.amountMinor);

    // Not recorded yet: on the bill calendar as overdue, and in the projection.
    const bills = ((await (await owner.api.get(`/api/workspaces/${ws}/bills?month=${second!.date.slice(0, 7)}`)).json()) as { items: Array<{ merchant: string | null; source: string; status: string; amountMinor: number }> }).items;
    expect(bills.filter((b) => b.merchant === "Home loan · EMI 2/240").map((b) => [b.source, b.status, b.amountMinor])).toEqual([["emi", "overdue", second!.amountMinor]]);
    const { projection } = (await (await owner.api.get(`/api/workspaces/${ws}/projection?days=30`)).json()) as { projection: { upcoming: Array<{ label: string }> } };
    expect(projection.upcoming.map((u) => u.label)).toEqual(expect.arrayContaining(["Home loan · EMI 2/240 principal", "Home loan · EMI 2/240 interest"]));

    // Undo takes the EMI and its transactions back.
    expect(((await (await owner.api.delete(`/api/loans/${loan.id}/emis`)).json()) as { loan: Loan }).loan.summary.paidCount).toBe(0);
    expect(((await (await owner.api.get(`/api/workspaces/${ws}/transactions?accountId=${bank.id}`)).json()) as { items: unknown[] }).items).toHaveLength(0);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    const card = page.locator('[data-loan="Home loan"]');
    await expect(card.getByRole("note")).toContainText(`2 EMIs not recorded since ${day(-40)}`);
    await card.getByRole("button", { name: `Record EMI 1 (${day(-40)})` }).click();
    await card.getByRole("button", { name: `Record EMI 2 (${second!.date})` }).click();
    await expect(card).toContainText("2 of 240 · 238 left");
    await expect(card.getByRole("button", { name: `Record EMI 3 (${third!.date})` })).toBeDisabled();
    await card.getByRole("button", { name: "Show schedule" }).click();
    await expect(card.locator('[data-emi="2"]')).toContainText("Paid");
    // Recorded, it's a paid bill on the calendar.
    const paidBills = ((await (await owner.api.get(`/api/workspaces/${ws}/bills?month=${second!.date.slice(0, 7)}`)).json()) as { items: Array<{ merchant: string | null; status: string }> }).items;
    expect(paidBills.filter((b) => b.merchant === "Home loan · EMI 2/240").map((b) => b.status)).toEqual(["paid"]);
    await page.screenshot({ path: "test-results/loans.png", fullPage: true });
    expect((await owner.api.post(`/api/loans/${loan.id}/emis`, { data: {} })).status()).toBe(400);
    await context.close();
  });
});
