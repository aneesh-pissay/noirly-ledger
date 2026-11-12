import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, today, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const NONE = { submitWithinDays: null, monthCloseDay: null, lateSubmission: "flag", remindAfterDays: null, escalateAfterDays: null };

type Approval = { id: string; late: boolean; waitingDays: number | null; lateSubmission: { daysLate: number } | null; steps: Array<{ remindedAt: string | null; escalatedAt: string | null }> };

test.describe("submission deadlines and late approvals", () => {
  let owner: TestUser;
  let ada: TestUser;
  let mel: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ona Owner");
    ada = await newUser("Ada Approver");
    mel = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, ada, mel);
  });

  test("late submissions are refused or flagged", async () => {
    const { workspaceId: ws, poolId } = await newTeam(owner, [mel]);
    const set = (deadlines: Record<string, unknown>) => owner.api.patch(`/api/workspaces/${ws}/settings`, { data: { approvalDeadlines: { ...NONE, ...deadlines } } });
    expect((await set({ remindAfterDays: 5, escalateAfterDays: 2 })).status()).toBe(400);
    expect((await mel.api.patch(`/api/workspaces/${ws}/settings`, { data: { approvalDeadlines: NONE } })).status()).toBe(403);

    const submit = (date: string) => mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor: "10.00", currency: "USD", date, note: `Spent ${date}` } });
    expect((await set({ submitWithinDays: 30, lateSubmission: "block" })).ok()).toBe(true);
    const refused = await submit(daysAgo(40));
    expect(refused.status()).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toBe("submission_late");
    expect((await submit(daysAgo(20))).ok()).toBe(true);

    expect((await set({ submitWithinDays: 30, lateSubmission: "flag" })).ok()).toBe(true);
    const flagged = await submit(daysAgo(40));
    expect(flagged.ok(), await flagged.text()).toBe(true);
    const { approval } = (await flagged.json()) as { approval: Approval };
    expect(approval.lateSubmission).toMatchObject({ daysLate: 10 });
  });

  test("a waiting step is reminded, then escalated so an owner can decide it", async ({ browser }) => {
    const { workspaceId: ws, poolId } = await newTeam(owner, [ada, mel]);
    expect((await owner.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: ada.id, role: "approver" } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${ws}/approval-rules`, { data: { name: "Ada only", steps: [{ kind: "members", userIds: [ada.id] }] } })).status()).toBe(201);
    const set = (deadlines: Record<string, unknown>) => owner.api.patch(`/api/workspaces/${ws}/settings`, { data: { approvalDeadlines: { ...NONE, ...deadlines } } });
    const cron = () => owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    const titles = async (user: TestUser) => ((await (await user.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string }> }).notifications.map((n) => n.title);

    const res = await mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor: "15.00", currency: "USD", date: today(), note: "Courier" } });
    expect(res.ok(), await res.text()).toBe(true);
    const { approval } = (await res.json()) as { approval: Approval };
    expect((await owner.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).status()).toBe(403);

    // Past the reminder line (0 days): Ada is reminded, once.
    expect((await set({ remindAfterDays: 0, escalateAfterDays: 5 })).ok()).toBe(true);
    expect((await cron()).ok()).toBe(true);
    expect(await titles(ada)).toContain("Expense waiting 0 days");
    expect((await owner.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).status()).toBe(403);

    // Past the escalation line: the owner can decide it too, and is told.
    expect((await set({ remindAfterDays: 0, escalateAfterDays: 0 })).ok()).toBe(true);
    expect((await cron()).ok()).toBe(true);
    expect((await cron()).ok()).toBe(true);
    expect((await titles(owner)).filter((t) => t === "Approval escalated to you")).toHaveLength(1);
    const items = ((await (await owner.api.get(`/api/workspaces/${ws}/approvals?status=submitted`)).json()) as { approvals: Approval[] }).approvals;
    expect(items.find((a) => a.id === approval.id)).toMatchObject({ late: true, waitingDays: 0 });

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/approvals`);
    const item = page.locator("li", { hasText: "Courier" });
    await expect(item.locator('[data-waiting="late"]')).toContainText("escalated to owners");
    await page.screenshot({ path: "test-results/deadlines.png", fullPage: true });
    await item.getByRole("button", { name: "Approve" }).click();
    await expect(item).toHaveCount(0);
    await context.close();

    const history = ((await (await owner.api.get(`/api/workspaces/${ws}/approval-history?approvalId=${approval.id}`)).json()) as { events: Array<{ kind: string; actorName: string }> }).events;
    expect(history.map((e) => [e.kind, e.actorName])).toEqual([["approved", "Ona Owner"], ["escalated", "Ledger"], ["reminded", "Ledger"], ["submitted", "Mel Member"]]);
  });
});
