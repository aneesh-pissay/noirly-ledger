import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import mongoose from "mongoose";
import { browserAs, disposeAll, newTeam, newUser, personalWorkspaceId, today, type TestUser } from "./fixtures";
import { E2E_CRON_SECRET, E2E_MONGODB_URI } from "./env";

type Export = {
  format: string;
  version: number;
  workspace: { id: string };
  members: Array<{ email: string; role: string }>;
  counts: Record<string, number>;
  transactions: Array<{ id: string; note: string | null; merchant: string | null }>;
  accounts: Array<Record<string, unknown>>;
  auditEntries: Array<{ action: string }>;
};

test.describe("full export and backups", () => {
  let owner: TestUser;
  let member: TestUser;

  test.beforeEach(async () => {
    owner = await newUser("Exa Mple");
    member = await newUser("Mem Ber");
  });

  test.afterEach(async () => {
    await disposeAll(owner, member);
  });

  test("the export holds everything, notes as text, and no secrets", async () => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/accounts`, { data: { name: "Savings", kind: "bank", currency: "USD", openingDate: today(), number: "50100123456789" } })).ok()).toBe(true);
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "12.00", currency: "USD", date: today(), merchant: "Cafe", note: "Coffee with Ravi" } })).ok()).toBe(true);

    const res = await owner.api.get(`/api/workspaces/${ws}/export?format=json`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="ledger-.+\.json"$/);
    const text = await res.text();
    const data = JSON.parse(text) as Export;
    expect(data).toMatchObject({ format: "noirly-ledger-export", version: 1, workspace: { id: ws } });
    expect(data.members).toEqual([expect.objectContaining({ role: "owner" })]);
    expect(data.transactions.map((t) => [t.merchant, t.note])).toEqual([["Cafe", "Coffee with Ravi"]]);
    expect(data.accounts[0]).toMatchObject({ name: "Savings", numberLast4: "6789" });
    expect(data.counts.transactions).toBe(1);
    for (const secret of ["numberSealed", "noteTerms", "enc1:", "50100123456789"]) expect(text).not.toContain(secret);
    // Downloading it is in the audit history.
    expect((await (await owner.api.get(`/api/workspaces/${ws}/audit?entity=workspace`)).json()).entries[0]).toMatchObject({ action: "workspace.exported" });
  });

  test("only those who run a workspace can export it or see its backups", async () => {
    const { workspaceId } = await newTeam(owner, [member]);
    expect((await member.api.get(`/api/workspaces/${workspaceId}/export?format=json`)).status()).toBe(403);
    expect((await member.api.get(`/api/workspaces/${workspaceId}/backups`)).status()).toBe(403);
    expect((await member.api.post(`/api/workspaces/${workspaceId}/backups/run`)).status()).toBe(403);
  });

  test("backups are made by hand or on schedule, stored sealed, and download as the export", async ({ browser }) => {
    const ws = await personalWorkspaceId(owner);
    expect((await owner.api.post(`/api/workspaces/${ws}/transactions`, { data: { type: "expense", amountMajor: "3.00", currency: "USD", date: today(), note: "Backup me please" } })).ok()).toBe(true);

    const made = await owner.api.post(`/api/workspaces/${ws}/backups/run`);
    expect(made.status(), await made.text()).toBe(201);
    const { backup } = (await made.json()) as { backup: { id: string; transactionCount: number; trigger: string } };
    expect(backup).toMatchObject({ transactionCount: 1, trigger: "manual" });
    expect((await owner.api.post(`/api/workspaces/${ws}/backups/run`)).status()).toBe(429);

    // The stored file says nothing readable.
    const stored = await (async () => {
      const db = await mongoose.createConnection(E2E_MONGODB_URI).asPromise();
      try {
        return await db.collection("workspace_backups").findOne({ _id: new mongoose.Types.ObjectId(backup.id) });
      } finally {
        await db.close();
      }
    })();
    expect(stored!.storage).toBe("local");
    const onDisk = readFileSync(join(process.cwd(), "data", "backups", String(stored!.key)));
    expect(onDisk.toString("utf8")).not.toContain("Backup me");

    const download = await owner.api.get(`/api/workspaces/${ws}/backups/${backup.id}`);
    expect(download.headers()["content-type"]).toBe("application/gzip");
    const restored = JSON.parse(gunzipSync(await download.body()).toString("utf8")) as Export;
    expect(restored.transactions.map((t) => t.note)).toEqual(["Backup me please"]);

    // Scheduled: due at once when turned on, then not again the same day.
    expect((await owner.api.put(`/api/workspaces/${ws}/backups`, { data: { enabled: true, frequency: "daily" } })).ok()).toBe(true);
    const cron = () => owner.api.post("/api/cron/recurring", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    expect((await cron()).ok()).toBe(true);
    const after = (await (await owner.api.get(`/api/workspaces/${ws}/backups`)).json()) as { enabled: boolean; backups: Array<{ trigger: string }> };
    expect(after.enabled).toBe(true);
    // The manual backup just set lastRunAt, so the schedule waits; nothing new yet.
    expect(after.backups.map((b) => b.trigger)).toEqual(["manual"]);

    const context = await browserAs(browser, owner);
    const page = await context.newPage();
    await page.goto("/settings/backups");
    await expect(page.locator('[data-backup="manual"]')).toHaveCount(1);
    await expect(page.getByLabel("Back up automatically")).toBeChecked();
    await page.screenshot({ path: "test-results/export-backups.png", fullPage: true });
    await context.close();
  });
});
