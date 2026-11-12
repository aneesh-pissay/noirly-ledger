import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

/** The first day of this month and the last day of the one before (UTC, like the server). */
function monthEdges() {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const before = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { first: first.toISOString().slice(0, 10), before: before.toISOString().slice(0, 10), month: now.getUTCMonth() + 1 };
}

test.describe("Indian numbering and the financial year", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ira Indian");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("the financial year sets the dashboard's year to date; only owners change it", async () => {
    const ws = await personalWorkspaceId(owner);
    // A year starting this month: the 1st is in it, the day before isn't.
    const { first, before, month } = monthEdges();
    expect((await owner.api.patch(`/api/workspaces/${ws}/settings`, { data: { fiscalYearStartMonth: 13 } })).status()).toBe(400);
    const saved = await owner.api.patch(`/api/workspaces/${ws}/settings`, { data: { fiscalYearStartMonth: month } });
    expect(((await saved.json()) as { workspace: { fiscalYearStartMonth: number } }).workspace.fiscalYearStartMonth).toBe(month);
    for (const [date, amountMajor] of [[first, "30.00"], [before, "7.00"]]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor, currency: "USD", date } })).status()).toBe(201);
    }
    const { summary } = (await (await owner.api.get(`/api/workspaces/${ws}/dashboard?range=fy`)).json()) as { summary: { expenseMinor: number; range: { from: string } } };
    expect(summary).toMatchObject({ expenseMinor: 3_000, range: { from: first } });

    const member = await newUser("Mia Member");
    try {
      const team = await newTeam(owner, [member]);
      expect((await member.api.patch(`/api/workspaces/${team.workspaceId}/settings`, { data: { fiscalYearStartMonth: 4 } })).status()).toBe(403);
      const { workspaces } = (await (await member.api.get("/api/workspaces")).json()) as { workspaces: Array<{ id: string; fiscalYearStartMonth: number }> };
      // A USD workspace starts in January until set.
      expect(workspaces.find((w) => w.id === team.workspaceId)!.fiscalYearStartMonth).toBe(1);
    } finally {
      await disposeAll(member);
    }
  });

  test("lakh and crore for rupees, switchable per person", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    for (const data of [
      { name: "SBI", kind: "bank", currency: "INR", openingMajor: "1234567.00" },
      { name: "Chase", kind: "bank", currency: "USD", openingMajor: "1234567.00" },
    ]) {
      expect((await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { openingDate: today(), ...data } })).status()).toBe(201);
    }
    expect((await owner.api.patch("/api/me", { data: { numberFormat: "roman" } })).status()).toBe(400);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/accounts");
    await expect(page.locator('[data-account="SBI"]')).toContainText("12,34,567.00 INR");
    await expect(page.locator('[data-account="Chase"]')).toContainText("1,234,567.00 USD");

    await page.goto("/settings/currency");
    const settings = page.getByRole("region", { name: "Numbers and financial year" });
    await settings.getByLabel("Group amounts in").selectOption("indian");
    await expect(settings.getByRole("status")).toHaveText("Number format saved.");
    await settings.getByLabel("Financial year starts in").selectOption({ label: "April" });
    await expect(settings.getByRole("status")).toHaveText("Financial year saved.");
    await expect(settings).toContainText(/This year is FY \d{4}–\d{2}: \d{4}-04-01 to \d{4}-03-31/);
    await page.screenshot({ path: "test-results/numbers-settings.png", fullPage: true });

    await page.goto("/accounts");
    await expect(page.locator('[data-account="Chase"]')).toContainText("12,34,567.00 USD");
    await page.goto("/reports");
    await expect(page.getByRole("button", { name: /^This year \(FY \d{4}–\d{2}\)$/ })).toBeVisible();
    await page.getByRole("button", { name: /^Last year/ }).click();
    await expect(page.getByLabel("To", { exact: true })).toHaveValue(/-03-31$/);
    await context.close();
  });
});
