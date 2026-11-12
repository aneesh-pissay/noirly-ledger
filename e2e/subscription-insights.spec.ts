import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

type Insight = { id: string; kind: string; name?: string; names?: string[]; group?: string | null; percent?: number; nextDate?: string; ruleId?: string };

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("subscription insights", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ina Insight");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("price rises, doubles and ones to check on", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const add = async (date: string, amountMajor: string, data: object) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", date, amountMajor, ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { transaction: { id: string } }).transaction;
    };
    const monthly = { frequency: "monthly", interval: 1 };
    // Spotted in spending: Netflix got dearer; YouTube Music runs beside a tracked Spotify.
    for (const [date, amount] of [[day(-64), "649.00"], [day(-33), "649.00"], [day(-3), "799.00"]] as const) await add(date, amount, { merchant: "Netflix" });
    for (const date of [day(-70), day(-40), day(-10)]) await add(date, "119.00", { merchant: "YouTube Music" });
    await add(day(-20), "119.00", { merchant: "Spotify", recurrence: monthly });
    // The gym set up twice, and a yearly domain renewing in ten days.
    await add(day(-10), "1500.00", { merchant: "Gym", recurrence: monthly });
    await add(day(-10), "1500.00", { merchant: "Gym", recurrence: monthly });
    const domain = await add(day(-355), "999.00", { merchant: "Domain", recurrence: { frequency: "yearly", interval: 1 } });

    const list = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/subscription-insights`)).json()) as { insights: Insight[] }).insights;
    const insights = await list();
    expect(insights.map((i) => [i.kind, i.name ?? i.names, i.group ?? null])).toEqual([
      ["price", "Netflix", null],
      ["duplicate", ["Gym", "Gym"], null],
      ["duplicate", ["Spotify", "YouTube Music"], "music streaming"],
      ["review", "Domain", null],
    ]);
    expect(insights[0]!.percent).toBe(23);
    expect(insights[3]).toMatchObject({ ruleId: domain.id });

    // The daily run tells members about the dearer charge, once.
    const run = () => owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    const alerts = async () =>
      ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ kind: string; title: string }> }).notifications.filter((n) => n.kind === "subscription.price").map((n) => n.title);
    expect((await run()).ok()).toBe(true);
    expect((await run()).ok()).toBe(true);
    expect(await alerts()).toEqual(["Netflix went up 23%"]);

    expect((await owner.api.post(`/api/transactions/${domain.id}/still-used`)).ok()).toBe(true);
    expect((await list()).some((i) => i.kind === "review")).toBe(false);
    // Only a recurring bill can be checked on.
    expect((await owner.api.post(`/api/transactions/000000000000000000000000/still-used`)).status()).toBe(404);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    const panel = page.getByRole("list", { name: "Subscription insights" });
    await expect(panel.locator('[data-insight="price"]')).toContainText("Netflix went up 23%");
    await expect(panel.locator('[data-insight="duplicate"]').nth(1)).toContainText("You pay for Spotify and YouTube Music: 238.00 INR a month together.");
    await page.screenshot({ path: "test-results/subscription-insights.png", fullPage: true });
    await panel.locator('[data-insight="price"]').getByRole("button", { name: "Got it" }).click();
    await expect(panel.locator('[data-insight="price"]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("list", { name: "Subscription insights" }).locator("[data-insight]")).toHaveCount(2);
    await context.close();
  });

  test("remind me to cancel sets a cancel-by date before the renewal", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/fx-rates`, { data: { currency: "INR", rate: "0.012", effectiveFrom: "2020-01-01" } })).ok()).toBe(true);
    const res = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", currency: "INR", date: day(-355), amountMajor: "999.00", merchant: "Domain", recurrence: { frequency: "yearly", interval: 1 } } });
    const domain = ((await res.json()) as { transaction: { id: string } }).transaction;
    const review = ((await (await owner.api.get(`/api/workspaces/${ws}/subscription-insights`)).json()) as { insights: Insight[] }).insights.find((i) => i.kind === "review")!;
    expect(review.ruleId).toBe(domain.id);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/recurring");
    const row = page.locator('[data-insight="review"]');
    await expect(row).toContainText(`Still using Domain?It charges again on ${review.nextDate}: 999.00 INR a year.`);
    await row.getByRole("button", { name: "Remind me to cancel" }).click();
    await expect(row).toHaveCount(0);
    const cancelBy = new Date(Date.parse(`${review.nextDate}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const markers = ((await (await owner.api.get(`/api/workspaces/${ws}/bills?month=${cancelBy.slice(0, 7)}`)).json()) as { markers: Array<{ date: string; kind: string; name: string }> }).markers;
    expect(markers).toEqual([{ date: cancelBy, kind: "cancel", ruleId: domain.id, name: "Domain" }]);
    await context.close();
  });
});
