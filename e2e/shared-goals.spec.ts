import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

type Sharing = {
  shares: Array<{ name: string; amountMinor: number; percent: number }>;
  pledges: Array<{ name: string; monthlyMinor: number; thisMonthMinor: number; met: boolean }>;
  pledgedMinor: number;
  pledgedDate: string | null;
  myPledgeMinor: number;
};

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("shared goals", () => {
  let asha: TestUser;
  let ravi: TestUser;

  test.beforeEach(async () => {
    asha = await newUser("Asha Saver");
    ravi = await newUser("Ravi Saver");
  });

  test.afterEach(async () => {
    await disposeAll(asha, ravi);
  });

  test("a household saves together: who put in what, and pledges", async ({ browser }) => {
    const { workspaceId: ws } = await newTeam(asha, [ravi]);
    // A team has no goals page; a household does.
    const context = await browserAs(browser, ravi);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/goals`);
    await expect(page.getByText("Not found")).toBeVisible();
    expect((await asha.api.patch(`/api/workspaces/${ws}/settings`, { data: { purpose: "household" } })).ok()).toBe(true);

    const { goal } = (await (await asha.api.post(`/api/workspaces/${ws}/savings-goals`, { data: { name: "Goa trip", targetMajor: "600.00" } })).json()) as { goal: { id: string } };
    expect((await asha.api.post(`/api/savings-goals/${goal.id}`, { data: { amountMajor: "200.00" } })).ok()).toBe(true);
    expect((await ravi.api.post(`/api/savings-goals/${goal.id}`, { data: { amountMajor: "100.00" } })).ok()).toBe(true);
    for (const [who, amount] of [[asha, "100.00"], [ravi, "100.00"]] as const) expect((await who.api.put(`/api/savings-goals/${goal.id}/pledge`, { data: { monthlyMajor: amount } })).ok()).toBe(true);

    const sharing = async (user: TestUser) =>
      ((await (await user.api.get(`/api/workspaces/${ws}/savings-goals/forecasts`)).json()) as { forecasts: Record<string, { sharing?: Sharing }> }).forecasts[goal.id]!.sharing!;
    const seen = await sharing(asha);
    expect(seen.shares).toEqual([
      expect.objectContaining({ name: "Asha Saver", amountMinor: 20_000, percent: 67 }),
      expect.objectContaining({ name: "Ravi Saver", amountMinor: 10_000, percent: 33 }),
    ]);
    expect(seen.pledges.map((p) => [p.name, p.monthlyMinor, p.thisMonthMinor, p.met])).toEqual([
      ["Asha Saver", 10_000, 20_000, true],
      ["Ravi Saver", 10_000, 10_000, true],
    ]);
    // ₹300 to go at ₹200 a month between them: about a month and a half.
    expect(seen).toMatchObject({ pledgedMinor: 20_000, pledgedDate: day(46), myPledgeMinor: 10_000 });

    // Each hears when the other puts money in.
    const heard = async (user: TestUser) =>
      ((await (await user.api.get("/api/notifications")).json()) as { notifications: Array<{ kind: string; title: string }> }).notifications.filter((n) => n.kind === "goal.contribution").map((n) => n.title);
    expect(await heard(ravi)).toEqual(["Asha Saver put 200.00 USD into Goa trip"]);
    expect(await heard(asha)).toEqual(["Ravi Saver put 100.00 USD into Goa trip"]);

    // A personal goal has nobody to share with.
    const personal = await personalWorkspaceId(asha);
    const { goal: mine } = (await (await asha.api.post(`/api/workspaces/${personal}/savings-goals`, { data: { name: "Mine", targetMajor: "100.00" } })).json()) as { goal: { id: string } };
    const own = ((await (await asha.api.get(`/api/workspaces/${personal}/savings-goals/forecasts`)).json()) as { forecasts: Record<string, { sharing?: Sharing }> }).forecasts[mine.id]!;
    expect(own.sharing).toBeUndefined();

    await page.goto(`/w/${ws}/goals`);
    await expect(page.getByRole("link", { name: "Goals" })).toBeVisible();
    const card = page.locator('[data-goal="Goa trip"]');
    await expect(card.getByRole("list", { name: "Who's put into Goa trip" })).toContainText("Asha Saver200.00 USD · 67%");
    await card.getByLabel("My monthly pledge to Goa trip").fill("150");
    await card.getByRole("button", { name: "Change my pledge" }).click();
    await expect(card.locator('[data-pledge="Ravi Saver"]')).toContainText("Ravi Saver · 150.00 USD100.00 USD in so far this month");
    await expect(card).toContainText("With everyone's pledges (250.00 USD a month)");
    await page.screenshot({ path: "test-results/shared-goals.png", fullPage: true });

    // Pledging nothing takes it back.
    expect((await ravi.api.put(`/api/savings-goals/${goal.id}/pledge`, { data: { monthlyMajor: "0" } })).ok()).toBe(true);
    expect((await sharing(ravi)).pledges.map((p) => p.name)).toEqual(["Asha Saver"]);
    await context.close();
  });
});
