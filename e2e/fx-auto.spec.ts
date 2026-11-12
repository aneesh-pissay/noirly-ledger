import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";

// The e2e server fetches from a set table (FX_RATES_URL=fixed): 0.92 EUR and 83.5 INR to the US dollar.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

type Rate = { currency: string; effectiveFrom: string; source: string; rateToBaseScaled: number };

test.describe("automatic FX rates", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Tom Traveller");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("fetched when spending in another currency, on the day it was spent; hand-set rates win", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const spend = (currency: string, amountMajor: string, date = today()) =>
      owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency, amountMajor, date } });
    const rates = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/fx-rates`)).json()) as { rates: Rate[] }).rates;

    // Off by default: no rate, no spending in euros.
    const refused = await spend("EUR", "10.00");
    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toBe("missing_fx_rate");

    expect((await owner.api.patch(`/api/workspaces/${ws}/settings`, { data: { autoFxRates: true } })).ok()).toBe(true);
    const euros = await spend("EUR", "10.00");
    expect(euros.status(), await euros.text()).toBe(201);
    // 10 EUR at 0.92 to the dollar.
    expect(((await euros.json()) as { transaction: { baseAmountMinor: number } }).transaction.baseAmountMinor).toBe(1_087);

    // Travel spending entered later gets that day's rate.
    const rupees = await spend("INR", "1000.00", daysAgo(20));
    expect(rupees.status(), await rupees.text()).toBe(201);
    expect(((await rupees.json()) as { transaction: { baseAmountMinor: number } }).transaction.baseAmountMinor).toBe(1_198);
    expect((await rates()).find((r) => r.currency === "INR")).toMatchObject({ effectiveFrom: daysAgo(20), source: "auto" });

    // A rate set by hand for today stays, even when rates are refreshed.
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "EUR", rate: "2.00", effectiveFrom: today() } })).ok()).toBe(true);
    const refreshed = await owner.api.post(`/api/workspaces/${ws}/fx-rates/refresh`);
    expect(refreshed.ok(), await refreshed.text()).toBe(true);
    expect(((await refreshed.json()) as { currencies: string[] }).currencies).toEqual(["EUR", "INR"]);
    const eurToday = (await rates()).find((r) => r.currency === "EUR" && r.effectiveFrom === today())!;
    expect(eurToday).toMatchObject({ source: "user", rateToBaseScaled: 200_000_000 });
    expect((await rates()).find((r) => r.currency === "INR" && r.effectiveFrom === today())).toMatchObject({ source: "auto" });

    // Currencies the provider doesn't cover still need a hand-set rate.
    expect((await spend("AED", "10.00")).status()).toBe(400);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/currency");
    await expect(page.getByRole("region", { name: "Automatic rates" }).getByRole("checkbox")).toBeChecked();
    await expect(page.locator(`[data-rate="INR ${daysAgo(20)}"]`)).toContainText("fetched");
    await page.screenshot({ path: "test-results/fx-auto.png", fullPage: true });
    await context.close();
  });
});
