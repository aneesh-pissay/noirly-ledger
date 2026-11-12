import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, today, type TestUser } from "./fixtures";

type Reimbursement = { id: string; approvalId: string; status: string; amountMinor: number; note: string | null };
type List = { reimbursements: Reimbursement[]; payouts: Array<{ id: string; amountMinor: number; count: number; undoneAt: string | null }>; canPay: boolean };

test.describe("reimbursements and payouts", () => {
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

  async function team() {
    const { workspaceId: ws, poolId } = await newTeam(owner, [ada, mel]);
    expect((await owner.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: ada.id, role: "approver" } })).ok()).toBe(true);
    const submit = async (user: TestUser, amountMajor: string, note: string, reimburse = true) => {
      const res = await user.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor, currency: "USD", date: today(), note, reimburse } });
      expect(res.ok(), await res.text()).toBe(true);
      return ((await res.json()) as { approval: { id: string } }).approval.id;
    };
    const decide = async (user: TestUser, id: string, decision: "approved" | "rejected") => {
      const res = await user.api.post(`/api/approvals/${id}/decide`, { data: { decision } });
      expect(res.ok(), await res.text()).toBe(true);
    };
    const list = async (user: TestUser) => (await (await user.api.get(`/api/workspaces/${ws}/reimbursements`)).json()) as List;
    const pay = (user: TestUser, ids: string[]) => user.api.post(`/api/workspaces/${ws}/payouts`, { data: { reimbursementIds: ids, method: "upi", reference: "UTR123", paidOn: today() } });
    return { ws, submit, decide, list, pay };
  }

  test("owed once approved, paid back in one payout, and undone", async () => {
    const { ws, submit, decide, list, pay } = await team();
    const taxi = await submit(mel, "30.00", "Taxi");
    const lunch = await submit(mel, "20.00", "Client lunch");
    const gift = await submit(mel, "5.00", "Gift");
    await submit(mel, "10.00", "Card spend", false);

    // Asked for, waiting on approval; only the ones that asked.
    let mine = await list(mel);
    expect(mine.canPay).toBe(false);
    expect(mine.reimbursements.map((r) => r.status)).toEqual(["pending", "pending", "pending"]);

    await decide(ada, taxi, "approved");
    await decide(ada, lunch, "approved");
    await decide(ada, gift, "rejected");
    mine = await list(mel);
    const owed = mine.reimbursements.filter((r) => r.status === "owed");
    expect(owed.map((r) => r.amountMinor).sort()).toEqual([2000, 3000]);
    expect(mine.reimbursements.find((r) => r.note === "Gift")?.status).toBe("void");

    // Members can't record payouts; a payer pays both in one go, once.
    expect((await pay(mel, owed.map((r) => r.id))).status()).toBe(403);
    const paid = await pay(owner, owed.map((r) => r.id));
    expect(paid.status(), await paid.text()).toBe(201);
    expect(((await paid.json()) as { payout: { amountMinor: number } }).payout.amountMinor).toBe(5000);
    expect((await pay(owner, owed.map((r) => r.id))).status()).toBe(400);

    mine = await list(mel);
    expect(mine.reimbursements.filter((r) => r.status === "paid")).toHaveLength(2);
    const notes = ((await (await mel.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string }> }).notifications;
    expect(notes.some((n) => n.title === "You've been paid back")).toBe(true);

    // Undo a payout recorded by mistake: owed again, and the history keeps both.
    const payout = (await list(owner)).payouts[0]!;
    expect(payout.count).toBe(2);
    expect((await owner.api.delete(`/api/workspaces/${ws}/payouts/${payout.id}`)).ok()).toBe(true);
    expect((await list(mel)).reimbursements.filter((r) => r.status === "owed")).toHaveLength(2);
    const history = ((await (await owner.api.get(`/api/workspaces/${ws}/approval-history?approvalId=${taxi}`)).json()) as { events: Array<{ kind: string }> }).events;
    expect(history.map((e) => e.kind)).toEqual(["unpaid", "paid", "approved", "submitted"]);
  });

  test("nobody pays themselves back while someone else can", async () => {
    const { submit, decide, list, pay } = await team();
    const hotel = await submit(ada, "80.00", "Hotel");
    await decide(owner, hotel, "approved");
    const [own] = (await list(ada)).reimbursements;
    expect((await pay(ada, [own!.id])).status()).toBe(403);
    expect((await pay(owner, [own!.id])).status()).toBe(201);
  });

  test("pay back from the reimbursements page", async ({ browser }) => {
    const { ws, submit, decide } = await team();
    await decide(ada, await submit(mel, "42.00", "Train"), "approved");

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/reimbursements`);
    const toPay = page.getByRole("region", { name: "To pay back" });
    const row = toPay.locator('[data-owed="Mel Member"]');
    await expect(row).toContainText("1 expense");
    await row.getByLabel("Reference").fill("UTR987");
    await row.getByRole("button", { name: "Record payout" }).click();
    await expect(toPay.getByText("Nobody is owed anything.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Payouts" }).locator('[data-payout="Mel Member"]')).toContainText("UTR987");
    await page.screenshot({ path: "test-results/reimbursements.png", fullPage: true });
    await context.close();

    // Mel sees it paid back.
    const melContext = await browserAs(browser, mel);
    const melPage = await melContext.newPage();
    await melPage.goto(`/w/${ws}/reimbursements`);
    await expect(melPage.locator('[data-reimbursement="Train"]')).toContainText("Paid back");
    await melContext.close();
  });
});
