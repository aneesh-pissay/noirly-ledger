import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

type Bill = { date: string; merchant: string | null; note: string | null; amountMinor: number; source: string; status: string; frequency: string | null };
type Calendar = { items: Bill[]; totals: Array<{ currency: string; paidMinor: number; toPayMinor: number }> };

/** This month moved by `delta` months, as YYYY-MM. */
function month(delta: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + delta, 1)).toISOString().slice(0, 7);
}

test.describe("bill calendar", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Bill Calendar");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("recurring bills, EMIs and scheduled ones, paid or to come", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const add = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", ...data } });
      expect(res.status(), await res.text()).toBe(201);
    };
    const [last, now, next] = [month(-1), month(0), month(1)];
    await add({ amountMajor: "649.00", date: `${last}-01`, merchant: "Netflix", recurrence: { frequency: "monthly", interval: 1 } });
    await add({ amountMajor: "999.00", date: `${next}-15`, note: "Domain", recurrence: { frequency: "yearly", interval: 1 } });
    await add({ type: "income", amountMajor: "90000.00", date: `${last}-01`, note: "Salary", recurrence: { frequency: "monthly", interval: 1 } });
    await add({ amountMajor: "5000.00", date: `${next}-20`, note: "Insurance" });
    await add({ amountMajor: "300.00", date: `${last}-03`, note: "Lunch" });
    const emi = await owner.api.post(`/api/workspaces/${ws}/installments`, { data: { currency: "INR", name: "Phone", principalMajor: "60000.00", months: 6, firstDate: `${next}-10` } });
    expect(emi.status(), await emi.text()).toBe(201);
    const calendar = async (m: string) => (await (await owner.api.get(`/api/workspaces/${ws}/bills?month=${m}`)).json()) as Calendar;

    // This month's subscription is due until the recurring run records it.
    expect((await calendar(now)).items.map((b) => [b.date, b.merchant, b.status])).toEqual([[`${now}-01`, "Netflix", "due"]]);
    expect((await owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } })).ok()).toBe(true);
    expect((await calendar(now)).items.map((b) => [b.merchant, b.status, b.frequency])).toEqual([["Netflix", "paid", "monthly"]]);
    expect((await calendar(last)).items.map((b) => [b.date, b.status])).toEqual([[`${last}-01`, "paid"]]);

    // Next month: the subscription, the EMI, the yearly renewal and the insurance; never income or one-off spending.
    const ahead = await calendar(next);
    expect(ahead.items.map((b) => [b.date, b.merchant ?? b.note, b.source, b.status])).toEqual([
      [`${next}-01`, "Netflix", "recurring", "upcoming"],
      [`${next}-10`, "Phone · EMI 1/6", "emi", "upcoming"],
      [`${next}-15`, "Domain", "recurring", "upcoming"],
      [`${next}-20`, "Insurance", "scheduled", "upcoming"],
    ]);
    expect(ahead.totals).toEqual([{ currency: "INR", paidMinor: 0, toPayMinor: 64_900 + 1_000_000 + 99_900 + 500_000 }]);
    expect((await owner.api.get(`/api/workspaces/${ws}/bills?month=2026-13`)).status()).toBe(400);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    const card = page.locator("div", { has: page.getByText("Bills and subscriptions", { exact: true }) }).last();
    const now0 = new Date(`${now}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    await expect(page.getByRole("list", { name: `Bills in ${now0}` }).locator('[data-bill-status="paid"]')).toContainText("Netflix");
    await page.getByRole("button", { name: "Next month" }).click();
    const next0 = new Date(`${next}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const list = page.getByRole("list", { name: `Bills in ${next0}` });
    await expect(list.locator("[data-bill-date]")).toHaveCount(4);
    await expect(list.locator(`[data-bill-date="${next}-10"]`)).toContainText("EMI");
    await expect(page.locator("[data-bill-totals]")).toContainText("Still to pay");
    await expect(card).toBeVisible();
    await page.screenshot({ path: "test-results/bill-calendar.png", fullPage: true });
    await context.close();
  });
});
