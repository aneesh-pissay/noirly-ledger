import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Forecast = {
  milestones: Array<{ percent: number; reached: boolean; reachedOn: string | null }>;
  paceMinor: number;
  projectedDate: string | null;
  neededMonthlyMinor: number | null;
  onTrack: boolean | null;
};

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("goal milestones and forecasts", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Gail Goals");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("milestones as they're passed, and when it'll be reached at this pace", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const { goal } = (await (await owner.api.post(`/api/workspaces/${ws}/savings-goals`, { data: { name: "Laptop", targetMajor: "100000.00", currency: "INR", targetDate: day(30) } })).json()) as { goal: { id: string } };
    const put = (amountMajor: string, date?: string) => owner.api.post(`/api/savings-goals/${goal.id}`, { data: { amountMajor, ...(date ? { date } : {}) } });
    for (const [amount, date] of [["20000.00", day(-60)], ["10000.00", day(-30)], ["30000.00", day(-1)]] as const) expect((await put(amount, date)).ok()).toBe(true);
    expect((await put("10.00", day(1))).status()).toBe(400);

    const { forecasts } = (await (await owner.api.get(`/api/workspaces/${ws}/savings-goals/forecasts`)).json()) as { forecasts: Record<string, Forecast> };
    const forecast = forecasts[goal.id]!;
    expect(forecast.milestones.map((m) => [m.percent, m.reached, m.reachedOn])).toEqual([
      [25, true, day(-30)],
      [50, true, day(-1)],
      [75, false, null],
      [100, false, null],
    ]);
    // ₹60,000 over 60 days is about ₹30,440 a month: the last ₹40,000 takes 40 days, ten past the target date.
    expect(forecast).toMatchObject({ paceMinor: 3_044_000, projectedDate: day(40), neededMonthlyMinor: 4_000_000, onTrack: false });

    const notes = ((await (await owner.api.get("/api/notifications")).json()) as { notifications: Array<{ kind: string; title: string }> }).notifications;
    expect(notes.filter((n) => n.kind === "goal.milestone").map((n) => n.title).sort()).toEqual(["25% of the way to Laptop", "Halfway to Laptop"]);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/goals");
    const card = page.locator('[data-goal="Laptop"]');
    await expect(card.locator('[data-milestone="50"]')).toContainText(`✓ 50%${day(-1)}`);
    await expect(card.locator("[data-goal-forecast]")).toHaveText(
      `At 30,440.00 INR a month, you'll get there around ${day(40)}. To make ${day(30)}, set aside 40,000.00 INR a month.`,
    );
    await page.screenshot({ path: "test-results/goal-forecast.png", fullPage: true });
    await context.close();
  });
});
