import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, type TestUser } from "./fixtures";

/** Today moved by `days`, as YYYY-MM-DD in UTC (as the server counts days). */
function day(days: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

test.describe("bills on a subscribed calendar", () => {
  let owner: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Cal Endar");
  });

  test.afterEach(async () => {
    await disposeAll(owner);
  });

  test("a private link serves bills as all-day events; settings trim it; a new link retires the old", async ({ browser, playwright }) => {
    const ws = await personalWorkspaceId(owner);
    const { workspaceId: team } = await newTeam(owner);
    const bill = async (workspaceId: string, name: string, dueDate: string) => {
      const res = await owner.api.post(`/api/workspaces/${workspaceId}/payments`, { data: { name, amountMajor: "1200.00", currency: "INR", dueDate } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { payment: { id: string } }).payment.id;
    };
    const water = await bill(ws, "Water", day(3));
    await bill(team, "Office rent", day(5));

    expect(await (await owner.api.get("/api/me/calendar-feed")).json()).toMatchObject({ enabled: false });
    const made = await owner.api.post("/api/me/calendar-feed");
    expect(made.status()).toBe(201);
    const { url } = (await made.json()) as { url: string };
    expect(url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);

    // Calendar apps fetch it with no session.
    const anon = await playwright.request.newContext();
    const fetchFeed = async (link = url) => anon.get(link);
    const res = await fetchFeed();
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    const ics = await res.text();
    expect(ics).toContain(`DTSTART;VALUE=DATE:${day(3).replace(/-/g, "")}`);
    expect(ics).toContain("SUMMARY:Water · 1\\,200.00 INR");
    expect(ics).toContain("SUMMARY:Office rent · 1\\,200.00 INR");
    expect(ics).toContain(`UID:payment:${water}@`);

    // Paid ones are ticked, or dropped; only the picked workspaces.
    expect((await owner.api.post(`/api/payments/${water}/pay`, { data: { how: "mark", paidOn: day(0) } })).ok()).toBe(true);
    expect(await (await fetchFeed()).text()).toContain("SUMMARY:✓ Water");
    expect((await owner.api.put("/api/me/calendar-feed", { data: { workspaceIds: [team], bills: true, reminders: true, showPaid: false } })).ok()).toBe(true);
    const trimmed = await (await fetchFeed()).text();
    expect(trimmed).not.toContain("Water");
    expect(trimmed).toContain("Office rent");
    expect((await owner.api.put("/api/me/calendar-feed", { data: { workspaceIds: ["e".repeat(24)], bills: true, reminders: true, showPaid: true } })).status()).toBe(400);

    // A new link retires the old one; turning it off retires both.
    const second = ((await (await owner.api.post("/api/me/calendar-feed")).json()) as { url: string }).url;
    expect((await fetchFeed()).status()).toBe(404);
    expect((await fetchFeed(second)).status()).toBe(200);
    expect((await fetchFeed(url.replace(/[A-Za-z0-9_-]{43}\.ics$/, "not-a-token.ics"))).status()).toBe(404);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/calendar");
    await expect(page.locator("[data-feed-on]")).toContainText("A calendar link is on");
    await page.getByRole("button", { name: "Make a new link" }).click({ trial: true });
    await page.screenshot({ path: "test-results/calendar-feed.png", fullPage: true });
    await context.close();

    expect((await owner.api.delete("/api/me/calendar-feed")).ok()).toBe(true);
    expect((await fetchFeed(second)).status()).toBe(404);
    await anon.dispose();
  });
});
