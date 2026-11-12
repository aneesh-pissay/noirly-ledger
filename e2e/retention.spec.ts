import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";
import { E2E_MONGODB_URI } from "./env";

async function raw<T>(run: (db: mongoose.Connection) => Promise<T>) {
  const db = await mongoose.createConnection(E2E_MONGODB_URI).asPromise();
  try {
    return await run(db);
  } finally {
    await db.close();
  }
}

test.describe("retention and deleting a workspace", () => {
  let owner: TestUser;
  let member: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Ret Ention");
    member = await newUser("Mem Ber");
  });

  test.afterEach(async () => {
    await disposeAll(owner, member);
  });

  test("deleted transactions go for good after the kept period, and the audit history says so", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    const url = `/api/workspaces/${ws}/retention`;
    expect(await (await owner.api.get(url)).json()).toMatchObject({ policy: { deletedTransactionsDays: null, unmatchedReceiptsDays: null, notificationsDays: null } });
    expect((await owner.api.post(`${url}/run`)).status()).toBe(400);

    const add = async (note: string) => ((await (await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "4.00", currency: "USD", date: today(), note } })).json()) as { transaction: { id: string } }).transaction.id;
    const old = await add("deleted long ago");
    const recent = await add("deleted yesterday");
    const kept = await add("still here");
    for (const id of [old, recent]) expect((await owner.api.delete(`/api/transactions/${id}`)).ok()).toBe(true);
    // One was deleted 40 days ago.
    await raw((db) => db.collection("transactions").updateOne({ _id: new mongoose.Types.ObjectId(old) }, { $set: { deletedAt: new Date(Date.now() - 40 * 86_400_000) } }));

    expect((await owner.api.put(url, { data: { deletedTransactionsDays: 7, unmatchedReceiptsDays: null, notificationsDays: null } })).status()).toBe(400);
    expect((await owner.api.put(url, { data: { deletedTransactionsDays: 30, unmatchedReceiptsDays: null, notificationsDays: 365 } })).ok()).toBe(true);
    const ran = await owner.api.post(`${url}/run`);
    expect(await ran.json()).toEqual({ removed: { deletedTransactions: 1, unmatchedReceipts: 0, notifications: 0 } });

    const left = await raw((db) => db.collection("transactions").find({ _id: { $in: [old, recent, kept].map((id) => new mongoose.Types.ObjectId(id)) } }).project({ _id: 1 }).toArray());
    expect(left.map((d) => String(d._id)).sort()).toEqual([recent, kept].sort());
    expect(await raw((db) => db.collection("transaction_changes").countDocuments({ transactionId: new mongoose.Types.ObjectId(old) }))).toBe(0);

    const { entries } = (await (await owner.api.get(`/api/workspaces/${ws}/audit?entity=workspace`)).json()) as { entries: Array<{ action: string; summary: string; actorName: string | null }> };
    expect(entries.map((e) => e.action)).toEqual(["workspace.retention_applied", "workspace.retention_changed"]);
    expect(entries[0]).toMatchObject({ actorName: null, summary: "Retention removed 1 deleted transaction, 0 unmatched receipts and 0 notifications" });
    // The audit history keeps its record of the deleted transaction, unbroken.
    expect(await (await owner.api.get(`/api/workspaces/${ws}/audit/verify`)).json()).toMatchObject({ ok: true });

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/backups");
    await expect(page.getByLabel("Deleted transactions")).toHaveValue("30");
    await expect(page.getByText("Your personal workspace is deleted with your Noirly account")).toBeVisible();
    await page.screenshot({ path: "test-results/retention.png", fullPage: true });
    await context.close();
  });

  test("an owner deletes a shared workspace by typing its name, and everything in it goes", async () => {
    const { workspaceId } = await newTeam(owner, [member]);
    const ws = new mongoose.Types.ObjectId(workspaceId);
    const name = ((await (await owner.api.get("/api/workspaces")).json()) as { workspaces: Array<{ id: string; name: string }> }).workspaces.find((w) => w.id === workspaceId)!.name;
    expect((await owner.api.post(`/api/workspaces/${workspaceId}/accounts`, { data: { name: "Ops float", kind: "cash", currency: "USD", openingDate: today() } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${workspaceId}/payments`, { data: { name: "Hosting", amountMajor: "20.00", currency: "USD", dueDate: today() } })).ok()).toBe(true);

    const del = (user: TestUser, confirmName: string) => user.api.delete(`/api/workspaces/${workspaceId}`, { data: { confirmName } });
    expect((await del(member, name)).status()).toBe(403);
    expect((await del(owner, name.toLowerCase() + "x")).status()).toBe(400);
    expect((await del(owner, name)).ok()).toBe(true);

    const leftovers = await raw(async (db) =>
      Object.fromEntries(
        await Promise.all(["accounts", "scheduled_payments", "audit_entries", "workspace_members", "budget_pools"].map(async (c) => [c, await db.collection(c).countDocuments({ workspaceId: ws })] as const)),
      ),
    );
    expect(leftovers).toEqual({ accounts: 0, scheduled_payments: 0, audit_entries: 0, workspace_members: 0, budget_pools: 0 });
    expect(await raw((db) => db.collection("workspaces").countDocuments({ _id: ws }))).toBe(0);
    const theirs = ((await (await member.api.get("/api/workspaces")).json()) as { workspaces: Array<{ id: string }> }).workspaces.map((w) => w.id);
    expect(theirs).not.toContain(workspaceId);
    const notes = ((await (await member.api.get("/api/notifications")).json()) as { notifications: Array<{ title: string }> }).notifications;
    expect(notes.map((n) => n.title)).toContain(`${name} was deleted`);
    // A personal workspace can't be deleted this way.
    const personal = await personalWorkspaceId(owner);
    expect((await owner.api.delete(`/api/workspaces/${personal}`, { data: { confirmName: "Personal" } })).status()).toBe(400);
  });
});
