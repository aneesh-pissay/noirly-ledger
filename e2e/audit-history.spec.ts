import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";
import { E2E_MONGODB_URI } from "./env";

type Entry = { seq: number; action: string; entity: string; summary: string; actorName: string | null };

test.describe("immutable audit history", () => {
  let owner: TestUser;
  let member: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Aud Itor");
    member = await newUser("Mo Member");
  });

  test.afterEach(async () => {
    await disposeAll(owner, member);
  });

  test("money changes are recorded in order, sealed, and tampering shows when checked", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const url = `/api/workspaces/${ws}/audit`;
    const added = await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "450.00", currency: "USD", date: today(), merchant: "Grocer" } });
    expect(added.status()).toBe(201);
    const { transaction } = (await added.json()) as { transaction: { id: string } };
    expect((await owner.api.patch(`/api/transactions/${transaction.id}`, { data: { note: "weekly shop" } })).ok()).toBe(true);
    const category = ((await (await owner.api.post(`/api/workspaces/${ws}/categories`, { data: { name: "Food" } })).json()) as { category: { id: string } }).category.id;
    expect((await owner.api.post(`/api/workspaces/${ws}/budgets`, { data: { categoryId: category, period: "monthly", limitMajor: "500.00" } })).ok()).toBe(true);
    expect((await owner.api.delete(`/api/transactions/${transaction.id}`)).ok()).toBe(true);

    const { entries } = (await (await owner.api.get(url)).json()) as { entries: Entry[] };
    expect(entries.map((e) => e.action)).toEqual(["transaction.deleted", "budget.created", "transaction.updated", "transaction.created"]);
    expect(entries.map((e) => e.seq)).toEqual([4, 3, 2, 1]);
    expect(entries[3]!.summary).toContain("450.00 USD · Grocer");
    expect(entries[2]!.summary).toContain("(note)");
    expect(entries[3]!.actorName).toBe("Aud Itor");
    expect((await (await owner.api.get(`${url}?entity=budget`)).json()).entries).toHaveLength(1);

    expect(await (await owner.api.get(`${url}/verify`)).json()).toMatchObject({ ok: true, entries: 4 });
    const csv = await (await owner.api.get(`${url}/export`)).text();
    expect(csv.split("\r\n")[0]).toBe("seq,at,actor,action,entity,entity_id,summary,data,hash");
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(5);

    // Someone edits an entry straight in the database: the check finds it.
    // The raw driver, past the app's guard, as someone with database access would.
    const db = await mongoose.createConnection(E2E_MONGODB_URI).asPromise();
    try {
      const changed = await db.collection("audit_entries").updateOne({ seq: 2, summary: { $regex: "note" } }, { $set: { summary: "Nothing to see here" } });
      expect(changed.modifiedCount).toBe(1);
    } finally {
      await db.close();
    }
    expect(await (await owner.api.get(`${url}/verify`)).json()).toMatchObject({ ok: false, brokenAt: 2, reason: "Entry 2 was changed after it was written", entries: 1 });

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/audit");
    await expect(page.locator('[data-audit="budget.created"]')).toContainText("Food monthly budget");
    await page.getByRole("button", { name: "Check integrity" }).click();
    await expect(page.locator('[data-verify="broken"]')).toContainText("broken at entry 2");
    await page.screenshot({ path: "test-results/audit-history.png", fullPage: true });
    await context.close();
  });

  test("members see it only with the right to; joining and role changes are recorded", async () => {
    const { workspaceId } = await newTeam(owner, [member]);
    expect((await member.api.get(`/api/workspaces/${workspaceId}/audit`)).status()).toBe(403);
    const changed = await owner.api.patch(`/api/workspaces/${workspaceId}/members`, { data: { userId: member.id, role: "approver" } });
    expect(changed.ok(), await changed.text()).toBe(true);
    const { entries } = (await (await member.api.get(`/api/workspaces/${workspaceId}/audit?entity=member`)).json()) as { entries: Entry[] };
    expect(entries.map((e) => e.action)).toEqual(["member.role_changed", "member.joined"]);
    expect(entries[0]!.summary).toBe("Mo Member is now approver");
  });
});
