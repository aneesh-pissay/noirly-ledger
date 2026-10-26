import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

type Payment = { id: string; name: string; dueDate: string; status: string; paidOn: string | null; paidAmountMinor: number | null; transactionId: string | null; repeat: string };
type Txn = { id: string; amountMinor: number; merchant: string | null; accountId: string | null; date: string };

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("scheduled payments", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Pat Payments");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("due, overdue and paid: record, link, mark, undo", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const { account } = (await (await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "HDFC", kind: "bank", currency: "INR", openingMajor: "50000.00", openingDate: day(-60) } })).json()) as { account: { id: string } };
    const create = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/payments`, { data: { currency: "INR", ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { payment: Payment }).payment;
    };
    const electricity = await create({ name: "Electricity", amountMajor: "1840.00", dueDate: day(-3), repeat: "monthly", accountId: account.id });
    await create({ name: "Rent", amountMajor: "25000.00", dueDate: day(5) });
    const card = await create({ name: "Card bill", amountMajor: "12000.00", dueDate: day(2) });
    const other = await create({ name: "Other card", amountMajor: "12000.00", dueDate: day(2) });
    expect(electricity).toMatchObject({ status: "overdue", repeat: "monthly" });
    expect((await owner.api.post(`/api/workspaces/${ws}/payments`, { data: { name: "Bad", amountMajor: "x", currency: "INR", dueDate: day(1) } })).status()).toBe(400);
    const list = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/payments`)).json()) as { payments: Payment[] }).payments;
    expect((await list()).map((p) => [p.name, p.status])).toEqual([["Electricity", "overdue"], ["Card bill", "due"], ["Other card", "due"], ["Rent", "due"]]);

    // The daily run reminds before a due date and once when one is overdue.
    expect((await owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } })).ok()).toBe(true);
    const notes = ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ kind: string; title: string }> }).notifications;
    expect(notes.filter((n) => n.kind === "bill.reminder").map((n) => n.title).sort()).toEqual(["Card bill is due in 2 days", "Electricity is overdue", "Other card is due in 2 days"]);

    // Recording the payment adds the expense from the account, and the next month's bill.
    const txns = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: Txn[] }).items;
    const paid = await owner.api.post(`/api/payments/${electricity.id}/pay`, { data: { how: "record", paidOn: day(0), amountMajor: "1900.00" } });
    expect(paid.status(), await paid.text()).toBe(200);
    const { payment, next } = (await paid.json()) as { payment: Payment; next: Payment };
    expect(payment).toMatchObject({ status: "paid", paidOn: day(0), paidAmountMinor: 190_000 });
    expect(next).toMatchObject({ name: "Electricity", repeat: "monthly" });
    expect(next.dueDate > electricity.dueDate).toBe(true);
    expect((await txns()).find((t) => t.id === payment.transactionId)).toMatchObject({ amountMinor: 190_000, merchant: "Electricity", accountId: account.id, date: day(0) });
    expect((await owner.api.post(`/api/payments/${electricity.id}/pay`, { data: { how: "mark", paidOn: day(0) } })).status()).toBe(409);

    // Undo takes back the expense and the next bill.
    expect((await owner.api.post(`/api/payments/${electricity.id}/undo`)).ok()).toBe(true);
    expect((await txns()).some((t) => t.id === payment.transactionId)).toBe(false);
    expect((await list()).filter((p) => p.name === "Electricity").map((p) => p.status)).toEqual(["overdue"]);

    // An expense already there can pay it, but only one bill.
    const added = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", amountMajor: "12000.00", date: day(1), note: "Card bill payment" } });
    const expense = ((await added.json()) as { transaction: Txn }).transaction;
    const { matches } = (await (await owner.api.get(`/api/payments/${card.id}/matches`)).json()) as { matches: Txn[] };
    expect(matches.map((t) => t.id)).toEqual([expense.id]);
    expect((await owner.api.post(`/api/payments/${card.id}/pay`, { data: { how: "link", transactionId: expense.id } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/payments/${other.id}/pay`, { data: { how: "link", transactionId: expense.id } })).status()).toBe(409);
    // On the calendar it shows once, as the paid bill.
    const bills = ((await (await owner.api.get(`/api/workspaces/${ws}/bills?month=${day(2).slice(0, 7)}`)).json()) as { items: Array<{ merchant: string | null; note: string | null; source: string; status: string }> }).items;
    expect(bills.filter((b) => b.merchant === "Card bill" || b.note === "Card bill payment").map((b) => [b.source, b.status])).toEqual([["payment", "paid"]]);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    const rent = page.locator('[data-payment="Rent"]');
    await expect(rent).toContainText(`Due ${day(5)} · in 5 days`);
    await expect(page.locator('[data-payment="Electricity"]')).toContainText("Overdue by 3 days");
    await rent.getByRole("button", { name: "Mark paid" }).click();
    const dialog = page.getByRole("dialog", { name: "Pay Rent" });
    await expect(dialog).toContainText("No expense of 25,000.00 INR");
    await page.screenshot({ path: "test-results/payments-dialog.png" });
    await dialog.getByRole("button", { name: "Just mark paid" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-payment="Rent"][data-payment-status="paid"]')).toContainText(`Paid on ${day(0)}`);
    await page.screenshot({ path: "test-results/payments-panel.png", fullPage: true });
    await context.close();
  });

  test("pay a rupee bill through a UPI app link, then record its reference", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${ws}/payments`, { data: { name: "Bad", amountMajor: "10", currency: "INR", dueDate: day(1), upiId: "not an id" } })).status()).toBe(400);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    await page.getByRole("button", { name: "New bill" }).click();
    const form = page.getByRole("form", { name: "New bill" });
    await form.getByLabel("Bill").fill("Electricity");
    await form.getByLabel("Amount").fill("1840.50");
    await form.getByLabel("Due on").fill(day(3));
    // UPI pays in rupees: the payee fields come with an INR bill.
    await expect(form.getByLabel("Payee UPI ID (optional)")).toHaveCount(0);
    await form.getByLabel("Currency").selectOption("INR");
    await form.getByLabel("Payee UPI ID (optional)").fill("BESCOM@okaxis");
    await form.getByLabel("Payee name (optional)").fill("BESCOM");
    await form.getByRole("button", { name: "Add bill" }).click();
    const row = page.locator('[data-payment="Electricity"]');
    await expect(row.getByRole("link", { name: "Pay Electricity with Any UPI app" })).toHaveAttribute(
      "href",
      "upi://pay?pa=bescom@okaxis&pn=BESCOM&am=1840.50&cu=INR&tn=Electricity",
    );
    await expect(row.getByRole("link", { name: "Pay Electricity with Google Pay" })).toHaveAttribute("href", /^tez:\/\/upi\/pay\?pa=bescom@okaxis&/);
    await page.screenshot({ path: "test-results/payments-upi.png" });

    // Back from the app: record it with the reference it showed.
    await row.getByRole("button", { name: "Mark paid" }).click();
    const dialog = page.getByRole("dialog", { name: "Pay Electricity" });
    await dialog.getByLabel("UPI reference (optional)").fill("4285 1234 5678");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-payment="Electricity"][data-payment-status="paid"]')).toBeVisible();
    const txns = ((await (await owner.api.get(`/api/workspaces/${ws}/transactions`)).json()) as { items: Array<{ merchant: string | null; upiRef: string | null; upiId: string | null }> }).items;
    expect(txns.find((t) => t.merchant === "Electricity")).toMatchObject({ upiRef: "428512345678", upiId: "bescom@okaxis" });
    await context.close();
  });
});
