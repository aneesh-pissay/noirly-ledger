import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, today, type TestUser } from "./fixtures";

type Approval = { id: string; status: string; currentStep: number; ruleName: string | null; steps: Array<{ kind: string; decision: string | null }> };

test.describe("multi-level approval rules", () => {
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
    for (const approver of [ada, ben]) {
      expect((await owner.api.patch(`/api/workspaces/${ws}/members`, { data: { userId: approver.id, role: "approver" } })).ok()).toBe(true);
    }
    const submit = async (amountMajor: string, extra: Record<string, unknown> = {}) => {
      const res = await mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor, currency: "USD", date: today(), note: `Spend ${amountMajor}`, ...extra } });
      expect(res.ok(), await res.text()).toBe(true);
      return ((await res.json()) as { approval: Approval }).approval;
    };
    const decide = (user: TestUser, id: string, decision: "approved" | "rejected") => user.api.post(`/api/approvals/${id}/decide`, { data: { decision } });
    const spend = async () => ((await (await owner.api.get(`/api/budget-pools/${poolId}`)).json()) as { pool: { currentSpendMinor: number } }).pool.currentSpendMinor;
    return { ws, poolId, submit, decide, spend };
  }

  test("large expenses need an approver and then an owner; small ones one approval", async () => {
    const { ws, submit, decide, spend } = await team();

    // Only owners write rules.
    const rule = { name: "Large", minMajor: "100.00", steps: [{ kind: "any" }, { kind: "owners" }] };
    expect((await ada.api.post(`/api/workspaces/${ws}/approval-rules`, { data: rule })).status()).toBe(403);
    const created = await owner.api.post(`/api/workspaces/${ws}/approval-rules`, { data: rule });
    expect(created.status(), await created.text()).toBe(201);

    // Under the threshold: one approval from any approver, as before.
    const small = await submit("50.00");
    expect(small.steps).toHaveLength(1);
    expect(small.ruleName).toBeNull();
    expect((await decide(ada, small.id, "approved")).ok()).toBe(true);
    expect(await spend()).toBe(5000);

    // Over it: two steps. Ada's approval moves it on without touching the pool.
    const large = await submit("150.00");
    expect(large).toMatchObject({ ruleName: "Large", currentStep: 0, steps: [{ kind: "any" }, { kind: "owners" }] });
    const first = await decide(ada, large.id, "approved");
    expect(first.ok(), await first.text()).toBe(true);
    expect(((await first.json()) as { approval: Approval }).approval).toMatchObject({ status: "submitted", currentStep: 1 });
    expect(await spend()).toBe(5000);

    // The second step is an owner's: not Ada again, not Ben.
    expect((await decide(ada, large.id, "approved")).status()).toBe(403);
    expect((await decide(ben, large.id, "approved")).status()).toBe(403);
    const last = await decide(owner, large.id, "approved");
    expect(last.ok(), await last.text()).toBe(true);
    expect(((await last.json()) as { approval: Approval }).approval).toMatchObject({ status: "approved", steps: [{ decision: "approved" }, { decision: "approved" }] });
    expect(await spend()).toBe(20000);
  });

  test("rules match by category and pool, first one wins, and a rejection at any step ends it", async () => {
    const { ws, poolId, submit, decide, spend } = await team();
    const travel = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Travel" } })).json()) as { category: { id: string } }).category;
    const flights = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Flights", parentId: travel.id } })).json()) as { category: { id: string } }).category;

    // Travel in this pool goes to Ben, then an owner; anything else over 10 to an owner only.
    const add = (data: Record<string, unknown>) => owner.api.post(`/api/workspaces/${ws}/approval-rules`, { data });
    const { rule: catchAll } = (await (await add({ name: "Over 10", minMajor: "10.00", steps: [{ kind: "owners" }] })).json()) as { rule: { id: string } };
    const { rule: trips } = (await (await add({ name: "Trips", categoryIds: [travel.id], budgetPoolIds: [poolId], steps: [{ kind: "members", userIds: [ben.id] }, { kind: "owners" }] })).json()) as { rule: { id: string } };
    // As added, "Over 10" comes first and catches the flight.
    expect((await submit("40.00", { categoryId: flights.id })).ruleName).toBe("Over 10");
    const reordered = await owner.api.put(`/api/workspaces/${ws}/approval-rules`, { data: { ids: [trips.id, catchAll.id] } });
    expect(reordered.ok(), await reordered.text()).toBe(true);

    // A subcategory counts as its parent.
    const flight = await submit("40.00", { categoryId: flights.id });
    expect(flight.ruleName).toBe("Trips");
    expect((await decide(ada, flight.id, "approved")).status()).toBe(403);
    expect((await decide(ben, flight.id, "approved")).ok()).toBe(true);
    const rejected = await decide(owner, flight.id, "rejected");
    expect(((await rejected.json()) as { approval: Approval }).approval.status).toBe("rejected");
    expect(await spend()).toBe(0);

    // Rejected at the first step: done, nothing more to decide.
    const second = await submit("45.00", { categoryId: travel.id });
    expect((await decide(ben, second.id, "rejected")).ok()).toBe(true);
    expect((await decide(owner, second.id, "approved")).status()).toBe(409);

    // Changing a rule leaves submitted expenses on the chain they started with.
    const pending = await submit("60.00", { categoryId: travel.id });
    expect((await owner.api.delete(`/api/workspaces/${ws}/approval-rules/${trips.id}`)).ok()).toBe(true);
    expect((await decide(owner, pending.id, "approved")).status()).toBe(403);
    expect((await decide(ben, pending.id, "approved")).ok()).toBe(true);
  });

  test("set up a rule on the approvals page; the inbox shows each step", async ({ browser }) => {
    const { ws, submit, decide } = await team();
    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/approvals`);
    const rules = page.getByRole("region", { name: "Approval rules" });
    await expect(rules.getByText("No rules yet")).toBeVisible();
    await rules.getByLabel("Rule name").fill("Big spend");
    await rules.getByLabel("From amount (USD)").fill("100");
    await rules.getByRole("button", { name: "Add a step" }).click();
    await rules.getByLabel("Step 1 approver").selectOption({ label: "Ada Approver" });
    await rules.getByRole("button", { name: "Add rule" }).click();
    await expect(rules.locator('[data-rule="Big spend"]')).toContainText("Ada Approver → An owner");

    const large = await submit("250.00");
    expect((await decide(ada, large.id, "approved")).ok()).toBe(true);
    await page.reload();
    const item = page.locator("li", { hasText: "Spend 250.00" });
    await expect(item.locator('[data-step="1"]')).toContainText("approved by Ada Approver");
    await expect(item.locator('[data-step="2"]')).toContainText("An owner — waiting");
    await page.screenshot({ path: "test-results/approval-rules.png", fullPage: true });
    await item.getByRole("button", { name: "Approve" }).click();
    await expect(item).toHaveCount(0);
    await context.close();
  });
});
