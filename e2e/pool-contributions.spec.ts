import { test, expect } from "@playwright/test";
import { browserAs, disposeAll, newTeam, newUser, today, type TestUser } from "./fixtures";

type Funding = {
  contributedMinor: number;
  balanceMinor: number;
  standings: Array<{ userId: string; expectedMinor: number | null; contributedMinor: number; owesMinor: number | null }>;
  contributions: Array<{ id: string; userId: string }>;
};

test.describe("member contributions and allocations to pools", () => {
  let owner: TestUser;
  let mel: TestUser;
  let sam: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ona Owner");
    mel = await newUser("Mel Member");
    sam = await newUser("Sam Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, mel, sam);
  });

  test("shares, what's been put in, who still owes, and the balance after spending", async () => {
    const { workspaceId: ws, poolId } = await newTeam(owner, [mel, sam]);
    const allocate = (user: TestUser, data: Record<string, unknown>) => user.api.put(`/api/budget-pools/${poolId}/allocation`, { data });
    const put = (user: TestUser, amountMajor: string, forUserId?: string) =>
      user.api.post(`/api/budget-pools/${poolId}/contributions`, { data: { amountMajor, date: today(), forUserId: forUserId ?? null } });
    const funding = async () => (await (await owner.api.get(`/api/budget-pools/${poolId}/contributions`)).json()) as Funding;
    const standing = (f: Funding, id: string) => f.standings.find((s) => s.userId === id);

    // Only pool managers set shares; percentages must add to 100.
    const everyone = [owner, mel, sam].map((u) => ({ userId: u.id }));
    expect((await allocate(mel, { mode: "equal", targetMajor: "300.00", shares: everyone })).status()).toBe(403);
    expect((await allocate(owner, { mode: "percent", shares: [{ userId: mel.id, value: "60" }, { userId: sam.id, value: "30" }] })).status()).toBe(400);
    expect((await allocate(owner, { mode: "equal", targetMajor: "300.00", shares: everyone })).ok()).toBe(true);

    // Mel puts in her own; only a manager records for someone else, who's told.
    expect((await put(mel, "60.00")).status()).toBe(201);
    expect((await put(mel, "10.00", sam.id)).status()).toBe(403);
    expect((await put(owner, "100.00", sam.id)).status()).toBe(201);
    const notes = ((await (await sam.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string }> }).notifications;
    expect(notes.some((n) => n.title.startsWith("Contribution to Ops recorded"))).toBe(true);

    let f = await funding();
    expect(f.contributedMinor).toBe(16_000);
    expect(standing(f, mel.id)).toMatchObject({ expectedMinor: 10_000, contributedMinor: 6_000, owesMinor: 4_000 });
    expect(standing(f, sam.id)).toMatchObject({ owesMinor: 0 });

    // Reminding tells those behind (not the manager asking).
    const reminded = await owner.api.post(`/api/budget-pools/${poolId}/contributions/remind`);
    expect(((await reminded.json()) as { reminded: number }).reminded).toBe(1);
    const melNotes = ((await (await mel.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string; body: string }> }).notifications;
    expect(melNotes.find((n) => n.title === "Your share of Ops")?.body).toContain("40.00");

    // Spending comes out of the balance.
    const res = await mel.api.post(`/api/workspaces/${ws}/expenses`, { data: { budgetPoolId: poolId, amountMajor: "20.00", currency: "USD", date: today(), note: "Snacks" } });
    const { approval } = (await res.json()) as { approval: { id: string } };
    expect((await owner.api.post(`/api/approvals/${approval.id}/decide`, { data: { decision: "approved" } })).ok()).toBe(true);
    expect((await funding()).balanceMinor).toBe(14_000);

    // Sam can't take out Mel's; Mel can.
    const melsOwn = f.contributions.find((c) => c.userId === mel.id)!;
    expect((await sam.api.delete(`/api/pool-contributions/${melsOwn.id}`)).status()).toBe(403);
    expect((await mel.api.delete(`/api/pool-contributions/${melsOwn.id}`)).ok()).toBe(true);
    f = await funding();
    expect(standing(f, mel.id)).toMatchObject({ contributedMinor: 0, owesMinor: 10_000 });
  });

  test("put money in from the pool page", async ({ browser }) => {
    const { workspaceId: ws, poolId } = await newTeam(owner, [mel]);
    expect((await owner.api.put(`/api/budget-pools/${poolId}/allocation`, { data: { mode: "amount", shares: [{ userId: mel.id, value: "75.00" }] } })).ok()).toBe(true);
    const context = await browserAs(browser, mel);
    const page = await context.newPage();
    await page.goto(`/w/${ws}/pools/${poolId}`);
    const section = page.getByRole("region", { name: "Contributions" });
    await section.getByLabel("Amount put in (USD)").fill("50");
    await section.getByRole("button", { name: "Add" }).click();
    await expect(section.locator('[data-standing="Mel Member"]')).toContainText("25.00");
    await expect(section.locator("[data-contributed]")).toContainText("50.00");
    await expect(section.getByRole("form", { name: "Shares" })).toHaveCount(0);
    await page.screenshot({ path: "test-results/pool-contributions.png", fullPage: true });
    await context.close();
  });
});
