import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, type TestUser } from "./fixtures";

type Pool = { id: string; template: string | null; periodStart: string | null; periodEnd: string | null; rules: { autoApproveUpToMinor: number | null; memberLimitMinor: number | null; memberLimitPeriod: string } };

test.describe("pool templates", () => {
  let owner: TestUser;
  let mel: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ona Owner");
    mel = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, mel);
  });

  test("a template starts a pool with its rules, shares, dates and categories", async () => {
    const { workspaceId: ws } = await newTeam(owner, [mel]);
    const create = (data: Record<string, unknown>) => owner.api.post(`/api/workspaces/${ws}/budget-pools`, { data });
    const categoryNames = async () => ((await (await owner.api.get(`/api/workspaces/${ws}/categories`)).json()) as { categories: Array<{ name: string }> }).categories.map((c) => c.name);

    expect((await create({ name: "Bad dates", limitMajor: "100.00", template: "trip", periodStart: "2026-12-10", periodEnd: "2026-12-01" })).status()).toBe(400);

    const trip = await create({ name: "Goa", limitMajor: "300.00", template: "trip", periodStart: "2026-12-20", periodEnd: "2026-12-27" });
    expect(trip.status(), await trip.text()).toBe(201);
    const { pool } = (await trip.json()) as { pool: Pool };
    expect(pool).toMatchObject({ template: "trip", periodStart: "2026-12-20", periodEnd: "2026-12-27", rules: { autoApproveUpToMinor: 3_000 } });
    const funding = (await (await owner.api.get(`/api/budget-pools/${pool.id}/contributions`)).json()) as { allocation: { mode: string }; standings: Array<{ userId: string; expectedMinor: number }> };
    expect(funding.allocation.mode).toBe("equal");
    expect(funding.standings.map((s) => s.expectedMinor)).toEqual([15_000, 15_000]);
    expect(await categoryNames()).toEqual(expect.arrayContaining(["Travel", "Stay", "Food and drinks", "Activities"]));

    // A second trip doesn't add the categories again.
    expect((await create({ name: "Kerala", limitMajor: "200.00", template: "trip" })).status()).toBe(201);
    expect((await categoryNames()).filter((n) => n === "Travel")).toHaveLength(1);

    const team = (await (await create({ name: "Tools", limitMajor: "1000.00", template: "team" })).json()) as { pool: Pool };
    expect(team.pool.rules).toMatchObject({ autoApproveUpToMinor: 2_000, memberLimitMinor: 50_000, memberLimitPeriod: "monthly" });

    // A blank pool has no rules at all.
    const blank = (await (await create({ name: "Misc", limitMajor: "100.00" })).json()) as { pool: Pool };
    expect(blank.pool).toMatchObject({ template: null, rules: { autoApproveUpToMinor: null, memberLimitMinor: null } });
  });

  test("pick a template when creating a pool", async ({ browser }) => {
    const { workspaceId: ws } = await newTeam(owner, [mel]);
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/pools`);
    await page.getByRole("radio", { name: "Event" }).check({ force: true });
    await expect(page.getByLabel("From")).toBeVisible();
    await page.getByLabel("Name").fill("Launch party");
    await page.getByLabel("Limit (USD)").fill("800");
    await page.getByLabel("From").fill("2026-11-20");
    await page.getByLabel("To").fill("2026-11-20");
    await page.getByRole("button", { name: "Create pool" }).click();
    const card = page.getByRole("link", { name: /Launch party/ });
    await expect(card).toContainText("Event");
    await expect(card).toContainText("2026-11-20 → 2026-11-20");
    await page.screenshot({ path: "test-results/pool-templates.png", fullPage: true });
    await context.close();
  });
});
