import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, today, type TestUser } from "./fixtures";

type Approval = { id: string; status: string; steps: Array<{ kind: string; userIds: string[] }> };

test.describe("pool approval rules and member limits", () => {
  let owner: TestUser;
  let ada: TestUser;
  let ben: TestUser;
  let mel: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ona Owner");
    ada = await newUser("Ada Approver");
    ben = await newUser("Ben Approver");
    mel = await newUser("Mel Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, ada, ben, mel);
  });

  async function team() {
    const { workspaceId: ws, poolId } = await newTeam(owner, [ada, ben, mel]);
    for (const u of [ada, ben]) {
      expect((await owner.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: u.id, role: "approver" } })).ok()).toBe(true);
    }
    const rules = (data: Record<string, unknown>) => owner.api.put(`/api/budget-pools/${poolId}`, { data });
    const submit = (amountMajor: string, note = `Spend ${amountMajor}`) =>
      mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor, currency: "USD", date: today(), note } });
    const ok = async (amountMajor: string) => {
      const res = await submit(amountMajor);
      expect(res.ok(), await res.text()).toBe(true);
      return ((await res.json()) as { approval: Approval }).approval;
    };
    const spend = async () => ((await (await owner.api.get(`/api/budget-pools/${poolId}`)).json()) as { pool: { currentSpendMinor: number } }).pool.currentSpendMinor;
    return { ws, poolId, rules, submit, ok, spend };
  }

  test("the pool's approvers decide, small ones approve on their own, and members stay under their limit", async () => {
    const { ws, poolId, rules, submit, ok, spend } = await team();
    expect((await mel.api.put(`/api/budget-pools/${poolId}`, { data: {} })).status()).toBe(403);
    const set = await rules({ approverIds: [ben.id], autoApproveUpToMajor: "20.00", memberLimitMajor: "100.00", memberLimits: [{ userId: mel.id, limitMajor: "150.00" }], memberLimitPeriod: "monthly" });
    expect(set.ok(), await set.text()).toBe(true);

    // Small and covered by no rule: approved on its own, and counted in the pool.
    const coffee = await ok("15.00");
    expect(coffee.status).toBe("approved");
    expect(await spend()).toBe(1500);
    const history = ((await (await owner.api.get(`/api/workspaces/${ws}/approval-history?approvalId=${coffee.id}`)).json()) as { events: Array<{ kind: string; actorName: string }> }).events;
    expect(history.map((e) => [e.kind, e.actorName])).toEqual([["approved", "Ledger"], ["submitted", "Mel Member"]]);

    // Bigger: the pool's own approver, not any approver.
    const hotel = await ok("50.00");
    expect(hotel).toMatchObject({ status: "submitted", steps: [{ kind: "members", userIds: [ben.id] }] });
    expect((await ada.api.post(`/api/approvals/${hotel.id}/decide`, { data: { decision: "approved" } })).status()).toBe(403);
    expect((await ben.api.post(`/api/approvals/${hotel.id}/decide`, { data: { decision: "approved" } })).ok()).toBe(true);

    // Mel's limit is 150 this month: 65 used; what's waiting counts too.
    const tooMuch = await submit("90.00");
    expect(tooMuch.status()).toBe(400);
    expect(((await tooMuch.json()) as { error: string }).error).toBe("member_limit");
    const train = await ok("80.00");
    expect((await submit("10.00")).status()).toBe(400);
    // Rejected spend doesn't count against it.
    expect((await ben.api.post(`/api/approvals/${train.id}/decide`, { data: { decision: "rejected" } })).ok()).toBe(true);
    await ok("80.00");
  });

  test("a workspace rule can send a step to the pool's approvers, and then nothing approves on its own", async () => {
    const { ws, rules, ok } = await team();
    expect((await rules({ approverIds: [ben.id], autoApproveUpToMajor: "50.00" })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${ws}/approval-rules`, { data: { name: "Over 30", minMajor: "30.00", steps: [{ kind: "pool" }, { kind: "owners" }] } })).status()).toBe(201);
    expect((await ok("10.00")).status).toBe("approved");
    expect(await ok("35.00")).toMatchObject({ status: "submitted", steps: [{ kind: "members", userIds: [ben.id] }, { kind: "owners" }] });
  });

  test("set pool rules on the pool page; members see their limit", async ({ browser }) => {
    const { ws, poolId } = await team();
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/pools/${poolId}`);
    const panel = page.getByRole("region", { name: "Pool rules" });
    await panel.getByLabel("Approver: Ben Approver").check();
    await panel.getByLabel("Auto-approve up to (USD)").fill("25");
    await panel.getByLabel("Member limit (USD)").fill("200");
    await panel.getByRole("button", { name: "Save pool rules" }).click();
    await expect(panel).toContainText("Approved by: Ben Approver");
    await expect(panel).toContainText("Approved on its own up to");
    await context.close();

    const melContext = await browserAs(browser, mel);
    const melPage = await melContext.newPage();
    await melPage.goto(`/w/${ws}/pools/${poolId}`);
    await expect(melPage.locator("[data-my-limit]")).toContainText("Your limit");
    await expect(melPage.getByRole("button", { name: "Save pool rules" })).toHaveCount(0);
    await melPage.screenshot({ path: "test-results/pool-rules.png", fullPage: true });
    await melContext.close();
  });
});
