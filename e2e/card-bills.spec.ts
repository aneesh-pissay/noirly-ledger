import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

type Bill = { lastStatement: string; dueDate: string; statementMinor: number; leftMinor: number; minimumMinor: number; minimumLeftMinor: number; status: string; utilizationPct: number | null };
type Card = { name: string; balanceNowMinor: number; bill: Bill | null };

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("credit card bills", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Cara Card");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("statement, what's left to pay, the minimum, the limit, and a reminder", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const account = async (data: object) =>
      ((await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { currency: "USD", openingDate: day(-60), openingMajor: "0", ...data } })).json()) as { account: { id: string } }).account;
    const bank = await account({ name: "Checking", kind: "bank", openingMajor: "5000.00" });
    const visa = await account({ name: "Visa", kind: "credit_card" });
    await account({ name: "Amex", kind: "credit_card" });
    const txn = async (data: object) => expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { currency: "USD", ...data } })).status()).toBe(201);
    // On the statement: $1,000 spent before it. After it: $300 more spent, and $400 paid.
    await txn({ type: "expense", amountMajor: "1000.00", date: day(-20), accountId: visa.id, note: "Flights" });
    await txn({ type: "expense", amountMajor: "300.00", date: day(-5), accountId: visa.id, note: "Dinner" });
    await txn({ type: "transfer", amountMajor: "400.00", date: day(-2), accountId: bank.id, toAccountId: visa.id, note: "Card payment" });

    // The statement was ten days ago, due twelve days after it.
    const statementDay = Number(day(-10).slice(8));
    const terms = (id: string, data: object | null) => owner.api.put(`/api/accounts/${id}/card-terms`, { data: data as object });
    expect((await terms(bank.id, { statementDay: 5, dueDays: 20 })).status()).toBe(400);
    expect((await terms(visa.id, { statementDay, dueDays: 12, creditLimitMajor: "3000.00" })).ok()).toBe(true);

    const cards = ((await (await owner.api.get(`/api/workspaces/${ws}/cards`)).json()) as { cards: Card[] }).cards;
    expect(cards.find((c) => c.name === "Amex")).toMatchObject({ bill: null, balanceNowMinor: 0 });
    expect(cards.find((c) => c.name === "Visa")!.bill).toEqual({
      lastStatement: day(-10),
      nextStatement: expect.any(String),
      dueDate: day(2),
      statementMinor: 100_000,
      leftMinor: 60_000,
      minimumMinor: 5_000,
      minimumLeftMinor: 0,
      status: "due",
      utilizationPct: 30,
    });

    // On the bill calendar on its due date, and a reminder two days ahead.
    const bills = ((await (await owner.api.get(`/api/workspaces/${ws}/bills?month=${day(2).slice(0, 7)}`)).json()) as { items: Array<{ merchant: string | null; date: string; source: string; amountMinor: number; status: string }> }).items;
    expect(bills.filter((b) => b.source === "card").map((b) => [b.merchant, b.date, b.amountMinor, b.status])).toEqual([["Visa bill", day(2), 60_000, "upcoming"]]);
    expect((await owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } })).ok()).toBe(true);
    const notes = ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ kind: string; title: string; body: string }> }).notifications;
    expect(notes.filter((n) => n.kind === "bill.reminder").map((n) => [n.title, n.body])).toEqual([["Visa bill is due in 2 days", `600.00 USD is due in 2 days, on ${day(2)}.`]]);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    const visaCard = page.locator('[data-card="Visa"]');
    await expect(visaCard.locator("[data-card-status]")).toHaveText(`600.00 USD to pay by ${day(2)} (minimum paid).`);
    await expect(visaCard).toContainText("30% of the 3,000.00 USD limit in use");
    const amex = page.locator('[data-card="Amex"]');
    await amex.getByRole("button", { name: "Set statement dates" }).click();
    await amex.getByLabel("Statement day").fill("5");
    await amex.getByRole("button", { name: "Save" }).click();
    await expect(amex.locator("[data-card-status]")).toHaveText(/^Nothing on the \d{4}-\d{2}-05 statement\.$/);
    await page.screenshot({ path: "test-results/card-bills.png", fullPage: true });
    await context.close();
  });
});
