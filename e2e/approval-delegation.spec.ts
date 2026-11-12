import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, today, type TestUser } from "./fixtures";

type Approval = { id: string; transactionId: string; status: string; steps: Array<{ decidedById: string | null; onBehalfOfId: string | null }> };
type Event = { kind: string; actorName: string; otherName: string | null; approvalId: string | null };

test.describe("delegated approval and the approval history", () => {
  let owner: TestUser;
  let ada: TestUser;
  let mel: TestUser;
  let sam: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ona Owner");
    ada = await newUser("Ada Approver");
    mel = await newUser("Mel Member");
    sam = await newUser("Sam Submitter");
  });

  test.afterEach(async () => {
    await disposeAll(owner, ada, mel, sam);
  });

  /** A team where Ada alone approves every expense. */
  async function team() {
    const { workspaceId: ws, poolId } = await newTeam(owner, [ada, mel, sam]);
    expect((await owner.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: ada.id, role: "approver" } })).ok()).toBe(true);
    const rule = await owner.api.post(`/api/workspaces/${ws}/approval-rules`, { data: { name: "Ada decides", steps: [{ kind: "members", userIds: [ada.id] }] } });
    expect(rule.status(), await rule.text()).toBe(201);
    const submit = async (user: TestUser, note: string) => {
      const res = await user.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor: "20.00", currency: "USD", date: today(), note } });
      expect(res.ok(), await res.text()).toBe(true);
      return ((await res.json()) as { approval: Approval }).approval;
    };
    const decide = (user: TestUser, id: string) => user.api.post(`/api/approvals/${id}/decide`, { data: { decision: "approved" } });
    const cover = (user: TestUser, toUserId: string, startsOn = today(), endsOn = today()) =>
      user.api.post(`/api/workspaces/${ws}/delegations`, { data: { toUserId, startsOn, endsOn, note: "Leave" } });
    const history = async (approvalId?: string) =>
      ((await (await owner.api.get(`/api/workspaces/${ws}/approval-history${approvalId ? `?approvalId=${approvalId}` : ""}`)).json()) as { events: Event[] }).events;
    return { ws, submit, decide, cover, history };
  }

  test("a delegate decides for someone away, never their own, until it's ended", async () => {
    const { ws, submit, decide, cover, history } = await team();
    const taxi = await submit(sam, "Taxi");
    expect((await decide(mel, taxi.id)).status()).toBe(403);

    // Not yourself, and one cover at a time.
    expect((await cover(ada, ada.id)).status()).toBe(400);
    const set = await cover(ada, mel.id);
    expect(set.status(), await set.text()).toBe(201);
    expect((await cover(ada, owner.id)).status()).toBe(400);
    const { delegation } = (await set.json()) as { delegation: { id: string } };

    // Mel is told, and now decides for Ada.
    const notes = ((await (await mel.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string }> }).notifications;
    expect(notes.some((n) => n.title === "You're covering approvals")).toBe(true);
    const decided = await decide(mel, taxi.id);
    expect(decided.ok(), await decided.text()).toBe(true);
    const approval = ((await decided.json()) as { approval: Approval }).approval;
    expect(approval.status).toBe("approved");
    expect(approval.steps[0]).toMatchObject({ decidedById: mel.id, onBehalfOfId: ada.id });

    // Covering never extends to the delegate's own expenses.
    const melsOwn = await submit(mel, "Mel lunch");
    expect((await decide(mel, melsOwn.id)).status()).toBe(403);

    // Only Ada or an owner ends it; then Mel can't decide for Ada any more.
    const pending = await submit(sam, "Hotel");
    expect((await mel.api.delete(`/api/workspaces/${ws}/delegations/${delegation.id}`)).status()).toBe(403);
    expect((await ada.api.delete(`/api/workspaces/${ws}/delegations/${delegation.id}`)).ok()).toBe(true);
    expect((await decide(mel, pending.id)).status()).toBe(403);

    // The history has all of it, newest first, with who acted for whom.
    expect((await history(taxi.id)).map((e) => [e.kind, e.actorName, e.otherName])).toEqual([
      ["approved", "Mel Member", "Ada Approver"],
      ["submitted", "Sam Submitter", null],
    ]);
    const kinds = (await history()).map((e) => e.kind);
    expect(kinds.slice(0, 2)).toEqual(["delegation.ended", "submitted"]);
    expect(kinds).toContain("delegation.started");
  });

  test("a withdrawn expense shows in the history", async () => {
    const { submit, history } = await team();
    const gift = await submit(sam, "Gift");
    expect((await sam.api.delete(`/api/transactions/${gift.transactionId}`)).ok()).toBe(true);
    expect((await history(gift.id)).map((e) => e.kind)).toEqual(["withdrawn", "submitted"]);
  });

  test("set cover on the approvals page; the delegate sees whom they decide for", async ({ browser }) => {
    const { ws, submit } = await team();
    await submit(sam, "Conference ticket");

    const adaContext = await browserAs(browser, ada);
    const adaPage = await adaContext.newPage();
    await adaPage.goto(`/w/${ws}/approvals`);
    const away = adaPage.getByRole("region", { name: "Away" });
    await away.getByLabel("Who approves for you").selectOption({ label: "Mel Member" });
    await away.getByRole("button", { name: "Set cover" }).click();
    await expect(away.locator('[data-delegation="Ada Approver"]')).toContainText("active");
    await adaContext.close();

    const melContext = await browserAs(browser, mel);
    const page = await melContext.newPage();
    await page.goto(`/w/${ws}/approvals`);
    const item = page.locator("li", { hasText: "Conference ticket" });
    await expect(item.getByText("Deciding for Ada Approver, who is away.")).toBeVisible();
    await item.getByRole("button", { name: "Approve" }).click();
    await expect(item).toHaveCount(0);
    await page.getByRole("button", { name: "History", exact: true }).click();
    const log = page.getByRole("region", { name: "Workspace approval history" });
    await expect(log).toContainText("Mel Member approved Conference ticket");
    await expect(log).toContainText("for Ada Approver");
    await page.screenshot({ path: "test-results/approval-delegation.png", fullPage: true });
    await melContext.close();
  });
});
