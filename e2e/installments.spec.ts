import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

type Plan = { id: string; name: string; monthlyMinor: number; paidCount: number; leftToPayMinor: number; principalLeftMinor: number; closed: boolean; nextDate: string | null; costMinor: number };
type Txn = { id: string; note: string | null; amountMinor: number; date: string; installmentPlanId: string | null; installmentNumber: number | null };

/** The same day `months` months from today (UTC), kept to the month's end. */
function monthsFromToday(months: number) {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(now.getUTCDate(), last));
  return target.toISOString().slice(0, 10);
}

test.describe("EMI purchases", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Emi Owner");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("each installment is a dated expense; pay off early or remove the plan", async () => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const { account } = (await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "HDFC card", kind: "credit_card", currency: "INR", openingMajor: "0", openingDate: monthsFromToday(-6) } })).json()) as { account: { id: string } };
    const create = (data: object) => owner.api.post(`/api/workspaces/${ws}/installments`, { data: { currency: "INR", accountId: account.id, ...data } });
    const txns = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: Txn[] }).items;

    expect((await create({ name: "Bad", principalMajor: "100.00", months: 1, firstDate: today() })).status()).toBe(400);

    // A no-cost EMI from next month, with a processing fee on the first payment's date.
    const phone = await create({ name: "Phone", principalMajor: "60000.00", months: 6, processingFeeMajor: "199.00", firstDate: monthsFromToday(1) });
    expect(phone.status(), await phone.text()).toBe(201);
    const { plan: phonePlan } = (await phone.json()) as { plan: Plan };
    expect(phonePlan).toMatchObject({ monthlyMinor: 1_000_000, paidCount: 0, leftToPayMinor: 6_019_900, costMinor: 19_900, nextDate: monthsFromToday(1) });
    const phoneTxns = (await txns()).filter((t) => t.installmentPlanId === phonePlan.id);
    expect(phoneTxns.map((t) => t.installmentNumber).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(phoneTxns.find((t) => t.installmentNumber === 3)).toMatchObject({ note: "Phone · EMI 3/6", amountMinor: 1_000_000, date: monthsFromToday(3) });

    // 12% over 12 months, started two months ago: three paid (this month's is today).
    const laptop = await create({ name: "Laptop", principalMajor: "100000.00", months: 12, annualRatePct: 12, taxOnInterestPct: 18, firstDate: monthsFromToday(-2) });
    const { plan: laptopPlan } = (await laptop.json()) as { plan: Plan };
    expect(laptopPlan.paidCount).toBe(3);
    expect(laptopPlan.principalLeftMinor).toBeGreaterThan(7_500_000);
    expect(laptopPlan.principalLeftMinor).toBeLessThan(7_700_000);

    const closed = await owner.api.post(`/api/installments/${laptopPlan.id}/close`, { data: {} });
    expect(closed.ok(), await closed.text()).toBe(true);
    expect(((await closed.json()) as { plan: Plan }).plan).toMatchObject({ closed: true, leftToPayMinor: 0, nextDate: null, principalLeftMinor: 0 });
    const laptopTxns = (await txns()).filter((t) => t.installmentPlanId === laptopPlan.id);
    expect(laptopTxns).toHaveLength(4);
    expect(laptopTxns.find((t) => t.installmentNumber === -1)).toMatchObject({ note: "Laptop · paid off early", amountMinor: laptopPlan.principalLeftMinor, date: today() });
    expect((await owner.api.post(`/api/installments/${laptopPlan.id}/close`, { data: {} })).status()).toBe(409);

    expect((await owner.api.delete(`/api/installments/${phonePlan.id}`)).ok()).toBe(true);
    expect((await txns()).filter((t) => t.installmentPlanId === phonePlan.id)).toHaveLength(0);
    const { plans } = (await (await owner.api.get(`/api/workspaces/${ws}/installments`)).json()) as { plans: Plan[] };
    expect(plans.map((p) => p.name)).toEqual(["Laptop"]);
  });

  test("start an EMI from the Recurring page with a preview", async ({ browser }) => {
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    await page.getByRole("button", { name: "New EMI" }).click();
    const form = page.getByRole("form", { name: "New EMI" });
    await form.getByLabel("What it's for").fill("Fridge");
    await form.getByLabel(/^Price/).fill("36000");
    await form.getByLabel("Months").fill("6");
    await form.getByLabel(/^Interest a year/).fill("14");
    await form.getByLabel("Tax on interest (%)").fill("18");
    const preview = form.getByRole("status", { name: "EMI preview" });
    await expect(preview).toContainText("a month for 6 months");
    await expect(preview).toContainText("costs");
    await page.screenshot({ path: "test-results/emi.png", fullPage: true });
    await form.getByRole("button", { name: "Add EMI" }).click();
    await expect(page.locator('[data-emi="Fridge"]')).toContainText("0 of 6 paid");
    await page.goto("/transactions?q=Fridge");
    await expect(page.locator("div.absolute")).toHaveCount(6);
    await context.close();
  });
});
