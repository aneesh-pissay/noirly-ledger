import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

type Schedule = { id: string; nextRunOn: string; lastRunAt: string | null; lastSentTo: number; lastError: string | null; lastRange: { from: string; to: string } | null };

/** Monday 1 … Sunday 7, for today. */
const todayWeekday = () => ((new Date().getUTCDay() + 6) % 7) + 1;
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test.describe("XLSX exports and scheduled reports by email", () => {
  let owner: TestUser;
  let mel: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Eve Exporter");
    mel = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, mel);
  });

  test("exports a spreadsheet", async () => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "12.50", currency: "USD", date: today(), note: "Lunch" } })).status()).toBe(201);
    const res = await owner.api.post(`/api/workspaces/${ws}/exports`, { data: { format: "xlsx", from: today(), to: today(), template: "summary" } });
    expect(res.ok(), await res.text()).toBe(true);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
    expect(res.headers()["content-disposition"]).toContain(".xlsx");
    const body = await res.body();
    expect(body.subarray(0, 2).toString()).toBe("PK");
  });

  test("schedules a report, sends it now, and the daily run sends what's due", async () => {
    const ws = await personalWorkspaceId(owner);
    const create = async (data: Record<string, unknown>) => {
      const res = await owner.api.post(`/api/workspaces/${ws}/scheduled-exports`, { data: { name: "Statement", format: "xlsx", template: "summary", recipientIds: [owner.id], ...data } });
      expect(res.status(), await res.text()).toBe(201);
      return ((await res.json()) as { schedule: Schedule }).schedule;
    };
    expect((await owner.api.post(`/api/workspaces/${ws}/scheduled-exports`, { data: { name: "Bad", format: "pdf", frequency: "monthly", runDay: 30, recipientIds: [owner.id] } })).status()).toBe(400);

    // Send now covers the month just finished.
    const monthly = await create({ frequency: "monthly", runDay: 1 });
    const sent = await owner.api.post(`/api/workspaces/${ws}/scheduled-exports/${monthly.id}/send`);
    expect(sent.ok(), await sent.text()).toBe(true);
    const after = ((await sent.json()) as { schedule: Schedule }).schedule;
    expect(after).toMatchObject({ lastSentTo: 1, lastError: null });
    expect(after.lastRange!.to < today()).toBe(true);
    expect(after.nextRunOn).toBe(monthly.nextRunOn);

    // Due today: the daily run sends it and moves it a week on.
    const weekly = await create({ name: "Weekly", frequency: "weekly", runDay: todayWeekday(), format: "csv" });
    expect(weekly.nextRunOn).toBe(today());
    expect((await owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } })).ok()).toBe(true);
    const { schedules } = (await (await owner.api.get(`/api/workspaces/${ws}/scheduled-exports`)).json()) as { schedules: Array<Schedule & { name: string }> };
    expect(schedules.find((s) => s.name === "Weekly")).toMatchObject({ nextRunOn: inDays(7), lastSentTo: 1, lastError: null });
  });

  test("reports only go to members of the workspace", async ({ browser }) => {
    const { workspaceId: ws } = await newTeam(owner, [mel]);
    const stranger = await newUser("Sam Stranger");
    const body = { name: "Pool report", format: "pdf", template: "summary", frequency: "weekly", runDay: 1 };
    expect((await owner.api.post(`/api/workspaces/${ws}/scheduled-exports`, { data: { ...body, recipientIds: [owner.id, stranger.id] } })).status()).toBe(400);
    expect((await owner.api.post(`/api/workspaces/${ws}/scheduled-exports`, { data: { ...body, recipientIds: [owner.id, mel.id] } })).status()).toBe(201);
    await disposeAll(stranger);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/reports`);
    await page.getByRole("tab", { name: "Export" }).click();
    const section = page.getByRole("region", { name: "Scheduled reports" });
    await expect(section.locator('[data-schedule="Pool report"]')).toContainText("Eve Exporter, Mel Member");
    await page.screenshot({ path: "test-results/scheduled-exports.png", fullPage: true });
    await context.close();
  });
});
