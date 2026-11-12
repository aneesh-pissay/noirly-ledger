import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Spotted = { key: string; name: string; cadence: string; count: number; lastMinor: number; previousMinor: number; active: boolean; nextDate: string };

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("spotted subscriptions", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Sub Spotter");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("found in spending, then tracked or set aside", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const add = async (date: string, amountMajor: string, data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", date, amountMajor, ...data } });
      expect(res.status(), await res.text()).toBe(201);
    };
    for (const [date, amount] of [[day(-82), "649.00"], [day(-51), "649.00"], [day(-21), "799.00"]] as const) await add(date, amount, { merchant: "Netflix" });
    await add(day(-40), "12000.00", { merchant: "Netflix", note: "Gift cards" });
    for (const [i, date] of [day(-70), day(-40), day(-10)].entries()) await add(date, "119.00", { note: `UPI/SPOTIFY/42851234567${i}` });
    for (const date of [day(-200), day(-170), day(-140)]) await add(date, "1500.00", { merchant: "Gym" });
    await add(day(-30), "250.00", { merchant: "Cafe" });
    await add(day(-3), "250.00", { merchant: "Cafe" });

    const list = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/subscriptions`)).json()) as { subscriptions: Spotted[] }).subscriptions;
    const found = await list();
    expect(found.map((s) => [s.name, s.cadence, s.count, s.active])).toEqual([
      ["Netflix", "monthly", 3, true],
      ["Spotify", "monthly", 3, true],
      ["Gym", "monthly", 3, false],
    ]);
    expect(found[0]).toMatchObject({ lastMinor: 79_900, previousMinor: 64_900 });

    // Set one aside: it isn't suggested again.
    const spotify = found[1]!;
    expect((await owner.api.post(`/api/workspaces/${ws}/subscriptions/dismiss`, { data: { key: spotify.key } })).ok()).toBe(true);
    expect((await list()).map((s) => s.name)).toEqual(["Netflix", "Gym"]);
    expect((await owner.api.post(`/api/workspaces/${ws}/subscriptions/track`, { data: { key: "m:nothing" } })).status()).toBe(404);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    const netflix = page.locator('[data-subscription="Netflix"]');
    await expect(netflix).toContainText("Monthly · now 799.00 INR, was 649.00 INR · charged 3 times");
    await expect(page.locator('[data-subscription="Gym"]')).toContainText("it may have been cancelled");
    await page.screenshot({ path: "test-results/subscriptions.png", fullPage: true });
    await netflix.getByRole("button", { name: "Track" }).click();
    await expect(netflix).toHaveCount(0);

    // Tracked: its next charge is on the bill calendar, a month after the latest.
    const next = found[0]!.nextDate;
    const bills = ((await (await owner.api.get(`/api/workspaces/${ws}/bills?month=${next.slice(0, 7)}`)).json()) as { items: Array<{ date: string; merchant: string | null; source: string }> }).items;
    expect(bills.filter((b) => b.merchant === "Netflix").map((b) => [b.date, b.source])).toEqual([[next, "recurring"]]);
    expect((await list()).map((s) => s.name)).toEqual(["Gym"]);
    await context.close();
  });
});
