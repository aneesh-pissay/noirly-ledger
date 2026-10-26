import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Fund = { id: string; name: string; savedMinor: number; targetMinor: number; dueDate: string; startDate: string; status: string; monthlyMinor: number; monthsLeft: number; ruleId: string | null };
type Suggestion = { source: string; id: string; name: string; dueDate: string; repeat: string; monthlyMinor: number };

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("sinking funds", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Sid Sinking");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("save up for lump-sum bills, suggested from the ones coming", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const txn = async (data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { transaction: { id: string } }).transaction;
    };
    const yearly = { frequency: "yearly", interval: 1 };
    const domain = await txn({ amountMajor: "999.00", date: day(-300), merchant: "Domain", recurrence: yearly });
    // Renewing too soon to save up for; and monthly bills aren't lump sums.
    await txn({ amountMajor: "24000.00", date: day(-340), merchant: "Health cover", recurrence: yearly });
    await txn({ amountMajor: "649.00", date: day(-10), merchant: "Netflix", recurrence: { frequency: "monthly", interval: 1 } });
    expect((await owner.api.post(`/api/workspaces/${ws}/payments`, { data: { name: "School fees", amountMajor: "60000.00", currency: "INR", dueDate: day(120) } })).status()).toBe(201);
    expect((await owner.api.post(`/api/workspaces/${ws}/payments`, { data: { name: "Electricity", amountMajor: "1800.00", currency: "INR", dueDate: day(60), repeat: "monthly" } })).status()).toBe(201);

    const list = async () => (await (await owner.api.get(`/api/workspaces/${ws}/sinking-funds`)).json()) as { funds: Fund[]; suggestions: Suggestion[] };
    const first = await list();
    expect(first.suggestions.map((s) => [s.name, s.source, s.dueDate, s.repeat])).toEqual([
      ["Domain", "rule", day(65), "yearly"],
      ["School fees", "payment", day(120), "none"],
    ]);

    const create = (data: object) => owner.api.post(`/api/workspaces/${ws}/sinking-funds`, { data: { currency: "INR", ...data } });
    expect((await create({ name: "Domain", targetMajor: "999.00", dueDate: day(65), repeat: "yearly", ruleId: domain.id })).status()).toBe(201);
    expect((await create({ name: "Late", targetMajor: "10.00", dueDate: day(0) })).status()).toBe(400);
    const carRes = await create({ name: "Car insurance", targetMajor: "24000.00", dueDate: day(150), repeat: "yearly", savedMajor: "2000.00" });
    const car = ((await carRes.json()) as { fund: Fund }).fund;
    expect(car).toMatchObject({ savedMinor: 200_000, monthsLeft: 5, monthlyMinor: 440_000, status: "on_track", startDate: day(0) });
    expect((await list()).suggestions.map((s) => s.name)).toEqual(["School fees"]);

    // Set aside and take out, never below nothing.
    const move = (amountMajor: string, direction: string) => owner.api.post(`/api/sinking-funds/${car.id}/move`, { data: { amountMajor, direction } });
    expect(((await (await move("1000.00", "in")).json()) as { fund: Fund }).fund.savedMinor).toBe(300_000);
    expect((await move("5000.00", "out")).status()).toBe(400);

    // Paid: a yearly fund starts over a year on, keeping nothing it didn't need.
    const paid = ((await (await owner.api.post(`/api/sinking-funds/${car.id}/spent`, { data: {} })).json()) as { fund: Fund }).fund;
    expect(paid).toMatchObject({ savedMinor: 0, startDate: day(0), status: "on_track" });
    expect(paid.dueDate > day(360)).toBe(true);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/goals");
    const suggestion = page.locator('[data-suggestion="School fees"]');
    await expect(suggestion).toContainText(`60,000.00 INR due ${day(120)}`);
    await suggestion.getByRole("button", { name: "Start a fund" }).click();
    const fees = page.locator('[data-fund="School fees"]');
    await expect(fees).toContainText(`Set aside 15,000.00 INR a month · 4 months to ${day(120)}`);
    await fees.getByLabel("Amount for School fees").fill("15000");
    await fees.getByRole("button", { name: "Set aside" }).click();
    await expect(fees).toContainText("15,000.00 INR of 60,000.00 INR");
    await expect(page.locator('[data-fund="Domain"]')).toBeVisible();
    await page.screenshot({ path: "test-results/sinking-funds.png", fullPage: true });

    // A one-off fund closes once paid.
    page.once("dialog", (d) => void d.accept());
    await fees.getByRole("button", { name: "Paid it" }).click();
    await expect(fees).toHaveCount(0);
    await context.close();
  });
});
