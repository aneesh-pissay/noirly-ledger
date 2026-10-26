import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

type Note = { kind: string; title: string; body: string };

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("bill reminders", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Remy Reminder");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("due, renewal, trial and cancel reminders, each sent once", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const add = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { transaction: { id: string } }).transaction;
    };
    const monthly = { frequency: "monthly", interval: 1 };
    await add({ amountMajor: "649.00", date: day(2), merchant: "Netflix", recurrence: monthly });
    await add({ amountMajor: "999.00", date: day(6), note: "Domain", recurrence: { frequency: "yearly", interval: 1 } });
    const spotify = await add({ amountMajor: "119.00", date: day(20), merchant: "Spotify", recurrence: monthly });
    const gym = await add({ amountMajor: "2000.00", date: day(2), merchant: "Gym", recurrence: monthly });
    const once = await add({ amountMajor: "300.00", date: day(1), note: "Lunch tomorrow" });
    expect((await owner.api.post(`/api/workspaces/${ws}/installments`, { data: { currency: "INR", name: "Phone", principalMajor: "60000.00", months: 6, firstDate: day(1) } })).status()).toBe(201);

    const put = (id: string, data: object | null) => owner.api.put(`/api/transactions/${id}/reminders`, { data: data as object });
    expect((await put(spotify.id, { daysBefore: null, trialEndsOn: day(1), cancelBy: day(0) })).ok()).toBe(true);
    expect((await put(gym.id, { daysBefore: 1, trialEndsOn: null, cancelBy: null })).ok()).toBe(true);
    expect((await put(once.id, { daysBefore: 1, trialEndsOn: null, cancelBy: null })).status()).toBe(400);
    expect((await put(gym.id, { daysBefore: 31, trialEndsOn: null, cancelBy: null })).status()).toBe(400);

    const run = async () => {
      const res = await owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
      expect(res.ok(), await res.text()).toBe(true);
    };
    const reminders = async () =>
      ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Note[] }).notifications.filter((n) => n.kind === "bill.reminder").map((n) => n.title).sort();
    await run();
    expect(await reminders()).toEqual([
      "Cancel Spotify today",
      "Domain renews in 6 days",
      "Lunch tomorrow is due tomorrow",
      "Netflix is due in 2 days",
      "Phone · EMI 1/6 is due tomorrow",
      "Spotify's free trial ends tomorrow",
    ]);
    await run();
    expect(await reminders()).toHaveLength(6);

    // Set up in the app: three days' notice and a trial on Netflix.
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    if (day(2).slice(0, 7) !== day(0).slice(0, 7)) await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: `Reminders for Netflix on ${day(2)}` }).click();
    const dialog = page.getByRole("dialog", { name: "Reminders for Netflix" });
    await dialog.getByLabel("Remind me").selectOption("3");
    await dialog.getByLabel("Free trial ends on").fill(day(2));
    await page.screenshot({ path: "test-results/reminders-dialog.png" });
    await dialog.getByRole("button", { name: "Save reminders" }).click();
    await expect(dialog).toBeHidden();
    const row = page.locator(`[data-bill-date="${day(2)}"]`, { hasText: "Netflix" });
    await expect(row).toContainText(`Reminds 3 days before · trial ends ${day(2)}`);
    await expect(page.getByRole("list", { name: "Dates to act on" })).toContainText("Trial ends: Netflix");
    await page.screenshot({ path: "test-results/reminders-calendar.png", fullPage: true });
    await context.close();
  });
});
